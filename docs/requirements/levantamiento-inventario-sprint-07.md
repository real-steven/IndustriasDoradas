# Levantamiento de inventario y mantenimiento básico — Sprint 7.1

**Estado:** 7.1 cerrado; habilitado para diseñar 7.2
**Fecha de apertura:** 2026-10-23
**Última actualización:** 2026-10-24
**Alcance:** una planta, inventario operativo, componentes de rastra y novedades
simples

## Propósito

Confirmar el vocabulario y los actos físicos que el sistema debe representar
antes de diseñar el kardex. Este documento separa los hechos ya aprobados de
los datos que todavía requieren respuesta. Un ejemplo histórico o técnico no
se convierte en regla de negocio sin validación de la empresa.

La pausa 7.1 pedía inicialmente un catálogo físico y cinco movimientos reales.
El 2026-10-24 el desarrollador autorizó cerrar el diseño con un catálogo
flexible y escenarios ficticios controlados, porque todavía no existe un conteo
confiable. Los nombres, saldos y movimientos físicos reales se verifican en el
piloto 7.10 y no se presentan aquí como evidencia ejecutada.

## Resultado parcial del audio de la empresa — 2026-10-24

El desarrollador recibió y transcribió un audio sobre el inventario. Esta
evidencia confirma parcialmente el flujo general, pero no responde todavía la
unidad, precisión, revisión y ciclo de vida de cada artículo.

### Confirmaciones recibidas

1. En bodega pueden existir artículos muy diferentes. Se mencionaron como
   ejemplos sal, jabón, cadenas, martillos, mercurio, tubos, filtros y llantas,
   sin cerrar la lista a esos elementos.
2. Debe existir un conjunto de tipos de artículo seleccionables —por ejemplo,
   mediante un `ComboBox`— y una alternativa editable para registrar un caso
   particular que no aparezca en las opciones.
3. El formulario debe ser general y servir para cualquier artículo; no se
   construye una pantalla o tabla distinta para sal, martillos, tubos u otro
   producto.
4. La identificación del artículo y la cantidad constituyen la información
   mínima indispensable. Falta confirmar si se exigirán simultáneamente tipo y
   nombre o si un nombre particular será suficiente dentro de un tipo.
5. Las cantidades y unidades de medición varían según el artículo. La unidad no
   puede codificarse globalmente ni suponerse siempre entera.
6. Se debe poder registrar la salida y el reintegro de un producto.
7. El formulario puede guardarse con la información mínima y dejar en blanco
   los campos complementarios, o completarlos cuando la información exista.
8. Los roles autorizados para manipular inventario son jefe de planta y
   gerente. Falta distribuir con precisión qué mutaciones corresponden a
   `JEFE_PLANTA` en desktop y cuáles a `JEFE_EMPRESA` en web.

### Interpretación técnica provisional

- Cada movimiento exigirá como mínimo un artículo identificable y una cantidad
  válida. La unidad deberá pertenecer al artículo o seleccionarse en el
  movimiento; esta decisión continúa abierta hasta validar el catálogo.
- Motivo, destino, observación y datos semejantes pueden ser opcionales en el
  formulario. Identidad autenticada, estación, fechas, UUID y auditoría no son
  opcionales: el sistema los captura automáticamente.
- “Reintegro” es el término recibido desde la empresa. En 7.2 se confirmará si
  será la etiqueta visible del movimiento interno `DEVOLUCION`.
- El selector editable debe permitir ampliar el catálogo sin generar nombres
  duplicados por diferencias de mayúsculas, espacios o escritura. La política
  de creación/activación se diseña después de aprobar los tipos iniciales.
- Mercurio puede existir como artículo físico de bodega, pero sus movimientos
  deben registrarse de forma independiente. Nunca se deducen automáticamente
  de `SWEEP_INPUT - SWEEP_REMAINDER`.
- “Llantas” queda registrado solo como ejemplo de artículo de bodega. El audio
  no confirma que sea el componente de desgaste de las rastras.

### Catálogo inicial mencionado, aún incompleto

