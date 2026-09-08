# Cierre del Sprint 2 y traspaso al Sprint 3

**Proyecto:** Sistema de Gestión y Control de Producción Minera — Industrias Doradas

**Fecha de cierre:** 2026-09-07

**Rama de trabajo:** `DevHenry`

**Responsable que aprueba el cierre:** `DevHenry`

**Base recibida del Sprint 1:** `23f6d39` (`fix: completar compuertas técnicas del Sprint 1`)

**Último commit funcional del Sprint 2:** `f8a188b` (`feat(desktop): preparar validacion de jornada offline`)

**Estado:** Sprint 2 cerrado para continuar con Sprint 3, con validaciones de
empresa y pruebas presenciales conservadas como deuda explícita.

## 1. Propósito de este documento

Esta es la fuente de entrada para una persona o un agente de Codex que comience
el Sprint 3 en un espacio de trabajo nuevo. Resume el alcance entregado, los
cambios funcionales, las reglas que sustituyeron decisiones anteriores, la
arquitectura implementada, la evidencia disponible y las deudas que no deben
confundirse con trabajo de sincronización.

El cierre aprobado significa que la base técnica local está lista para iniciar
el diseño de sincronización. No convierte en realizadas las comprobaciones
presenciales que todavía no se ejecutaron ni inventa la muestra de
cuaderno/Excel que la empresa aún no ha entregado.

## 2. Resultado ejecutivo

El Sprint 2 transformó el esqueleto WPF del Sprint 1 en una estación operativa
local-first para el piloto de una línea. La estación puede:

- restaurar una autorización protegida y elevar temporalmente al jefe de planta;
- refrescar y conservar localmente proveedores, trabajadores y líneas;
- iniciar un cargamento con proveedor, línea y responsable activos;
- relevar al responsable sin cerrar el cargamento;
- finalizar el cargamento mediante preparación y confirmación;
- registrar una cajuela en SQLite sin esperar Internet;
- corregir la última cajuela mediante un evento compensatorio inmutable;
- operar por clic, teclado o un adaptador de controlador futuro;
- impedir auto-repeat y rebotes demasiado rápidos sin retrasar la pulsación normal;
- mostrar total, contexto, guardado local y pendientes Outbox;
- sobrevivir reinicios y ofrecer diagnóstico y copia consistente de SQLite.

Entre la compuerta técnica del Sprint 1 y el último commit funcional del Sprint
2 se modificaron o agregaron **100 archivos**, con **12.067 líneas agregadas** y
**57 eliminadas**. No se agregaron migraciones PostgreSQL/Supabase en este
sprint: la persistencia nueva es SQLite local y la consolidación central
corresponde al Sprint 3.

La suite de escritorio se volvió a ejecutar el 2026-09-07: **105 de 105 pruebas
correctas**, sin omitidas ni fallidas.

## 3. Alcance cerrado y límites deliberados

### 3.1 Incluido

- Una computadora, una estación, un punto de control y una sola línea piloto.
- Dominio de cargamento, ciclo de alimentación, responsable vigente e historial
  de relevos.
- Jornada automática de Costa Rica.
- Eventos `CAJUELA_ADDED` y `CAJUELA_REVERSED` con UUID de cliente.
- SQLite por estación, cinco migraciones, repositorios, contador reconstruible y
  Outbox.
- Preparación/confirmación atómica para inicio, relevo, finalización y reverso.
- Interfaz WPF local, teclado configurable, feedback y diagnóstico.
- Manejo seguro de timeout, pérdida de red, base ocupada, disco lleno,
  corrupción, reloj atrasado y configuración ausente.
- Evidencia automatizada de una jornada con dos cargamentos, tres responsables,
  120 agregados, tres reversos y reinicios.

### 3.2 No incluido

- Envío de Outbox, reintentos, confirmaciones del servidor o pull incremental.
- Tablas centrales de producción o recibos de sincronización en PostgreSQL.
- Convergencia entre varias estaciones o control de solapamientos.
- Operación visual simultánea de cuatro líneas.
- Sensor, PLC, IoT o automatización física.
- Barridas, alerta productiva de cada 50, mercurio, oro o entregas.
- CRUD genérico de proveedores o trabajadores dentro del Modo Operación.
- Corrección administrativa histórica de producción.
- Asistencia, biometría, inventario, reportes o Excel.

