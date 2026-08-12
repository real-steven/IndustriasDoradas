# Línea base funcional — versión 0.1

**Estado:** Borrador para validación de Gerencia/responsable de planta  
**Fecha de línea base:** 2026-08-11  
**Proyecto:** Sistema de Gestión y Control de Producción Minera — Industrias Doradas  
**Alcance de esta versión:** requerimientos, actores, procesos, reglas conocidas, supuestos, preguntas abiertas y glosario previos a implementación.

## 1. Propósito y criterio de lectura

Este documento establece la línea base funcional inicial disponible en el repositorio. No autoriza implementar reglas todavía no validadas con la empresa.

Cada afirmación se clasifica así:

- **Confirmado:** aparece expresamente en la documentación actual del proyecto.
- **Supuesto por validar:** interpretación provisional necesaria para organizar el análisis; no es una regla de negocio.
- **Pregunta abierta:** requiere respuesta de Gerencia o del responsable de planta antes de diseñar datos o comportamiento relacionado.
- **Ejemplo ficticio:** dato creado solo para explicar o probar; no representa producción real.

> No se encontró en el repositorio un archivo independiente identificado como “diagnóstico original”. Esta línea base usa el diagnóstico resumido en `README.md` y los documentos de `docs/sprints/`. Debe compararse con el diagnóstico fuente, cuadernos y entrevistas cuando estén disponibles.

## 2. Fuentes revisadas

Se revisaron completos:

- `README.md`.
- `docs/sprints/README.md`.
- Los planes de los sprints 0 al 8.
- `docs/sprints/arquitectura-y-calidad.md`.
- `docs/sprints/dependencias-y-alcance.md`.
- `docs/sprints/guia-de-prompts.md`.
- `docs/sprints/plantilla-pruebas-manuales.md`.

## 3. Contexto confirmado

- **Confirmado — situación actual:** Industrias Doradas es una empresa de reciente creación dedicada al procesamiento de material minero en Abangares, Guanacaste, Costa Rica.
- **Confirmado — problema:** gran parte de la información operativa se registra manualmente en cuadernos y luego se consolida en hojas de Microsoft Excel.
- **Confirmado — propósito:** digitalizar y centralizar gradualmente los registros operativos y administrativos para mejorar consulta, control y toma de decisiones.
- **Confirmado — conectividad:** la planta puede sufrir interrupciones de Internet satelital; el registro operativo debe continuar sin conexión.
- **Confirmado — primera versión:** se orienta inicialmente a una planta y una línea, pero el modelo debe admitir varias líneas, estaciones y futuras plantas sin implementar una administración multiempresa completa.
- **Confirmado — sensibilidad:** el sistema manejará información operativa, financiera y posiblemente fotografías o datos biométricos, por lo que requiere acceso por roles, auditoría y protección de secretos.

## 4. Actores

| Actor | Estado | Necesidad o responsabilidad conocida |
|---|---|---|
| Operario | Confirmado | Registrar la operación de planta de forma rápida, comprensible y sin depender de Internet; utilizar teclado o controlador. |
| Supervisor | Confirmado | Supervisar operación, asignaciones, correcciones, barridas, paros/incidentes y estado de sincronización según permisos. |
| Gerencia | Confirmado | Consultar información consolidada, revisar indicadores, reportes, auditoría, asistencia e incidencias; aprobar reglas y resultados. |
| Administrador del sistema | Confirmado | Gestionar configuración, usuarios, roles, plantas, líneas, estaciones y catálogos autorizados. |
| Socio | Confirmado | Consultar información gerencial remotamente desde computadora o móvil, con permisos por definir. |
| Trabajador/operario sujeto a asistencia | Confirmado | Registrar entrada/salida y, si se aprueba, fotografía o mecanismo de identificación con alternativa ante fallos. |
| Responsable de planta | Confirmado | Validar lenguaje, flujo físico, reglas de barrida y decisiones operativas que no pueden inferirse del software. |
| Proveedor | Confirmado como entidad externa | Proveer material asociado a cargamentos; no se confirma que use directamente el sistema. |
| Tutor académico | Confirmado | Validar aspectos académicos y decisiones sensibles que requieran consulta, particularmente privacidad/biometría. |
| Personal de soporte/desarrollo | Supuesto por validar | Instalar, mantener, diagnosticar y recuperar el sistema sin acceder indebidamente a información sensible. |

