# Sprint 7 — Inventario y mantenimiento básico (semanas 14–15)

> **Decisión posterior al cierre — 2026-10-27:** el equipo rechazó este diseño
> como experiencia final y solicitó reemplazarlo por un inventario convencional.
> Inventario queda deshabilitado en las interfaces Web y Desktop: no aparece en
> la navegación, los enlaces web anteriores redirigen al resumen y Desktop no
> registra ni inicializa su vista. La API, migraciones, sincronización y datos se
> conservan temporalmente como historial técnico; no deben interpretarse como un
> módulo disponible ni ampliarse hasta aprobar el nuevo alcance.

**Objetivo:** conocer existencias y vida útil de herramientas/componentes
mediante movimientos y revisiones trazables, sin construir compras,
contabilidad ni un CMMS.

**Entregable:** catálogo validado, kardex append-only sin negativos, revisiones
físicas, operación local-first para `JEFE_PLANTA`, consulta/corrección gerencial,
registro básico de instalación/retiro de componentes de rastra y novedades
simples de paro/mantenimiento transferidas desde 4.10.

## Dependencias y límites heredados

1. Reutiliza catálogos, desactivación y auditoría de Sprint 1.
2. Reutiliza persistencia local, outbox y sincronización idempotente de Sprints
   2–4.
3. Reutiliza API, filtros, frescura y shell web de Sprint 5. No depende
   funcionalmente de asistencia, aunque se ejecute después de Sprint 6.
4. Desktop pertenece a `JEFE_PLANTA`; web pertenece a `JEFE_EMPRESA`.
   `ADMINISTRADOR` no forma parte del alcance vigente.
5. Las mediciones `SWEEP_INPUT/SWEEP_REMAINDER` de mercurio no son movimientos
   de inventario ni permiten inferir consumo, pérdida o merma.
6. El nombre técnico y la unidad del componente de desgaste de las rastras
   deben validarse en 7.1; no se codifica “neumático”, “forro” u otro término
   provisional como verdad del dominio.
7. Asignar herramientas a un operario es opcional y solo se implementa si el
   flujo real lo requiere.

## Orden de trabajo

1. Levantar catálogo, unidades, responsables, ubicación lógica y componentes
   reemplazables reales.
2. Diseñar artículos, movimientos inmutables, reversos y revisiones físicas.
3. Diseñar historial de instalación/retiro/condición de componentes de rastra,
   más novedades simples de planta/línea, sin órdenes de mantenimiento.
4. Implementar PostgreSQL/SQLite, integridad, idempotencia e índices.
5. Implementar API transaccional y permisos vigentes.
6. Implementar movimientos/revisiones local-first en desktop.
7. Extender push/pull y resolver concurrencia sin ocultar conflictos.
8. Implementar en web existencias, kardex, revisiones y vida útil.
9. Integrar mercurio únicamente si se aprueba un movimiento físico separado;
   nunca derivarlo de las mediciones de barrida.
10. Carga inicial, conciliación y cierre.

**Pruebas:** UUID repetido, entrada/salida/reverso, unidad inválida, stock
insuficiente, dos estaciones offline, llegada fuera de orden, ajuste con motivo,
revisión sin diferencias, reemplazo de componente conservando historial y
novedad que atraviesa un cambio de jornada.

**Prueba manual:** conteo físico pequeño, carga inicial, movimientos desde
desktop, desconexión, consolidación, consulta web y conciliación con la misma
fecha de corte.

**Aceptación:** existencia = suma explicable de movimientos vigentes; ninguna
confirmación desaparece; los conflictos offline quedan visibles; cada ajuste o
reemplazo conserva actor, motivo y estado anterior/nuevo.

## Mini pasos, pausas y prompts

### 7.1 Levantamiento y vocabulario