Estas exclusiones no son defectos del Sprint 2. Deben implementarse únicamente
en el sprint que les corresponde.

## 4. Recorrido de los doce mini pasos

| Paso | Commit | Entrega principal | Evidencia y estado al cierre |
| --- | --- | --- | --- |
| 2.1 | `f25fde6` | Contrato provisional del flujo real, historias, vocabulario y wireframes para una línea. | Aprobado para avanzar con respuestas del desarrollador jefe. La validación con usuarios y una muestra real quedó diferida. |
| 2.2 | `9bc9f22` | Dominio puro de cargamento, ciclo, jornada y responsables secuenciales. | Invariantes y transiciones inválidas cubiertas por pruebas. |
| 2.3 | `b3b5ced` | Contrato inmutable del evento de producción y contador derivable. | UUID, secuencia, contexto y reversos cubiertos; contraste real con cuaderno/Excel diferido. |
| 2.4 | `db2b08d` | SQLite por estación, migrador, repositorios, WAL, FK, inmutabilidad y copia segura. | Dos arranques e inspección de base real aprobados. |
| 2.5 | `1f6928e` | Inicio, relevo, finalización y consulta de contexto local. | Atomicidad, autorización, concurrencia optimista y bloqueos cubiertos. |
| 2.6 | `75ac4bd` | Registro atómico e idempotente de una cajuela, contador y Outbox. | Casos 1/10/50 y objetivo menor a 300 ms cubiertos. |
| 2.7 | `02eb895` | Corrección inmediata con doble paso, compensación y auditoría inmutable. | Base real migrada; aceptación, rechazo, idempotencia y rollback cubiertos. |
| 2.8 | `5fa255c` | Pantalla WPF del piloto y panel reutilizable de línea. | Dos arranques y lectura en monitor aprobados; comprensión con personal diferida. |
| 2.9 | `74ad556` | Entrada semántica configurable por clic/teclado/controlador. | Teclas y reconexión manual aprobadas; recorrido activo cubierto automáticamente. |
| 2.10 | `cd4bd57` | Antirrebote, bloqueo de auto-repeat, feedback, métricas anónimas y preparación de Línea 1. | Pruebas automatizadas completas; comprobación presencial registrada como deuda. |
| 2.11 | `6afb777` | Recuperación, clasificación de fallos, diagnóstico y copia consistente. | Cobertura automatizada completa; prueba manual de cierre abrupto diferida. |
| 2.12 | `f8a188b` | Integración de inicio/relevo/finalización en UI, escenario offline integral y protocolo C1–C10. | Suite integral aprobada. C1 quedó parcial y C2–C10 se conservan como validación posterior. |

## 5. Reglas funcionales que cambiaron o se precisaron

Las siguientes decisiones sustituyen cualquier texto anterior incompatible.

### 5.1 Identidad visible del cargamento

**Antes:** se proponía un código o consecutivo legible generado por el sistema.

**Ahora:** el cargamento usa UUID como identidad técnica y el personal lo
reconoce por proveedor/empresa más hora automática de inicio. No se exige código
visible hasta que la empresa demuestre esa necesidad.

### 5.2 Responsable del cargamento

**Antes:** “un único responsable” podía interpretarse como una persona fija
durante todo el cargamento.

**Ahora:** existe exactamente un responsable principal **vigente en cada
instante**. Un relevo cierra el tramo anterior, abre el siguiente y conserva las
personas y horas históricas. El cargamento y la línea no cambian por el relevo.

Un trabajador puede responder por varios cargamentos o líneas. Los ayudantes no
se asignan al ciclo productivo.

### 5.3 Jornada

La jornada no es un selector ni el estado de la línea. Se deriva en
`America/Costa_Rica`:

- diurna: `[06:00, 18:00)`;
- nocturna: `[18:00, 06:00)`.

El cambio de jornada no finaliza el cargamento, el ciclo, la sesión ni la
responsabilidad vigente. Cada evento registra la clasificación correspondiente
a su propia hora.

### 5.4 Preparación de cambios

