-- Indices de soporte para las claves foraneas financieras.
-- La organizacion encabeza cada indice para conservar el aislamiento por tenant.

create index if not exists ix_report_settlements_created_by_fk
  on app.report_settlements (organization_id, created_by_profile_id);

create index if not exists ix_report_settlements_updated_by_fk
  on app.report_settlements (organization_id, updated_by_profile_id);

create index if not exists ix_report_settlements_approved_by_fk
  on app.report_settlements (organization_id, approved_by_profile_id);

create index if not exists ix_report_settlements_supersedes_fk
  on app.report_settlements (organization_id, supersedes_settlement_id);

create index if not exists ix_payroll_adjustments_profile_fk
  on app.payroll_adjustments (organization_id, recorded_by_profile_id);
