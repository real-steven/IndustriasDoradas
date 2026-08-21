# Sprint 6 — Asistencia y horas (semanas 12–13)

**Objetivo:** check-in/out local mediante fotografía pendiente, trabajadores provisionales y horas revisables; reconocimiento facial solo después de estabilizar y aprobar el flujo base.

**Entregable:** entrada/salida offline autoservicio, fotografía y hora original pendientes de revisión, estados provisional/vencido, incidencias y correcciones auditadas; reconocimiento facial opcional si política y precisión quedan aprobadas.

## Orden de trabajo

1. Eventos `CHECK_IN/CHECK_OUT`, incidencias y ajustes sin descansos.
2. Flujo inicial autoservicio: trabajador selecciona perfil, captura foto y crea marca pendiente con hora original.
3. Trabajador `PROVISIONAL` desde la solicitud; a las 72 horas pasa a `PROVISIONAL_VENCIDO` con alerta urgente, sin bloquear ni perder horas.
4. Revisión del jefe durante 24 horas; auditoría/corrección posterior de `JEFE_EMPRESA` o administrador autorizado sin borrar eventos.
5. Calcular horas normales/adicionales sin salario; validar regla 8–10 horas.
6. Revisar y aprobar o sustituir la retención indefinida provisional; definir finalidad, acceso, respaldo y respuesta a incidentes de fotos, además de consentimiento, enrolamiento y precisión antes de reconocimiento facial.
7. Abstraer cámara/reconocimiento sin usar PIN como alternativa ordinaria del trabajador.
8. Almacenamiento privado/cifrado y URL firmada; nunca imagen pública/log.
9. Offline/sync; hora original del intento, cámara ausente y reloj incorrecto sin detener la operación.
10. Facial opcional tras medir errores; fallo siempre deriva a foto pendiente.

**Pruebas:** provisional/vencido, aprobación/rechazo/fusión/reasignación, doble/entrada sin salida, nocturno, corrección, cámara ausente, reloj, offline, permisos de imagen y cálculo decimal.

**Prueba manual:** trabajadores consentidos, solicitud provisional, vencimiento, iluminación difícil, cámara desconectada, Internet caído y revisión desktop/web.

**Aceptación:** nadie queda bloqueado ni pierde horas por cámara, vencimiento o rechazo; corrección conserva autor/motivo/anterior/nuevo; reconocimiento facial requiere aprobación.

## Mini pasos, pausas y prompts

### 6.1 Política y minimización de datos

**Prompt:** Antes de código, revisa la decisión provisional de conservar fotografías indefinidamente y apruébala o sustitúyela con una política explícita. Documenta finalidad, acceso por ventana temporal, almacenamiento/costo, respaldo y respuesta a incidentes; agrega consentimiento, enrolamiento y precisión para biometría. Distingue foto de evidencia de plantilla facial. La foto vive en Storage privado y auditoría conserva referencia/checksum, nunca blob o URL permanente. Jefe de planta ve pendientes/recientes durante 24 horas; `JEFE_EMPRESA` y administradores con permiso sensible ven evidencia histórica mediante acceso temporal auditado. Define continuidad cuando no hay cámara. Si reconocimiento no se aprueba, implementa solo foto pendiente.

**Pausa:** política aprobada por responsable; decisión explícita de incluir o posponer reconocimiento.

### 6.2 Flujo de asistencia real

**Prompt:** Especifica check-in/out sin descansos, jornadas diurna/nocturna, olvido, doble marca, cambio de día e incidencias. Flujo inicial: el trabajador selecciona su perfil desde Modo Operación, la estación toma foto y crea marca pendiente; jefe de planta resuelve durante 24 horas y administrador audita/corrige después. Incluye cámara ausente sin bloqueo. Valida jornada habitual de 8 horas y extensión aproximada a 10 sin inventar pago.

**Pausa:** gerencia resuelve ejemplos ambiguos y aprueba reglas de redondeo (o ausencia de redondeo).

### 6.3 Modelo de eventos y ajustes

**Prompt:** Diseña eventos inmutables de asistencia y ajustes compensatorios con trabajador, solicitud, estado provisional/vencido, estación, jornada, tiempos dispositivo/servidor, método, estado de revisión, presencia/ausencia de evidencia, motivo y actor. Tras 72 horas la solicitud vence y alerta sin bloquear; rechazo/fusión/reasignación conserva horas y evidencia. Separa cálculo derivado de horas. Implementa dominio puro y pruebas de casos límite.

**Pausa:** tabla de entrada/salida nocturna, abierta, duplicada y corregida produce estados esperados.

### 6.4 Migraciones y permisos