Inicio, relevo, finalización y reverso separan **preparar** de **confirmar**. La
preparación es un borrador en memoria y no escribe. Mientras se prepara un
cambio, el contexto confirmado anterior continúa siendo válido para registrar.
La confirmación revalida catálogo, autorización y versión del contexto, y aplica
todo dentro de una transacción.

### 5.5 Fin del cargamento

Solo la finalización confirmada lleva el ciclo de `ACTIVE` a `COMPLETED`.
Relevo, cambio de jornada y preparación del cierre no lo finalizan. Después del
cierre no se permiten nuevas cajuelas ni correcciones inmediatas.

### 5.6 Corrección de cajuelas

Una equivocación inmediata no modifica ni elimina la cajuela original. Crea un
`CAJUELA_REVERSED`, apunta al UUID agregado, resta uno del read model y conserva
auditoría y Outbox. Requiere un segundo paso explícito y solo puede afectar la
última cajuela efectiva de un ciclo abierto.

Las correcciones no inmediatas o posteriores al cierre son administrativas y no
se deben añadir al manejador local para “facilitar” el Sprint 3.

### 5.7 Alcance físico del MVP

La planta tiene cuatro líneas configurables. El MVP usa una estación y mantiene
una sola línea operativa enfocada a la vez: el jefe la selecciona al preparar el
cargamento y Modo Operación conserva un único panel. El dominio y los adaptadores
no están acoplados al nombre de Línea 1; la operación simultánea en cuatro
paneles requiere una decisión posterior.

### 5.8 Catálogos y datos faltantes

Proveedor, línea y responsable deben existir, pertenecer al alcance autorizado
y estar activos al confirmar. Desktop refresca los catálogos a través de la API
y conserva el último valor local válido. La creación/solicitud de trabajadores
y proveedores sigue siendo un flujo autorizado de API/web; Sprint 2 no añadió
un CRUD genérico dentro de la pantalla de operación.

El `seed.sql` no crea usuarios Auth, PIN ni trabajadores reales. Una lista de
responsables vacía es un prerrequisito de datos, no autorización para inventar
identidades en SQLite.

### 5.9 Vocabulario visible

Se aceptaron provisionalmente `Cargamento`, `Alimentación actual`, `Línea
lista` y `Registrar cajuela`. `Camionetada` es un sinónimo oral reportado. Los
términos y el orden visual deben revisarse con personal de planta antes de
considerarlos definitivos.

## 6. Arquitectura implementada

### 6.1 Dependencias entre capas

```text
Presentation (WPF/ViewModels)
  -> Application (casos de uso y puertos)
      -> Domain/Production (invariantes puras)
      -> interfaces de almacenamiento, reloj, entrada y feedback
          <- Infrastructure (SQLite, HTTP, teclado, sonido)
```

- `Domain/Production` no conoce WPF, SQLite, Supabase ni red.
- Los ViewModels no contienen SQL.
- Los repositorios SQLite implementan interfaces de `Application/Abstractions`.
- La API sigue siendo la única puerta remota a reglas y datos de negocio.
- Desktop usa Supabase directamente solo para Auth; consume catálogos y
  autorización mediante NestJS.
- La clave secreta o `service_role` nunca pertenece a desktop o web.

### 6.2 Dominio

| Tipo | Responsabilidad |
| --- | --- |
| `Shipment` | Raíz del cargamento, proveedor, inicio y ciclo único. |
| `LineFeedCycle` | Línea fija, estado y responsables secuenciales. |
| `ResponsibilityAssignment` | Tramo auditable de una persona responsable. |
| `WorkPeriodSchedule` | Clasificación pura diurna/nocturna. |
| `ProductionEvent` | Hecho inmutable agregado o revertido. |
| `ProductionEventContext` | Organización, planta, estación, línea, ciclo, cargamento y responsable. |
| `ProductionEventCounter` | Total derivado, con validación de UUID, secuencia y reversos. |

### 6.3 Casos de aplicación

