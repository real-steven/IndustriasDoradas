# Línea base funcional 0.1 — revisión consolidada

**Estado:** validada funcionalmente para continuar el Sprint 0; decisiones diferidas identificadas

**Fecha de consolidación:** 2026-08-13

**Proyecto:** Sistema de Gestión y Control de Producción Minera — Industrias Doradas

**Alcance:** requerimientos, actores, procesos, reglas confirmadas, supuestos y preguntas abiertas previos a implementación.

## 1. Criterio de lectura y fuentes

Esta línea base consolida el diagnóstico descrito en `README.md`, los documentos de `docs/sprints/`, las respuestas de la encargada y las aclaraciones del responsable del proyecto. Las hojas de Excel y los cuadernos físicos son fuentes del proceso actual; deberán utilizarse como muestra en los levantamientos detallados de cada sprint.

Las afirmaciones se clasifican así:

- **Confirmado:** decisión funcional aceptada para orientar el diseño.
- **Pendiente:** decisión que debe resolverse en el sprint indicado antes de implementar esa función.
- **Ejemplo ficticio:** dato ilustrativo que no representa producción real.

Los valores ficticios nunca se convierten en reglas. Las decisiones que afecten datos, permisos o comportamiento se documentan antes de programarse.

## 2. Contexto operativo confirmado

- Industrias Doradas procesa material minero en Abangares, Guanacaste.
- Las cajuelas, asistencia y otros datos se registran actualmente en cuadernos y se consolidan en Excel.
- La planta actual tiene cuatro líneas; cada línea posee un molino y tres rastras.
- El piloto empieza con una línea y un punto de control, pero líneas, rastras, estaciones y controladores serán configurables.
- La planta opera normalmente de lunes a sábado de forma continua. El domingo no hay producción regular.
- La conectividad satelital suele funcionar, pero una caída puede durar hasta uno o dos días.
- El escritorio debe confirmar siempre primero en SQLite y sincronizar en segundo plano; la nube consolida, pero nunca bloquea la operación local.
- Con varias estaciones conectadas, los cambios deben propagarse casi en tiempo real. Sin conexión, convergen al recuperar red.

## 3. Glosario confirmado

| Término | Definición |
|---|---|
| Cajuela | Balde usado como unidad operativa para medir el material introducido en un molino. Su peso no es fijo y no se convierte automáticamente a kilogramos. |
| Línea | Flujo productivo configurable compuesto actualmente por un molino y tres rastras. |
| Molino | Equipo que rompe inicialmente las piedras grandes. |
| Rastra | Etapa posterior que continúa reduciendo el material hasta permitir obtener amalgama. Actualmente existen tres por línea. |
| Cargamento | Entrega específica de material perteneciente a un solo proveedor. Un proveedor puede entregar varios cargamentos, incluso el mismo día. |
| Jornada | Clasificación diurna o nocturna de las horas trabajadas; no abre ni cierra físicamente una línea. |
| Asignación de línea | Relación temporal entre una línea activa y su operario principal responsable. |
| Ciclo de línea | Periodo en el que una línea recibe cajuelas de un cargamento específico hasta terminar su alimentación. |
| Barrida | Limpieza real del proceso; puede abarcar menos, exactamente o más de 50 cajuelas según el cargamento y la decisión operativa. |
| Palo | Unidad tradicional para oro. Para la línea base, `1 palo = 0,1 g` y `10 palos = 1 g`; redondeo y variación real quedan pendientes. |
| Outbox | Cola local de operaciones confirmadas en SQLite pendientes de aceptación central. |
| Corrección compensatoria | Nuevo registro que revierte o ajusta el efecto de otro sin borrar el historial. |

## 4. Actores y separación de cuentas

Existen cuatro roles funcionales. Una persona puede cumplir varios, pero los accesos privilegiados se separan en cuentas diferentes para reducir errores.