**Prompt:** Implementa PostgreSQL/SQLite, índices y permisos de asistencia, estados provisionales y referencias de evidencia. Separa quién marca, quién ve fotos durante cada ventana, quién revisa, quién fusiona/reasigna y quién ajusta. Prueba migración con datos anteriores, aislamiento por organización y auditoría; no almacenes imagen dentro de SQLite/PostgreSQL como blob sin justificación.

**Pausa:** matriz de roles verificada y consulta no autorizada bloqueada.

### 6.5 Abstracción de captura

**Prompt:** Solo después de aprobar política de fotografía, define `ICameraCapture` con timeout/cancelación y fake. Cámara ausente/fallo crea marca pendiente `SIN_EVIDENCIA_CAMARA`, conserva hora original, no bloquea y alerta. Define por separado el puerto opcional de reconocimiento, enrolamiento multiángulo y prueba satisfactoria; no uses PIN como fallback de asistencia. Permite reutilizar la captura aprobada como evidencia de elevaciones del jefe, sin mezclarla con la plantilla facial.

**Pausa:** capturar, cancelar y desconectar cámara durante operación; aplicación permanece utilizable.

### 6.6 Check-in/out local-first

**Prompt:** Implementa interfaz WPF siempre accesible desde Modo Operación para que el trabajador seleccione su perfil, capture foto y registre entrada/salida pendiente localmente. Incluye provisional/vencido y cámara ausente sin bloqueo. Si reconocimiento fue aprobado, úsalo como método preferido y deriva baja confianza a foto pendiente. Evento/outbox atómicos; evita doble pulsación y vuelve a la pantalla previa sin detener producción.

**Pausa:** marcar sin Internet, reiniciar y comprobar evento/foto pendiente sin duplicación.

### 6.7 Almacenamiento y sincronización privada

**Prompt:** Con la política de fotografía aprobada, implementa carga separada a bucket privado de Supabase Storage mediante backend/flujo autorizado, metadatos mínimos, checksum, reintentos e idempotencia. Genera URL firmada corta según rol y ventana de 24 horas. Incluye evidencia de asistencia y, cuando corresponda, elevación con PIN. Define qué ocurre si evento sincroniza pero archivo no y limpieza segura de temporales; si fotografía fue aplazada, documenta este paso como no aplicable.

**Pausa:** perder red durante carga, reintentar, comprobar un solo archivo y expiración del enlace.

### 6.8 Cálculo de horas

**Prompt:** Implementa servicio versionado que empareje eventos aprobados y calcule duración exacta, incidencias y totales por periodo. Mantén datos incompletos como pendientes, no los conviertas en cero. No calcule impuestos, deducciones ni pago final. Prueba zona horaria y turno nocturno.

**Pausa:** dataset manual coincide al minuto/precisión acordada.

### 6.9 Revisión web y ajustes

**Prompt:** Implementa resumen web de asistencia para jefe de empresa y correcciones auditadas en el módulo Administración. Jefe de planta resuelve pendientes/recientes desde desktop durante 24 horas; `JEFE_EMPRESA` o administrador con permisos de asistencia audita después, aprueba/rechaza trabajadores y fusiona/reasigna sin borrar horas. Las fotografías exigen permiso sensible y cada acceso queda auditado. Muestra alertas urgentes por provisional vencido o cámara ausente. Purga caché sensible al cerrar sesión.

**Pausa:** jefe de planta resuelve pendiente desde desktop; solo superadministración o administradores con permiso sensible acceden temporalmente a fotos y cada consulta queda auditada; operario no accede a fotos ajenas.

### 6.10 Reconocimiento facial opcional y evaluable

**Prompt:** Solo si fue aprobado, crea adaptador reemplazable para reconocimiento facial con umbral configurable, enrolamiento consentido mediante varios ángulos, prueba satisfactoria de reconocimiento/iluminación y métricas de falso positivo/negativo. Nunca confirmar identidad silenciosamente con baja confianza; fallback obligatorio a foto pendiente. Evalúa por separado su uso como primer paso de elevación del jefe antes del PIN. No mezcles algoritmo con dominio.

**Pausa:** informe de precisión con usuarios consentidos; criterio empresarial de activación o descarte.

### 6.11 Piloto y cierre

**Prompt:** Ejecuta jornada de asistencia básica offline con entrada/salida, jornada nocturna, olvido y corrección. Si biometría fue aprobada, añade cámara normal/difícil/ausente y pendientes; si no, deja evidencia explícita del aplazamiento. Verifica privacidad, horas y sincronización, corrige críticos/altos y cierra Sprint 6.

**Pausa:** nadie queda sin marcar por falla técnica; horas aprobadas; compuerta cerrada.