| Caso o servicio | Función |
| --- | --- |
| `LocalOperationService` | Preparar/confirmar inicio, relevo y finalización. |
| `RegisterCajuelaHandler` | Crear UUID, validar contexto y registrar localmente. |
| `RevertLastCajuelaHandler` | Preparar y confirmar el reverso inmediato. |
| `OperationInputGuard` | Suprimir auto-repeat y rebote por controlador/línea. |
| `StationCoordinator` | Login, restauración, elevación, fallback offline y caché de catálogos. |

### 6.4 Presentación

- `OperationViewModel` enruta clic y comandos semánticos, conserva foco y
  actualiza el dashboard.
- `OperationLinePanelViewModel` representa un panel sin fijar reglas de dominio.
- `StationViewModel` integra elevación, catálogos y preparación/confirmación.
- `DiagnosticsViewModel` separa salud de API de salud SQLite.
- `WpfKeyboardInputAdapter` traduce señales físicas a comandos semánticos.
- `WpfOperationFeedbackPlayer` traduce éxito, advertencia y error a sonidos de
  Windows.

## 7. Persistencia SQLite que recibe el Sprint 3

Ruta predeterminada:

```text
%LOCALAPPDATA%\IndustriasDoradas\stations\<station-id-N>\operation.sqlite3
```

| Migración | Responsabilidad |
| --- | --- |
| `001_initial_operation` | Catálogos cacheados, cargamentos, responsables, sesión, eventos y Outbox. |
| `002_operation_indexes_and_immutability` | Índices, unicidad de sesiones/asignaciones activas y triggers inmutables. |
| `003_production_counter_read_model` | Total reconstruible por línea y cargamento. |
| `004_immediate_cajuela_correction` | Reversión única y auditoría inmutable. |
| `005_operation_input_metrics` | Métricas anónimas e inmutables de entrada. |

Configuración de durabilidad:

- `journal_mode=WAL` obligatorio;
- `synchronous=FULL`;
- claves foráneas activas en cada conexión;
- timeout ocupado de cinco segundos;
- evento, contador, auditoría y Outbox se confirman o revierten juntos;
- eventos y correcciones rechazan físicamente `UPDATE` y `DELETE`.

Las migraciones ya compartidas **no se reescriben**. Si Sprint 3 necesita nuevos
estados, recibos, cursores o marcas de reclamación, debe agregar una migración
SQLite nueva y probar actualización desde la versión 5.

## 8. Contrato local preparado para sincronización

### 8.1 Evento de producción

Cada evento contiene:

- `client_event_id` UUID generado en origen;
- organización, planta, estación, línea, ciclo, cargamento y responsable;
- tipo `CAJUELA_ADDED` o `CAJUELA_REVERSED`;
- jornada derivada;
- `occurred_at` y `recorded_at` en UTC;
- secuencia positiva y única por estación;
- UUID objetivo cuando es reversión.

Un mismo UUID con contenido idéntico es reintento; con contenido distinto es
corrupción. PostgreSQL y la API deben volver a imponer estas reglas, no confiar
solo en SQLite.

### 8.2 Outbox existente

Las mutaciones locales producen:

- `OPERATION_STARTED`;
- `RESPONSIBLE_RELIEVED`;
- `OPERATION_COMPLETED`;
- `PRODUCTION_EVENT_CREATED` para agregado o reverso.

La tabla actual acepta `PENDING`, `IN_FLIGHT`, `CONFIRMED` y `FAILED`. La guía
del Sprint 3 propone `PENDING`, `SYNCING`, `SYNCED` y `FAILED_REVIEW`. El paso
3.1 debe resolver y documentar explícitamente la correspondencia; no debe
cambiar nombres en código y base de forma parcial.

El repositorio actual solo lista pendientes. Sprint 3 deberá extender el puerto
para reclamar lotes, confirmar recibos, liberar reclamaciones abandonadas y
clasificar fallos sin bloquear la UI.

### 8.3 Catálogos actuales

Al autenticar o revalidar, desktop pagina los endpoints existentes de
proveedores, trabajadores y líneas, y hace `upsert` en SQLite. Un timeout no
borra el último catálogo válido. Este mecanismo es un snapshot de arranque, no
el pull incremental con cursor solicitado para Sprint 3.

## 9. Configuración operativa relevante

