# Sprint 6 — Trabajadores, asistencia y horas (semanas 12–13)

**Objetivo:** incorporar control de trabajadores y marcas de entrada/salida
local-first sin convertir el sistema en nómina ni comprometer la continuidad de
la planta.

**Entregable:** catálogo operativo de trabajadores, `CHECK_IN/CHECK_OUT`
offline, incidencias y ajustes compensatorios, horas derivadas y consulta
gerencial. La fotografía solo se incluye después de aprobar su política; el
reconocimiento facial queda fuera del criterio de cierre de este sprint.

## Dependencias y límites heredados

1. Reutiliza identidad, trabajadores provisionales y auditoría de Sprint 1.
2. Reutiliza SQLite + outbox + push/pull + conflictos de Sprints 2–4; no crea
   una vía paralela de sincronización.
3. Reutiliza API paginada, shell mobile-first, sesión y estados de frescura de
   Sprint 5.
4. En desktop, `JEFE_PLANTA` administra el flujo operativo. En web,
   `JEFE_EMPRESA` consulta la consolidación y solo realiza correcciones
   centrales expresamente definidas.
5. `ADMINISTRADOR` no forma parte del alcance vigente. Las tablas o permisos
   históricos no justifican pantallas ni casos de uso nuevos.
6. No hay descansos automáticos, deducciones, pago final ni cálculo de nómina.
   Puede existir una estimación bruta derivada de minutos y tarifa versionada
   por trabajador, claramente separada de un comprobante de pago.
7. Ningún fallo de cámara, red, perfil provisional o reloj puede borrar una
   marca ya confirmada ni detener producción.

## Orden de trabajo

1. Validar el flujo real de llegada/salida, olvidos, turno nocturno y
   responsables de corrección.
2. Decidir si el MVP usa fotografía. Si se aprueba, cerrar antes finalidad,
   consentimiento, acceso, retención, costo y respuesta a incidentes.
3. Diseñar eventos inmutables de asistencia, incidencias y ajustes; las horas
   son una proyección, no un campo editable.
4. Implementar PostgreSQL/SQLite y contrato de sincronización idempotente.
5. Implementar check-in/out en desktop desde Modo Operación, con intervención
   de `JEFE_PLANTA` para revisiones y correcciones.
6. Implementar Storage privado y carga reintentable únicamente si fotografía
   fue aprobada.
7. Consolidar eventos fuera de orden, duplicados y datos tardíos sin perder la
   hora original.
8. Crear read models versionados de horas, pendientes e incidencias.
9. Implementar en web trabajadores y horas para `JEFE_EMPRESA`, sin gestión de
   roles ni nómina.
10. Ejecutar piloto, privacidad, regresión y cierre.

**Pruebas:** doble entrada, salida sin entrada, marca abierta, turno nocturno,
reverso/ajuste, provisional/vencido, reloj incorrecto, reinicio, offline,
idempotencia y dos estaciones. Si hay fotografía: cámara ausente, archivo
pendiente, acceso temporal y caché eliminada al cerrar sesión.

**Prueba manual:** una jornada con perfiles ficticios, Internet caído, olvido,
cambio de día, corrección del jefe de planta y consulta web de la gerente.

**Aceptación:** nadie pierde horas por una falla técnica; cada corrección
conserva anterior/nuevo, actor, motivo y momento; desktop y web muestran el
mismo total central y los datos incompletos permanecen pendientes, nunca cero.

## Mini pasos, pausas y prompts

**Referencia visual preparatoria — 2026-10-12:** la categoría `Asistencia y
horas` de Auditoría permanece conceptual hasta 6.8. La pantalla navegable de
Asistencia dejó de ser maqueta el 2026-10-17: desde 6.5 sus controles escriben
marcas reales en SQLite y outbox. Sigue sin capturar fotografías y la consulta
central aún depende de 6.7–6.9.