| Nombre mencionado | Clase provisional | Unidad | Precisión | Observación |
| --- | --- | --- | --- | --- |
| Sal | Consumible por confirmar | Pendiente | Pendiente | Confirmar presentación: saco, kilogramo u otra. |
| Jabón | Consumible por confirmar | Pendiente | Pendiente | Confirmar si se cuenta por unidad, paquete o caja. |
| Cadenas | Herramienta, insumo o repuesto por confirmar | Pendiente | Pendiente | Confirmar si requieren identificación individual. |
| Martillos | Herramienta retornable por confirmar | Pendiente | Pendiente | Confirmar si se asignan a una persona. |
| Mercurio | Artículo controlado por confirmar | Pendiente | Decimal por confirmar | Separado de las mediciones de barrida. |
| Tubos | Insumo o repuesto por confirmar | Pendiente | Pendiente | Confirmar medida, longitud o unidad. |
| Filtros | Consumible o repuesto por confirmar | Pendiente | Pendiente | Confirmar tipo y compatibilidad si importa. |
| Llantas | Repuesto o componente por confirmar | Pendiente | Pendiente | No se asocia todavía a una rastra. |

### Preguntas detectadas después del audio

1. Tipos iniciales exactos que debe mostrar el selector.
2. Regla para crear, normalizar, desactivar y reutilizar un tipo personalizado.
3. Unidad y precisión de cada artículo.
4. Significado operativo de `SALIDA`, `CONSUMO` y `REINTEGRO`, y si los tres se
   necesitan como movimientos distintos.
5. Campos complementarios concretos que el usuario puede dejar en blanco.
6. Reglas para existencia insuficiente y concurrencia de estaciones offline.
7. Acciones exactas autorizadas a jefe de planta y gerente por canal.
8. Conteo inicial, revisiones físicas, frecuencia y aprobación de diferencias.
9. Asignación de herramientas a trabajadores.
10. Nombre y ciclo real del componente de desgaste de las rastras.
11. Vocabulario y flujo de novedades operativas.
12. Cinco movimientos o reemplazos reales con cantidades antes y después.

Estas preguntas se cerraron el 2026-10-24 como decisiones de producto del
desarrollador, usando el audio como evidencia funcional y conservando
configurables los datos que pueden variar en la planta.

## Decisiones de cierre aprobadas — 2026-10-24

### Catálogo flexible y formulario general

1. Los tipos iniciales serán `HERRAMIENTA`, `CONSUMIBLE`, `INSUMO`, `REPUESTO`,
   `PRODUCTO_QUIMICO`, `ENVASE` y `OTRO`. Los nombres visibles serán sencillos
   y en español.
2. El selector de tipo permite elegir `OTRO` y crear un tipo nuevo particular.
   Solo `JEFE_PLANTA` o `JEFE_EMPRESA` pueden hacerlo. El sistema normaliza
   espacios y mayúsculas para evitar duplicados evidentes; desactivar un tipo
   impide usarlo en artículos nuevos sin borrar historia.
3. Crear un artículo exige tipo, nombre y unidad base. El nombre es libre porque
   la bodega puede recibir artículos no previstos.
4. Cada artículo conserva una sola unidad base. Los movimientos muestran esa
   unidad y no permiten cambiarla silenciosamente, evitando mezclar unidades
   dentro del mismo saldo.
5. Las unidades iniciales serán `UNIDAD`, `CAJA`, `PAQUETE`, `SACO`, `GRAMO`,
   `KILOGRAMO`, `MILILITRO`, `LITRO`, `METRO` y `GALON`. También se permite una
   unidad particular autorizada mediante `OTRA`.
6. `UNIDAD`, `CAJA`, `PAQUETE` y `SACO` usan cantidades enteras por defecto.
   Peso, volumen y longitud admiten hasta tres decimales. Esta capacidad queda
   configurada en la unidad, no dispersa por formulario.
7. Un movimiento exige artículo, tipo de movimiento y cantidad positiva. La
   unidad se obtiene del artículo. Destino, observación y trabajador responsable
   son opcionales.