| Sección | Valor/base | Regla |
| --- | --- | --- |
| `Api` | URL externa; timeout base 5 s | La API puede estar caída sin destruir SQLite. |
| `Supabase` | URL, clave publicable y timeout 10 s | Solo Auth; nunca clave secreta. |
| `Station` | UUID, sesión inactiva 3600 s, elevación inactiva 300 s, offline 24 h | El UUID determina autorización y ruta local; el access token se renueva y no actúa como reloj de inactividad. |
| `OperationInput` | teclado compartido, Línea 1 | El mapeo es configurable por adaptador/controlador. |
| `OperationSafety` | rebote 75 ms; espera entre registros 3000 ms; feedback y métricas activos | Auto-repeat siempre se bloquea; clic y teclado comparten la espera por línea. |
| `LocalRecovery` | mínimo 256 MB libres | Espacio menor genera atención. |
| `LocalDatabase` | timeout ocupado 5 s | No forzar desbloqueos ni compartir el archivo por red. |

Los valores locales viven en archivos ignorados. No se versionan `.env`,
`appsettings.Local.json`, bases SQLite, copias, diagnósticos, fotos, tokens,
PIN, verificadores ni datos reales.

## 10. Feedback sonoro y accesibilidad

El Sprint 2 implementó feedback por categoría:

- éxito: tono ascendente corto generado localmente;
- prevención/advertencia: aviso visual silencioso;
- error: `SystemSounds.Hand`;
- `SoundFeedbackEnabled` permite activarlo o desactivarlo;
- `VisualFeedbackEnabled` mantiene color y texto como canal complementario.

El tono de éxito no depende del esquema sonoro de Windows. Los archivos, volumen
y patrones no son configurables todavía. El puerto `IOperationFeedbackPlayer`
permite reemplazar el adaptador WPF después sin tocar registro, dominio o SQLite.

### Pregunta para la reunión posterior

¿Qué sonidos distingue con mayor facilidad el personal —incluidas personas con
baja alfabetización— para éxito, error, acción bloqueada y confirmación
destructiva, y qué combinación de sonido, color, icono y texto evita depender de
la lectura o de la audición como único canal?

La respuesta puede producir otro commit después de la reunión. Esta mejora de
accesibilidad no bloquea el inicio del Sprint 3. La alerta sonora de múltiplos de
50 es otra función y pertenece al Sprint 4.

## 11. Evidencia de calidad y validación

### 11.1 Automatizada

El 2026-09-07 se ejecutó:

```powershell
pnpm.cmd run test:desktop
```

Resultado: 105 correctas, 0 fallidas, 0 omitidas.

La verificación general confirmó además:

- revisión de secretos, formato y analizadores sin hallazgos;
- compilación de API, web y desktop correcta; desktop con 0 advertencias y 0
  errores;
- contrato OpenAPI actualizado;
- seis migraciones PostgreSQL, seed idempotente y siete archivos de prueba SQL
  correctos;
- API: 41 pruebas unitarias y 20 E2E correctas;
- web: 14 pruebas correctas en la repetición aislada.

La primera ejecución general de Vitest terminó por un timeout al iniciar un
worker, aunque las siete pruebas que alcanzó a ejecutar estaban correctas. La
repetición inmediata de la suite completa web terminó con 14 de 14 correctas.
Se clasifica como incidencia transitoria del runner, no como defecto funcional.
Vite también informó que el bundle principal minificado mide aproximadamente
503 kB; es una advertencia de optimización futura, no un error de compilación ni
una condición del Sprint 2.

El escenario integral
`OfflineShiftPreservesTwoShipmentsReliefs120CajuelasReversalsAndRestarts`
verifica:

| Dato | Resultado |
| --- | ---: |
| Cargamentos | 2 |
| Responsables distintos | 3 |
| Cajuelas agregadas | 120 |
| Reversos | 3 |
| Eventos de producción | 123 |
| Total final A | 59 |
| Total final B | 58 |
| Relevos | 2 |
| Outbox del escenario | 129 |
| Integridad SQLite | `ok` |

También existen pruebas de dominio, eventos, migración desde base vacía y desde
versiones anteriores, FK, WAL, inmutabilidad, atomicidad, idempotencia,
concurrencia, menos de 300 ms, ViewModels, teclado, antirrebote, métricas,
timeouts, bloqueo, disco lleno, corrupción, reloj y recuperación.

