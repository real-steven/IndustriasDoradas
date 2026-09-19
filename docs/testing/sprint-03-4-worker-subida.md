# Sprint 3.4 — Worker de subida desktop

Fecha de implementación local: 2026-09-19. Rama: `DevHenry`.

## Comportamiento implementado

- El worker se ejecuta como servicio en segundo plano y no espera desde el hilo
  de WPF.
- La migración SQLite 007 conserva la Outbox existente, asigna una secuencia
  estable por estación y mapea estados heredados a
  `PENDING/SYNCING/SYNCED/FAILED_REVIEW`.
- Cada lote se reclama dentro de una transacción inmediata con `claimId` y lease.
  Un lease vencido vuelve a `PENDING` y puede reclamarse después de reiniciar.
- `attemptCount` aumenta al reclamar para un intento de red. Los reintentos usan
  backoff exponencial limitado a cinco minutos y jitter inyectable.
- La autorización, actor y ventana offline quedan capturados con la mutación
  local. Un inicio de sesión posterior no cambia la atribución del evento.
- El cliente envía el contrato push v1 con un máximo configurable de 500
  elementos y aplica cada resultado por separado.
- `APPLIED/ALREADY_APPLIED` requieren recibo central y terminan en `SYNCED`.
  `RETRY_LATER` vuelve a `PENDING`; `FAILED_REVIEW` se conserva sin reintento.
- Red, timeout, 401, 408, 429 y 5xx son transitorios. Otros 4xx son permanentes.
  Respuestas incompletas o inválidas no confirman mensajes.
- Un error inesperado no derriba la aplicación; el lease evita que el lote quede
  bloqueado indefinidamente.

## Verificación automática

- 119 pruebas desktop aprobadas.
- Compilación Release sin advertencias.
- Casos nuevos: migración de Outbox, reclamo y secuencia, backoff determinista,
  respuesta parcial, recibo obligatorio, recuperación de lease, falta de sesión,
  429, 503, 400 y serialización del envelope HTTP.
- Las 76 pruebas de API y las 9 pruebas SQL ya validaban la contraparte del push
  antes de iniciar este punto.

## Pausa manual pendiente

La aceptación de 3.4 aún requiere ejecutar el escritorio contra un API y
PostgreSQL reales, cortar la conexión antes, durante y después de la respuesta,
cerrar el proceso con un lote `SYNCING` y confirmar recuperación sin duplicados.
También debe comprobarse visualmente que la captura de cajuelas conserva su
latencia y que la UI continúa respondiendo.

No se aplicaron migraciones remotas, no se hizo push y no se inició el pull 3.5.