8. Motivo es obligatorio para `AJUSTE` y `REVERSO`. Actor autenticado, rol,
   estación, fecha de ocurrencia/registro, UUID y auditoría siempre se capturan
   automáticamente aunque el formulario use solo los campos mínimos.

### Movimientos y correcciones

- `ENTRADA`: carga inicial o incorporación física posterior. El módulo no
  administra la compra, precio ni factura que originó la entrada.
- `SALIDA`: artículo que abandona temporalmente el saldo disponible y puede
  regresar. Puede vincular opcionalmente destino o trabajador responsable.
- `CONSUMO`: uso definitivo de una cantidad que no se espera recuperar.
- `DEVOLUCION`: reintegro físico de una salida previa. La interfaz usará
  `REINTEGRO / DEVOLUCIÓN` y enlazará la salida original cuando se conozca.
- `AJUSTE`: diferencia positiva o negativa confirmada por conteo físico, con
  motivo obligatorio. No modifica otro movimiento.
- `REVERSO`: anulación completa de un movimiento registrado por error. Agrega
  exactamente el efecto contrario, referencia el original, exige motivo y solo
  puede aplicarse una vez. La interfaz lo explicará como `Anular movimiento`;
  nunca borra ni edita el registro original.

La existencia es la suma de movimientos vigentes. Una salida, consumo o ajuste
negativo que exceda el saldo conocido se rechaza con la cantidad disponible y
la cantidad solicitada. Si dos estaciones offline producen en conjunto un
saldo insuficiente, el servidor rechaza para revisión el movimiento que llegue
cuando ya no exista saldo; lo conserva visible como conflicto y no lo descarta.
La prueba de carrera y convergencia se implementa en 7.7.

### Responsabilidad y experiencia de uso

1. `JEFE_PLANTA` registra artículos, entradas, salidas, consumos, reintegros,
   revisiones y correcciones desde desktop mediante elevación vigente.
2. `JEFE_EMPRESA`, única cuenta web gerencial del MVP, consulta todo el
   inventario y puede registrar movimientos excepcionales, ajustes y reversos
   desde web. Cada acción conserva el mismo nivel de auditoría.
3. Los trabajadores no reciben cuentas ni manipulan directamente el módulo.
   Esto mantiene la interfaz operativa apta para personal con distintos niveles
   de alfabetización: el jefe registra la acción con etiquetas claras, unidad
   visible y pocos campos obligatorios.
4. Un trabajador del catálogo puede seleccionarse opcionalmente como responsable
   de una salida, consumo o devolución. Dejarlo vacío no elimina la identidad
   del jefe o gerente que registró la acción.
5. El esposo de la gerente y los proveedores no se convierten en usuarios. Los
   informes que ella comparte se prepararán en Sprint 8 usando la información
   autorizada, sin ampliar roles en Sprint 7.

### Revisiones físicas

- `JEFE_PLANTA` puede ejecutar una revisión total o seleccionar artículos desde
  desktop; `JEFE_EMPRESA` puede hacer lo mismo desde web si lo necesita.
- El recordatorio inicial será cada 30 días, configurable e informativo. Nunca
  bloquea movimientos.
- Una revisión que coincide se registra como `SIN_DIFERENCIAS` y no crea
  movimientos.
- Una diferencia conserva saldo esperado, conteo físico, actor y fecha. No
  cambia el kardex automáticamente: el jefe o la gerente confirma después un
  `AJUSTE` con motivo.

### Mercurio, componentes y novedades

1. Mercurio puede configurarse como `PRODUCTO_QUIMICO`, normalmente con unidad
   `GRAMO` o la unidad física que confirme el catálogo. Sus entradas, salidas,
   consumos y reintegros son manuales e independientes de las barridas.
2. Las mediciones de barrida nunca crean movimientos de inventario ni descuentan
   mercurio automáticamente.
3. Sprint 7 sí conserva el historial mínimo de componentes de rastra definido
   en 7.3. No se codifica un nombre físico concreto: cualquier artículo de tipo
   `REPUESTO` puede vincularse opcionalmente a una rastra al instalarse.
