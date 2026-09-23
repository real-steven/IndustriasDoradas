# Validación de Sprint 3.9 — Caos y volumen

Fecha de implementación: 2026-09-22. Rama: `DevHenry`.

## Alcance implementado

- La matriz local reproduce timeout del cliente y HTTP 408, fallo DNS/red,
  `401`, `403`, `409`, `429`, `500` y `503`, y comprueba si cada respuesta
  vuelve a `PENDING` o termina en `FAILED_REVIEW` según el contrato.
- La pérdida de respuesta después del commit central se reintenta y converge
  con `ALREADY_APPLIED`, el mismo recibo y un solo efecto central.
- Una respuesta parcial confirma únicamente los elementos mencionados. Los
  ausentes vuelven a `PENDING` con `INCOMPLETE_SERVER_RESPONSE`; ninguno queda
  atrapado en `SYNCING`.
- Un lease abandonado se recupera después del reinicio y aumenta el contador de
  intentos sin duplicar el mensaje.
- Después de 24 horas sin revalidación, la estación restaurada conserva Modo
  Operación, bloquea mutaciones de jefe de planta y captura cajuelas/reversos
  como `EXPIRED_CONTINGENCY`. PostgreSQL conserva el recibo de rechazo
  `AUTHORIZATION_EXPIRED_CONTINGENCY` sin crear el efecto de producción.
- Un registro antiguo sin evidencia ya no hereda como si fuera propia la
  autorización vigente al sincronizar: se envía como `LEGACY_UNAVAILABLE`.
- La prueba de volumen crea 10 000 pendientes reales en SQLite, ejecuta dos
  reclamos simultáneos de 500 elementos y drena la cola completa en lotes de
  500. Comprueba UUID únicos, recibos únicos, cero estados residuales e
  `integrity_check = ok`.
- Las pruebas operativas existentes verifican que repetir el mismo comando no
  duplica evento, Outbox ni total, y que dos cargamentos, 120 cajuelas, tres
  reversos y reinicios conservan sus invariantes matemáticas.

## Matriz automatizada

| Escenario | Resultado exigido | Cobertura |
| --- | --- | --- |
| Timeout local / HTTP 408 | `REQUEST_TIMEOUT`, reintentable | `SyncApiTests` |
| DNS o transporte | `NETWORK_UNAVAILABLE`, reintentable | `SyncApiTests` |
| HTTP 401 | `AUTH_REFRESH_REQUIRED`, reintentable | `SyncApiTests` |
| HTTP 403 | código seguro del servidor o rechazo permanente | `SyncApiTests` |
| HTTP 409 | `HTTP_CLIENT_REJECTION`, permanente | `SyncApiTests` |
| HTTP 429 | `RATE_LIMITED`, reintentable | `SyncApiTests` |
| HTTP 500/503 | `SERVER_TEMPORARY_FAILURE`, reintentable | `SyncApiTests` |
| Lote parcial | faltantes a `PENDING`, respuesta por elemento | `SyncApiTests`, `SyncChaosVolumeTests` |
| Respuesta perdida | reintento `ALREADY_APPLIED`, un efecto | `OutboxSyncProcessorTests` |
| Reinicio con lease | recuperación `ABANDONED_CLAIM` | `LocalSqliteStorageTests` |
| Más de 24 h offline | operación restringida y revisión durable | `StationCoordinatorTests`, `ContingencyAuthorizationTests`, `sync-ingestion.spec.ts` |
| 10 000 pendientes | cola íntegra, acotada y drenada | `SyncChaosVolumeTests` |
| Concurrencia | reclamos locales disjuntos; un efecto central | `SyncChaosVolumeTests`, `test-sync-concurrency.mjs` |
| Eventos y totales | idempotencia y suma de cajuelas/reversos | `LocalSqliteStorageTests` |

## Límites medidos

Equipo de desarrollo Windows x64, .NET 10, SQLite WAL con `synchronous=FULL`.
Tres ejecuciones aisladas del escenario de 10 000 pendientes dieron:

| Ejecución | Tiempo de siembra, doble reclamo y drenado | Crecimiento administrado |
| ---: | ---: | ---: |
| 1 | 2.923 s | 895 352 bytes |
| 2 | 3.208 s | 895 808 bytes |
| 3 | 2.939 s | 895 808 bytes |

El límite automatizado permite hasta 120 segundos y 256 MiB de crecimiento
administrado para evitar fallos falsos en agentes más lentos. Los valores
observados quedaron entre 2.923 y 3.208 segundos y por debajo de 0.86 MiB. El
tamaño máximo del lote sigue siendo 500; la prueba nunca carga los 10 000
mensajes a la vez.

La matriz local completa ejecutó 32 pruebas tres veces consecutivas en la misma
sesión sin resultados intermitentes. El comando tardó 46.49 segundos.

## Comandos de validación

Desde la raíz del repositorio:

```powershell
pnpm test:sync:chaos
pnpm test:api
pnpm test:desktop
pnpm verify
```

`test:sync:chaos` repite tres veces la selección marcada `SyncChaos`. Para una
cantidad distinta, entre 1 y 10:

```powershell
$env:SYNC_CHAOS_RUNS='5'
pnpm test:sync:chaos
Remove-Item Env:SYNC_CHAOS_RUNS
```

La carrera central real ya está automatizada y usa UUID nuevos. Selecciona una
línea autorizada sin cargamento activo y completa el cargamento de prueba al
terminar para liberar esa línea. Debe ejecutarse con el proyecto de desarrollo
conectado y las variables de `apps/api/.env.local` disponibles:

```powershell
pnpm test:sync:concurrency
```

El resultado esperado contiene `"outcome": "concurrency-safe"`, una respuesta
`APPLIED`, otra `ALREADY_APPLIED` y exactamente un cargamento, una asignación,
un recibo y una auditoría con la misma correlación.

## Estado de la pausa

La pausa quedó aprobada el 2026-09-22:

1. `pnpm verify` terminó correctamente.
2. La matriz local ejecutó 32 pruebas tres veces consecutivas sin resultados
   intermitentes.
3. La primera carrera central eligió una línea ya ocupada y ambas solicitudes
   convergieron correctamente al mismo recibo
   `FAILED_REVIEW/LINE_OPERATION_CONFLICT`. El script se corrigió para excluir
   líneas con cargamento activo y cerrar su propio cargamento al finalizar.
4. La repetición usó la Línea 2 y devolvió `APPLIED` + `ALREADY_APPLIED`, con un
   solo cargamento, asignación, recibo y evento de auditoría. El recibo fue
   `45e8e2d1-e69d-4c50-9564-fdc01b086642` y la correlación compartida
   `c5fc181d-5f60-483d-80ed-d5971b17769f`.
5. Una consulta posterior confirmó que el cargamento de prueba quedó
   `COMPLETED`; la línea no permaneció bloqueada.

3.9 no agrega ni modifica migraciones de Supabase.

No se hizo `push` ni merge de Git.