### 11.2 Manual realizada

- arranques repetidos de la aplicación y migraciones reales;
- inspección de integridad, WAL, FK y tablas SQLite;
- revisión de pantalla en el monitor usado;
- teclado y reconexión sin contexto activo;
- restauración automática de estación;
- elevación individual con código/PIN;
- indicador `Procesando` y bloqueo de botones durante la solicitud.

### 11.3 Manual diferida

La guía [`../validation/jornada-offline-sprint-02.md`](../validation/jornada-offline-sprint-02.md)
mantiene el detalle C1–C10. Al cierre:

- C1 está parcial porque no había responsables en el catálogo;
- C2–C9 no se ejecutaron de forma presencial completa;
- C10 espera muestra real de cuaderno/Excel y contraste con la empresa;
- el procedimiento formal para establecer el PIN sigue documentado como
  `DT-S2-001`, aunque la elevación individual ya funcionó en la estación.

La aprobación del 2026-09-07 acepta estas comprobaciones como validación
posterior y permite comenzar Sprint 3. No deben marcarse falsamente como
ejecutadas. Antes de una implantación productiva deben completarse o recibir una
decisión explícita de descarte del responsable.

## 12. Deuda y decisiones trasladadas

| ID | Pendiente | Bloquea 3.1 | Tratamiento |
| --- | --- | :---: | --- |
| `DT-S2-001` | Formalizar el procedimiento propio y no compartido de PIN; completar la prueba presencial asociada. | No | Cerrar con jefe de desarrollo, sin documentar credenciales. |
| `DV-S2-EXCEL` | Obtener muestra anonimizada de cuaderno/Excel y contrastar eventos. | No | Reabrir contrato solo si aparece una incompatibilidad real. |
| `DV-S2-USUARIOS` | Validar términos, orden, lectura a distancia y comprensión con personal. | No | Convertir resultados en cambios pequeños y probados. |
| `DV-S2-DATOS` | Disponer de proveedor, responsables y al menos una línea administrativamente activa; desktop enfoca una sola al preparar el cargamento. | No | Crear/aprobar datos por API/web; nunca insertar identidades manualmente en SQLite. |
| `DV-S2-C1-C10` | Ejecutar el protocolo offline presencial. | No | Conservar resultados reales y no sustituirlos con el test automatizado. |
| `MEJ-S2-SONIDO` | Elegir sonidos más comprensibles y configurables. | No | Resolver después de la reunión mediante el puerto de feedback. |
| `EV-S2-4-LINEAS` | Diseñar y validar operación simultánea hasta cuatro líneas. | No | Evolución posterior al piloto estable; coordinar con 3.7. |

Si una reunión cambia una regla de negocio, primero se actualiza la línea base y
la decisión correspondiente; luego código, pruebas y documentación en el mismo
commit. No se corrigen eventos históricos ni migraciones compartidas para
adaptarlos retroactivamente.

## 13. Riesgos que el Sprint 3 debe controlar

1. **Estados incompatibles:** acordar la migración de estados Outbox antes de
   implementar el worker.
2. **Duplicación remota:** UUID y secuencia local no bastan; PostgreSQL necesita
   restricciones y recibos idempotentes.
3. **Respuesta perdida:** reenviar el mismo lote debe devolver un resultado
   estable sin duplicar efectos.
4. **Lote parcial:** un evento inválido no debe ocultar ni perder los válidos;
   la política se define en 3.1.
5. **Bloqueo de UI:** ningún HTTP, backoff o pull puede estar en el recorrido de
   `Registrar cajuela`.
6. **Reclamaciones abandonadas:** un reinicio debe liberar `IN_FLIGHT`/estado
   equivalente vencido.
7. **Errores permanentes:** no reintentar un 4xx inválido para siempre ni borrar
   el evento; pasarlo a revisión con causa segura.
8. **Conflictos:** producción es append-only; no usar “última escritura gana”
   sobre eventos.
9. **Catálogos inactivos:** el pull debe propagar desactivaciones conservando
   referencias históricas.