| Rol | Canal | Facultades confirmadas |
|---|---|---|
| Jefe de empresa | Web | Consulta de toda la operación, estadísticas, notificaciones y reportes Excel. No modifica datos sensibles. Puede confirmar o rechazar entregas físicas de oro. |
| Administrador | Web | Crea, edita, corrige, desactiva y ejecuta protocolos de eliminación; administra usuarios privilegiados, líneas, estaciones y configuración. No consulta ni genera reportes desde esta cuenta por ahora. |
| Jefe de planta | Desktop | Prepara la operación, crea trabajadores, gestiona proveedores e inventario, asigna responsables, registra/certifica mercurio y oro, revisa asistencia pendiente y corrige durante el ciclo abierto. |
| Operario | Desktop compartido | Registra cajuelas, confirma una reversión inmediata y puede seleccionar el responsable principal. No registra mercurio ni oro. |

Reglas de acceso:

- Un gerente que también administra usa una cuenta gerencial y otra administrativa.
- Un administrador que también es jefe de planta puede acceder a ambos sistemas con sus credenciales correspondientes.
- Solo un administrador crea cuentas de administrador o jefe de empresa.
- El jefe de planta puede crear trabajadores operativos sin aprobación administrativa adicional.
- La interfaz es española por defecto; cada cuenta guarda una preferencia editable `es` o `en`.
- MFA y enrolamiento/revocación de dispositivos administrativos son obligatorios antes de producción, aunque se implementen al final del proyecto.

## 5. Proceso físico y productivo

### 5.1 Preparación y alimentación

1. El jefe de planta registra o selecciona un proveedor existente.
2. Registra un cargamento con código legible generado automáticamente, fecha y proveedor. Internamente usa UUID.
3. Selecciona una línea, el cargamento y un operario principal desde listas de registros activos.
4. Una línea no puede comenzar a recibir cajuelas sin responsable principal.
5. Un operario puede ser responsable simultáneamente de varias líneas; no se trazan ayudantes secundarios.
6. El punto de control puede ser compartido. La atribución se hace a línea, cargamento, responsable asignado y estación, no a quien pulsó físicamente la tecla.
7. El responsable permanece durante el ciclo; los cambios excepcionales conservan hora e historial.
8. Una jornada o cambio de responsable no obliga a detener la línea ni a cambiar cargamento.

### 5.2 Cargamentos

- Un cargamento siempre pertenece a un único proveedor.
- Proveedor + fecha no es identificador suficiente; el sistema genera un consecutivo legible y UUID.
- Un cargamento puede procesarse en varias líneas.
- Cada línea lleva su conteo, barridas, mercurio y oro; el cargamento consolida todas las líneas.
- La barrida no cierra el cargamento.
- Al agotarse el material termina la alimentación de ese ciclo; el material ya introducido sigue su curso hasta obtener amalgama y oro.
- Un nuevo cargamento puede comenzar sin crear una nueva jornada.
- Nunca se mezclan cajuelas o resultados de cargamentos distintos dentro de una misma barrida.

### 5.3 Cajuelas y corrección inmediata

- Cada pulsación válida crea un evento inmutable `CAJUELA_ADDED` con UUID.
- La confirmación local debe tardar menos de 300 ms en el equipo objetivo.
- El operario puede revertir únicamente la última cajuela de la línea seleccionada mientras el ciclo está abierto.
- La reversión requiere un segundo paso de confirmación, no texto libre, y usa un motivo automático de error inmediato.
- Visualmente resta uno; técnicamente crea `CAJUELA_REVERSED` y conserva el original.
- El jefe de planta puede corregir registros operativos antes del cierre/revisión del ciclo correspondiente.
- Después del cierre, solo el administrador corrige desde la web mediante eventos o ajustes auditados. El escritorio recibe la corrección al sincronizar.

## 6. Regla de alerta y barrida