4. La instalación conserva artículo, rastra, cantidad, fecha, responsable,
   identificación opcional, condición y observación. El retiro cierra esa
   instalación y conserva su condición; nunca borra la anterior.
5. La vida útil inicial es el tiempo transcurrido entre instalación y retiro.
   No se predice reemplazo ni se bloquea producción. Llantas continúa como
   artículo posible, no como componente de rastra asumido.
6. Las novedades iniciales serán `PARO`, `MANTENIMIENTO`, `EMERGENCIA`,
   `FERIADO` y `OTRO`. Exigen descripción, alcance de planta o línea e inicio;
   el fin y responsable relacionado son opcionales. Pueden atravesar jornada y
   no crean órdenes de trabajo.

### Carga inicial

La primera carga se realizará manualmente con un conteo físico pequeño y una
`ENTRADA` identificada como inventario inicial. Una plantilla CSV/Excel solo se
incorpora en 7.10 si el catálogo real resulta suficientemente confiable; no es
una dependencia para comenzar.

### Escenarios aprobados para diseñar 7.2

Estos datos son ejemplos ficticios de aceptación, no existencias reales de la
empresa:

| Caso | Estado anterior | Acción | Resultado esperado |
| --- | --- | --- | --- |
| Entrada inicial | Martillos: 0 unidades | `ENTRADA` de 10 unidades | Saldo 10 y auditoría del actor. |
| Salida | Martillos: 10 unidades | `SALIDA` de 4 unidades, destino opcional | Saldo 6; actor y fecha obligatorios. |
| Reintegro | Martillos: 6 unidades | `DEVOLUCION` de 2 vinculada a la salida | Saldo 8 sin reescribir la salida. |
| Consumo | Sal: 20 kilogramos | `CONSUMO` de 3 kilogramos | Saldo 17; no se espera devolución. |
| Revisión/ajuste | Filtros: 5 unidades; conteo físico 4 | revisión con diferencia y `AJUSTE` de -1 motivado | Saldo 4 y ambos hechos auditados. |
| Reemplazo | Rastra con instalación anterior abierta | retirar componente e instalar otro artículo compatible | Línea temporal continua; el historial anterior permanece. |

Un intento de sacar 9 martillos cuando existen 8 se rechaza indicando ambos
valores. Registrar por error una salida de 4 se corrige con `REVERSO`, que
reintegra 4 y conserva la salida equivocada dentro de la auditoría.

## Hechos confirmados heredados

1. `JEFE_PLANTA` registra movimientos y revisiones desde desktop;
   `JEFE_EMPRESA` consulta y puede registrar movimientos excepcionales o
   correcciones auditadas desde web.
2. El primer alcance corresponde a una sola planta. Compras, costos,
   contabilidad, múltiples bodegas, mínimos de reposición y CMMS quedan fuera.
3. La existencia se deriva de movimientos trazables. No se mantiene un saldo
   editable como única verdad y no se borra historial para corregirlo.
4. Una revisión puede terminar sin diferencias. En ese caso conserva quién,
   cuándo y qué se revisó, pero no crea un ajuste de existencia.
5. Las cantidades son enteras solo cuando la unidad real lo exige. No se decide
   precisión decimal antes de confirmar la unidad de cada artículo.
6. Las mediciones de mercurio `SWEEP_INPUT` y `SWEEP_REMAINDER` describen una
   barrida. Su diferencia no es consumo, pérdida ni merma de inventario.
7. Los componentes de rastra usan artículos configurables y un historial de
   instalación/retiro; no se codifica un nombre físico específico.
8. Las novedades explican paros, mantenimiento, emergencias, feriados u otras
   ausencias de producción mediante un registro simple; no son órdenes de
   trabajo.
9. El trabajador responsable es opcional en salidas, consumos y devoluciones;
   nunca sustituye al actor autenticado que registra el movimiento.
10. El funcionamiento debe ser local-first y reutilizar SQLite, outbox,
    idempotencia, pull incremental y auditoría existentes.

## Fuentes que no definen el dominio

