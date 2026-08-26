# Línea base funcional 0.1 — revisión consolidada

**Estado:** validada funcionalmente para continuar el Sprint 0; decisiones diferidas identificadas

**Fecha de consolidación:** 2026-08-13

**Última actualización funcional:** 2026-08-25

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
- El MVP empieza con una sola computadora compartida como estación y un punto de control para el piloto de una línea; el modelo conserva líneas, rastras, estaciones y controladores configurables para crecer después.
- La planta opera normalmente de lunes a sábado de forma continua. El domingo no hay producción regular.
- La conectividad satelital suele funcionar. La estación autorizada podrá continuar hasta 24 horas desde su última validación central y deberá reautenticarse al recuperar conexión.
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
| Jornada | Clasificación automática de la operación por hora local: diurna de 06:00 inclusive a 18:00 exclusiva y nocturna de 18:00 inclusive a 06:00 exclusiva, en `America/Costa_Rica`; no abre ni cierra físicamente una línea. |
| Asignación de línea | Relación temporal entre una línea activa y su operario principal responsable. |
| Ciclo de línea | Periodo en el que una línea recibe cajuelas de un cargamento específico hasta terminar su alimentación. |
| Barrida | Limpieza real del proceso; puede abarcar menos, exactamente o más de 50 cajuelas según el cargamento y la decisión operativa. |
| Palo | Unidad tradicional para oro. Para la línea base, `1 palo = 0,1 g` y `10 palos = 1 g`; redondeo y variación real quedan pendientes. |
| Outbox | Cola local de operaciones confirmadas en SQLite pendientes de aceptación central. |
| Corrección compensatoria | Nuevo registro que revierte o ajusta el efecto de otro sin borrar el historial. |
| Modo Operación | Estado restringido y compartido de la estación, sin cuenta de operario, desde el que se registran cajuelas y se accede al check-in/out. |
| Trabajador provisional | Persona solicitada desde planta que puede registrar horas antes de la aprobación administrativa; a las 72 horas pasa a provisional vencido sin perder ni bloquear sus marcas. |

## 4. Actores y autorización granular

Existen tres roles autenticados y un modo operativo compartido. `JEFE_EMPRESA` es la cuenta de máxima autoridad: combina consulta gerencial y superadministración sin una segunda cuenta. `ADMINISTRADOR` no recibe acceso total por pertenecer al rol; sus capacidades se seleccionan individualmente y pueden cambiarse o revocarse.

| Rol | Canal | Facultades confirmadas |
|---|---|---|
| Jefe de empresa | Web | Superadministrador permanente: consulta toda la operación, estadísticas, notificaciones, auditoría y reportes; puede ejecutar los casos de uso administrativos y operativos de todos los módulos, crear administradores, seleccionar/editar sus permisos y suspenderlos. La interfaz prioriza datos y separa las ediciones en un módulo de Administración dentro de la misma sesión. |
| Administrador | Web | Cuenta de privilegio mínimo. Solo consulta o modifica los módulos concedidos individualmente. Puede llegar a tener acceso amplio si un jefe de empresa lo decide. Solo crea administradores, gobierna sus estados o asigna permisos cuando recibe cada capacidad específica. |
| Jefe de planta | Desktop | Inicia y habilita la estación; solicita trabajadores; gestiona proveedores e inventario; asigna responsables; registra/certifica mercurio y oro; revisa asistencia pendiente reciente y corrige durante el ciclo abierto. Eleva temporalmente permisos mediante su PIN individual. |
| Modo Operación | Desktop compartido | No es una cuenta ni un rol de Supabase. Mantiene el flujo continuo, registra/revierte cajuelas y permite check-in/out; no accede a administración, inventario, certificaciones ni correcciones profundas. |

Reglas de acceso:

- El gerente usa una única cuenta `JEFE_EMPRESA`; no necesita cerrar sesión ni mantener una cuenta administrativa paralela.
- Un administrador que también es jefe de planta puede acceder a ambos sistemas con sus credenciales correspondientes.
- Jefe de empresa crea la cuenta administrativa y elige sus permisos iniciales. Puede añadirlos, retirarlos, suspenderla o reactivarla después.
- Un administrador solo crea otra cuenta administrativa con `administrators.create`; solo cambia permisos con `administrators.permissions.manage`, y nunca puede conceder o retirar una capacidad que él mismo no posea. No puede modificar sus propios permisos.
- Ningún perfil puede alterar o borrar auditoría ni desactivar la última cuenta gerencial activa. Los datos históricos se corrigen o desactivan, no se eliminan físicamente.
- El administrador crea, suspende o revoca cuentas de jefe de planta y administra sus PIN individuales.
- Los trabajadores regulares no tienen cuenta de acceso. El jefe de planta crea una solicitud y el administrador aprueba, rechaza, reasigna o fusiona el perfil.
- La estación permanece normalmente en Modo Operación. El Modo Jefe de Planta exige el PIN personal, ofrece salida explícita y vuelve al modo restringido después de dos minutos de inactividad total, con aviso previo. Un bloqueo conserva formularios no enviados para reanudarlos tras reautenticación.
- Los intentos fallidos de PIN tienen límite y alerta configurables. Al excederlos se bloquea únicamente la elevación privilegiada: Modo Operación continúa. La recuperación exige contraseña completa en línea o restablecimiento administrativo; nunca se envía ni recupera el PIN por correo.
- Toda cuenta autenticada usa un correo válido para recuperación de contraseña mediante Supabase Auth. El correo opcional del trabajador es solo contacto y no participa en autenticación.
- Antes del reconocimiento facial, la estación se abre con usuario/contraseña y el jefe eleva permisos con PIN. Cuando exista captura aprobada, el uso del PIN intentará guardar una fotografía de auditoría; una cámara ausente o dañada no bloquea la continuidad, registra el acceso sin foto y genera una alerta administrativa.
- La interfaz es española por defecto; cada cuenta guarda una preferencia editable `es` o `en`.
- MFA y enrolamiento/revocación de dispositivos administrativos son obligatorios antes de producción, aunque se implementen al final del proyecto.

## 5. Proceso físico y productivo

### 5.1 Preparación y alimentación

1. El jefe de planta registra o selecciona un proveedor existente.
2. Registra un cargamento asociado al proveedor. Para el personal se reconoce por
   el nombre del proveedor/empresa y la hora automática de inicio; internamente
   usa UUID y no exige un código de negocio visible.
3. Selecciona una línea, el cargamento y un operario principal desde listas de registros activos.
4. Una línea no puede comenzar a recibir cajuelas sin responsable principal.
5. Un operario puede ser responsable simultáneamente de varias líneas; no se trazan ayudantes secundarios.
6. El punto de control puede ser compartido. La atribución se hace a línea, cargamento, responsable asignado y estación, no a quien pulsó físicamente la tecla.
7. Existe exactamente un responsable principal vigente a la vez. Cada relevo
   conserva responsable anterior, nuevo responsable e instante del cambio, y el
   resumen final muestra todas las personas responsables del cargamento.
8. La jornada se calcula automáticamente por la hora local. Su cambio o el
   relevo de responsable no obliga a detener la línea ni a cambiar cargamento.

### 5.2 Cargamentos

- Un cargamento siempre pertenece a un único proveedor.
- El sistema usa UUID como identidad técnica. En la operación el cargamento se
  muestra por proveedor/empresa y hora automática de inicio; por ahora no se
  exige un consecutivo o código de negocio legible.
- Un cargamento se asigna exactamente a una línea y nunca se reparte entre varias.
- Cada cargamento tiene exactamente un operario principal vigente a la vez y
  puede acumular varios responsables secuenciales mediante relevos auditados.
  Un operario puede responder simultáneamente por otros cargamentos/líneas sin
  privilegios adicionales. Ayudantes y demás operarios no se asignan a la línea.
- La línea asignada lleva el conteo, barridas, mercurio y oro del cargamento.
- La barrida no cierra el cargamento.
- Al agotarse el material termina la alimentación de ese ciclo; el material ya introducido sigue su curso hasta obtener amalgama y oro.
- Un nuevo cargamento puede comenzar sin crear una nueva jornada.
- Nunca se mezclan cajuelas o resultados de cargamentos distintos dentro de una misma barrida.

### 5.3 Cajuelas y corrección inmediata