10. **Reloj:** conservar hora original y medir desviación; no reescribir eventos
    locales confirmados.
11. **Seguridad:** frontends no acceden a tablas de negocio; NestJS valida JWT,
    organización, estación, permiso, versión e idempotencia.
12. **Observabilidad:** diagnóstico útil sin tokens, PIN, claves, payloads
    sensibles ni rutas innecesarias.

## 14. Punto de partida recomendado para Sprint 3

El documento normativo es
[`sprint-03-sincronizacion.md`](sprint-03-sincronizacion.md). Debe trabajarse en
sus mini pasos 3.1–3.10, con pausa, prueba, commit y push después de cada parte.

### 14.1 Primer mini paso: 3.1

Antes de programar, definir y aprobar:

- envelope y versión del lote;
- tipos de eventos aceptados;
- claves de idempotencia y semántica de reintento;
- respuesta total o por elemento;
- correspondencia de estados SQLite;
- cuándo un elemento se reclama, confirma, libera o pasa a revisión;
- cursor de pull y tratamiento de desactivaciones;
- timestamps de origen, recepción y servidor;
- autenticación y alcance de la estación;
- compatibilidad de versiones y errores permanentes/transitorios;
- qué metadatos nunca se sobrescriben.

La pausa de 3.1 debe demostrar en papel el caso crítico: el servidor confirmó el
lote, la respuesta se perdió y desktop lo reenvía. El resultado central debe ser
idéntico y la estación debe poder reconocer la confirmación.

### 14.2 Orden obligatorio después de 3.1

1. 3.2 ingesta idempotente en API.
2. 3.3 restricciones y recibos centrales.
3. 3.4 worker desktop con lotes, backoff y recuperación.
4. 3.5 pull incremental de configuración.
5. 3.6 política de conflictos.
6. 3.7 coordinación de varias estaciones.
7. 3.8 estado y diagnóstico.
8. 3.9 caos y volumen.
9. 3.10 ensayo multiestación y cierre.

No adelantar el worker antes de fijar el contrato y las restricciones
centrales.

## 15. Cómo abrir un espacio nuevo de trabajo

### 15.1 Preparar el repositorio

```powershell
git fetch origin
git switch DevHenry
git pull --ff-only origin DevHenry
node --version
pnpm.cmd --version
dotnet --version
pnpm.cmd install --frozen-lockfile
dotnet restore apps/desktop/IndustriasDoradas.Desktop.slnx --locked-mode
pnpm.cmd run verify
git status --short
```

Versiones esperadas:

- Node.js 24.19.0;
- pnpm 11.21.0;
- .NET SDK 10.0.302 o banda compatible admitida por `global.json`.

Crear únicamente los archivos locales a partir de los ejemplos. No copiar ni
pegar secretos en prompts, documentación, logs o commits.

### 15.2 Orden de lectura para la persona y su IA

1. Este documento.
2. [`sprint-03-sincronizacion.md`](sprint-03-sincronizacion.md).
3. [`arquitectura-y-calidad.md`](arquitectura-y-calidad.md).
4. [`../architecture/contrato-evento-produccion-sprint-02.md`](../architecture/contrato-evento-produccion-sprint-02.md).
5. [`../architecture/almacenamiento-local-sprint-02.md`](../architecture/almacenamiento-local-sprint-02.md).
6. [`../architecture/recuperacion-diagnostico-local-sprint-02.md`](../architecture/recuperacion-diagnostico-local-sprint-02.md).
7. [`../requirements/linea-base-funcional-v0.1.md`](../requirements/linea-base-funcional-v0.1.md).
8. [`../development/guia-desarrollo.md`](../development/guia-desarrollo.md).
9. Código y pruebas actuales de `Application/Abstractions/ILocalStorage.cs`,
   `ProductionEvent.cs`, repositorios SQLite y el escenario offline integral.

### 15.3 Prompt inicial sugerido para un nuevo Codex

