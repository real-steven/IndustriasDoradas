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
iniciar 3.7. La migración no los modifica ni elige uno arbitrariamente. Los dos
deben finalizar por el flujo normal; mientras exista alguno, cualquier nuevo
inicio sobre Línea 1 será rechazado para revisión.

## Archivos principales

- `supabase/migrations/20260920203542_sync_multi_station_coordination.sql`
- `supabase/tests/012_sync_multi_station_coordination.sql`
- `apps/api/src/sync/sync.service.ts`
- `apps/api/src/sync/supabase-sync.repository.ts`
- `apps/desktop/src/IndustriasDoradas.Desktop/Presentation/ViewModels/StationViewModel.cs`

## Validación automática pendiente

Desde la raíz del repositorio:

```powershell
pnpm verify
```

Para aislar un fallo, los grupos relevantes son `pnpm test:db`,
`pnpm test:api`, `pnpm test:desktop`, `pnpm format:check`, `pnpm lint`,
`pnpm build`, `pnpm contract:check` y `pnpm secrets:check`.

Antes de aplicar en Supabase:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --dry-run
npx.cmd supabase db push --linked
npx.cmd supabase migration list --linked
```

El `dry-run` debe listar únicamente
`20260920203542_sync_multi_station_coordination.sql` y la lista final debe
mostrar la misma versión en Local y Remote.

## Pausa manual pendiente

1. Con cuatro líneas activas en una PC, entrar como jefe. Confirmar que ninguna
   se selecciona automáticamente y que el botón de preparación sigue bloqueado
   hasta escoger una.
2. Seleccionar Línea 3, salir y volver a entrar a modo jefe. Confirmar que se
   conserva si continúa activa.
3. Desactivar o quitar el alcance de Línea 3, actualizar y volver a modo jefe.
   Confirmar que la selección queda vacía y no cambia a Línea 1, 2 o 4.
4. Reactivar Línea 3. Confirmar que sigue sin seleccionarse hasta que el usuario
   la elija de nuevo.
5. Con dos estaciones, iniciar una operación en Línea 3 desde la primera y otra
   en Línea 4 desde la segunda. Ambas deben sincronizar.
6. Mientras Línea 3 siga activa, iniciar otro cargamento sobre Línea 3 desde la
   segunda estación. Debe quedar en revisión con
   `LINE_OPERATION_CONFLICT`; el primer cargamento y sus eventos no cambian.
7. Finalizar el primer cargamento de Línea 3 y crear uno nuevo desde la segunda
   estación. El nuevo inicio debe sincronizar.

No se hizo `push` ni merge de Git.