### Preguntas sobre actores y permisos

- **PA-01:** ¿“Gerencia” y “Socio” tendrán exactamente los mismos permisos de consulta?
- **PA-02:** ¿Quién puede iniciar/cerrar turnos, cargamentos, barridas y paros?
- **PA-03:** ¿Quién puede corregir cada tipo de registro y quién aprueba la corrección?
- **PA-04:** ¿Quién administrará usuarios, estaciones y catálogos en la operación real?
- **PA-05:** ¿Existe personal de mantenimiento o bodega con acceso propio, o esas funciones recaen en supervisor/administrador?

## 5. Procesos funcionales identificados

### 5.1 Configuración e identidad

1. Administrar organización, planta, líneas y estaciones.
2. Administrar usuarios, roles, trabajadores/operarios y proveedores.
3. Autenticar usuarios mediante Supabase Auth y aplicar permisos propios desde el backend.
4. Activar o desactivar catálogos conservando su historial.
5. Auditar accesos, rechazos, mutaciones y correcciones.

### 5.2 Preparación de la operación

1. Preparar o autorizar una estación.
2. Seleccionar o abrir turno y cargamento.
3. Asociar proveedor, línea y operario/responsable.
4. Validar que el contexto esté activo antes de registrar producción.

Los responsables exactos, la simultaneidad permitida y las transiciones son preguntas abiertas.

### 5.3 Registro local de producción

1. El operario registra una cajuela mediante una pulsación.
2. La aplicación confirma primero el evento en SQLite local.
3. El registro genera un identificador UUID y una operación pendiente de sincronización en la misma transacción.
4. La interfaz muestra confirmación inmediata, contador derivado y estado local/sincronización.
5. Una corrección genera un evento compensatorio; no elimina ni sobrescribe el evento confirmado.
6. La estación continúa funcionando durante una interrupción de Internet.

### 5.4 Sincronización

1. La estación envía operaciones pendientes por lotes al backend NestJS.
2. El backend valida identidad, permisos, organización, estación, esquema y reglas.
3. La recepción es idempotente: reintentar el mismo UUID no duplica el efecto.
4. La estación recibe confirmación por operación y conserva para revisión los rechazos permanentes.
5. Los catálogos y asignaciones se actualizan incrementalmente mediante cursor; no se descarga toda la base.
6. Fotografías y archivos se sincronizan separadamente de los eventos.

### 5.5 Barrida, mercurio y resultado de oro

1. El sistema calcula el progreso desde eventos válidos de producción.
2. Al alcanzar el umbral configurado emite una alerta operacional sin perder la pulsación registrada.
3. Un usuario autorizado inicia, sigue y cierra la barrida.
4. Se registra responsable, tiempos, rastras, eventos incluidos, mercurio y resultado.
5. El oro se almacena canónicamente en gramos y puede mostrarse o capturarse en palos.
6. La trazabilidad debe permitir recorrer resultado de oro → barrida → cajuelas → cargamento/línea/turno/operarios.

La agrupación exacta del conteo, sobrantes, reinicios y cambios de proveedor/turno sigue abierta.

### 5.6 Paros, incidentes y mantenimiento básico

1. Registrar inicio y fin de un paro de línea.
2. Registrar categoría, motivo, responsable y observaciones necesarias.
3. Relacionar un incidente o mantenimiento básico cuando corresponda.
4. Permitir operación offline, reinicio y sincronización posterior.
5. Conservar eventos auditables para calcular tiempo detenido en el futuro.

Este proceso no incluye órdenes de trabajo completas, repuestos, mantenimiento predictivo ni un CMMS.

### 5.7 Consulta web y reportes

1. Gerencia y roles autorizados consultan líneas, turnos, cargamentos, proveedores, barridas, historial y auditoría.
2. La interfaz diferencia datos centrales actualizados de estaciones desconectadas o información tardía.
3. Los filtros y totales provienen del backend; React no redefine las reglas.
4. Los reportes e indicadores se generan con fórmulas previamente aprobadas y pueden exportarse a Excel.

### 5.8 Asistencia

