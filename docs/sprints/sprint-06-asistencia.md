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
6. No hay descansos automáticos, salario, deducciones, pago final ni cálculo de
   nómina.
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

### 6.1 Flujo real y responsabilidades

**Prompt:** Contrasta con la empresa cómo se marca entrada/salida, quién corrige
un olvido, qué ocurre en turno nocturno, si existe redondeo y cómo se trata una
marca abierta. Confirma qué puede resolver `JEFE_PLANTA` desde desktop y qué
correcciones excepcionales puede ejecutar `JEFE_EMPRESA` desde web. No diseñes
cuentas de operario ni recuperes el rol legado `ADMINISTRADOR`.

**Pausa:** tabla de casos ambiguos aprobada y responsables definidos.

### 6.2 Privacidad y decisión de fotografía

**Prompt:** Decide explícitamente si el primer flujo requiere fotografía. Si la
requiere, documenta finalidad, consentimiento, ventana de acceso, retención,
respaldo, borrado, costo y respuesta a incidentes. Distingue foto de evidencia
de plantilla biométrica. Si no se aprueba, implementa asistencia sin imagen y
registra la decisión; reconocimiento facial permanece en backlog.

**Pausa:** política firmada o aplazamiento explícito antes de crear Storage.

### 6.3 Dominio de asistencia

**Prompt:** Diseña `CHECK_IN`, `CHECK_OUT`, incidencia y ajuste compensatorio con
trabajador, estación, tiempos de ocurrencia/registro/confirmación, estado de
sincronización, motivo y actor. Conserva trabajadores
`PROVISIONAL/PROVISIONAL_VENCIDO` sin perder horas y separa el cálculo derivado.
Prueba entrada duplicada, salida huérfana, nocturno y corrección tardía.

**Pausa:** dataset pequeño produce estados esperados sin editar eventos.

### 6.4 Persistencia y permisos

**Prompt:** Implementa migraciones PostgreSQL/SQLite, FK, índices, checks,
append-only y permisos. Desktop guarda evento + outbox atómicamente. API aplica
aislamiento por organización y autoriza `JEFE_PLANTA` operacional y
`JEFE_EMPRESA` gerencial según casos aprobados. No guardes imágenes como blob
en SQLite/PostgreSQL.

**Pausa:** actualización desde Sprint 5 conserva todo el historial y bloquea
acceso cruzado.

### 6.5 Check-in/out local-first

**Prompt:** Implementa una pantalla WPF accesible desde Modo Operación para
seleccionar trabajador y registrar entrada/salida sin frenar las cards de
producción. Evita doble pulsación, muestra guardado local/frescura y permite a
`JEFE_PLANTA` resolver incidencias mediante elevación y motivo.

**Pausa:** marcar offline, reiniciar y comprobar un único evento pendiente.

### 6.6 Evidencia privada, si aplica

**Prompt:** Solo si 6.2 aprobó fotografía, define `ICameraCapture`, captura con
timeout/cancelación, metadatos mínimos, checksum y carga idempotente a bucket
privado. Cámara ausente crea una incidencia sin bloquear. Las URL son firmadas,
cortas y cada acceso se audita. Define limpieza de temporales y evento
sincronizado con archivo pendiente.

**Pausa:** caída de red/cámara ensayada sin duplicar ni exponer archivos.

### 6.7 Sincronización de asistencia

**Prompt:** Extiende el contrato incremental a asistencia respetando secuencia,
idempotencia, dependencias fuera de orden y hora original. Una corrección remota
se proyecta en desktop sin reescribir historia. Añade prueba multiestación y de
reintento tras 24 horas offline.

**Pausa:** ambas estaciones convergen en eventos y estados explicables.

### 6.8 Read models de horas

**Prompt:** Empareja eventos válidos mediante servicio versionado y devuelve
duración exacta, marcas abiertas, incidencias, cobertura y frescura por período.
No conviertas incompletos en cero ni calcules dinero. Usa UTC para almacenar y
`America/Costa_Rica` para cortes visibles.

**Pausa:** resultados coinciden al minuto con un cálculo manual aprobado.

### 6.9 Trabajadores y horas en web

**Prompt:** Implementa el módulo `Trabajadores` de Sprint 5 para
`JEFE_EMPRESA`: actividad actual, horas por período, pendientes e historial de
ajustes. Mantén filtros en URL y auditoría legible. Permite creación/edición
central solo si el flujo fue confirmado; no agregues gobierno de usuarios.

**Pausa:** la gerente distingue horas confirmadas, abiertas y excluidas.

### 6.10 Piloto y cierre

**Prompt:** Ejecuta una jornada ficticia completa con offline, nocturno, olvido,
corrección, reinicio y consulta web. Si fotografía quedó aplazada, no la simules
como implementada. Corrige críticos/altos, actualiza manuales y cierra Sprint 6.

**Pausa:** cero pérdida de marcas, totales aprobados y política respetada.
