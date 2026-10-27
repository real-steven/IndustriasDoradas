# Sincronización de inventario — Sprint 7.7

**Estado:** implementado y verificado automáticamente  
**Fecha:** 2026-10-26

## Decisión de concurrencia

El servidor procesa cada artículo del `push` en una transacción y serializa los
movimientos por artículo. Si dos estaciones desconectadas registran salidas que
juntas superan la existencia central, gana la que se confirma primero. La otra
recibe `FAILED_REVIEW` con `INVENTORY_STOCK_INSUFFICIENT`.

El rechazo crea un recibo idempotente y un evento de auditoría. El hecho local
y su outbox permanecen en la estación como conflicto; no se borran ni se hacen
pasar por sincronizados. Reenviar el mismo mensaje devuelve el mismo recibo y
no duplica el kardex.

## Llegada fuera de orden

`stationSequence` identifica cada hecho y detecta colisiones, pero no exige
orden consecutivo. Una secuencia 1002 puede llegar antes que 1001. Las
dependencias reales —artículo, unidad, trabajador o movimiento relacionado— sí
deben existir; si todavía no llegaron, el servidor responde `RETRY_LATER` sin
crear un recibo terminal.

## Push y pull

El contrato v1 incorpora:

- `INVENTORY_MOVEMENT_RECORDED`;
- `INVENTORY_REVIEW_RECORDED`;
- `INVENTORY_ITEM_TYPE`, `INVENTORY_UNIT`, `INVENTORY_ITEM`,
  `INVENTORY_MOVEMENT` e `INVENTORY_REVIEW` en el feed incremental.

Tipos, unidades y artículos se proyectan en SQLite en orden de dependencia. El
kardex confirmado se guarda separado del hecho local: **central conocido** es
la suma del espejo confirmado; **saldo local** agrega además los hechos del
equipo que continúan pendientes o rechazados. Esto permite mostrar un conflicto
sin bloquear la llegada de un movimiento válido de otra estación.

Las revisiones físicas se sincronizan con sus líneas en una sola transacción y
siguen sin modificar existencias automáticamente.

## Seguridad y auditoría

La RPC privada solo se concede a `service_role`, valida estación, versión de
permisos, autorización offline y `inventory.manage`. El permiso queda asignado
a `JEFE_PLANTA` y `JEFE_EMPRESA`; las tablas privadas conservan RLS y no se
exponen directamente a `authenticated` ni `anon`.

## Evidencia automática

- dos estaciones, dos salidas y saldo conjunto insuficiente;
- recibo estable al reintentar un rechazo y un hecho aceptado;
- llegada fuera de orden sin exigir huecos de secuencia;
- revisión física idempotente y publicación incremental;
- catálogo recibido por pull y disponible en desktop;
- movimiento rechazado visible junto al saldo central convergente;
- base de datos completa, 122 pruebas API, 34 e2e y 275 pruebas desktop.

La prueba manual multi-PC es complementaria: no sustituye estas invariantes y
puede ejecutarse al validar visualmente el módulo antes del cierre 7.10.