**Estado — iniciado el 2026-10-23:** se revisaron la línea base, las fronteras
de los Sprints 1–6 y el esquema demostrativo histórico. Los hechos confirmados,
las preguntas para la empresa, los cinco escenarios de validación y la
compuerta de salida están en
[`../requirements/levantamiento-inventario-sprint-07.md`](../requirements/levantamiento-inventario-sprint-07.md).
El esquema `demo_supervisor` no es fuente de verdad para Sprint 7: contiene un
consumo de mercurio derivado y un catálogo de movimientos incompleto que
contradicen el alcance vigente. Durante el levantamiento no se inició 7.2 antes
de aprobar la ficha.

**Cierre — 2026-10-24:** el audio de la empresa y las decisiones posteriores del
desarrollador cerraron la pausa. El catálogo usa tipos seleccionables y permite
crear uno particular; tipo, nombre, unidad y cantidad son obligatorios. El
formulario general admite entrada, salida, consumo, reintegro, ajuste y reverso,
con destino, observación y trabajador responsable opcionales. Jefe de planta y
gerencia operan con auditoría; no se crean cuentas para trabajadores.

Se aprobó rechazo de saldos insuficientes, revisión total o parcial cada 30 días
como recordatorio configurable, mercurio como artículo manual independiente de
las barridas y componentes de rastra genéricos sin asumir que sean llantas. La
ficha contiene seis escenarios ficticios y la compuerta completa. El siguiente
paso es 7.2; todavía no corresponde crear migraciones ni interfaces.

**Prompt:** Identifica con la empresa herramientas, consumibles, envases,
unidades, ubicación y responsables reales. Confirma el nombre del componente de
desgaste de cada rastra, intervalo aproximado de reemplazo y datos que se anotan
hoy. Parte de una sola planta y cantidades enteras solo cuando la unidad lo
permita. Deja compras, costos y múltiples bodegas fuera de alcance.

**Pausa:** catálogo y cinco movimientos/reemplazos reales aprobados.

### 7.2 Kardex y revisiones

**Estado — implementado el 2026-10-24:** el dominio puro define tipos y unidades
configurables, artículos con unidad base, los seis movimientos append-only,
saldo derivado sin negativos, reintegros relacionados, reverso exacto y único,
idempotencia por UUID/secuencia y revisiones sin modificación automática. La
especificación y el kardex manual están en
[`../architecture/dominio-inventario-sprint-07.md`](../architecture/dominio-inventario-sprint-07.md).

Las pruebas de dominio reproducen martillos `10 → 6 → 8 → 7 → 8`, consumo de
sal, conteo de filtros, exceso de saldo, precisión por unidad, reintentos,
conflictos, alcance de planta y mutación web sin estación. Persistencia, API,
sincronización y UI continúan reservadas para 7.4–7.8.

**Pausa cumplida:** el kardex manual coincide con la proyección y la regresión
desktop completa aprobó 254 pruebas, incluidas 15 nuevas de inventario. El paso
7.2 queda cerrado sin adelantar migraciones de 7.4.

**Prompt:** Diseña artículo, unidad y movimientos append-only `ENTRADA`,
`SALIDA`, `CONSUMO`, `DEVOLUCION`, `AJUSTE` y `REVERSO`. La existencia se deriva
de movimientos y no puede quedar negativa. Modela revisión
`SIN_DIFERENCIAS/CON_DIFERENCIAS`; una revisión sin diferencias no reescribe
stock.

**Pausa:** un kardex manual con reverso/ajuste coincide con el dominio.

### 7.3 Componentes de rastra y novedades

**Estado — dominio puro implementado el 2026-10-26:** los componentes se
registran mediante cambios inmutables de instalación, retiro y reemplazo. Cada
instalación conserva artículo, cantidad/unidad, rastra, identificación
opcional, condiciones, fechas, actor autenticado, responsable opcional y
observaciones. Un reemplazo cierra exactamente una instalación activa y abre
la siguiente en el mismo hecho, enlazando ambas sin borrar historia. Se admite
más de un componente activo porque la cardinalidad física continúa abierta.

Las novedades usan apertura/cierre auditables, alcance de planta o línea,
categoría configurable opcional, descripción obligatoria e inicio obligatorio.
El fin y el trabajador relacionado continúan opcionales. Una novedad puede
cruzar jornada y no crea órdenes, repuestos, agenda ni predicción. El detalle de
decisiones está en
[`../architecture/componentes-y-novedades-sprint-07.md`](../architecture/componentes-y-novedades-sprint-07.md).