1. Registrar eventos de entrada y salida, incluso offline.
2. Conservar incidencias y ajustes auditados en vez de reemplazar silenciosamente los datos.
3. Calcular horas revisables; no implementar nómina, impuestos, deducciones ni pago final.
4. Capturar fotografía solo bajo política aprobada y con alternativa manual cuando falle la cámara.
5. Considerar reconocimiento facial únicamente después de consentimiento, aprobación y medición de precisión.

### 5.9 Inventario

1. Administrar artículos, herramientas, unidades, ubicaciones y mínimos.
2. Registrar movimientos inmutables de entrada, salida, consumo, devolución, ajuste y reverso.
3. Derivar existencias desde movimientos; no usar un saldo editable como única verdad.
4. Relacionar el consumo de mercurio de una barrida con exactamente un movimiento de inventario.
5. Registrar asignación y devolución de herramientas a operarios.

## 6. Requerimientos funcionales de línea base

| ID | Estado | Requerimiento |
|---|---|---|
| RF-01 | Confirmado | Autenticar usuarios y autorizar acciones según rol y ámbito organizacional. |
| RF-02 | Confirmado | Administrar planta, líneas, estaciones, operarios, proveedores y cargamentos. |
| RF-03 | Confirmado | Preparar turnos y asignar línea, cargamento y operario antes de registrar producción. |
| RF-04 | Confirmado | Registrar cajuelas localmente con una pulsación aunque no haya Internet. |
| RF-05 | Confirmado | Corregir producción mediante eventos compensatorios auditables, sin borrar el original. |
| RF-06 | Confirmado | Sincronizar operaciones incremental e idempotentemente, sin pérdida ni duplicación. |
| RF-07 | Confirmado | Alertar al alcanzar el umbral inicial configurable de barrida. |
| RF-08 | Confirmado | Registrar barridas, mercurio y resultados de oro con trazabilidad al origen. |
| RF-09 | Confirmado | Registrar paros, incidentes y mantenimiento básico que afecten una línea. |
| RF-10 | Confirmado | Consultar historial y estado operativo desde un portal web adaptable a móvil y computadora. |
| RF-11 | Confirmado | Registrar asistencia y calcular horas revisables sin implementar nómina completa. |
| RF-12 | Confirmado si se mantiene el calendario | Gestionar inventario mediante movimientos trazables y asignar herramientas. |
| RF-13 | Confirmado | Generar reportes y exportaciones a Microsoft Excel. |
| RF-14 | Confirmado | Mantener auditoría de accesos, cambios, correcciones y operaciones sensibles. |
| RF-15 | Posterior al núcleo y condicionado | Evaluar reconocimiento facial solo con consentimiento, política y precisión aprobados. |

## 7. Requerimientos no funcionales de línea base

| ID | Estado | Requerimiento |
|---|---|---|
| RNF-01 | Confirmado | Registrar localmente una cajuela en menos de 300 ms en el equipo objetivo. |
| RNF-02 | Confirmado | Tener la pantalla operativa lista en menos de 3 segundos en el equipo objetivo. |
| RNF-03 | Confirmado | Un reinicio offline no debe perder registros ya confirmados localmente. |
| RNF-04 | Confirmado | Permitir operación completa mediante teclado/controlador, con foco visible, botones grandes, icono y texto, contraste y retroalimentación visual/sonora. |
| RNF-05 | Confirmado | Almacenar fechas en UTC y mostrarlas en `America/Costa_Rica`. |
| RNF-06 | Confirmado | Usar tipos decimales, no punto flotante binario, para oro, mercurio y dinero. |
| RNF-07 | Confirmado | Mantener secretos fuera del repositorio y restringir `service_role` al backend. |
| RNF-08 | Confirmado | Validar JWT de Supabase en NestJS y concentrar reglas, permisos y auditoría en el backend. |
| RNF-09 | Confirmado | Producir logs estructurados y diagnósticos sin tokens, claves, fotografías ni biometría. |
| RNF-10 | Confirmado | Ensayar realmente respaldo y restauración antes de producción. |
| RNF-11 | Confirmado | Conservar compatibilidad con Safari/Chrome y dispositivos iPhone/Android para el portal web. |
| RNF-12 | Confirmado | Mantener un monolito modular y evitar microservicios o abstracciones especulativas sin necesidad medida. |

## 8. Reglas confirmadas

### RC-01 — Umbral inicial de barrida