**Estado revisado — 2026-10-15:** la maqueta no cierra por sí sola el paso 6.1.
El paso 6.2 sí queda resuelto con fotografía aplazada para el MVP. La decisión
completa está en
[`../security/decision-fotografia-asistencia.md`](../security/decision-fotografia-asistencia.md).

### 6.1 Flujo real y responsabilidades

**Prompt:** Contrasta con la empresa cómo se marca entrada/salida, quién corrige
un olvido, qué ocurre en turno nocturno, si existe redondeo y cómo se trata una
marca abierta. Confirma qué puede resolver `JEFE_PLANTA` desde desktop y qué
correcciones excepcionales puede ejecutar `JEFE_EMPRESA` desde web. No diseñes
cuentas de operario ni recuperes el rol legado `ADMINISTRADOR`.

**Pausa:** tabla de casos ambiguos aprobada y responsables definidos.

**Revisión aprobada 2026-10-15 — paso 6.1 cerrado:**

| Caso                       | Regla confirmada                                                                                                                                                              | Estado     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Identificación             | El trabajador selecciona su perfil desde Modo Operación; no tiene cuenta ni contraseña.                                                                                       | Confirmado |
| Entrada y salida           | El trabajador registra su propia entrada o salida; no se registran descansos ni almuerzo.                                                                                     | Confirmado |
| Operación sin red          | La hora original se conserva localmente y la sincronización posterior no puede borrar la marca.                                                                               | Confirmado |
| Revisión en planta         | El jefe de planta atiende incidencias desde desktop mediante elevación temporal y motivo auditable.                                                                           | Confirmado |
| Consulta gerencial         | `JEFE_EMPRESA` consulta horas e incidencias consolidadas desde web; no existe revisión por `ADMINISTRADOR`.                                                                   | Confirmado |
| Olvido de entrada o salida | El jefe de planta agrega una sola corrección con fecha/hora real y motivo obligatorio; nunca edita la marca original. Gerencia puede agregar una versión posterior desde web. | Confirmado |
| Turno nocturno             | Una jornada que cruza medianoche no se divide y conserva como fecha de referencia el día local de la entrada.                                                                 | Confirmado |
| Marca abierta              | Check-in sin check-out permanece abierto, no vale cero y genera alerta al superar ocho horas; el jefe puede cerrarlo mediante ajuste motivado.                                | Confirmado |
| Precisión                  | Horas y franjas se calculan al minuto exacto, sin redondeo de jornada.                                                                                                        | Confirmado |
| Responsabilidad gerencial  | La corrección local no requiere aprobación. Queda visible en auditoría y gerencia puede agregar otra versión si detecta un error.                                             | Confirmado |

La planta puede operar continuamente y el cambio de fecha no cierra jornadas.
El jefe de planta resuelve el olvido inmediato una sola vez. Una modificación
posterior corresponde a `JEFE_EMPRESA` y agrega otra versión auditable, nunca
reescribe el historial.

### 6.2 Privacidad y decisión de fotografía

**Prompt:** Decide explícitamente si el primer flujo requiere fotografía. Si la
requiere, documenta finalidad, consentimiento, ventana de acceso, retención,
respaldo, borrado, costo y respuesta a incidentes. Distingue foto de evidencia
de plantilla biométrica. Si no se aprueba, implementa asistencia sin imagen y
registra la decisión; reconocimiento facial permanece en backlog.

**Pausa:** política firmada o aplazamiento explícito antes de crear Storage.

**Resultado 2026-10-15 — aplazamiento explícito aprobado:**

- El primer flujo de asistencia funcionará sin fotografía.
- No se solicita consentimiento fotográfico porque el MVP no captura imágenes.
- No se crea bucket, carga, respaldo, caché ni política de retención de fotos.
- No se genera ni almacena plantilla biométrica y no se realiza reconocimiento
  facial.
- Cámara USB, timbre o Raspberry quedan como integraciones futuras y no pueden
  condicionar el check-in/out manual.