- Cada pulsación válida crea un evento inmutable `CAJUELA_ADDED` con UUID.
- La confirmación local debe tardar menos de 300 ms en el equipo objetivo.
- Desde el Modo Operación se puede revertir únicamente la última cajuela de la línea seleccionada mientras el ciclo está abierto.
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
- El resultado definitivo del cargamento es la suma automática de sus barridas
  en la única línea asignada.
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
- El trabajador accede desde el Modo Operación, selecciona su perfil y la estación toma una fotografía para crear una marca pendiente con su hora original. No necesita una cuenta ni contraseña.
- El jefe de planta confirma o rechaza marcas pendientes recientes desde su modo temporal. El administrador conserva revisión global y corrige decisiones mediante ajustes auditados, nunca borrando el evento original.
- El jefe de planta puede consultar evidencia pendiente y reciente durante las primeras 24 horas. Después, la fotografía queda visible solo para el administrador mediante acceso temporal y auditado.
- El jefe de planta solicita un trabajador con nombre como dato mínimo y correo opcional de contacto. El perfil nace `PROVISIONAL`, puede marcar y acumular horas inmediatamente y espera aprobación administrativa.
- A las 72 horas sin resolución pasa a `PROVISIONAL_VENCIDO`: muestra aviso visible y alertas urgentes para administrador/gerencia, pero continúa registrando horas sin descartarlas ni bloquear la operación.
- Si la solicitud se rechaza o era duplicada, las horas y evidencias se conservan. El administrador debe reasignarlas al trabajador correcto, fusionar perfiles o documentar el rechazo.
- La jornada habitual es hasta 8 horas y puede extenderse aproximadamente hasta 10; la regla exacta de horas extra/dobles queda pendiente.
- El sistema calcula duración e incidencias, no salarios, impuestos ni deducciones.
- Olvidos o marcas históricas se corrigen por administrador mediante ajuste auditable.
- El escritorio debe soportar asistencia offline.

### Biometría posterior y condicionada

- Reconocimiento facial no es requisito del núcleo inicial.
- Antes de activarlo se aprueban consentimiento, retención, precisión, enrolamiento y alternativa segura.
- El enrolamiento debe capturar varios ángulos y superar una prueba de reconocimiento antes de considerarse válido; el trabajador permanece provisional hasta la aprobación administrativa.
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
- historial de cambios y alertas de acceso administrativo, sin posibilidad de alterar la auditoría.

Reportes iniciales:

- Excel de oro, cajuelas/producción, asistencia, horas, actividad de líneas, cargamentos y proveedores.
- PDF queda fuera de la primera versión.
- El idioma se puede elegir; por defecto usa la preferencia de la cuenta.
- La interfaz web y sus reportes soportan español e inglés; el texto libre no se traduce automáticamente.

## 11. Operación offline, sincronización y auditoría

- Toda mutación de planta se guarda primero en SQLite y outbox dentro de una transacción.
- Se intenta sincronizar inmediatamente sin bloquear la interfaz.
- Reiniciar, cerrar la aplicación o perder electricidad no elimina operaciones confirmadas localmente.
- La estación soporta hasta 24 horas offline desde la última validación central y reanuda automáticamente.
- El acceso offline requiere que un jefe de planta haya autenticado previamente la única estación inicial. Permite Modo Operación y elevación local limitada del jefe, pero no administración web ni cambios privilegiados fuera de la política cacheada.
- Al vencer las 24 horas sin red, la estación entra en contingencia: continúan cajuelas, reverso inmediato y check-in/out, se bloquea el Modo Jefe y cada evento queda pendiente de revisión por autorización vencida.
- Al recuperar conexión, la estación revalida cuenta, PIN/privilegios, autorización del dispositivo y revocaciones; los eventos locales confirmados nunca se descartan por el resultado de esa revalidación.
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
| RF-01 | Autenticar y autorizar `JEFE_EMPRESA`, `ADMINISTRADOR` y `JEFE_PLANTA`; usar una cuenta gerencial superadministradora, permisos individuales revocables para administradores y Modo Operación sin cuenta compartida. |
| RF-02 | Administrar planta, líneas, rastras, estaciones, solicitudes/estados de trabajadores, proveedores y cargamentos. |
| RF-03 | Asignar un responsable principal y cargamento antes de alimentar una línea. |
| RF-04 | Registrar y revertir cajuelas localmente mediante eventos inmutables. |
| RF-05 | Operar hasta 24 horas offline desde la última validación y sincronizar sin pérdida o duplicación. |
| RF-06 | Alertar en cada múltiplo configurable de 50 sin bloquear producción. |
| RF-07 | Registrar barridas reales, mercurio y oro parcial/definitivo con trazabilidad al cargamento. |
| RF-08 | Registrar entrega y confirmación/rechazo de oro bajo custodia. |
| RF-09 | Consultar operación central desde web responsive en español e inglés. |
| RF-10 | Registrar check-in/out con fotografía pendiente, trabajadores provisionales y vencidos, aprobación/reasignación auditable y horas revisables sin bloqueo. |
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
- Una falla de cámara no bloquea la elevación del jefe ni la continuidad de la operación; genera evidencia de ausencia y alerta prioritaria.
- MFA y dispositivos administrativos autorizados antes de producción.
- Instalación, respaldo y restauración ensayados.
- Monolito modular, sin microservicios ni servidor local de planta hasta que una necesidad medida lo justifique.

