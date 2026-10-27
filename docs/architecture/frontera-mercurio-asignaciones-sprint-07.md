# Frontera de mercurio y asignaciones — Sprint 7.9

**Estado:** implementado el 2026-10-27.

## Decisión funcional

Las mediciones `SWEEP_INPUT` y `SWEEP_REMAINDER` describen lo observado en una
barrida. Su diferencia no representa por sí sola consumo, pérdida ni merma de
inventario. El kardex de mercurio solo cambia cuando un jefe autorizado registra
un acto físico independiente (`ENTRY`, `EXIT`, `CONSUMPTION`, `RETURN`,
`ADJUSTMENT` o `REVERSAL`).

Cuando ese acto corresponde a una barrida, el movimiento puede guardar un único
`linked_sweep_id`. El enlace no tiene cantidad y no ejecuta cálculos sobre las
mediciones: la cantidad vive exclusivamente en el movimiento de inventario.

## Persistencia e invariantes

`inventory_sweep_links` es append-only y usa como clave la organización y el
movimiento. Sus restricciones y validadores garantizan que:

- movimiento y barrida pertenecen a la misma organización y planta;
- un movimiento solo puede enlazarse con una barrida;
- un reverso conserva el mismo enlace que el hecho original;
- actualizar o eliminar el enlace se rechaza;
- repetir una escritura con la misma pareja es idempotente y una pareja distinta
  se reporta como conflicto.

El RPC `record_inventory_movement_v2` crea movimiento y enlace en la misma
transacción. El API no inserta directamente en las tablas. PostgreSQL mantiene
la tabla en el esquema privado `app`, con RLS y acceso exclusivo del
`service_role`.

## Sincronización local-first

El contrato de movimiento versión 2 añade `linkedSweepId`, que puede ser nulo.
El servidor continúa aceptando la versión 1 para estaciones todavía no
actualizadas. La ingestión v2 delega las reglas existentes a la ingestión v1 y
después agrega el enlace dentro de la misma transacción.

SQLite guarda el movimiento, el enlace y el mensaje Outbox versión 2 de forma
atómica. Pull puede recibir primero el movimiento y después su enlace; el segundo
cambio enriquece la proyección existente sin sumar otra vez la cantidad. Por
eso un reintento, una llegada fuera de orden o una corrección conserva un solo
efecto neto.

## Herramientas entregadas a trabajadores

No existe una segunda tabla mutable de custodia. La vista
`management_inventory_assignments` reconstruye la asignación desde hechos:

- una `EXIT` de un artículo cuyo tipo es `HERRAMIENTA` y que tiene
  `responsible_worker_id` inicia la entrega;
- las `RETURN` enlazadas a esa salida acumulan la cantidad devuelta;
- el saldo pendiente es cantidad entregada menos devoluciones válidas;
- un reverso de la salida la presenta como devuelta, sin borrar historia;
- el estado derivado es `ASSIGNED` mientras exista cantidad pendiente y
  `RETURNED` al quedar en cero.

La API expone la proyección paginada y filtrable por trabajador o estado. El
navegador no recibe acceso directo a Supabase. Una salida sin responsable sigue
siendo válida, pero no se presenta como asignación personal.

## Verificación

Las pruebas cubren el saldo de mercurio independiente de las mediciones de
barrida, enlace y reverso idempotentes, proyección de martillo entregado y
devuelto, privacidad, compatibilidad de sincronización v1/v2, persistencia
SQLite atómica y enriquecimiento por pull sin duplicar el saldo.