- Activar fotografía en el futuro requiere una nueva aprobación explícita de
  finalidad, acceso, retención, borrado, costo, contingencia e incidentes.

La pausa 6.2 queda cerrada. El paso 6.6 se omite en este Sprint mientras esta
decisión permanezca vigente.

### 6.3 Dominio de asistencia

**Prompt:** Diseña `CHECK_IN`, `CHECK_OUT`, incidencia y ajuste compensatorio con
trabajador, estación, tiempos de ocurrencia/registro/confirmación, estado de
sincronización, motivo y actor. Conserva trabajadores
`PROVISIONAL/PROVISIONAL_VENCIDO` sin perder horas y separa el cálculo derivado.
Prueba entrada duplicada, salida huérfana, nocturno y corrección tardía.

**Pausa:** dataset pequeño produce estados esperados sin editar eventos.

**Avance 2026-10-15 — dominio inicial implementado:**

- `CHECK_IN`, `CHECK_OUT`, `ADJUSTED_CHECK_IN` y `ADJUSTED_CHECK_OUT` son
  eventos inmutables con UUID, secuencia de estación, trabajador, estación,
  tiempos de ocurrencia/registro/confirmación y estado de sincronización.
- Un ajuste exige perfil de jefe, motivo y referencia a la marca relacionada.
- La proyección produce jornadas completas o abiertas e incidencias por entrada
  duplicada, salida huérfana y jornada abierta de más de ocho horas.
- Reintentar el mismo UUID es idempotente; reutilizarlo con otro contenido o
  repetir una secuencia con otro evento se rechaza.
- Medianoche no divide la jornada y la fecha visible corresponde al check-in en
  `America/Costa_Rica`.
- La tarifa regular y el multiplicador nocturno son versiones configurables por
  trabajador. La referencia inicial es franja regular 06:00–18:00 y nocturna
  18:00–06:00 con multiplicador 1,5; no se codifica una tarifa única global.
- Jornadas abiertas no calculan pago. Las completas generan una estimación
  bruta por minutos regulares/nocturnos, no nómina.

La especificación está en
[`../architecture/dominio-asistencia-sprint-06.md`](../architecture/dominio-asistencia-sprint-06.md).
El dataset automatizado cubre cruce de medianoche, duplicado, salida huérfana,
apertura mayor a ocho horas, corrección tardía, idempotencia y tarifa distinta
por empleado. La persistencia queda resuelta en 6.4; la ingestión API y la
convergencia multiestación continúan reservadas para 6.7.

### 6.4 Persistencia y permisos

**Prompt:** Implementa migraciones PostgreSQL/SQLite, FK, índices, checks,
append-only y permisos. Desktop guarda evento + outbox atómicamente. API aplica
aislamiento por organización y autoriza `JEFE_PLANTA` operacional y
`JEFE_EMPRESA` gerencial según casos aprobados. No guardes imágenes como blob
en SQLite/PostgreSQL.

**Pausa:** actualización desde Sprint 5 conserva todo el historial y bloquea
acceso cruzado.

**Resultado 2026-10-15 — capa de datos 6.4 cerrada:**

- PostgreSQL agrega eventos de asistencia y tarifas versionadas por trabajador,
  con FK compuestas por organización, checks, índices, RLS y privilegios
  exclusivos del backend.
- SQLite migra a versión 16 y conserva eventos de asistencia localmente sin
  guardar tarifas gerenciales ni imágenes.
- El repositorio desktop asigna la secuencia de estación y persiste marca +
  outbox de manera atómica; un fallo en cualquiera revierte ambos.
- Eventos y versiones de tarifa son append-only. Los olvidos se resuelven con
  `ADJUSTED_CHECK_IN/OUT`, perfil de jefe, motivo y referencia a la marca.
- `JEFE_PLANTA` recibe `attendance.record` y `attendance.correct`;
  `JEFE_EMPRESA` recibe lectura gerencial y gestión de tarifas. Los clientes no
  acceden directamente a las tablas privadas.
