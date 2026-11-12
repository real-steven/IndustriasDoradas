-- Auditoría gerencial clasificada por área y tipo de acción.
--
-- `app.audit_events` sigue siendo el registro append-only; esta vista solo lo
-- interpreta para que la API filtre y pagine en el servidor por área (operación,
-- personal, seguridad y administración), tipo de acción, persona y línea.
-- Las cajuelas individuales y los accesos técnicos se marcan como rutina: no se
-- borran, pero la vista gerencial normal los oculta.

create or replace view app.management_audit_entries
with (security_invoker = true)
as
select
  audit.id,
  audit.correlation_id,
  audit.organization_id,
  audit.station_id,
  audit.actor_display_name,
  audit.actor_role_code,
  audit.origin,
  audit.action,
  audit.entity_type,
  audit.entity_id,
  audit.result,
  audit.reason_code,
  audit.evidence_state,
  audit.changed_fields,
  audit.changes,
  audit.occurred_at,
  audit.recorded_at,
  area.audit_area,
  kind.audit_kind,
  kind.audit_kind in ('API_ACCESS', 'CAJUELA_RECORDED') as is_routine,
  coalesce(attendance_worker.id, profile_worker.id, worker.id) as subject_worker_id,
  coalesce(
    attendance_worker.name, profile_worker.name, profile.display_name, worker.name
  ) as subject_name,
  attendance.occurred_at_utc as subject_occurred_at_utc,
  coalesce(
    production.production_line_id,
    shipment.production_line_id,
    sweep.production_line_id
  ) as production_line_id
from app.audit_events as audit
left join lateral (
  select receipt.operation_type
  from app.sync_receipts as receipt
  where audit.action = 'sync.ingest'
    and receipt.organization_id = audit.organization_id
    and receipt.correlation_id = audit.correlation_id
    and receipt.aggregate_id = audit.entity_id
    and receipt.processed_at_utc = audit.occurred_at
  order by receipt.id
  limit 1
) as receipt on true
left join app.production_events as production
  on audit.entity_type = 'production_event'
  and production.organization_id = audit.organization_id
  and production.id = audit.entity_id
left join app.shipments as shipment
  on audit.entity_type = 'shipment'
  and shipment.organization_id = audit.organization_id
  and shipment.id = audit.entity_id
left join app.production_sweeps as sweep
  on audit.entity_type = 'production_sweep'
  and sweep.organization_id = audit.organization_id
  and sweep.id = audit.entity_id
left join app.attendance_events as attendance
  on audit.entity_type = 'attendance_event'
  and attendance.organization_id = audit.organization_id
  and attendance.id = audit.entity_id
left join app.workers as attendance_worker
  on attendance_worker.organization_id = attendance.organization_id
  and attendance_worker.id = attendance.worker_id
left join app.user_profiles as profile
  on audit.entity_type in ('user_profile', 'user_profile_permissions')
  and profile.organization_id = audit.organization_id
  and profile.id = audit.entity_id
left join lateral (
  select linked.id, linked.name
  from app.workers as linked
  where linked.organization_id = profile.organization_id
    and linked.user_profile_id = profile.id
  order by linked.created_at, linked.id
  limit 1
) as profile_worker on true
left join app.workers as worker
  on audit.entity_type = 'worker'
  and worker.organization_id = audit.organization_id
  and worker.id = audit.entity_id