> Trabaja en la rama DevHenry del proyecto Industrias Doradas. Lee completo
> `docs/sprints/sprint-02-cierre-y-traspaso-sprint-03.md`, luego
> `docs/sprints/sprint-03-sincronizacion.md`, arquitectura, línea base y guía de
> desarrollo. El Sprint 2 está cerrado como base técnica: no reimplementes el
> registro local ni declares sincronizado ningún Outbox. Empieza únicamente con
> 3.1, diseñando el contrato push/pull, estados, idempotencia, lotes, respuestas,
> cursor y compatibilidad. Contrasta el diseño con los tipos y estados SQLite
> reales. Conserva la regla local-first: registrar una cajuela confirma primero
> en SQLite y nunca espera Internet. No reescribas migraciones compartidas, no
> expongas secretos y no hagas acceso directo de desktop/web a tablas de negocio
> de Supabase. Presenta el contrato y los casos de reintento para aprobación
> antes de implementar 3.2. Después de cada mini paso ejecuta pruebas, pausa para
> comprobación manual cuando corresponda, crea un commit claro y sube a la rama
> acordada.

## 16. Flujo de trabajo acordado

Para mantener el estilo utilizado durante Sprint 2:

1. leer el prompt y documentos del mini paso;
2. inspeccionar código y estado Git antes de modificar;
3. implementar únicamente el alcance de ese mini paso;
4. añadir pruebas positivas, inválidas, offline y de regresión;
5. ejecutar verificaciones proporcionales al riesgo;
6. documentar decisiones y evidencia;
7. hacer una pausa para aprobación o comprobación manual;
8. crear un commit pequeño y descriptivo;
9. subir a `DevHenry` o a la rama que el equipo acuerde;
10. comenzar el siguiente mini paso solo después de la aprobación.

Antes de compartir:

```powershell
pnpm.cmd run verify
git diff --check
git status --short
```

Preservar cambios ajenos y no usar operaciones destructivas para limpiar un
workspace con trabajo no reconocido.

## 17. Archivos guía del Sprint 2

| Tema | Documento |
| --- | --- |
| Flujo y wireframes | [`../architecture/flujo-operativo-local-sprint-02.md`](../architecture/flujo-operativo-local-sprint-02.md) |
| Dominio | [`../architecture/dominio-operacion-local-sprint-02.md`](../architecture/dominio-operacion-local-sprint-02.md) |
| Evento | [`../architecture/contrato-evento-produccion-sprint-02.md`](../architecture/contrato-evento-produccion-sprint-02.md) |
| SQLite | [`../architecture/almacenamiento-local-sprint-02.md`](../architecture/almacenamiento-local-sprint-02.md) |
| Operación local | [`../architecture/casos-operativos-locales-sprint-02.md`](../architecture/casos-operativos-locales-sprint-02.md) |
| Registro | [`../architecture/registro-cajuela-local-sprint-02.md`](../architecture/registro-cajuela-local-sprint-02.md) |
| Corrección | [`../architecture/correccion-cajuela-local-sprint-02.md`](../architecture/correccion-cajuela-local-sprint-02.md) |
| Pantalla | [`../architecture/pantalla-operacion-local-sprint-02.md`](../architecture/pantalla-operacion-local-sprint-02.md) |
| Entrada | [`../architecture/entrada-controlador-sprint-02.md`](../architecture/entrada-controlador-sprint-02.md) |
| Pulsaciones | [`../architecture/prevencion-pulsaciones-sprint-02.md`](../architecture/prevencion-pulsaciones-sprint-02.md) |
| Recuperación | [`../architecture/recuperacion-diagnostico-local-sprint-02.md`](../architecture/recuperacion-diagnostico-local-sprint-02.md) |
| Jornada offline | [`../validation/jornada-offline-sprint-02.md`](../validation/jornada-offline-sprint-02.md) |

## 18. Decisión de cierre

El responsable del proyecto aprobó el cierre del Sprint 2 el 2026-09-07 y
autorizó comenzar Sprint 3 sobre esta base. La decisión se apoya en la
implementación completa del alcance técnico, 105 pruebas de escritorio en verde
y las comprobaciones manuales registradas.

Las validaciones con empresa, datos reales, personal de planta y protocolo
C1–C10 permanecen visibles como deuda posterior. Cualquier cambio que nazca de
la reunión —incluido feedback sonoro más accesible— se versionará en un commit
separado con su propia evidencia, sin reescribir el historial de este cierre.
