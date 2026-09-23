# Sprint 3 — Sincronización y estaciones (semanas 6–7)

**Objetivo:** consolidar una o varias computadoras con Internet inestable.

**Entregable:** una o más estaciones guardan localmente, sincronizan de inmediato cuando hay red y convergen en PostgreSQL sin pérdida/duplicación.

## Orden de trabajo

1. API por lotes con UUID/idempotencia, transacción y respuesta por evento.
2. Restricciones PostgreSQL contra duplicación.
3. Worker desktop: lotes, backoff+jitter, reanudación y errores temporales/permanentes.
4. Pull incremental de catálogos/asignaciones con cursor e inactivos.
5. Propagación casi en tiempo real de cambios centrales y notificación de correcciones administrativas.
6. Conflictos: eventos se anexan; catálogo central prevalece; irresolubles quedan para revisión.
7. Estados `PENDING/SYNCING/SYNCED/FAILED_REVIEW` y panel jefe de planta.
8. Registrar estación, versión, última sync y desviación de reloj.
9. Métricas y diagnóstico exportable sin secretos.

**Pruebas:** repetir lote; cortar red antes/durante/después; reiniciar; 24 h offline; concurrencia; aislar evento inválido.

**Prueba manual:** dos equipos para líneas 1–2 y 3–4, luego superposición deliberada; comparar SQLite/API/PostgreSQL.

**Aceptación:** cero eventos perdidos/duplicados; Modo Operación no expone errores técnicos; jefe de planta ve pendientes.

## Mini pasos, pausas y prompts

### 3.1 Contrato y estados de sincronización

**Estado:** aprobado para implementación mediante la orden `R`; diseñado el
2026-09-08 y contrastado con la Outbox SQLite real. Contrato en
[`../architecture/contrato-sincronizacion-sprint-03.md`](../architecture/contrato-sincronizacion-sprint-03.md).

**Prompt:** Diseña push/pull y propagación de cambios: envelope, versión, UUID, secuencia, lotes, cursor, respuestas parciales, idempotencia, timestamps y estados. Cada mutación se confirma primero en SQLite, se envía inmediatamente si hay red y nunca depende de la nube para responder al Modo Operación. Define confirmado central, revalidación de la estación al recuperar conexión, correcciones administrativas entrantes y datos que nunca se sobrescriben.

**Pausa:** representar en papel reintento después de perder respuesta sin producir duplicado.

### 3.2 Ingesta idempotente en API

**Estado:** implementado el 2026-09-15; pendiente de la pausa manual. El API
procesa cada elemento en su propia transacción PostgreSQL, conserva recibos
centrales y devuelve resultados parciales estables. El pull permanece fuera de
alcance.

**Prompt:** Implementa endpoint versionado de ingesta por lotes para los eventos existentes. Valida organización/estación, autorización, esquema y versión; procesa transaccionalmente o responde por elemento según contrato; devuelve resultado estable. No implementes pull aún. Añade integración con PostgreSQL.

**Pausa:** enviar lote válido, duplicado, mixto e inválido; revisar respuesta y base.

### 3.3 Restricciones y recibos centrales

**Estado:** implementado el 2026-09-15; pendiente de la pausa manual. PostgreSQL
serializa cada `(organization_id, station_id, outbox_message_id)` mediante un
bloqueo transaccional, conserva restricciones únicas como defensa final y
mantiene la misma correlación entre recibo y auditoría.

**Correcciones locales del 2026-09-19:** normalización de producción v2,
dependencias pendientes reintentables y conflictos permanentes aislados.
Ver [evidencia y pendientes](../testing/sprint-03-correcciones-ingesta.md).
La migración nueva requiere aplicación al entorno destino; estas pruebas no
sustituyen la pausa manual ni la prueba de concurrencia con conexiones reales.

**Prompt:** Refuerza idempotencia en PostgreSQL con claves/índices únicos y recibos de sincronización, no solo memoria de aplicación. Maneja carreras concurrentes y correlación. Prueba dos solicitudes simultáneas con el mismo UUID y confirma un único efecto/auditoría coherente.