- El umbral inicial configurable es 50 cajuelas por línea y cargamento.
- La alerta se repite en cada múltiplo: 50, 100, 150 y siguientes.
- La señal grande, visual y sonora dura aproximadamente 10 segundos; el sonido debe ser perceptible sin resultar molesto.
- El estado visual permanece durante el intervalo 50–55, 100–105, 150–155, etc.
- Al superar el final del intervalo desaparece y no bloquea nuevas cajuelas.
- Si una reversión baja de 50 a 49, la alerta desaparece; al regresar a 50 se activa otra vez.
- El operario principal decide cuándo barrer. No existe un máximo rígido porque la cajuela y el material son variables.
- Si queda poco material, puede continuarse más allá de 50 para evitar una barrida adicional pequeña.
- Todo cargamento termina con una barrida final, aunque el último grupo tenga menos de 50.
- Cada barrida registra la cantidad real de cajuelas incluidas y sus eventos; no se presume que sean exactamente 50.

## 7. Mercurio y oro

- El mercurio se registra después de cada barrida.
- La unidad provisional es gramos decimales; unidad definitiva, precisión y rangos se validan en el Sprint 4.
- El operario puede medir o comunicar el resultado; el jefe de planta lo verifica, registra y certifica.
- Cada barrida produce un resultado parcial de oro en gramos.
- El resultado definitivo del cargamento es la suma automática de sus barridas y líneas.
- Los totales se consultan por barrida, línea, jornada, día, cargamento y proveedor.
- El corte diario es medianoche en `America/Costa_Rica`; los datos se almacenan en UTC.
- La conversión inicial es `1 palo = 0,1 g`; no se implementa redondeo hasta validarlo.

### Custodia y entrega de oro

1. El sistema deriva el oro producido y el oro aún bajo custodia en planta.
2. El jefe de planta crea una solicitud de entrega en gramos desde el escritorio.
3. La gerente autorizada recibe una notificación en la web.
4. Tras la verificación física, confirma o rechaza la cantidad.
5. Una discrepancia conserva cantidad solicitada, cantidad recibida, motivo, participantes y fechas.
6. No se modelan transporte, venta, contabilidad ni destino posterior del oro.

El umbral para avisar que ya conviene recoger oro queda pendiente y será configurable.

## 8. Jornadas y asistencia

- Jornada diurna/nocturna clasifica horas y no representa el estado de la línea.
- Actualmente el jefe de planta anota entradas y salidas en cuaderno.
- La primera versión digital registra solo check-in y check-out; no descansos ni almuerzo.
- El jefe de planta selecciona al trabajador y registra la hora mientras se pospone biometría.
- La jornada habitual es hasta 8 horas y puede extenderse aproximadamente hasta 10; la regla exacta de horas extra/dobles queda pendiente.
- El sistema calcula duración e incidencias, no salarios, impuestos ni deducciones.
- Olvidos o marcas históricas se corrigen por administrador mediante ajuste auditable.
- El escritorio debe soportar asistencia offline.

### Biometría posterior y condicionada

- Reconocimiento facial no es requisito del núcleo inicial.
- Antes de activarlo se aprueban consentimiento, retención, precisión, enrolamiento y alternativa segura.
- El enrolamiento debe capturar varios ángulos; detalles técnicos quedan para el Sprint 6.
- Un intento fallido guarda foto, hora original, trabajador propuesto, estación y tipo de marca.
- El jefe de planta puede ver la evidencia y aceptar/rechazar; al aceptar se conserva la hora del intento.
- No se usará PIN como sustituto ordinario porque permitiría marcar a un trabajador ausente.
- Administrador o jefe de planta puede repetir el enrolamiento cuando falle.

## 9. Inventario y novedades

### Inventario inicial

- Alcance: herramientas y utensilios como palas, escaleras, tornillos, taladros y unidades o envases completos por definir.
- Las cantidades iniciales son enteras y no se permiten existencias negativas.
- Jefe de planta y administrador registran entradas, salidas, consumos, devoluciones y ajustes.
- No se requieren varias ubicaciones ni existencias mínimas inicialmente.
- La revisión es recomendada; si todo coincide se registra “inventario revisado sin diferencias”.
- El sistema recuerda el tiempo desde la última revisión con intervalos configurables; jefe de planta y gerencia pueden consultarlo.
- Catálogo, unidades definitivas y tratamiento de consumibles se validan en Sprint 7.