- El umbral inicial es **50 cajuelas**.
- Debe ser **configurable**, no una constante irreversible distribuida entre clientes.
- Alcanzar el umbral debe producir una alerta una sola vez por ciclo reconocido, incluso después de reiniciar o sincronizar.
- **Pendiente:** definir el ámbito del conteo y el tratamiento de sobrantes, cambios y correcciones.

### RC-02 — Conversión entre palos y gramos

- **1 palo = 0,1 gramos.**
- **10 palos = 1 gramo.**
- El valor canónico de oro se almacena en gramos decimales.
- “Palos” es una unidad de captura o presentación; el redondeo, si existe, debe ser solo visual y aprobado.

### RC-03 — Registros operativos inmutables

- Producción, asistencia e inventario se representan mediante eventos o movimientos inmutables.
- Una corrección compensa y audita; no borra silenciosamente el registro confirmado.
- `CAJUELA_ADDED` suma y `CAJUELA_REVERSED` compensa.

### RC-04 — Operación local-first

- Registrar una cajuela confirma primero en SQLite y nunca espera Internet.
- Cada operación sincronizable usa UUID generado en origen y una cola local.
- La sincronización debe admitir reintentos idempotentes e incrementales.

### RC-05 — Autoridad de negocio

- NestJS es la única puerta remota a datos y reglas de negocio.
- React y WPF no consultan directamente tablas de negocio en Supabase.
- Los clientes no deben duplicar fórmulas o reglas cuya autoridad corresponde a la API.

### RC-06 — Paros e incidentes básicos

- Se registran eventos básicos de inicio/fin de paro, categoría, motivo y responsable.
- Los incidentes y mantenimientos relacionados deben ser offline, sincronizables y auditables.
- No se incluye un sistema completo de mantenimiento, órdenes de trabajo, repuestos ni mantenimiento predictivo.

## 9. Supuestos por validar

Estos supuestos permiten organizar el análisis, pero **no deben implementarse como reglas** hasta validación:

- **SV-01:** la operación piloto comenzará efectivamente con una sola planta y una sola línea.
- **SV-02:** cada estación será una computadora Windows identificable y autorizada.
- **SV-03:** una estación podrá mostrar y operar más de una línea, porque la planificación contempla escenarios de 1, 4 y 10 líneas.
- **SV-04:** proveedor y cargamento se seleccionan antes del primer registro de producción relacionado.
- **SV-05:** Gerencia podrá revisar remotamente información central ya sincronizada, pero no verá como confirmados los eventos que permanezcan solo en una estación offline.
- **SV-06:** los nombres de roles `ADMIN`, `GERENCIA`, `SUPERVISOR` y `OPERADOR` son identificadores técnicos iniciales; falta validar su vocabulario empresarial.
- **SV-07:** los términos “trabajador”, “operario”, “encargado” y “responsable” pueden representar funciones diferentes; no deben fusionarse sin confirmación.
- **SV-08:** las tres “rastras” mencionadas forman parte del ciclo de barrida; su definición física y relación con línea/cargamento están pendientes.

## 10. Preguntas abiertas para la pausa gerencial

### Bloqueantes para el modelo y el flujo operativo

- **PA-06:** ¿Cuál es el documento del diagnóstico original y dónde se encuentra? ¿Hay cuadernos, formularios, fotografías o entrevistas que deban incorporarse como fuente?
- **PA-07:** ¿Qué significa exactamente una **cajuela** en planta: recipiente, cantidad, acción procesada u otra unidad? ¿Su capacidad es fija?
- **PA-08:** ¿Qué significa exactamente una **línea** y cuál es su relación con una rastra, estación y monitor?
- **PA-09:** ¿Qué es una **rastra** en el proceso de Industrias Doradas y por qué se contemplan tres en una barrida?
- **PA-10:** ¿Quién inicia y cierra un turno? ¿Puede haber más de un turno activo por planta, línea o estación?
- **PA-11:** ¿Cómo se identifica un cargamento y cuándo se considera abierto, activo, agotado o cerrado?
- **PA-12:** ¿Puede una línea procesar más de un cargamento o proveedor durante el mismo turno? ¿Cómo se registra el cambio?
- **PA-13:** ¿Puede un operario cambiar durante un turno o compartir responsabilidad sobre una línea?
- **PA-14:** ¿Qué correcciones se permiten, durante cuánto tiempo y con qué autorización/motivo?

### Bloqueantes para barridas, mercurio y oro

