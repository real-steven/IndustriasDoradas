# Sprint 5.9 — Rendimiento y frescura

**Estado:** aprobado por Henry el 2026-10-13. `pnpm run verify`, REN-01 a
REN-05 y el benchmark anual finalizaron correctamente. La advertencia de Vite
por el tamaño bruto del bundle queda como observación menor no bloqueante: la
salida comprimida fue de aproximadamente 153 kB y el recorrido con red lenta
permaneció utilizable.

## Alcance implementado

- La web establece un cursor opaco contra `management/freshness` y consulta la
  señal cada 30 segundos únicamente mientras la pestaña está visible.
- La señal usa el feed `app.sync_changes` de 4.11 y devuelve solo cursor,
  existencia de cambios y fecha efectiva; los datos se vuelven a leer desde los
  endpoints gerenciales.
- Cuando el cursor avanza se invalidan las consultas operativas afectadas. No se
  copian payloads del pull ni se altera el protocolo de desktop.
- Se conserva `Actualizar datos` y ahora actualiza tanto la proyección como la
  señal.
- La interfaz muestra la hora efectiva del último cambio central, no la hora en
  que React terminó la solicitud.
- No se agregó una migración: `ix_sync_changes_pull (organization_id,
  server_sequence)` ya cubre la consulta descendente con límite 1. Cualquier
  índice, caché o cambio de paginación adicional requiere primero una medición.

## Pruebas automatizadas entregadas

| ID | Cobertura |
| --- | --- |
| REN-A01 | El servicio establece un cursor base sin anunciar un cambio falso. |
| REN-A02 | Una secuencia posterior activa `hasChanges`, incluso por encima del límite seguro de `number`. |
| REN-A03 | Un cursor mal formado devuelve `INVALID_MANAGEMENT_CURSOR`. |
| REN-A04 | El repositorio filtra por organización, ordena `server_sequence desc` y limita a una fila. |
| REN-A05 | La web envía el cursor anterior e invalida los datos solo cuando la señal avanza. |
| REN-A06 | El contrato OpenAPI tipa la respuesta de frescura y mantiene la ruta exclusiva de `JEFE_EMPRESA`. |

Henry ejecuta la compuerta habitual:

```powershell
pnpm run verify
```

## Volumen reproducible de un año

El benchmark crea una base temporal aislada, aplica migraciones y seed, genera
365 días × 4 cargamentos diarios × 25 eventos por cargamento y mide cinco veces
la señal, la primera página y la página más profunda del año:

```powershell
pnpm run benchmark:management
```

El resultado JSON informa volumen, tiempo de creación, mediana y máximo. No
modifica Supabase ni la base usada por web/desktop. Para variar la carga:

```powershell
$env:MANAGEMENT_BENCHMARK_EVENTS_PER_SHIPMENT = "250"
pnpm run benchmark:management
Remove-Item Env:MANAGEMENT_BENCHMARK_EVENTS_PER_SHIPMENT
```

Registrar aquí el resultado antes de cerrar el mini-sprint:

| Medición | Mediana | Máximo | Resultado |
| --- | ---: | ---: | --- |
| `freshness-latest-change` | 1,20 ms | 1,41 ms | Aprobado |
| `shipments-first-page` | 68,72 ms | 70,71 ms | Aprobado |
| `shipments-last-page` | 67,93 ms | 69,08 ms | Aprobado |

El fixture generó 1.460 cargamentos, 36.500 eventos de producción y 39.449
cambios incrementales. La última página no se degradó frente a la primera, por
lo que no se justificó agregar índices, caché ni reemplazar la paginación.

## Recorrido manual

### REN-01 — Contrato y autorización

1. Iniciar API y abrir Swagger.
2. Con `JEFE_EMPRESA`, ejecutar `GET
   /api/v1/organizations/{organizationId}/management/freshness`.
3. Confirmar `200`, `hasChanges: false`, cursor no vacío,
   `pollAfterSeconds: 30` y fechas ISO o `effectiveAtUtc: null` si no hay feed.
4. Repetir enviando el cursor recibido: sin una operación nueva debe continuar
   en `false`.
5. Sin token esperar `401`; con otro rol esperar `403`.

### REN-02 — Cambio central y pull incremental

1. Conservar el cursor de REN-01.
2. Registrar y sincronizar una cajuela desde desktop.
3. Repetir frescura con el cursor anterior.
4. Esperar `hasChanges: true`, un cursor distinto y `effectiveAtUtc` igual al
   cambio confirmado centralmente.
5. Confirmar que el siguiente llamado con el cursor nuevo vuelve a `false`.

### REN-03 — Actualización automática y manual

1. Abrir Resumen u Operación y observar `Datos centrales al …`.
2. Sin recargar la página, sincronizar otro cambio desde desktop.
3. Mantener visible la pestaña: la tarjeta debe actualizarse después del
   siguiente intervalo de 30 segundos más la duración de red.
4. Repetir y usar `Actualizar datos`; la consulta debe comenzar de inmediato.
5. Confirmar que no aparece un control de producción en web.

### REN-04 — Red lenta, segundo plano y recuperación

1. En Edge DevTools seleccionar una red lenta y recargar Operación.
2. Confirmar estado de carga, contenido legible y ausencia de solicitudes
   solapadas a `freshness`.
3. Dejar la pestaña en segundo plano por más de 60 segundos: no debe hacer
   polling en segundo plano.
4. Volver a la pestaña y confirmar que la consulta se reanuda.
5. Pasar a offline: los últimos datos permanecen visibles. Volver online y
   confirmar recuperación sin recargar.

### REN-05 — Medición de endpoint y render

1. Con el volumen anual generado, guardar el JSON de
   `pnpm run benchmark:management`.
2. En Network medir `operation-lines`, `shipments` y `freshness`, separando la
   latencia artificial de red del tiempo de servidor.
3. En React DevTools Profiler grabar la llegada de una señal con cambio y el
   nuevo render de Operación.
4. Verificar que solo se actualizan consultas gerenciales y que desktop sigue
   enviando/recibiendo normalmente.

## Objetivos para aprobar con Henry

- Ninguna consulta automática más frecuente que 30 segundos y ninguna en una
  pestaña oculta.
- Señal pequeña y sin payload operacional; una lectura de datos solo cuando el
  cursor cambia o la usuaria pulsa el botón.
- En la carga anual, primera y última página mantienen tiempos utilizables sin
  crecimiento que justifique todavía reemplazar la paginación.
- En red lenta la página conserva feedback y datos previos; no se bloquea la
  sincronización de desktop.
- Si una medición falla, guardar el plan (`EXPLAIN (ANALYZE, BUFFERS)`) antes de
  proponer índices, caché o paginación distintos.