### Novedades operativas

- No existen categorías formales de paro actualmente.
- Se implementará un registro simple de novedad: fecha/hora, línea o planta, tipo general opcional, descripción, responsable e inicio/fin si aplica.
- El jefe de planta registra feriados, emergencias, paros, mantenimiento o razones de ausencia de producción.
- Una novedad puede atravesar el cambio de jornada.
- No se implementa CMMS, órdenes de trabajo, repuestos ni mantenimiento predictivo.

## 10. Web, reportes e idiomas

El perfil jefe de empresa consulta en modo informativo:

- cajuelas y líneas operando o detenidas;
- proveedor, cargamento y responsable;
- barridas, mercurio y oro;
- actividad por línea y jornada;
- check-in/check-out y horas;
- inventario, última revisión y novedades;
- estado/frescura de sincronización;
- entregas de oro pendientes y confirmadas.

Reportes iniciales:

- Excel de oro, cajuelas/producción, asistencia, horas, actividad de líneas, cargamentos y proveedores.
- PDF queda fuera de la primera versión.
- El idioma se puede elegir; por defecto usa la preferencia de la cuenta.
- La interfaz web y sus reportes soportan español e inglés; el texto libre no se traduce automáticamente.

## 11. Operación offline, sincronización y auditoría

- Toda mutación de planta se guarda primero en SQLite y outbox dentro de una transacción.
- Se intenta sincronizar inmediatamente sin bloquear la interfaz.
- Reiniciar, cerrar la aplicación o perder electricidad no elimina operaciones confirmadas localmente.
- La estación soporta uno o dos días offline y reanuda automáticamente.
- El acceso offline se limita a usuarios previamente autenticados y estación autorizada; no permite administración privilegiada.
- NestJS valida identidad, permisos, organización, estación, versión e idempotencia.
- PostgreSQL consolida la verdad central; los clientes reciben cambios incrementales, no una descarga completa.
- Con Internet, varias estaciones se actualizan casi en tiempo real; sin Internet se garantiza convergencia posterior, no simultaneidad.
- Solapamientos de varias estaciones sobre la misma línea se bloquean o advierten según política aprobada en Sprint 3.
- Una corrección web recibida por el escritorio genera una notificación breve y enlace al detalle.
- La auditoría registra actor con nombre, rol, origen, fecha, acción, entidad, anterior/nuevo, motivo y correlación.
- Usuarios, líneas, proveedores y trabajadores con historial se desactivan antes de considerar eliminación.

## 12. Requerimientos funcionales consolidados

| ID | Requerimiento |
|---|---|
| RF-01 | Autenticar y autorizar los cuatro roles con cuentas privilegiadas separadas. |
| RF-02 | Administrar planta, líneas, rastras, estaciones, trabajadores, proveedores y cargamentos. |
| RF-03 | Asignar un responsable principal y cargamento antes de alimentar una línea. |
| RF-04 | Registrar y revertir cajuelas localmente mediante eventos inmutables. |
| RF-05 | Operar uno o dos días offline y sincronizar sin pérdida o duplicación. |
| RF-06 | Alertar en cada múltiplo configurable de 50 sin bloquear producción. |
| RF-07 | Registrar barridas reales, mercurio y oro parcial/definitivo con trazabilidad al cargamento. |
| RF-08 | Registrar entrega y confirmación/rechazo de oro bajo custodia. |
| RF-09 | Consultar operación central desde web responsive en español e inglés. |
| RF-10 | Registrar asistencia básica de entrada/salida y calcular horas revisables. |
| RF-11 | Gestionar inventario básico sin existencias negativas y registrar revisiones. |
| RF-12 | Registrar novedades simples de paro, mantenimiento, emergencia o cierre. |
| RF-13 | Generar reportes Excel bilingües según permisos. |
| RF-14 | Auditar accesos, mutaciones, correcciones, entregas y eliminaciones. |
| RF-15 | Incorporar biometría solo después de aprobar política y medir precisión. |