- **PA-15:** ¿Las 50 cajuelas se cuentan por línea, cargamento, proveedor, rastra, turno u otra combinación?
- **PA-16:** ¿Qué ocurre con las cajuelas sobrantes después de una barrida o al cambiar turno, proveedor o cargamento?
- **PA-17:** ¿Un reverso al pasar de 50 a 49 reactiva, cancela o conserva la alerta ya reconocida?
- **PA-18:** ¿Cuándo inicia y termina formalmente una barrida, quién la autoriza y puede reabrirse?
- **PA-19:** ¿Cómo participan las tres rastras y se permiten barridas simultáneas o solapadas?
- **PA-20:** ¿En qué unidad se mide actualmente el mercurio, con qué instrumento y precisión?
- **PA-21:** ¿En qué momento el resultado de oro pasa de preliminar a final y quién lo confirma?
- **PA-22:** ¿“Palo” se utiliza como décima exacta de gramo en todos los registros o existen prácticas de redondeo?

### Paros, incidentes y mantenimiento

- **PA-23:** ¿Qué categorías reales de paro e incidente utiliza la planta?
- **PA-24:** ¿Quién abre/cierra un paro y qué ocurre si atraviesa un cambio de turno?
- **PA-25:** ¿Qué datos mínimos necesita Gerencia para un incidente o mantenimiento básico?

### Seguridad, asistencia e inventario

- **PA-26:** ¿Qué funciones exactas deben continuar offline para una estación previamente autorizada?
- **PA-27:** ¿Cuál será la política de retención, acceso, consentimiento y eliminación para fotografías y posible biometría?
- **PA-28:** ¿Cómo se registran hoy entrada, salida, descansos, olvidos y turnos nocturnos?
- **PA-29:** ¿Se permiten existencias negativas? ¿Qué unidades, conversiones, ubicaciones y responsables usa inventario?
- **PA-30:** ¿Cuál es la lista mínima de reportes e indicadores que Gerencia considera imprescindible?

## 11. Glosario inicial

| Término | Estado | Definición de línea base |
|---|---|---|
| Cajuela | Parcialmente confirmado | Unidad o evento operativo cuyo registro suma uno al conteo de producción. Su significado físico y capacidad deben validarse en PA-07. |
| Palo | Confirmado en conversión | Unidad usada para expresar oro. Un palo equivale exactamente a 0,1 g en esta línea base. Falta validar uso y redondeo en planta. |
| Gramo (g) | Confirmado | Unidad canónica para almacenar el resultado de oro. Diez palos equivalen a un gramo. |
| Cargamento | Parcialmente confirmado | Conjunto de material recibido y asociado con un proveedor, producción y resultado. Identificación, estados y cambios requieren validación. |
| Turno | Parcialmente confirmado | Periodo operativo que contextualiza producción, asignaciones y posiblemente asistencia. Horarios, responsables y simultaneidad están abiertos. |
| Línea de producción | Parcialmente confirmado | Ámbito operativo al que se asignan estación, operario, producción, paros y barridas. Su definición física exacta está abierta. |
| Estación | Confirmado técnicamente | Cliente/computadora autorizada que mantiene SQLite, registra eventos locales y los sincroniza. Su correspondencia física debe validarse. |
| Rastra | Pendiente de definición | Elemento del proceso minero relacionado con la barrida; la documentación menciona tres, pero no define su función o cardinalidad. |
| Barrida | Parcialmente confirmado | Proceso del ciclo productivo activado por un progreso cuyo umbral inicial es 50 cajuelas configurables, y que relaciona responsables, tiempos, rastras, mercurio y oro. Las reglas físicas están abiertas. |
| Proveedor | Confirmado | Persona u organización de origen del material asociado a uno o más cargamentos. |
| Operario | Confirmado | Persona que participa en la operación y registra o tiene asignada producción, conforme a permisos. |
| Responsable/encargado | Pendiente de distinción | Persona responsable de una línea, turno, barrida, paro u otra acción. Debe aclararse si es un rol, una asignación o sinónimo de operario/supervisor. |
| Evento de producción | Confirmado técnicamente | Registro inmutable con UUID y contexto de organización, planta, estación, línea, turno, cargamento, operario y tiempos. |
| Evento compensatorio | Confirmado | Nuevo evento que corrige el efecto de otro sin modificarlo ni borrarlo. |
| Paro de línea | Parcialmente confirmado | Intervalo en que una línea deja de operar; debe registrar inicio/fin, motivo/categoría y responsable. |
| Incidente | Parcialmente confirmado | Hecho relevante que afecta o puede afectar la operación y debe quedar registrado y auditado. Sus categorías están abiertas. |
| Mantenimiento básico | Confirmado en alcance limitado | Registro relacionado con una línea o incidente, sin órdenes completas, repuestos, predicción ni funciones propias de un CMMS. |
| Outbox | Confirmado técnicamente | Cola local de operaciones confirmadas en SQLite que aún deben enviarse al backend. |
| Sincronización incremental | Confirmado técnicamente | Intercambio solo de operaciones o cambios pendientes desde un cursor, sin descargar o reemplazar la base completa. |
| Idempotencia | Confirmado técnicamente | Propiedad por la que repetir una operación con el mismo identificador no produce un segundo efecto. |
| Datos centrales confirmados | Confirmado técnicamente | Datos aceptados por el backend y persistidos centralmente; pueden diferir temporalmente de eventos aún pendientes en estaciones offline. |
| Ejemplo ficticio | Confirmado como criterio | Nombre, cantidad, horario, proveedor, persona o resultado inventado únicamente para documentación, seed o pruebas; nunca se presume como dato o regla real. |

