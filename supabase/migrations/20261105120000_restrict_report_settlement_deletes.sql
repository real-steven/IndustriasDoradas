-- Las liquidaciones financieras conservan historial auditable.
-- Sus detalles se reemplazan explicitamente al guardar un borrador y nunca
-- deben desaparecer como efecto secundario de borrar una cabecera.

alter table app.report_settlement_lines
  drop constraint report_settlement_lines_settlement_fk,
  add constraint report_settlement_lines_settlement_fk
    foreign key (organization_id, settlement_id)
    references app.report_settlements (organization_id, id)
    on delete restrict;

alter table app.report_settlement_expenses
  drop constraint report_settlement_expenses_settlement_fk,
  add constraint report_settlement_expenses_settlement_fk
    foreign key (organization_id, settlement_id)
    references app.report_settlements (organization_id, id)
    on delete restrict;