`supabase/demo/esquema-demo-supervisor.sql` es una maqueta histórica y no una
migración productiva. No se copiarán de ella estas decisiones:

- descontar mercurio automáticamente a partir de la diferencia de una barrida,
  aunque también exista como artículo de bodega;
- limitar los movimientos a `ENTRADA`, `CONSUMO`, `DEVOLUCION` y `AJUSTE`;
- usar `SIN_NOVEDAD` como estado definitivo sin contrastarlo con la expresión
  aprobada `SIN_DIFERENCIAS`;
- asumir tres decimales, una unidad o categorías rígidas para todos los
  artículos;
- almacenar un saldo derivado sin resolver antes concurrencia offline.

Los ejemplos actuales `Palas`, `Escaleras`, `Tornillos` y `Taladros` son
candidatos de conversación tomados de la línea base. No constituyen todavía el
catálogo aprobado.

## Ficha para cargar el catálogo real

Durante la carga o el piloto se completa una fila por artículo realmente
controlado. Si dos nombres se refieren al mismo objeto, se conserva el que usa
el personal de planta.

| Dato | Pregunta que debe responder la empresa |
| --- | --- |
| Nombre usado en planta | ¿Cómo lo piden, entregan y cuentan normalmente? |
| Clase | ¿Es herramienta retornable, consumible, envase o componente instalado? |
| Unidad base | ¿Unidad, paquete, caja, kilogramo, litro, metro u otra? |
| Precisión | ¿Solo enteros o admite fracción? ¿Cuántos decimales tienen sentido físico? |
| Presentación | Si llega en caja/envase, ¿se controla el envase completo o su contenido? |
| Existencia inicial | ¿Hay un conteo físico confiable y con fecha de corte? |
| Ubicación lógica | ¿Basta “inventario de planta” o necesitan una etiqueta informativa de área? |
| Responsable | ¿Quién autoriza y quién registra cada movimiento? |
| Retorno esperado | ¿Debe regresar o se consume al salir? |
| Identificación individual | ¿Importa número de serie, placa o código por unidad? |
| Estado | ¿Solo activo/inactivo o se necesita condición física? |
| Frecuencia de revisión | ¿Cada cuántos días/semanas se cuenta y quién recibe el recordatorio? |

Una ubicación lógica no crea múltiples bodegas ni saldos independientes en
este sprint. Si la empresa necesita transferencias entre ubicaciones, se debe
revisar formalmente el alcance antes de 7.2.

## Evidencia física diferida al piloto 7.10

Para cada caso se debe registrar qué ocurrió, qué documento o comprobación se
usa hoy y cuál es la cantidad antes/después. Los nombres de evento son
propuestas del Sprint 7, no respuestas anticipadas.

| Caso | Ejemplo físico que debe aportar la empresa | Datos mínimos por confirmar | Estado |
| --- | --- | --- | --- |
| 1. Entrada | Recepción o carga inicial de un artículo real | artículo, cantidad/unidad, origen, fecha real, responsable y motivo | Diferido a 7.10 |
| 2. Salida o consumo | Retiro definitivo o utilización de un artículo real | diferencia entre salida y consumo, destino, responsable y comprobación | Diferido a 7.10 |
| 3. Entrega y devolución | Herramienta que sale y luego regresa, si este flujo existe | persona responsable, fechas, condición de salida/regreso y pérdida | Diferido a 7.10 |
| 4. Revisión y diferencia | Conteo físico que coincide o descubre una diferencia | alcance del conteo, cantidad esperada/real, quién autoriza el ajuste y motivo | Diferido a 7.10 |
| 5. Reemplazo de rastra | Retiro de un componente e instalación del siguiente | nombre técnico, rastra, unidad, identificación, condición, fechas y responsable | Diferido a 7.10 |

El audio confirma que salida y reintegro deben poder registrarse, pero no aporta
un caso físico completo. El diseño se probó con los escenarios controlados del
cierre; esta tabla permanece para no confundirlos con evidencia de planta.

Si entrega/devolución no existe como proceso controlado, se reemplaza el caso 3
por un reverso real de captura equivocada. No se inventará una asignación a
trabajador para completar la tabla.

