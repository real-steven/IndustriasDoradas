# Sprint 3.7 — Coordinación de varias estaciones

Fecha de implementación local: 2026-09-20. Rama: `DevHenry`.

## Política implementada

- `station_line_scopes` conserva la asignación N:M entre estaciones y líneas.
- Una estación con varias líneas debe seleccionar una de forma explícita.
- Una actualización del catálogo conserva la selección si sigue autorizada.
  Si desaparece, la interfaz deja la selección vacía y pide escoger otra; no
  usa la primera línea activa como reemplazo silencioso.
- PostgreSQL toma un bloqueo transaccional por línea antes de evaluar cada
  `OPERATION_STARTED`.
- Si ya existe un cargamento central activo distinto para esa línea, el intento
  queda en `FAILED_REVIEW/LINE_OPERATION_CONFLICT`, con recibo y auditoría, sin
  insertar cargamento ni asignación.
- Estaciones distintas pueden operar simultáneamente líneas distintas. Una
  línea queda disponible para otra estación después de finalizar su cargamento.
- `app.sync_clients` registra una fila privada por estación v1 con aplicación,
  versión, último lote, última comunicación y desviación horaria observada.

La base compartida tenía dos cargamentos activos históricos en la Línea 1 al
iniciar 3.7. La migración no los modificó ni eligió uno arbitrariamente. Uno se
cerró por el flujo normal durante la validación; queda uno histórico activo y,
mientras exista, cualquier nuevo inicio sobre Línea 1 será rechazado para
revisión.

## Archivos principales

- `supabase/migrations/20260920203542_sync_multi_station_coordination.sql`
- `supabase/tests/012_sync_multi_station_coordination.sql`
- `apps/api/src/sync/sync.service.ts`
- `apps/api/src/sync/supabase-sync.repository.ts`
- `apps/desktop/src/IndustriasDoradas.Desktop/Presentation/ViewModels/StationViewModel.cs`

## Validación automática

La validación local fue aprobada el 2026-09-20:

- 12 pruebas SQL desde una base vacía.
- 80 pruebas unitarias/de integración de API.
- 21 pruebas E2E de API.
- 14 pruebas web.
- 124 pruebas desktop.
- Secretos, formato, lint, compilación y contrato generable aprobados.

Desde la raíz del repositorio:

```powershell
pnpm verify
```

Para aislar un fallo, los grupos relevantes son `pnpm test:db`,
`pnpm test:api`, `pnpm test:desktop`, `pnpm format:check`, `pnpm lint`,
`pnpm build`, `pnpm contract:check` y `pnpm secrets:check`.

La migración se aplicó al Supabase compartido con este flujo:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --dry-run
npx.cmd supabase db push --linked
npx.cmd supabase migration list --linked
```

El `dry-run` listó únicamente
`20260920203542_sync_multi_station_coordination.sql`. La lista final confirmó
las doce migraciones alineadas en Local y Remote.

## Resultado de la pausa manual

La prueba manual con `ESTACION_1`, sus cuatro líneas asignadas y Línea 3 como
línea libre fue aprobada:

1. Al entrar como jefe ninguna línea quedó preseleccionada; preparar permaneció
   bloqueado hasta escoger línea, proveedor y responsable.
2. Línea 3 se conservó al volver temporalmente a Modo Operación porque seguía
   activa y dentro del alcance de la estación.
3. Tras desactivar Línea 3 centralmente y aplicar el pull, la selección quedó
   vacía. Desktop no saltó a Línea 1, 2 o 4.
4. Tras reactivar y aplicar el pull, Línea 3 reapareció sin seleccionarse; el
   usuario tuvo que elegirla nuevamente.
5. El inicio de Línea 3, una cajuela `+1` y el cierre produjeron tres recibos
   centrales `APPLIED`. Sincronizados pasó de 21 a 22 con la cajuela y a 23 con
   el cierre; pendientes quedó en 0 y revisión permaneció en 31.
6. PostgreSQL confirmó el cargamento de Línea 3 como `COMPLETED` y el cliente
   `desktop 0.1.0`, con último contacto actualizado y desviación horaria de dos
   segundos.

El entorno compartido solo tiene `ESTACION_1`. La prueba SQL 012 y la
integración API verificaron 1 PC/4 líneas, dos estaciones sobre líneas distintas,
rechazo durable del solapamiento y reutilización de la línea después del cierre.
El ensayo físico con una segunda instalación independiente se conserva como
compuerta del punto 3.10.

## Asesores posteriores a la migración

No apareció una clave foránea sin índice en el esquema `app`. Los índices nuevos
figuran como no utilizados porque acaban de crearse y el entorno tiene poco
tráfico; no se eliminan antes de medir uso real. `app.sync_clients` tiene RLS
sin políticas de cliente de forma intencional: solo `service_role` posee permisos,
igual que el feed privado. El asesor lo informa como
[RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Permanece el aviso general previo de
[protección de contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

No se hizo `push` ni merge de Git.
