# Persistencia y API de inventario — Sprint 7.4–7.5

**Estado:** implementada y verificada  
**Fecha:** 2026-10-26  
**API:** implementada en 7.5
**Sincronización:** reservada para 7.7

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
actualizarlos ni borrarlos. La API es la frontera de autorización para
`JEFE_PLANTA` y `JEFE_EMPRESA`: ambos requieren `inventory.manage`; el primero
solo opera plantas incluidas en `user_plant_scopes` y la gerencia queda limitada
a su organización. La clave de backend nunca se entrega a desktop o web.

## API 7.5

La ruta base es
`/api/v1/organizations/{organizationId}/inventory`. Los casos publicados son:

- listar, crear y activar/desactivar tipos, unidades y artículos;
- listar el kardex y registrar entrada, salida, consumo o devolución;
- registrar ajuste motivado y reverso exacto de un movimiento;
- registrar una revisión física completa o parcial en una transacción;
- registrar instalación, retiro o reemplazo de componentes de rastra.

Los cuerpos aceptan una cantidad positiva para los movimientos ordinarios; el
servicio la convierte al delta firmado del kardex. El ajuste recibe
`quantityDelta` distinto de cero. El reverso obtiene el movimiento original y
crea su inverso enlazado, sin editarlo. El conteo físico calcula estado y
diferencias, pero no modifica el saldo. Cada mutación genera auditoría con actor
y correlación.

`app.inventory_balance_v1` devuelve la suma derivada exacta y
`app.record_inventory_review_v1` persiste cabecera y líneas de conteo
atómicamente. Ambas funciones son privadas y solo pueden ejecutarse con
`service_role`. La comprobación previa mejora el mensaje de saldo insuficiente;
el trigger y el bloqueo transaccional de PostgreSQL siguen siendo la autoridad
si hay una carrera.

## Migración y evidencia

- Central: `20261026191811_sprint_7_4_inventory_persistence.sql`.
- API central: `20261026202144_sprint_7_5_inventory_api.sql`.
- Local: `020_inventory_persistence.sql`, actualización desde versión 19.
- Central: 25 migraciones desde cero, seed idempotente y 22 pruebas SQL.
- Desktop: 20 migraciones, actualización sin pérdida y 269 pruebas aprobadas.
- API: 20 suites/119 pruebas unitarias y 34 pruebas E2E aprobadas.

Los casos automáticos reconstruyen el saldo de martillos, una revisión con
diferencia, tres instalaciones encadenadas que dejan una activa y una novedad
abierta a las 17:30 y cerrada a las 19:15. También prueban rechazo por negativo,
precisión, reintegro excesivo y mutación del historial.

## Límites después de 7.5

Todavía no existen outbox/pull de inventario ni pantallas desktop/web. La API de
7.5 no publica novedades operativas, cuya integración pertenece a los pasos
posteriores. Tampoco se crean compras, costos, varias bodegas, conversiones de
unidad, órdenes de mantenimiento o consumo automático de mercurio. Esos límites
conservan el contrato aprobado en 7.1–7.3.