cross join lateral (
  select case
    when audit.action = 'access.api' then 'API_ACCESS'
    when audit.action = 'maintenance.shipment_completed' then 'SHIPMENT_COMPLETED'
    when audit.action = 'sync.ingest' and audit.entity_type = 'shipment' then
      case receipt.operation_type
        when 'OPERATION_STARTED' then 'LINE_STARTED'
        when 'OPERATION_COMPLETED' then 'SHIPMENT_COMPLETED'
        when 'RESPONSIBLE_RELIEVED' then 'RESPONSIBLE_CHANGED'
        else 'SHIPMENT_UPDATED'
      end
    when audit.action = 'sync.ingest' and audit.entity_type = 'production_sweep'
      then 'SWEEP_RECORDED'
    when audit.action = 'sync.ingest' and audit.entity_type = 'mercury_movement'
      then 'MERCURY_RECORDED'
    when audit.action = 'sync.ingest' and audit.entity_type = 'production_event' then
      case when production.event_type = 'CAJUELA_REVERSED'
        then 'CAJUELA_REVERSED' else 'CAJUELA_RECORDED' end
    when audit.action = 'sync.ingest' and audit.entity_type = 'attendance_event'
      then 'ATTENDANCE_SYNC'
    when audit.action in ('attendance.record', 'attendance.correct') then
      case attendance.event_type
        when 'CHECK_IN' then 'ATTENDANCE_CHECK_IN'
        when 'CHECK_OUT' then 'ATTENDANCE_CHECK_OUT'
        when 'ADJUSTED_CHECK_IN' then 'ATTENDANCE_CHECK_IN_CORRECTED'
        when 'ADJUSTED_CHECK_OUT' then 'ATTENDANCE_CHECK_OUT_CORRECTED'
        else 'ATTENDANCE_REJECTED'
      end
    when audit.action = 'account.provision' then 'USER_CREATED'
    when audit.action = 'account.governance' then
      case audit.changes -> 'account_status' ->> 'after'
        when 'SUSPENDED' then 'USER_SUSPENDED'
        when 'ACTIVE' then 'USER_REACTIVATED'
        else 'USER_UPDATED'
      end
    when audit.action = 'business.mutation'
      and audit.entity_type in ('worker', 'worker_request') then 'WORKER_UPDATED'
    when audit.action = 'station.security' then
      case audit.changes -> 'security_event' ->> 'after'
        when 'SESSION_OPENED' then 'SESSION_SIGNED_IN'
        when 'SESSION_FOUND' then 'STATION_OPENED'
        when 'SESSION_RESTORED' then 'STATION_OPENED'
        when 'SESSION_CLOSED' then 'STATION_CLOSED'
        when 'SESSION_EXPIRED' then 'SESSION_EXPIRED'
        when 'ELEVATION_REQUESTED' then 'ELEVATION_REQUESTED'
        when 'ELEVATION_ENDED' then 'ELEVATION_ENDED'
        when 'ELEVATION_ACCEPTED' then
          case when audit.changes -> 'access_method' ->> 'after' = 'BIOMETRIC'
            then 'ELEVATION_BIOMETRIC' else 'ELEVATION_PIN' end
        when 'SESSION_REJECTED' then 'SECURITY_REJECTED'
        when 'ELEVATION_REJECTED' then 'SECURITY_REJECTED'
        else
          case when audit.changes -> 'security_event' ->> 'after' like 'BIOMETRIC\_%'
            then 'SECURITY_REJECTED' else 'SECURITY_EVENT' end
      end
    when audit.action = 'privilege.elevation' then
      case when audit.result = 'SUCCEEDED'
        then 'ELEVATION_AUTHORIZED' else 'SECURITY_REJECTED' end
    when audit.action = 'authorization.policy' then 'PERMISSION_BLOCKED'
    when audit.action = 'permission.governance' then 'PERMISSIONS_UPDATED'
    when audit.action = 'business.mutation' then
      case
        when audit.entity_type = 'shipment'
          and 'gold_amount_grams' = any(audit.changed_fields) then 'GOLD_RESULT'
        when audit.entity_type = 'supplier' then 'SUPPLIER_CHANGED'
        when audit.entity_type in ('production_line', 'line_component')
          then 'LINE_CONFIGURATION'
        when audit.entity_type in ('plant', 'station') then 'PLANT_CONFIGURATION'
        when audit.entity_type like 'payroll.%' then 'PAYROLL_CHANGED'
        when audit.entity_type = 'report.settlement' then 'SETTLEMENT_CHANGED'
        when audit.entity_type like 'inventory\_%'
          or audit.entity_type in ('rastra_component_change', 'operational_novelty_change')
          then 'INVENTORY_CHANGED'
        else 'ADMIN_CHANGE'
      end
    when audit.action = 'inventory.manage' then 'INVENTORY_CHANGED'
    else 'OTHER'
  end as audit_kind
) as kind
cross join lateral (
  select case
    when kind.audit_kind in (
      'LINE_STARTED', 'SHIPMENT_COMPLETED', 'RESPONSIBLE_CHANGED',
      'SHIPMENT_UPDATED', 'SWEEP_RECORDED', 'MERCURY_RECORDED',
      'CAJUELA_REVERSED', 'CAJUELA_RECORDED'
    ) then 'operation'
    when kind.audit_kind in (
      'ATTENDANCE_CHECK_IN', 'ATTENDANCE_CHECK_OUT',
      'ATTENDANCE_CHECK_IN_CORRECTED', 'ATTENDANCE_CHECK_OUT_CORRECTED',
      'ATTENDANCE_REJECTED', 'USER_CREATED', 'USER_SUSPENDED',
      'USER_REACTIVATED', 'USER_UPDATED', 'WORKER_UPDATED'
    ) then 'people'
    when kind.audit_kind in (
      'SESSION_SIGNED_IN', 'STATION_OPENED', 'STATION_CLOSED',
      'SESSION_EXPIRED', 'ELEVATION_REQUESTED', 'ELEVATION_ENDED',
      'ELEVATION_PIN', 'ELEVATION_BIOMETRIC', 'ELEVATION_AUTHORIZED',
      'SECURITY_REJECTED', 'SECURITY_EVENT', 'PERMISSION_BLOCKED'
    ) then 'security'
    when kind.audit_kind in (
      'PERMISSIONS_UPDATED', 'GOLD_RESULT', 'SUPPLIER_CHANGED',
      'LINE_CONFIGURATION', 'PLANT_CONFIGURATION', 'PAYROLL_CHANGED',
      'SETTLEMENT_CHANGED', 'INVENTORY_CHANGED', 'ADMIN_CHANGE'
    ) then 'administration'
  end as audit_area
) as area;

revoke all on table app.management_audit_entries
  from public, anon, authenticated;
grant select on table app.management_audit_entries to service_role;