- La actualización desde las 15 migraciones locales anteriores conserva los
  datos; las pruebas validan idempotencia, rollback transaccional, secuencia,
  aislamiento, privilegios e inmutabilidad.

El contrato HTTP que ingiere el outbox y los read models autorizados se conecta
en 6.7–6.9, sin abrir una vía paralela al sistema de sincronización existente.

### 6.5 Check-in/out local-first

**Prompt:** Implementa una pantalla WPF accesible desde Modo Operación para
seleccionar trabajador y registrar entrada/salida sin frenar las cards de
producción. Evita doble pulsación, muestra guardado local/frescura y permite a
`JEFE_PLANTA` resolver incidencias mediante elevación y motivo.

**Pausa:** marcar offline, reiniciar y comprobar un único evento pendiente.

**Avance 2026-10-17 — implementación lista para prueba manual:**

- La navegación `ASIST.` permite seleccionar un trabajador activo y registrar
  explícitamente entrada o salida.
- Solo se habilita la acción coherente con su jornada local: no permite otra
  entrada mientras está dentro ni salida cuando está fuera.
- La marca se guarda primero en SQLite y el comando se bloquea mientras procesa,
  evitando doble pulsación desde la interfaz.
- La vista muestra trabajadores en planta, jornadas abiertas, incidencias y la
  última marca conocida por trabajador.
- Tras reiniciar, la vista reconstruye el estado desde eventos locales; una
  jornada abierta no se convierte en cero.
- Con Modo Jefe de Planta se puede cerrar una salida olvidada con motivo,
  fecha y hora real obligatorios mediante `ADJUSTED_CHECK_OUT`, conservando la
  entrada original. La hora debe ser posterior a la entrada y no futura.
- La misma omisión solo admite una corrección del jefe. Una eventual corrección
  gerencial se encadena como otra versión append-only, no como `UPDATE`.
- Los eventos ya contienen trabajador y fechas indexadas para que la consulta
  web de 6.9 filtre por persona y rango sin modificar el historial.
- No hay cámara, fotografía ni biometría.
- Operarios y jefes de planta usan la misma asistencia. Cada cuenta
  `JEFE_PLANTA` crea o recupera una ficha laboral vinculada, visible en el mismo
  selector con su categoría, mientras credenciales, PIN y permisos permanecen
  separados.
- Un operario provisional no vence automáticamente: permanece pendiente hasta
  la decisión explícita de gerencia y conserva todas sus marcas.

Las pruebas automatizadas cubren entrada, reinicio, salida y corrección
auditada. La pausa manual debe ejecutarse sin Internet: la ingestión del outbox
de asistencia al API se implementa en 6.7. Hasta entonces no debe evaluarse la
convergencia entre dos computadoras como parte de 6.5.

### 6.6 Evidencia privada, si aplica

**Prompt:** Solo si 6.2 aprobó fotografía, define `ICameraCapture`, captura con
timeout/cancelación, metadatos mínimos, checksum y carga idempotente a bucket
privado. Cámara ausente crea una incidencia sin bloquear. Las URL son firmadas,
cortas y cada acceso se audita. Define limpieza de temporales y evento
sincronizado con archivo pendiente.

**Pausa:** caída de red/cámara ensayada sin duplicar ni exponer archivos.

**Decisión vigente — 2026-10-20:** omitido para el MVP. La fotografía y la
biometría continúan aplazadas; no se crearon cámara, archivos ni Storage.

### 6.7 Sincronización de asistencia

**Prompt:** Extiende el contrato incremental a asistencia respetando secuencia,
idempotencia, dependencias fuera de orden y hora original. Una corrección remota
se proyecta en desktop sin reescribir historia. Añade prueba multiestación y de
reintento tras 24 horas offline.

**Pausa:** ambas estaciones convergen en eventos y estados explicables.

