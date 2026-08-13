# Sprint 6 — Asistencia y horas (semanas 12–13)

**Objetivo:** check-in/out local y horas revisables; biometría solo después de estabilizar el flujo base.

**Entregable:** entrada/salida offline, incidencias y correcciones auditadas; reconocimiento facial opcional si política y precisión quedan aprobadas.

## Orden de trabajo

1. Eventos `CHECK_IN/CHECK_OUT`, incidencias y ajustes sin descansos.
2. Flujo inicial: jefe de planta selecciona trabajador y registra marca.
3. Calcular horas normales/adicionales sin salario; validar regla 8–10 horas.
4. Aprobar consentimiento, retención, acceso/eliminación antes de biometría.
5. Abstraer cámara/reconocimiento sin usar PIN como alternativa ordinaria.
6. Almacenamiento privado/cifrado y URL firmada; nunca imagen pública/log.
7. Offline/sync; hora original del intento y reloj incorrecto.
8. Web para resumen; desktop para pendientes del jefe de planta.
9. Facial opcional tras medir errores; fallo siempre deriva a foto pendiente.

**Pruebas:** doble/entrada sin salida, nocturno, corrección, reloj, offline, permisos de imagen y cálculo decimal.

**Prueba manual:** operarios reales, iluminación difícil, cámara desconectada, Internet caído y revisión móvil.

**Aceptación:** nadie queda bloqueado por cámara; corrección conserva autor/motivo/anterior/nuevo; facial requiere aprobación.

## Mini pasos, pausas y prompts

### 6.1 Política y minimización de datos

**Prompt:** Antes de código, documenta finalidad, consentimiento, acceso, retención, eliminación, respaldo y respuesta a incidentes para fotos/biometría. Distingue foto de evidencia de plantilla facial. Propón alternativa manual equivalente y consulta requerida con empresa/tutor. Si no hay aprobación, planifica solo foto pendiente.

**Pausa:** política aprobada por responsable; decisión explícita de incluir o posponer reconocimiento.

### 6.2 Flujo de asistencia real

**Prompt:** Especifica check-in/out sin descansos, jornadas diurna/nocturna, olvido, doble marca, cambio de día e incidencias. Valida jornada habitual de 8 horas y extensión aproximada a 10 sin inventar pago. Flujo inicial: jefe de planta selecciona trabajador; correcciones históricas: administrador.

**Pausa:** gerencia resuelve ejemplos ambiguos y aprueba reglas de redondeo (o ausencia de redondeo).

### 6.3 Modelo de eventos y ajustes

**Prompt:** Diseña eventos inmutables de asistencia y ajustes compensatorios con trabajador, estación, jornada, tiempos dispositivo/servidor, método, estado de revisión, motivo y actor. Separa cálculo derivado de horas. Implementa dominio puro y pruebas de casos límite.

**Pausa:** tabla de entrada/salida nocturna, abierta, duplicada y corregida produce estados esperados.

### 6.4 Migraciones y permisos

**Prompt:** Implementa PostgreSQL/SQLite, índices y permisos de asistencia. Separa quién marca, quién ve fotos, quién revisa y quién ajusta. Prueba migración con datos anteriores, aislamiento por organización y auditoría; no almacenes imagen dentro de SQLite/PostgreSQL como blob sin justificación.

**Pausa:** matriz de roles verificada y consulta no autorizada bloqueada.

### 6.5 Abstracción de captura

**Prompt:** Solo después de aprobar política, define `ICameraCapture` y puerto de reconocimiento, enrolamiento por varios ángulos, captura con timeout/cancelación y fake. No uses PIN como fallback ordinario. Cámara ausente/fallo crea intento pendiente con evidencia y hora original.

**Pausa:** capturar, cancelar y desconectar cámara durante operación; aplicación permanece utilizable.

### 6.6 Check-in/out local-first

**Prompt:** Implementa primero interfaz WPF para seleccionar trabajador y registrar entrada/salida localmente. Si biometría fue aprobada, añade cámara como método preferido y pendiente con foto al fallar. Evento/outbox atómicos; evita doble pulsación.

**Pausa:** marcar sin Internet, reiniciar y comprobar evento/foto pendiente sin duplicación.

### 6.7 Almacenamiento y sincronización privada

**Prompt:** Solo si fotografía/biometría fue aprobada, implementa carga separada a bucket privado de Supabase Storage mediante backend/flujo autorizado, metadatos mínimos, checksum, reintentos e idempotencia. Genera URL firmada corta solo para roles permitidos. Define qué ocurre si evento sincroniza pero archivo no y limpieza segura de temporales; si fue aplazada, documenta este paso como no aplicable.

**Pausa:** perder red durante carga, reintentar, comprobar un solo archivo y expiración del enlace.

### 6.8 Cálculo de horas

**Prompt:** Implementa servicio versionado que empareje eventos aprobados y calcule duración exacta, incidencias y totales por periodo. Mantén datos incompletos como pendientes, no los conviertas en cero. No calcule impuestos, deducciones ni pago final. Prueba zona horaria y turno nocturno.

**Pausa:** dataset manual coincide al minuto/precisión acordada.

### 6.9 Revisión web y ajustes

**Prompt:** Implementa resumen web de asistencia para jefe de empresa y correcciones administrativas auditadas. Las solicitudes biométricas pendientes se resuelven en desktop por jefe de planta; administrador puede auditar/re-enrolar. Purga caché sensible al cerrar sesión.

**Pausa:** jefe de planta resuelve pendiente desde desktop; jefe de empresa no accede a fotos y operario no accede a fotos ajenas.

### 6.10 Reconocimiento facial opcional y evaluable

**Prompt:** Solo si fue aprobado, crea adaptador reemplazable para reconocimiento facial con umbral configurable, enrolamiento consentido, prueba de iluminación y métricas de falso positivo/negativo. Nunca confirmar identidad silenciosamente con baja confianza; fallback obligatorio a foto pendiente. No mezcles algoritmo con dominio.

**Pausa:** informe de precisión con usuarios consentidos; criterio empresarial de activación o descarte.

### 6.11 Piloto y cierre

**Prompt:** Ejecuta jornada de asistencia básica offline con entrada/salida, jornada nocturna, olvido y corrección. Si biometría fue aprobada, añade cámara normal/difícil/ausente y pendientes; si no, deja evidencia explícita del aplazamiento. Verifica privacidad, horas y sincronización, corrige críticos/altos y cierra Sprint 6.

**Pausa:** nadie queda sin marcar por falla técnica; horas aprobadas; compuerta cerrada.
