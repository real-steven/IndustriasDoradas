# Componentes de rastra y novedades — Sprint 7.3

**Estado:** dominio puro implementado
**Fecha:** 2026-10-26
**Persistencia:** reservada para 7.4
**API, sincronización y UI:** reservadas para 7.5–7.8

## Propósito

Conservar una línea temporal mínima de componentes instalados en las rastras y
explicar períodos sin producción mediante novedades simples. El diseño reutiliza
el catálogo flexible de inventario, no inventa el nombre del componente físico
y no convierte este módulo en un CMMS.

## Contexto auditable común

`PlantRecordContext` conserva organización, planta, actor autenticado y,
cuando el hecho nace en desktop, estación y secuencia cliente. El trabajador
relacionado es opcional y nunca reemplaza al actor que registra. Una mutación
gerencial puede carecer de estación/secuencia, igual que en el kardex.

El UUID cliente repetido con contenido idéntico es un reintento. El mismo UUID
con otro contenido o una secuencia de estación reutilizada para otro cambio es
conflicto. PostgreSQL y SQLite deberán volver a imponer estas reglas en 7.4.

## Componentes de rastra

Una instalación conserva:

- rastra y artículo configurable de la misma organización/planta;
- copia del tipo, nombre, unidad y cantidad del artículo;
- identificador físico opcional;
- condición y fecha de instalación;
- actor, responsable opcional y observación opcional.

No se codifica `LLANTA`, `FILTRO` ni otro nombre como regla. El catálogo o la
interfaz podrán proponer artículos de repuesto, pero el dominio no depende de
un código rígido. Solo se inicia historia con artículo y tipo activos, y la
cantidad respeta la precisión de su unidad.

`INSTALLATION`, `REMOVAL` y `REPLACEMENT` son cambios inmutables. Un retiro
exige condición y motivo. Un reemplazo es un solo cambio auditable que cierra
la instalación activa indicada y abre otra en el mismo instante; la anterior
conserva condición final, actor, motivo y enlace a la nueva, mientras la nueva
enlaza a la anterior. No se puede cerrar dos veces ni retirar antes de instalar.

La proyección admite varias instalaciones activas en la misma rastra. La
empresa todavía no confirmó si cada rastra lleva uno o varios componentes del
mismo tipo, por lo que imponer una cardinalidad de uno perdería información.
El reemplazo siempre identifica por UUID cuál instalación concreta cierra.

La vida útil observada es `retiro - instalación`. No hay estimación, alerta
predictiva ni bloqueo. Instalar tampoco genera automáticamente una salida o
consumo de inventario: cualquier enlace transaccional con el kardex debe
definirse después sin duplicar efectos ni inferir cantidades.

## Novedades operativas

Una categoría es catálogo configurable y opcional. `PARO`, `MANTENIMIENTO`,
`EMERGENCIA`, `FERIADO` y `OTRO` son opciones iniciales de interfaz, no un
`enum` cerrado del dominio. La novedad exige descripción e inicio; una línea
opcional reduce el alcance y su ausencia significa toda la planta.

La apertura y el cierre son hechos separados e inmutables. Por eso una novedad
puede permanecer abierta, cerrarse por otro actor y atravesar medianoche o el
cambio de jornada. La proyección conserva actores y responsables de ambos
momentos, calcula duración y permite consultar si un instante estuvo cubierto.

Una novedad solo explica operación. No crea órdenes de trabajo, agenda,
repuestos, costos, mantenimiento preventivo ni predicciones.

## Escenario de aceptación automatizado

### Dos reemplazos

| Orden | Acción | Resultado proyectado |
| ---: | --- | --- |
| 1 | Instalar Componente A | A activo. |
| 2 | Reemplazar A por B a los 30 días | A cerrado con vida útil de 30 días; B activo y enlazado con A. |
| 3 | Reemplazar B por C a los 60 días | B cerrado con vida útil de 30 días; C activo y enlazado con B. |

La proyección contiene las tres instalaciones y los tres cambios. Solo C queda
activo; A y B no se sobrescriben ni desaparecen.

### Novedad que cruza jornada

Una novedad `MANTENIMIENTO` para una línea inicia a las 17:30 y finaliza a las
19:15. Conserva descripción, línea, actor de apertura, trabajador relacionado,
actor de cierre y duración de 105 minutos. El intervalo de las 18:30 queda
cubierto aunque corresponda a otra jornada operativa.

## Invariantes probadas

1. Organización, planta y rastra no se mezclan en una línea temporal.
2. Artículo, tipo y unidad deben estar activos al instalar.
3. Cantidad, condición de instalación, condición de retiro y motivo respetan
   obligatoriedad y precisión.
4. Solo una instalación activa existente puede retirarse o reemplazarse.
5. UUID y secuencia de estación son idempotentes y no se reutilizan.
6. Descripción e inicio son obligatorios para novedades; tipo, línea, fin y
   trabajador relacionado son opcionales.
7. Una novedad no finaliza antes de iniciar ni puede cerrarse dos veces.
8. Una categoría desactivada conserva historia pero no se usa en aperturas
   nuevas.

`InventoryMaintenanceDomainTests.cs` contiene 12 pruebas para estas reglas.
La regresión desktop completa aprobó 238 de 238 pruebas el 2026-10-26.

## Límite hacia 7.4

7.4 debe representar los cambios y sus relaciones en PostgreSQL/SQLite con FK
tenant, UUID, secuencias, checks temporales e índices. No debe reemplazar los
hechos por una única fila mutable que pierda actores o estados anteriores. La
integración con movimientos de inventario, si se aprueba, debe ser explícita e
idempotente; nunca se deduce del uso de la rastra ni de mediciones de mercurio.

## Pausa manual

El desarrollador comprobará:

1. que dos reemplazos muestren A → B → C, con A/B cerrados y C activo;
2. que cada cierre muestre condición, motivo, responsable y fechas;
3. que una novedad abierta pueda quedar sin fin;
4. que la novedad 17:30–19:15 explique todo ese período sin dividirse por
   jornada.

La validación visual integrada se repetirá cuando existan persistencia y UI.
