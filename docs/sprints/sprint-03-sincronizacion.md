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

**Aceptación:** cero eventos perdidos/duplicados; operario no resuelve errores técnicos; jefe de planta ve pendientes.

## Mini pasos, pausas y prompts

### 3.1 Contrato y estados de sincronización

**Prompt:** Diseña push/pull y propagación de cambios: envelope, versión, UUID, secuencia, lotes, cursor, respuestas parciales, idempotencia, timestamps y estados. Cada mutación se confirma primero en SQLite, se envía inmediatamente si hay red y nunca depende de la nube para responder al operario. Define confirmado central, correcciones administrativas entrantes y datos que nunca se sobrescriben.

**Pausa:** representar en papel reintento después de perder respuesta sin producir duplicado.

### 3.2 Ingesta idempotente en API

**Prompt:** Implementa endpoint versionado de ingesta por lotes para los eventos existentes. Valida organización/estación, autorización, esquema y versión; procesa transaccionalmente o responde por elemento según contrato; devuelve resultado estable. No implementes pull aún. Añade integración con PostgreSQL.

**Pausa:** enviar lote válido, duplicado, mixto e inválido; revisar respuesta y base.

### 3.3 Restricciones y recibos centrales

**Prompt:** Refuerza idempotencia en PostgreSQL con claves/índices únicos y recibos de sincronización, no solo memoria de aplicación. Maneja carreras concurrentes y correlación. Prueba dos solicitudes simultáneas con el mismo UUID y confirma un único efecto/auditoría coherente.

**Pausa:** prueba de concurrencia repetida sin duplicados ni 500 inesperado.

### 3.4 Worker de subida desktop

**Prompt:** Implementa worker en segundo plano que reclame elementos outbox, envíe lotes, marque confirmados y reintente con backoff+jitter. Distingue red/5xx/429 de 4xx permanente, libera elementos `SYNCING` abandonados tras reinicio y nunca bloquea UI. Añade reloj/inyección para pruebas deterministas.

**Pausa:** cortar conexión antes, durante y después de respuesta; observar recuperación automática.

### 3.5 Pull incremental de configuración

**Prompt:** Implementa feed incremental con cursor para líneas/componentes, estaciones, trabajadores, proveedores, cargamentos, asignaciones y correcciones administrativas. Aplica transaccionalmente y avanza cursor al completar. Añade señal de cambios para actualización casi en tiempo real cuando hay red, con polling incremental de respaldo; no descargues la base completa.

**Pausa:** bootstrap, dos páginas, interrupción intermedia, reinicio y desactivación sin pérdida local.

### 3.6 Política de conflictos

**Prompt:** Implementa la política documentada: eventos operativos append-only; configuración central prevalece; referencias históricas se conservan; conflicto no resoluble pasa a `FAILED_REVIEW` con causa. No uses “última escritura gana” indiscriminadamente. Añade casos de estación/línea revocada y reloj desviado.

**Pausa:** provocar cada conflicto y confirmar que ninguno desaparece silenciosamente.

### 3.7 Coordinación de varias estaciones

**Prompt:** Añade clientes de sincronización, asignación de líneas y política de solapamiento. Piloto: un punto/una línea; configuración actual: cuatro líneas; futuro: varias líneas por PC y varias PC. Impide o advierte doble operación sobre la misma línea según decisión aprobada.

**Pausa:** escenarios 1 PC/4 líneas, 2 PC/2 líneas y solapamiento intencional.

### 3.8 Estado y diagnóstico

**Prompt:** Crea vista de jefe de planta con última sincronización, pendientes, fallidos, versión, estación, red, desviación horaria y correcciones web recibidas. Una notificación breve abre auditoría con administrador, motivo y cambios. La vista operaria solo muestra estados simples.

**Pausa:** partiendo de un evento fallido, localizar su causa usando pantalla + diagnóstico sin abrir base.

### 3.9 Pruebas de caos y volumen

**Prompt:** Automatiza una matriz de fallos: timeout, DNS, 401/403, 409, 429, 500, lote parcial, respuesta perdida, reinicio, 24 h offline, 10 000 pendientes y concurrencia. Verifica invariantes de eventos, outbox y totales. Documenta límites medidos.

**Pausa:** ejecutar suite varias veces; resultados deterministas y memoria/tiempo aceptables.

### 3.10 Ensayo multiestación y cierre

**Prompt:** Ejecuta prueba integrada con dos equipos o dos perfiles de estación, captura conteos antes/después y consulta PostgreSQL/API. Incluye actualización de catálogo durante desconexión y recuperación. Corrige defectos, completa ficha manual y runbook de sincronización.

**Pausa:** igualdad matemática local/central, cero duplicados/pérdidas y compuerta Sprint 3 aprobada.