## Preguntas de observación para el piloto

Estas preguntas ya no bloquean 7.2. Se conservan para contrastar las decisiones
configurables durante la carga y conciliación de 7.10.

### Catálogo y cantidades

1. ¿Cuáles artículos se controlan realmente y cuáles solo se compran cuando se
   necesitan?
2. ¿Una caja o envase se registra completo o se convierte a unidades internas?
3. ¿Qué artículos admiten fracciones y con qué precisión?
4. ¿Se necesita identificar individualmente taladros, escaleras u otras
   herramientas, o basta una cantidad agregada?
5. ¿Desactivar un artículo solo impide nuevos movimientos y conserva todo el
   historial?

### Responsabilidad y revisión

6. ¿Quién cuenta, quién registra y quién autoriza una diferencia?
7. ¿La revisión es total o puede abarcar solo algunos artículos?
8. ¿Qué intervalo inicial de recordatorio se usa y puede variar por artículo?
9. ¿Una herramienta se entrega a una persona concreta? Si es así, ¿cómo se
   registra devolución, daño o pérdida?
10. ¿Qué evidencia existe hoy: cuaderno, factura, vale, fotografía o solo
    confirmación verbal?

### Componentes de rastra

11. ¿Cuál es el nombre que usa la planta para el componente de desgaste?
12. ¿Se cuenta por unidad, juego, medida, peso u otra unidad?
13. ¿Cada rastra mantiene uno o varios simultáneamente?
14. ¿Posee identificador individual o solo tipo y fecha de instalación?
15. ¿Qué dispara el reemplazo: calendario, horas, cajuelas, condición visual o
    decisión del responsable?
16. ¿Qué condiciones deben registrarse al retirar el componente?

### Novedades y mercurio

17. ¿Qué palabras usa la planta para paro, mantenimiento, emergencia, feriado
    u otra ausencia de producción? La categoría puede continuar opcional.
18. ¿Una novedad se registra para toda la planta o para una línea determinada?
19. ¿Quién la abre y quién confirma su finalización cuando atraviesa jornada?
20. ¿Existe un acto físico independiente para ingresar o retirar mercurio del
    inventario? Si no existe, el mercurio queda completamente fuera del kardex.

## Decisiones reservadas para pasos posteriores

Estas decisiones no bloquean la conversación de 7.1, pero no pueden quedar
ocultas antes de implementar:

- 7.2 define signos, reversos, ajustes y cálculo de existencia a partir de los
  movimientos aprobados;
- 7.3 define la línea temporal de componentes y novedades usando el vocabulario
  confirmado;
- 7.7 aprueba qué ocurre cuando dos estaciones offline registran salidas que,
  juntas, superarían la existencia central;
- 7.9 decide cualquier vínculo con un movimiento físico de mercurio y cualquier
  asignación de herramientas a trabajadores;
- 7.10 decide si la carga inicial usa plantilla CSV/Excel o captura manual,
  según la confiabilidad del catálogo y del conteo.

## Compuerta para iniciar 7.2

- [x] Catálogo flexible aprobado con tipo, nombre y unidad obligatorios.
- [x] Precisión definida por unidad, sin una precisión global rígida.
- [x] Roles de registro, consulta y corrección confirmados.
- [x] Una sola bodega lógica en el alcance inicial.
- [x] Revisión total/parcial y recordatorio inicial de 30 días confirmados.
- [x] Cinco o más escenarios explicados y aprobados para el diseño.
- [x] Componente de rastra resuelto de forma genérica, sin nombre inventado.
- [x] Trabajador responsable definido como vínculo opcional.
- [x] Mercurio permitido como artículo mediante movimientos manuales separados.
- [x] Vocabulario inicial de novedades definido sin construir un CMMS.

La pausa 7.1 queda aprobada el 2026-10-24. El siguiente trabajo autorizado es
7.2: diseñar y probar manualmente artículo, unidad, kardex, reversos, ajustes y
revisiones antes de crear migraciones o interfaces.