**Pausa:** prueba de concurrencia repetida sin duplicados ni 500 inesperado.

### 3.4 Worker de subida desktop

**Estado:** implementado localmente en `DevHenry` el 2026-09-19; pendiente de
la pausa manual. La Outbox usa estados `PENDING/SYNCING/SYNCED/FAILED_REVIEW`,
secuencia por estación, reclamo atómico con lease, respuesta por elemento y
backoff exponencial con jitter. La autorización se captura al crear la mutación,
no al enviarla. Evidencia en
[`../testing/sprint-03-4-worker-subida.md`](../testing/sprint-03-4-worker-subida.md).

**Prompt:** Implementa worker en segundo plano que reclame elementos outbox, envíe lotes, marque confirmados y reintente con backoff+jitter. Distingue red/5xx/429 de 4xx permanente, libera elementos `SYNCING` abandonados tras reinicio y nunca bloquea UI. Añade reloj/inyección para pruebas deterministas.

**Pausa:** cortar conexión antes, durante y después de respuesta; observar recuperación automática.

### 3.5 Pull incremental de configuración

**Estado:** completado en `DevHenry` el 2026-09-20. Las migraciones centrales
quedaron aplicadas, el historial local/remoto quedó alineado y las pruebas
automáticas y manuales fueron aprobadas. El API entrega un cursor opaco por
páginas y una señal SSE que solo anuncia disponibilidad. WPF aplica cada página
y su cursor en una transacción SQLite, conserva inactivos, versiones, recibos y
revisiones, y mantiene polling como respaldo. Evidencia en
[`../testing/sprint-03-5-pull-incremental.md`](../testing/sprint-03-5-pull-incremental.md).

**Prompt:** Implementa feed incremental con cursor para líneas/componentes, estaciones, trabajadores, proveedores, cargamentos, asignaciones y correcciones administrativas. Aplica transaccionalmente y avanza cursor al completar. Añade señal de cambios para actualización casi en tiempo real cuando hay red, con polling incremental de respaldo; no descargues la base completa.

**Pausa:** bootstrap, dos páginas, interrupción intermedia, reinicio y desactivación sin pérdida local.

### 3.6 Política de conflictos

**Estado:** completado en `DevHenry` el 2026-09-20. La migración central quedó
aplicada, el historial remoto quedó alineado y la pausa manual confirmó rechazo
durable y recuperación posterior. PostgreSQL clasifica estación o línea
revocada, versión de permisos obsoleta y reloj futuro sin crear efectos de
negocio, pero conserva un recibo y auditoría de `FAILED_REVIEW`. El cliente
preserva el código seguro devuelto por el API. Evidencia en
[`../testing/sprint-03-6-politica-conflictos.md`](../testing/sprint-03-6-politica-conflictos.md).

**Prompt:** Implementa la política documentada: eventos operativos append-only; configuración central prevalece; referencias históricas se conservan; conflicto no resoluble pasa a `FAILED_REVIEW` con causa. No uses “última escritura gana” indiscriminadamente. Añade casos de estación/línea revocada y reloj desviado.

**Pausa:** provocar cada conflicto y confirmar que ninguno desaparece silenciosamente.

### 3.7 Coordinación de varias estaciones

**Estado:** completado en `DevHenry` el 2026-09-20. La migración central quedó
aplicada, el historial local/remoto está alineado y las pruebas automáticas y
manuales fueron aprobadas. La política elegida bloquea un segundo cargamento activo sobre la misma línea con
`FAILED_REVIEW/LINE_OPERATION_CONFLICT`, permite estaciones concurrentes en
líneas diferentes y registra versión/último contacto por estación. Desktop ya
no cambia automáticamente de línea cuando cambia el catálogo. La prueba física
con una segunda estación queda en 3.10 porque el entorno actual solo tiene
`ESTACION_1`; los escenarios multiestación de 3.7 quedaron cubiertos en SQL y
API. Evidencia y resultados
en [`../testing/sprint-03-7-coordinacion-estaciones.md`](../testing/sprint-03-7-coordinacion-estaciones.md).