## 14. Datos personales y desactivación

- Un trabajador que deja la empresa se desactiva y conserva su historial para auditoría y posible recontratación.
- No existe eliminación automática por antigüedad en esta línea base.
- Un administrador puede iniciar una eliminación manual bajo protocolo, siempre que no rompa referencias legales u operativas.
- La fotografía/plantilla biométrica tiene ciclo de vida separado del historial laboral.
- Administrador accede a evidencias privadas desde funciones protegidas de la web, no directamente a la base de datos.
- Jefe de planta accede únicamente a fotografías pendientes o recientes necesarias para resolver intentos durante las primeras 24 horas.
- Por ahora las fotografías no tienen eliminación automática y se conservan indefinidamente como evidencia vinculada a auditoría, hasta que Sprint 6 apruebe una política definitiva. Deben monitorearse volumen y costo; conservar no significa hacerlas públicas ni permitir acceso irrestricto.
- La fotografía vive en almacenamiento privado; la auditoría guarda identificador, ruta lógica, checksum, actor, motivo y fechas, no el binario de la imagen ni una URL permanente.
- Nombre es el único dato obligatorio inicial del trabajador; correo y demás datos de contacto son opcionales y no sirven para iniciar sesión.
- Horas, fotos y decisiones ya registradas no se eliminan al vencer, rechazar o fusionar un perfil provisional.

## 15. Alcance y exclusiones

### Núcleo prioritario

- Roles, auditoría y catálogos.
- Líneas, responsables, proveedores y cargamentos.
- Cajuelas, correcciones, SQLite y sincronización.
- Alertas, barridas, mercurio, oro y custodia/entrega.
- Web informativa y Excel.

### Posterior dentro del plan

- Asistencia básica con fotografía pendiente, sin reconocimiento facial inicial.
- Inventario básico.
- Reconocimiento facial condicionado.
- Sensor sencillo de cajuelas como mejora futura, solo después de validar clic/teclado/controlador; no condiciona la aceptación del MVP.

### Fuera de alcance

- Sensores automáticos durante el MVP, PLC, IoT, SCADA y automatización física. El posible sensor sencillo queda en backlog y no sustituye la entrada manual.
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
| Matriz detallada de permisos, gobierno de cuentas, PIN y acceso offline de 24 horas | Aprobada al iniciar el prompt 1.2 el 2026-08-17 |
| Cardinalidades y modelo relacional de identidad, organización y catálogos iniciales | Aprobados al iniciar el prompt 1.3 el 2026-08-17 |
| Comportamiento de check-in cuando la cámara de asistencia no está disponible | Sprint 6 |
| Regla de horas extra/dobles; la clasificación operativa 06:00/18:00 ya fue confirmada | Sprint 6 |
| Confirmación o sustitución de la retención indefinida provisional de fotografías; consentimiento, enrolamiento y precisión biométrica | Sprint 6 |
| Catálogo/unidades definitivas e intervalos de revisión de inventario | Sprint 7 |
| Fórmulas e indicadores gerenciales | Sprint 8 |
| Tarifa horaria y estimación de costo laboral, solo si se aprueban sin convertir el sistema en nómina | Sprint 6/8 |

## 17. Aprobación de la pausa 0.1

La línea base ya incorpora las respuestas funcionales disponibles y permite continuar con infraestructura sin inventar reglas pendientes. Las decisiones de la sección 16 no bloquean Sprint 0 y deberán cerrarse antes de implementar su módulo.

**Decisión funcional:** Aprobada para continuar Sprint 0

**Responsable de consolidación:** Steven Venegas

**Fecha:** 2026-08-13

**Restricción:** no avanzar al siguiente prompt sin autorización expresa del responsable del proyecto.

## 18. Matriz requisito → sprint

La asignación indica responsabilidad futura; no significa que el requisito ya
esté implementado.