**Pruebas automatizadas:** 12 casos cubren dos reemplazos, retiro único,
fechas, alcance, cantidad/unidad, UUID/secuencia, categoría opcional, novedad
abierta y mantenimiento de línea que cruza de 17:30 a 19:15. La regresión
desktop completa en la base actual aprobó 238 de 238 pruebas.

**Pausa manual pendiente:** el desarrollador comprobará visualmente la línea
temporal de dos reemplazos y que una novedad explique un período sin
producción. Persistencia, API y pantallas todavía no existen; esa validación se
repite sobre el flujo integrado en 7.4–7.8.

**Prompt:** Diseña un historial mínimo de componente instalado: rastra, tipo,
identificador opcional, fecha de instalación, retiro, condición, responsable y
observación. El reemplazo cierra una instalación y abre otra sin borrar la
anterior. Modela además una novedad simple con planta/línea, tipo opcional,
descripción, responsable, inicio y fin opcional para explicar paros, feriados,
emergencias o mantenimiento. Puede atravesar jornada. No agregues órdenes,
repuestos, predicción ni agenda CMMS.

**Pausa:** dos reemplazos producen una línea temporal clara y una novedad
explica un período sin producción.

### 7.4 Migraciones e integridad

**Estado — implementado el 2026-10-26:** PostgreSQL y SQLite representan los
catálogos de tipos, unidades y artículos; kardex, revisiones y sus líneas;
cambios de componentes de rastra; y aperturas/cierres de novedades. No existe
una columna `stock`: el saldo se deriva de los movimientos. PostgreSQL conserva
cantidades `numeric(18,3)` y SQLite milésimas enteras para evitar errores de
punto flotante.

Los hechos son append-only incluso para `service_role`; actualización y borrado
se rechazan. Las restricciones validan organización/planta, artículo-unidad,
precisión, trabajador opcional, saldo no negativo, reintegro máximo, reverso
exacto y único, conteos, secuencia de reemplazos y apertura previa al cierre de
una novedad. Los índices cubren todas las claves foráneas y el bloqueo asesor
por artículo serializa la validación del saldo central.

La especificación de persistencia y sus límites están en
[`../architecture/persistencia-inventario-sprint-07.md`](../architecture/persistencia-inventario-sprint-07.md).
La suite central aplica las 24 migraciones desde cero, ejecuta el seed dos
veces y aprueba 21 pruebas SQL. La regresión desktop aplica 20 migraciones,
prueba actualización desde Sprint 6 y aprueba 269 de 269 casos. Incluye el
kardex `10 → 6 → 8 → 7 → 8`, rechazos de negativo/precisión/reintegro, revisión
física, dos reemplazos y una novedad 17:30–19:15.

**Pausa cumplida:** base vacía, actualización desde la versión 19, repetición
del migrador, integridad referencial, permisos y conservación del historial
quedaron verificadas automáticamente. La interfaz, API y sincronización de
estos hechos continúan reservadas para 7.5–7.8.

**Prompt:** Implementa PostgreSQL/SQLite con aislamiento por organización,
checks de cantidad/unidad, FK, índices, UUID, append-only y actualización desde
Sprint 6. No mantengas un `stock` editable como única verdad. Prueba base vacía,
actualización e historial referenciado.

**Pausa:** migraciones repetibles y restricciones verificadas.

### 7.5 API y autorización

**Estado — implementado el 2026-10-26:** la API versionada expone casos de uso
específicos para tipos, unidades y artículos; consulta y registro del kardex;
reversos, ajustes motivados, revisiones físicas y cambios de componentes. No
existe CRUD genérico ni borrado físico: los catálogos solo se crean, consultan o
activan/desactivan, y los hechos permanecen append-only.