**Hallazgo de entrada:** al desactivar la Línea 1 seleccionada, desktop cambió
automáticamente a Línea 2 y regresó a Línea 1 al reactivarla. 3.7 debe definir
una selección visible y estable para evitar que un cambio de catálogo dirija
una operación a otra línea sin decisión del usuario.

**Prompt:** Añade clientes de sincronización, asignación de líneas y política de solapamiento. Piloto: un punto/una línea; configuración actual: cuatro líneas; futuro: varias líneas por PC y varias PC. Impide o advierte doble operación sobre la misma línea según decisión aprobada.

**Pausa:** escenarios 1 PC/4 líneas, 2 PC/2 líneas y solapamiento intencional.

### 3.8 Estado y diagnóstico

**Estado:** completado en `DevHenry` el 2026-09-20. Las pruebas automáticas y
manuales fueron aprobadas y las catorce migraciones quedaron alineadas en
Supabase, incluida `20260921013125_expand_sync_administrative_corrections.sql`.
La vista exclusiva de jefe de planta muestra estación, versión, red, última
sincronización, desviación horaria, conteos y causas seguras de fallos. Las
mutaciones administrativas centrales con cambios auditados se publican como
`CORRECTION_APPENDED` y abren una auditoría local con administrador, motivo y
cambios permitidos. La prueba confirmó la corrección y restauración de un
proveedor, la continuidad local durante un corte de Internet y la recuperación
automática a `Nube disponible`. El reporte JSON omite tokens, PIN y payloads
operativos. El pie visible del escritorio y la versión enviada al API
identifican Sprint 3 (`0.3.0`). Evidencia y resultados en
[`../testing/sprint-03-8-estado-diagnostico.md`](../testing/sprint-03-8-estado-diagnostico.md).

**Prompt:** Crea vista de jefe de planta con última sincronización, pendientes, fallidos, versión, estación, red, desviación horaria y correcciones web recibidas. Una notificación breve abre auditoría con administrador, motivo y cambios. El Modo Operación solo muestra estados simples y nunca permite resolver fallos técnicos.

**Pausa:** partiendo de un evento fallido, localizar su causa usando pantalla + diagnóstico sin abrir base.

### 3.9 Pruebas de caos y volumen

**Estado:** completado en `DevHenry` el 2026-09-22. La matriz
automatiza transporte, respuestas HTTP, lotes parciales, respuesta perdida,
reinicio, contingencia vencida, 10 000 pendientes y reclamos concurrentes. La
suite local fue determinista en tres ejecuciones; detectó y corrigió la
restauración después de 24 horas, la evidencia de autorización vencida y el
bloqueo de mutaciones privilegiadas. `pnpm verify` pasó y la carrera real en
Supabase produjo `APPLIED` + `ALREADY_APPLIED`, un único efecto y el mismo
recibo. El cargamento de prueba se completó automáticamente para liberar la
línea. No requiere migración. Evidencia y límites medidos en
[`../testing/sprint-03-9-caos-volumen.md`](../testing/sprint-03-9-caos-volumen.md).

**Prompt:** Automatiza una matriz de fallos: timeout, DNS, 401/403, 409, 429, 500, lote parcial, respuesta perdida, reinicio, 24 h offline, 10 000 pendientes y concurrencia. Verifica invariantes de eventos, outbox y totales. Documenta límites medidos.

**Pausa:** ejecutar suite varias veces; resultados deterministas y memoria/tiempo aceptables.

### 3.10 Ensayo multiestación y cierre

**Prompt:** Ejecuta prueba integrada con dos equipos o dos perfiles de estación, captura conteos antes/después y consulta PostgreSQL/API. Incluye actualización de catálogo durante desconexión y recuperación. Corrige defectos, completa ficha manual y runbook de sincronización.

**Pausa:** igualdad matemática local/central, cero duplicados/pérdidas y compuerta Sprint 3 aprobada.