| ID | Sprint | Evidencia prevista |
| --- | ---: | --- |
| RF-01 | 1 | Matriz de permisos y accesos rechazados |
| RF-02 | 1 | Catálogos y cuatro líneas configurables |
| RF-03 | 2 | Cargamento y responsable obligatorios |
| RF-04 | 2 | Cajuela y reverso local probados |
| RF-05 | 3 | Caída, reintento y convergencia sin duplicados |
| RF-06 | 4 | Casos 49/50/55/56 y múltiplos |
| RF-07 | 4 | Barridas y oro consolidado por cargamento |
| RF-08 | 4–5 | Entrega, confirmación, rechazo y discrepancia |
| RF-09 | 5 | Portal español/inglés en móvil y escritorio |
| RF-10 | 6 | Entrada/salida offline y ajustes |
| RF-11 | 7 | Kardex sin negativos y revisión |
| RF-12 | 7 | Novedad que puede atravesar jornada |
| RF-13 | 8 | Excel bilingüe con dataset aprobado |
| RF-14 | 1–8 | Auditoría transversal por módulo |
| RF-15 | 6 | Política/precisión aprobadas o aplazamiento |

Seguridad, accesibilidad, rendimiento, UTC, decimales, recuperación y
observabilidad se verifican transversalmente cuando se introduce cada flujo.

## 19. Actualizaciones funcionales

### 19.1 Confirmaciones del 2026-08-17

El responsable confirmó una sola computadora compartida para el MVP, tres roles
autenticados y, en ese momento, cuenta administrativa separada para el gerente, Modo Operación
sin cuenta de operario, elevación temporal del jefe
mediante PIN individual, gobierno gerencial limitado sobre administradores,
trabajadores provisionales con aprobación posterior y check-in inicial mediante
fotografía pendiente. También confirmó que las horas nunca se eliminan, que la
operación continúa ante fallos técnicos y que sensor, reconocimiento facial y
estimaciones de pago se incorporan únicamente después de estabilizar sus flujos
base y aprobar sus políticas específicas.

También confirmó que la planta actual tiene un solo jefe de planta, que todos
los trabajadores registran horas independientemente de la línea y que solo el
responsable principal se asigna operativamente. Un trabajador puede responder
por más de una línea. Cada cargamento pertenece a un proveedor, se procesa en
exactamente una línea y tiene un único responsable; nunca se reparte entre
líneas.

### 19.2 Autorización granular del 2026-08-20

La decisión de cuentas gerencial y administrativa separadas queda sustituida.
`JEFE_EMPRESA` opera como superadministrador desde una sola cuenta. Crea las
cuentas `ADMINISTRADOR`, selecciona sus permisos y puede añadirlos, retirarlos,
suspenderlas o reactivarlas. Un administrador solo crea otras cuentas o gestiona
permisos cuando recibe la capacidad correspondiente; nunca delega ni retira una
capacidad que él mismo no posea. La interfaz gerencial prioriza datos y reportes,
y concentra las ediciones en un módulo separado dentro de la misma sesión.

### 19.3 Decisiones provisionales del flujo operativo del 2026-08-25

El desarrollador jefe autorizó usar estas respuestas para iniciar el diseño de
dominio 2.2, con validación posterior de la empresa y posibilidad de ajustar el
modelo antes de cerrar el Sprint 2:

- todavía no existen muestras de cuaderno o Excel ni una lista confirmada de
  columnas; se trabaja con la información disponible sin inventar campos;
- el término principal es `cargamento` y el personal también usa `camionetada`;
- la jornada se deriva automáticamente en `America/Costa_Rica`: diurna desde
  las 06:00 y nocturna desde las 18:00;
- el cargamento continúa durante un relevo: hay un responsable vigente a la vez
  y un historial de responsables con la hora de cada cambio;
- el jefe de planta puede registrar un proveedor faltante e iniciar el nuevo
  cargamento; el proveedor queda disponible para futuras entregas y una
  corrección administrativa posterior debe ser auditable;
- la línea física permanece activa. Mientras se prepara un cambio, el contexto
  confirmado anterior sigue recibiendo registros y el nuevo contexto se aplica
  completo al confirmar;
- no se exige código visible del cargamento: se presenta nombre de
  proveedor/empresa y hora automática de inicio;
- durante todo el MVP se diseña y valida una estación con una sola línea. La
  capacidad de configurar hasta cuatro líneas permanece como evolución futura;
- `Alimentación actual`, `Línea lista` y `Registrar cajuela` se aceptan como
  etiquetas provisionales hasta la siguiente reunión con la empresa.

Estas precisiones sustituyen, para Sprint 2, la lectura anterior de «un único
responsable» como una persona inmutable durante todo el cargamento: la unicidad
aplica al responsable vigente en cada instante.

Esta autorización no equivale a validación del proceso por usuarios de planta.
La estructura exacta del Excel y cualquier ajuste visual permanecen como deuda
explícita de levantamiento.