Todos los endpoints exigen `inventory.manage` y rol `JEFE_PLANTA` o
`JEFE_EMPRESA`. El jefe de planta queda limitado a sus plantas activas; la
gerencia puede consultar y corregir dentro de su organización. Salidas y
consumos validan el saldo antes de escribir y PostgreSQL conserva la autoridad
final bajo concurrencia. Un rechazo informa cantidad solicitada y disponible.
El ajuste y el reverso exigen motivo, y la revisión se guarda atómicamente sin
crear ajustes ni cambiar existencias.

La migración agrega las funciones privadas `inventory_balance_v1` y
`record_inventory_review_v1`, ejecutables únicamente por `service_role`. El
contrato OpenAPI documenta el flujo completo. La evidencia automática aprobó
25 migraciones desde cero, seed repetido y 22 pruebas SQL; 20 suites/119 pruebas
unitarias y 34 casos E2E de API, incluido
entrada→salida→reverso→ajuste y rechazo sin permiso. La exploración manual del
contrato queda a cargo del desarrollador, conforme al acuerdo de validación.

**Prompt:** Implementa casos específicos para catálogo, movimientos, reversos,
ajustes, revisiones y componentes. `JEFE_PLANTA` opera desde desktop y
`JEFE_EMPRESA` consulta/corrige desde web según política. Ajuste y corrección
requieren motivo; desactivar conserva kardex; no implementes CRUD genérico ni
borrado físico.

**Pausa automática cumplida:** OpenAPI recorre
entrada→salida→reverso→ajuste y la API rechaza accesos no autorizados. La prueba
manual del contrato permanece pendiente del desarrollador.

### 7.6 Inventario local-first

**Estado — implementado el 2026-10-26:** desktop incorpora una pantalla de
inventario para `JEFE_PLANTA`, protegida por Modo Jefe de Planta, con catálogo
local, existencias, entrada, salida, consumo, devolución, ajuste motivado y
conteo físico parcial. Movimiento + outbox y revisión + líneas + outbox se
guardan en transacciones SQLite únicas y comparten la secuencia monotónica de
la estación. Reiniciar el repositorio conserva saldo y pendientes.

La vista diferencia saldo local de saldo central conocido, muestra fecha del
último pull, estado de red y hechos pendientes, y advierte que otras estaciones
offline impiden prometer una existencia global exacta. Los mensajes nuevos
quedan pendientes y no son reclamados por el worker hasta ampliar el contrato
central en 7.7; así no se convierten falsamente en fallos permanentes. El diseño
y sus límites están en
[`../architecture/inventario-local-first-sprint-07.md`](../architecture/inventario-local-first-sprint-07.md).

**Pruebas automatizadas:** atomicidad, saldo insuficiente sin escrituras
parciales, revisión sin movimiento, recuperación después de reinicio,
diferimiento seguro del sync y navegación WPF. La regresión desktop aprobó 273
de 273 pruebas, además de compilación y formato sin advertencias.

**Prompt:** Implementa WPF para movimientos y revisiones esenciales con
catálogo cacheado, evento + outbox atómicos y última frescura central. Mientras
otra estación esté offline, presenta saldo local/central con advertencia y no
prometas existencia global exacta.

**Pausa automática cumplida:** registrar, recrear el repositorio y continuar
offline no pierde movimientos. La comprobación visual con reinicio de la
aplicación queda a cargo del desarrollador cuando 7.7 alimente el catálogo local
o exista un dataset controlado.

### 7.7 Sincronización y concurrencia

**Estado — implementado el 2026-10-26:** push acepta movimientos y revisiones
de inventario con recibos idempotentes, autorización y auditoría. Pull publica
tipos, unidades, artículos, kardex y revisiones hacia el espejo SQLite. Las
secuencias pueden llegar fuera de orden sin exigir continuidad.

Cuando dos salidas offline superan juntas el saldo, la primera confirmada queda
en el kardex central y la segunda recibe `FAILED_REVIEW` con
`INVENTORY_STOCK_INSUFFICIENT`. El movimiento rechazado sigue visible en su
estación y el reintento conserva el mismo recibo; ninguna acción desaparece.
Desktop separa saldo central confirmado de hechos locales pendientes o
rechazados para converger sin ocultar el conflicto. El diseño está en
[`../architecture/sincronizacion-inventario-sprint-07.md`](../architecture/sincronizacion-inventario-sprint-07.md).