**Estado — 2026-10-20:** completado localmente. `ATTENDANCE_EVENT_RECORDED`
usa el mismo push incremental que producción, conserva `occurred_at_utc`, deja
dependencias ausentes en `RETRY_LATER` sin consumir recibo y publica cada marca
como `ATTENDANCE_EVENT` para toda la planta. El pull confirma una marca local o
inserta una remota sin modificar sus hechos; una corrección se publica como
`CORRECTION_APPENDED`. Las pruebas PostgreSQL/API/SQLite cubren replay
idempotente, corrección adelantada, 24 horas offline y convergencia de dos
estaciones.

### 6.8 Read models de horas

**Prompt:** Empareja eventos válidos mediante servicio versionado y devuelve
duración exacta, marcas abiertas, incidencias, cobertura y frescura por período.
No conviertas incompletos en cero ni calcules dinero. Usa UTC para almacenar y
`America/Costa_Rica` para cortes visibles.

**Pausa:** resultados coinciden al minuto con un cálculo manual aprobado.

**Estado — 2026-10-20:** completado localmente. El endpoint gerencial
`management/attendance/hours` publica `attendance-hours-v1`, recibe fechas
inclusivas de Costa Rica y permite filtrar por planta o trabajador. La
proyección sustituye únicamente versiones de corrección equivalentes, conserva
omisiones completadas, separa jornadas abiertas e incidencias y recorta los
minutos al período solicitado. También informa eventos confirmados/excluidos y
la última confirmación; no convierte incompletos en cero ni consulta tarifas.
Las pruebas comparan dos jornadas manuales, incluida una nocturna cortada por el
fin del período, con un total controlado de 930 minutos.

### 6.9 Trabajadores y horas en web

**Prompt:** Implementa el módulo `Trabajadores` de Sprint 5 para
`JEFE_EMPRESA`: actividad actual, horas por período, pendientes e historial de
ajustes. Mantén filtros en URL y auditoría legible. Permite creación/edición
central solo si el flujo fue confirmado; no agregues gobierno de usuarios.

**Pausa:** la gerente distingue horas confirmadas, abiertas y excluidas.

**Estado — 2026-10-20:** completado localmente. El módulo web
`/gerencia/trabajadores` consume `attendance-hours-v1` y reúne operarios y
jefes de planta en una consulta de solo lectura. Permite consultar semana
actual, semana anterior o un día específico y filtrar por trabajador; los
filtros permanecen en la URL. La vista separa minutos confirmados, jornadas
abiertas, incidencias y marcas excluidas, y muestra el detalle de jornadas y el
historial de ajustes con actor, motivo y momento de registro. No calcula pagos,
no estima jornadas incompletas y no agrega creación o gobierno de usuarios.
Las pruebas web verifican los cortes de lunes a domingo, los filtros enviados
al API y la presentación legible de pendientes y correcciones.

### 6.10 Piloto y cierre

**Prompt:** Ejecuta una jornada ficticia completa con offline, nocturno, olvido,
corrección, reinicio y consulta web. Si fotografía quedó aplazada, no la simules
como implementada. Corrige críticos/altos, actualiza manuales y cierra Sprint 6.

**Pausa:** cero pérdida de marcas, totales aprobados y política respetada.

**Estado técnico — 2026-10-20:** piloto automatizado aprobado. El escenario
controlado registra una entrada offline a las 17:30, conserva la jornada tras
reiniciar, detecta que sigue abierta después de ocho horas y agrega una salida
olvidada de las 07:15 mediante corrección motivada. Desktop y el read model
central coinciden en 825 minutos; la sincronización converge entre estaciones
sin duplicar y la web presenta horas, pendientes y ajustes auditables. La suite
completa no detecta defectos críticos o altos. Fotografía y biometría no se
simularon porque continúan aplazadas.

La evidencia y el recorrido MAN-01–MAN-06 están en
[`../testing/sprint-06-10-piloto-asistencia.md`](../testing/sprint-06-10-piloto-asistencia.md).
El Sprint 6 queda listo para cierre, sujeto a esa revisión manual antes de
iniciar Sprint 7.