## 13. Requerimientos no funcionales consolidados

- Registro local de cajuela menor a 300 ms; pantalla lista menor a 3 s en equipo objetivo.
- Uso mediante controlador configurable, foco visible, panel claro por línea y retroalimentación visual/sonora.
- UTC al almacenar y `America/Costa_Rica` al mostrar/agrupar.
- Tipos decimales para oro, mercurio y dinero; nunca `float` binario.
- JWT de Supabase validado por NestJS; `service_role` solo en backend.
- Logs sin tokens, claves, fotografías o plantillas biométricas.
- Fotografías privadas con acceso temporal y auditado.
- MFA y dispositivos administrativos autorizados antes de producción.
- Instalación, respaldo y restauración ensayados.
- Monolito modular, sin microservicios ni servidor local de planta hasta que una necesidad medida lo justifique.

## 14. Datos personales y desactivación

- Un trabajador que deja la empresa se desactiva y conserva su historial para auditoría y posible recontratación.
- No existe eliminación automática por antigüedad en esta línea base.
- Un administrador puede iniciar una eliminación manual bajo protocolo, siempre que no rompa referencias legales u operativas.
- La fotografía/plantilla biométrica tiene ciclo de vida separado del historial laboral.
- Administrador accede a evidencias privadas desde funciones protegidas de la web, no directamente a la base de datos.
- Jefe de planta accede únicamente a fotografías necesarias para resolver intentos pendientes.

## 15. Alcance y exclusiones

### Núcleo prioritario

- Roles, auditoría y catálogos.
- Líneas, responsables, proveedores y cargamentos.
- Cajuelas, correcciones, SQLite y sincronización.
- Alertas, barridas, mercurio, oro y custodia/entrega.
- Web informativa y Excel.

### Posterior dentro del plan

- Asistencia básica sin biometría.
- Inventario básico.
- Reconocimiento facial condicionado.

### Fuera de alcance

- Sensores, PLC, IoT, SCADA y automatización física.
- Medición automática de material, mercurio u oro.
- Contabilidad, banca, nómina completa y cálculo definitivo de salarios.
- PDF en la primera versión.
- Aplicación móvil nativa.
- Administración multiempresa completa.
- CMMS, mantenimiento predictivo y gestión completa de compras.

## 16. Decisiones pendientes enrutadas

| Pendiente | Debe resolverse en |
|---|---|
| Precisión/unidad definitiva de mercurio y rangos válidos | Sprint 4 |
| Variación real y redondeo de palos ↔ gramos | Sprint 4 |
| Umbral de oro para notificar recogida | Sprint 4/5 |
| Política exacta de corrección administrativa y eliminación | Sprint 1 |
| Matriz detallada de permisos y acceso offline | Sprint 1 |
| Horarios diurno/nocturno y regla de horas extra/dobles | Sprint 6 |
| Consentimiento, retención, enrolamiento y precisión biométrica | Sprint 6 |
| Catálogo/unidades definitivas e intervalos de revisión de inventario | Sprint 7 |
| Fórmulas e indicadores gerenciales | Sprint 8 |

## 17. Aprobación de la pausa 0.1

La línea base ya incorpora las respuestas funcionales disponibles y permite continuar con infraestructura sin inventar reglas pendientes. Las decisiones de la sección 16 no bloquean Sprint 0 y deberán cerrarse antes de implementar su módulo.

**Decisión funcional:** Aprobada para continuar Sprint 0

**Responsable de consolidación:** Steven Venegas

**Fecha:** 2026-08-13

**Restricción:** no avanzar al siguiente prompt sin autorización expresa del responsable del proyecto.