**Pruebas automatizadas:** migraciones y pruebas SQL completas; 122/122 API,
34/34 e2e y 275/275 desktop. Incluyen dos estaciones, saldo insuficiente,
reintento idempotente, llegada fuera de orden, revisión física, catálogo por
pull y permanencia local del rechazo.

**Prompt:** Extiende push/pull con idempotencia y llegada fuera de orden. Define
la política cuando dos salidas desconectadas superarían el stock central:
ningún movimiento desaparece; el servidor acepta, rechaza para revisión o exige
compensación según la regla aprobada. Añade pruebas de carrera y convergencia.

**Pausa:** dos estaciones producen un resultado central auditable y comprensible.

**Pausa automática cumplida:** el resultado central, el recibo rechazado, la
auditoría y la convergencia local están comprobados. La comprobación visual
multi-PC queda como validación manual complementaria antes de 7.10.

### 7.8 Inventario web

**Implementado:** el espacio futuro del portal se sustituyó por una consulta
gerencial responsive con vistas de existencias, kardex, revisiones físicas e
historial de componentes. Planta, búsqueda, vista, artículo/rastra, página,
solo diferencias e intervalos de recordatorio permanecen en la URL. La fecha
de corte y la invalidación automática reutilizan la frescura central del Sprint 5.

Tres vistas privadas `security_invoker` reconstruyen saldo, última revisión y
estado de instalaciones desde hechos append-only. El API las publica solo por
organización y planta con permiso `inventory.manage`; el navegador no recibe
acceso directo a Supabase. El kardex y los componentes admiten orden ascendente
para comenzar por el primer evento. Los recordatorios de revisión y reemplazo
parten en 30 días, son configurables desde la URL e informativos: nunca escriben
ni bloquean. Diseño en
[`../architecture/inventario-web-sprint-07.md`](../architecture/inventario-web-sprint-07.md).

**Pruebas automatizadas:** base de datos completa con la prueba SQL 023; 123/123
API unitarias, 35/35 e2e y 60/60 web. Incluyen privacidad de las vistas, saldo
reconstruido desde cinco movimientos, última diferencia, instalación activa,
filtros persistentes y apertura del kardex desde el primer evento.

**Prompt:** Implementa el módulo `Inventario` de Sprint 5 para
`JEFE_EMPRESA`: existencias, kardex, diferencias, fecha de corte, última
revisión e historial de componentes. Conserva filtros en URL, paginación y
frescura. Recordatorios de revisión/reemplazo son informativos y configurables,
nunca bloquean.

**Pausa:** un artículo y una rastra se reconstruyen desde su primer evento.

**Pausa automática cumplida:** el artículo conserva cinco movimientos en orden
cronológico y la rastra conserva instalación y dos reemplazos, con un único
componente activo. La comprobación visual con datos reales queda disponible
como validación manual antes de cerrar 7.8.

**Pausa manual cumplida el 2026-10-27:** el desarrollador confirmó en web que
Inventario carga correctamente y presenta el estado vacío sin error de servicio.

### 7.9 Frontera con mercurio y asignaciones

**Implementado el 2026-10-27:** las mediciones de entrada y remanente de una
barrida permanecen independientes del kardex. Un movimiento físico puede
enlazarse opcionalmente con una barrida mediante una relación inmutable sin
cantidad; el RPC central y el Outbox SQLite versión 2 guardan el movimiento y
el enlace atómicamente. La sincronización conserva compatibilidad con mensajes
versión 1, enriquece por pull un movimiento ya recibido y no vuelve a sumar su
cantidad.

La entrega de herramientas se reconstruye desde una salida con trabajador y
sus devoluciones enlazadas. No existe un segundo estado mutable de custodia. La
consulta gerencial informa cantidad entregada, devuelta, pendiente y estado
`ASSIGNED`/`RETURNED`, con filtros por trabajador, estado, organización y planta.
Diseño en
[`../architecture/frontera-mercurio-asignaciones-sprint-07.md`](../architecture/frontera-mercurio-asignaciones-sprint-07.md).

