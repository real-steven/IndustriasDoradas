-- Registra el material extraido por la propia empresa como proveedor operativo.
-- El cliente desktop lo reconoce por nombre y lo propone al preparar un cargamento nuevo.

update app.suppliers
set
  name = 'Material propio',
  is_active = true,
  deactivated_at = null,
  updated_at = now()
where organization_id = '30000000-0000-4000-8000-000000000001'
  and lower(btrim(name)) = lower('Material propio');

insert into app.suppliers (id, organization_id, name, email, phone)
select
  gen_random_uuid(),
  organizations.id,
  'Material propio',
  null,
  null
from app.organizations
where organizations.id = '30000000-0000-4000-8000-000000000001'
  and not exists (
    select 1
    from app.suppliers
    where suppliers.organization_id = organizations.id
      and lower(btrim(suppliers.name)) = lower('Material propio')
  );