## 12. Ejemplos exclusivamente ficticios

Los siguientes casos ilustran el modelo y **no confirman comportamiento real**:

- **EF-01:** “Proveedor Alfa”, “Cargamento C-001”, “Línea 1” y “Operario Ejemplo” son nombres ficticios aptos para pruebas.
- **EF-02:** si un ciclo configurado en 50 registra 49 eventos válidos, el progreso ilustrativo es 49; el evento número 50 alcanza el umbral y el 51 sería posterior al umbral. La pertenencia del evento 51 al mismo ciclo o a sobrantes no está definida.
- **EF-03:** 25 palos equivalen matemáticamente a 2,5 g según la conversión confirmada; esto no representa una recuperación real esperada.
- **EF-04:** un paro ficticio de 10:00 a 10:15 ilustra un intervalo de 15 minutos; no confirma categorías, horarios ni reglas de planta.

Los seeds, capturas, pruebas y manuales deben identificar claramente sus datos como ficticios y no usar información sensible real.

## 13. Alcance inicial y exclusiones

### Imprescindible

- Identidad, roles y auditoría.
- Planta, líneas, estaciones, operarios, proveedores, cargamentos y turnos.
- Cajuelas, correcciones, operación offline y sincronización.
- Barrida con umbral inicial configurable de 50 cajuelas, mercurio y oro.
- Portal web básico, reportes Excel, respaldo y recuperación.
- Paros, incidentes y mantenimiento básico que afecten la línea.

### Incluido si se mantiene el calendario

- Asistencia con fotografía y revisión.
- Cálculo de horas como apoyo, sin nómina completa.
- Inventario y herramientas.
- Indicadores básicos de proveedores y cargamentos.

### Posterior al núcleo o condicionado

- Reconocimiento facial automático, únicamente con consentimiento y precisión medida.
- Reportes avanzados.
- Editor visual de teclas.

### Fuera de alcance

- **Sensores, PLC, IoT y SCADA.**
- Automatización física y medición automática.
- Contabilidad, banca y nómina completa.
- Migración masiva de cuadernos.
- Aplicación móvil nativa.
- Administración multiempresa completa.
- CMMS completo, órdenes de mantenimiento y mantenimiento predictivo.

## 14. Criterio para aprobar esta línea base

Gerencia o el responsable de planta debe:

1. Corregir términos del glosario y confirmar su uso real.
2. Identificar el diagnóstico original y demás fuentes faltantes.
3. Responder primero PA-07 a PA-25, porque bloquean el modelo de producción, barridas y paros.
4. Revisar actores y responsables de cada acción.
5. Confirmar que 50 cajuelas es un umbral inicial configurable y que 10 palos = 1 gramo.
6. Confirmar las inclusiones y exclusiones de alcance.
7. Marcar esta versión como **Aprobada**, **Aprobada con correcciones** o **Rechazada**.

**Decisión:** Pendiente  
**Responsable:** Pendiente  
**Fecha:** Pendiente  
**Observaciones:** Pendiente