**Pruebas automatizadas:** base de datos completa con la prueba SQL 024; 125/125
API unitarias, 35/35 e2e y 277/277 desktop. La prueba SQL conserva las mediciones
de mercurio, comprueba un solo efecto neto ante reverso y valida la asignación
parcial de un martillo. API comprueba contratos v1/v2, reintento idempotente,
endpoint y herencia del enlace en el reverso. Desktop comprueba migración,
escritura atómica y enriquecimiento por pull sin duplicar saldo.

**Prompt:** No conviertas entrada menos remanente de mercurio en consumo de
inventario. Si la empresa confirma un acto físico separado de retiro/ingreso de
mercurio, enlaza ese movimiento idempotentemente con la barrida sin duplicar
cantidades. Implementa asignación de herramientas a trabajador únicamente si
7.1 confirmó responsable, entrega y devolución.

**Pausa:** repetir sincronización/corrección mantiene un solo efecto neto y las
mediciones de barrida permanecen intactas.

**Pausa automática cumplida:** las pruebas SQL, API y desktop mantienen un solo
efecto de inventario, un único enlace y las mediciones originales intactas. No
hay una pantalla manual nueva en 7.9; la consulta Swagger queda disponible como
comprobación complementaria del endpoint de asignaciones antes de 7.10.

### 7.10 Carga inicial y cierre

**Decisión de entrada del 2026-10-27:** la empresa todavía no entregó un
catálogo real con unidad, precisión y cantidad verificadas. Por tanto, 7.10 no
crea una importación CSV/Excel ni precarga los ejemplos del audio. La ruta de
cierre es una carga manual pequeña y auditable. Una importación solo se evalúa
después si existe una fuente confiable y suficientemente grande para justificarla.

#### 7.10.1 Catálogo manual y compuerta de carga

La web gerencial permite crear un tipo particular, una unidad con precisión de
0 a 3 decimales y un artículo asociado a la planta. Tipo, nombre y unidad son
obligatorios. Crear el artículo no crea saldo: el conteo físico se registra
después como `ENTRADA` y conserva fecha, actor y auditoría. Esta separación
evita que una fila de catálogo se interprete como existencia comprobada.

**Estado:** implementado; prueba web dirigida 4/4, lint y build aprobados. Queda
la comprobación visual junto con el piloto físico.

#### 7.10.2 Acciones excepcionales de gerencia

La web deja de ser solo consulta en una vista claramente separada para que
`JEFE_EMPRESA` pueda registrar una entrada, salida, consumo o reintegro
excepcional, una revisión física, un ajuste motivado y el reverso único de un
movimiento. Los mismos límites de saldo, unidad, organización y auditoría del
API aplican; no se edita ni elimina el kardex.

**Estado:** implementado; la web muestra saldo y unidad antes de guardar,
permite vincular opcionalmente el reintegro y exige original más motivo para el
reverso. Suite web 62/62 aprobada.

#### 7.10.3 Trazabilidad completa en desktop

La pantalla operativa debe permitir enlazar un reintegro con la salida conocida
y anular un movimiento erróneo con motivo, mostrando términos sencillos. Debe
conservar el modo local-first, la elevación vigente, el recibo de sincronización
y el conflicto por saldo insuficiente construidos en 7.5–7.7.

**Estado:** implementado; la pantalla carga las salidas locales elegibles,
excluye de reverso las ya anuladas o parcialmente devueltas y calcula el efecto
contrario sin pedir al usuario que cambie signos. Suite desktop 278/278 aprobada.

#### 7.10.4 Componentes y novedades mínimas

Se expone la captura mínima ya aprobada para instalación, retiro o reemplazo de
componentes de rastra y para novedades `PARO`, `MANTENIMIENTO`, `EMERGENCIA`,
`FERIADO` u `OTRO`. Son hechos auditables; no crean mantenimiento predictivo,
órdenes de trabajo ni descuentos automáticos de inventario.

