-- Indices de soporte para todas las claves foraneas que el asesor de
-- rendimiento de Supabase detecto sin cobertura en el esquema app.
-- Version registrada en Supabase: 20260817202508.

create index ix_line_components_component_type
  on app.line_components (component_type_id);

create index ix_station_line_scopes_station
  on app.station_line_scopes (organization_id, plant_id, station_id);

create index ix_station_user_authorizations_authorized_by
  on app.station_user_authorizations (organization_id, authorized_by_profile_id);

create index ix_station_user_authorizations_deactivated_by
  on app.station_user_authorizations (organization_id, deactivated_by_profile_id);

create index ix_station_user_authorizations_scope
  on app.station_user_authorizations (organization_id, user_profile_id, plant_id);

create index ix_station_user_authorizations_station
  on app.station_user_authorizations (organization_id, plant_id, station_id);

create index ix_user_pin_credentials_changed_by
  on app.user_pin_credentials (organization_id, changed_by_profile_id);

create index ix_user_profiles_approved_by
  on app.user_profiles (organization_id, approved_by_profile_id);

create index ix_user_profiles_role
  on app.user_profiles (role_id);

create index ix_user_profiles_suspended_by
  on app.user_profiles (organization_id, suspended_by_profile_id);

create index ix_worker_merges_merged_by
  on app.worker_merges (organization_id, merged_by_profile_id);

create index ix_worker_merges_source
  on app.worker_merges (organization_id, source_request_id, source_worker_id);

create index ix_worker_requests_requested_by
  on app.worker_requests (organization_id, requested_by_profile_id);

create index ix_worker_requests_resolved_by
  on app.worker_requests (organization_id, resolved_by_profile_id);

create index ix_workers_source_request
  on app.workers (organization_id, plant_id, source_request_id);
