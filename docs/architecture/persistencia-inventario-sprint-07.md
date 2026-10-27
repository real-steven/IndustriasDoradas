# Persistencia de inventario — Sprint 7.4

**Estado:** implementada y verificada  
**Fecha:** 2026-10-26  
**API y sincronización:** reservadas para 7.5 y 7.7

## Autoridad y exactitud

La existencia de un artículo es siempre la suma de sus movimientos. Ni
PostgreSQL ni SQLite guardan un `stock` editable. PostgreSQL usa
`numeric(18,3)`; SQLite guarda milésimas en enteros y aplica la precisión de la
unidad con residuos exactos. Esto permite unidades enteras y hasta tres
decimales sin depender de `REAL`.

Los catálogos de tipo, unidad, artículo y categoría de novedad pueden cambiarse
sin borrar historia. Movimientos, revisiones, líneas de revisión, cambios de
componentes y cambios de novedad son append-only. Corregir un movimiento exige
otro hecho: reverso o ajuste motivado.

## Tablas

| Concepto | PostgreSQL y SQLite |
| --- | --- |
| Catálogo | `inventory_item_types`, `inventory_units`, `inventory_items` |
| Kardex | `inventory_movements` |
| Conteo físico | `inventory_reviews`, `inventory_review_lines` |
| Vida del componente | `rastra_component_changes` |
| Novedades | `operational_novelty_categories`, `operational_novelty_changes` |

Cada hecho central usa UUID, organización, actor y fechas UTC. Los hechos que
nacen en desktop pueden agregar estación y secuencia; ambos aparecen juntos y
forman la llave de idempotencia local. Las mutaciones web futuras no inventarán
una estación.

## Integridad

- artículo, unidad, organización y planta deben coincidir;
- la precisión configurada limita las cantidades aceptadas;
- una salida o consumo que dejaría saldo negativo se rechaza;
- un reintegro vinculado solo apunta a una salida y no puede superarla;
- un reverso compensa exactamente una vez y no puede revertir otro reverso;
- una salida parcialmente reintegrada no admite reverso completo;
- una revisión guarda esperado, contado y diferencia, pero no mueve stock;
- retiro o reemplazo requiere una instalación anterior de la misma rastra;
- un reemplazo cierra una instalación y abre otra en un solo hecho;
- el cierre de novedad requiere apertura anterior en la misma planta.

PostgreSQL toma un bloqueo transaccional por organización/artículo antes de
validar el saldo. Esto evita que dos escrituras centrales simultáneas aprueben
el mismo saldo. La política funcional para movimientos offline rechazados y su
visibilidad se completa en 7.7.

## Seguridad

Las nueve tablas están en el esquema privado `app`, con RLS habilitado. `anon`
y `authenticated` no tienen acceso directo. `service_role` puede mantener los
cuatro catálogos y solo consultar/agregar hechos históricos; tampoco puede
actualizarlos ni borrarlos. La API de 7.5 será la frontera de autorización para
`JEFE_PLANTA` y `JEFE_EMPRESA`.

## Migración y evidencia

- Central: `20261026191811_sprint_7_4_inventory_persistence.sql`.
- Local: `020_inventory_persistence.sql`, actualización desde versión 19.
- Central: 24 migraciones desde cero, seed idempotente y 21 pruebas SQL.
- Desktop: 20 migraciones, actualización sin pérdida y 269 pruebas aprobadas.

Los casos automáticos reconstruyen el saldo de martillos, una revisión con
diferencia, tres instalaciones encadenadas que dejan una activa y una novedad
abierta a las 17:30 y cerrada a las 19:15. También prueban rechazo por negativo,
precisión, reintegro excesivo y mutación del historial.

## Límites de 7.4

Todavía no existen endpoints, repositorios de aplicación, outbox/pull para
inventario ni pantallas. Tampoco se crean compras, costos, varias bodegas,
conversiones de unidad, órdenes de mantenimiento o consumo automático de
mercurio. Esos límites conservan el contrato aprobado en 7.1–7.3.