**Estado — implementación local validada el 2026-10-27:** el API central expone
categorías y apertura/cierre de novedades, y reconstruye su duración desde
hechos inmutables. Web permite instalar, retirar o reemplazar componentes y
gestionar novedades de planta o línea. Desktop registra ambos flujos sin
Internet, conserva secuencia/idempotencia y los envía por el outbox; instalar un
componente no descuenta inventario automáticamente.

La migración agrega las cinco categorías iniciales configurables, una vista
`security_invoker`, captura pull de los tres tipos de entidad y una RPC de
ingesta reservada a `service_role`. Fue aplicada al proyecto Supabase remoto el
2026-10-27 y se verificaron la vista, la RPC, las cinco categorías y la ausencia
de acceso directo para `anon`/`authenticated`. Aprobaron 25 pruebas SQL, 29
pruebas API enfocadas, 35 E2E, 5 pruebas web y 279 pruebas desktop. El recorrido
visual quedó registrado con la guía
[`../testing/sprint-07-10-pruebas-manuales.md`](../testing/sprint-07-10-pruebas-manuales.md).

**Evidencia manual cumplida — 2026-10-27:** una novedad `MANTENIMIENTO`
abierta en desktop sincronizó a web, fue cerrada allí y regresó al desktop. La
proyección central conservó apertura, cierre y tres minutos de duración. Se creó
un artículo de prueba, se instaló y reemplazó en una rastra desde el flujo
integrado y la web conservó las dos entradas, enlazó la instalación anterior y
dejó activa únicamente la nueva. El artículo mantuvo saldo `12` derivado de un
solo movimiento: los dos hechos de componente no alteraron el kardex.

**Compuerta 7.10.4 cerrada:** automatización, migración remota y recorrido visual
aprobaron. El siguiente paso es el piloto y cierre 7.10.5.

#### 7.10.5 Piloto y cierre

**Estado — cerrado el 2026-10-27:** el piloto partió de `12 UNIDADES` y terminó
en saldo central `9`, igual a la suma de siete movimientos del kardex. Conservó
un reintegro y un reverso enlazados, una revisión sin diferencias y otra con
diferencia `-1`, seguida por su ajuste motivado. Web y desktop convergieron, y
el `verify` completo aprobó.

La empresa operará por ahora una sola estación con alcance sobre todas las
líneas. Por ello no se habilitó una segunda estación ficticia para una prueba
manual que no corresponde al despliegue real. La política de concurrencia queda
conservada y cubierta por la prueba automatizada de dos estaciones: el servidor
acepta el primer hecho compatible y devuelve un rechazo visible e idempotente
cuando el segundo excede el saldo. Si la topología cambia, esa prueba manual se
reactiva antes de habilitar la nueva estación.

1. La empresa crea únicamente artículos realmente identificados con su unidad.
2. Se hace un conteo físico pequeño y se registra como entrada inicial.
3. Se ejecutan entrada, salida o consumo, entrega y reintegro de herramienta,
   revisión sin diferencia, revisión con ajuste y reverso de un error.
4. Dos estaciones producen movimientos offline sobre el mismo artículo; al
   reconectar, ambas muestran el mismo resultado central o un rechazo visible y
   auditable cuando el saldo no alcanza.
5. Para un mismo instante de corte, conteo físico, suma del kardex y existencia
   mostrada coinciden. Web y desktop conservan la unidad y precisión del artículo.
6. Se ejecuta `pnpm run verify` y la revisión manual de la matriz de evidencias.

**Fuera de alcance:** compras, proveedores del artículo, costos, factura,
múltiples bodegas, mínimos de reposición, código de barras, lotes, vencimiento,
CMMS, mantenimiento predictivo y descuento automático de mercurio desde barridas.

**Pausa final cumplida para la topología vigente:** conteo, kardex y existencia
coinciden para el mismo corte; evidencias manuales completas; concurrencia futura
cubierta automáticamente; cero defectos críticos o altos observados.
