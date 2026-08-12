# Sprint 6 — Asistencia y horas (semanas 12–13)

**Objetivo:** check-in/out local con alternativa cuando falle cámara/biometría.

**Entregable:** fotografía + marca; dudas quedan pendientes y gerencia corrige auditadamente.

## Orden de trabajo

1. Aprobar consentimiento, retención, acceso/eliminación antes de biometría.
2. Eventos `CHECK_IN/CHECK_OUT`, incidencias, revisión y ajustes.
3. Abstraer cámara/reconocimiento; primero fotografía + identificación/PIN.
4. Almacenamiento privado/cifrado y URL firmada; nunca imagen pública/log.
5. Offline/sync; reglas para turno abierto y reloj incorrecto.
6. Calcular horas revisables, no nómina contable.
7. Web para pendientes y resumen por operario/periodo.
8. Facial opcional tras medir errores; fallo siempre deriva a foto pendiente.

**Pruebas:** doble/entrada sin salida, nocturno, corrección, reloj, offline, permisos de imagen y cálculo decimal.

**Prueba manual:** operarios reales, iluminación difícil, cámara desconectada, Internet caído y revisión móvil.

**Aceptación:** nadie queda bloqueado por cámara; corrección conserva autor/motivo/anterior/nuevo; facial requiere aprobación.

## Mini pasos, pausas y prompts

### 6.1 Política y minimización de datos

**Prompt:** Antes de código, documenta finalidad, consentimiento, acceso, retención, eliminación, respaldo y respuesta a incidentes para fotos/biometría. Distingue foto de evidencia de plantilla facial. Propón alternativa manual equivalente y consulta requerida con empresa/tutor. Si no hay aprobación, planifica solo foto pendiente.

**Pausa:** política aprobada por responsable; decisión explícita de incluir o posponer reconocimiento.

### 6.2 Flujo de asistencia real

**Prompt:** Especifica check-in/out, descansos si aplican, turnos nocturnos, olvido, doble marca, cambio de día, encargado, incidencia y ajuste. Define qué necesita el cálculo de pago sin convertirlo en nómina. Crea historias, estados y ejemplos con horarios reales.

**Pausa:** gerencia resuelve ejemplos ambiguos y aprueba reglas de redondeo (o ausencia de redondeo).

### 6.3 Modelo de eventos y ajustes

**Prompt:** Diseña eventos inmutables de asistencia y ajustes compensatorios con trabajador, estación, turno, tiempos dispositivo/servidor, método, estado de revisión, motivo y actor. Separa cálculo derivado de horas. Implementa dominio puro y pruebas de casos límite.

**Pausa:** tabla de entrada/salida nocturna, abierta, duplicada y corregida produce estados esperados.

### 6.4 Migraciones y permisos

**Prompt:** Implementa PostgreSQL/SQLite, índices y permisos de asistencia. Separa quién marca, quién ve fotos, quién revisa y quién ajusta. Prueba migración con datos anteriores, aislamiento por organización y auditoría; no almacenes imagen dentro de SQLite/PostgreSQL como blob sin justificación.

**Pausa:** matriz de roles verificada y consulta no autorizada bloqueada.

### 6.5 Abstracción de captura

**Prompt:** Define `ICameraCapture`/puerto equivalente, detección de cámaras, selección y captura con timeout, cancelación, tamaño/formato y orientación. Implementa adaptador WPF y fake para pruebas. Maneja cámara ausente/ocupada/desconectada sin impedir método alternativo.

**Pausa:** capturar, cancelar y desconectar cámara durante operación; aplicación permanece utilizable.

### 6.6 Check-in/out local-first

**Prompt:** Implementa interfaz WPF simple para identificar trabajador por selección/PIN autorizado, capturar foto y confirmar marca local en una acción clara. Evento y outbox deben ser atómicos; archivo usa ID opaco y cola separada. Muestra confirmación comprensible y evita doble pulsación.

**Pausa:** marcar sin Internet, reiniciar y comprobar evento/foto pendiente sin duplicación.

### 6.7 Almacenamiento y sincronización privada

**Prompt:** Implementa carga separada a bucket privado de Supabase Storage mediante backend/flujo autorizado, metadatos mínimos, checksum, reintentos e idempotencia. Genera URL firmada corta solo para roles permitidos. Define qué ocurre si evento sincroniza pero archivo no, y limpieza segura de temporales.

**Pausa:** perder red durante carga, reintentar, comprobar un solo archivo y expiración del enlace.

### 6.8 Cálculo de horas

**Prompt:** Implementa servicio versionado que empareje eventos aprobados y calcule duración exacta, incidencias y totales por periodo. Mantén datos incompletos como pendientes, no los conviertas en cero. No calcule impuestos, deducciones ni pago final. Prueba zona horaria y turno nocturno.

**Pausa:** dataset manual coincide al minuto/precisión acordada.

### 6.9 Revisión web y ajustes

**Prompt:** Implementa web para pendientes, visualización temporal de foto, aprobación/rechazo y ajuste con motivo. Separa revisión de resumen de horas; purga caché sensible al cerrar sesión. Añade filtros, permisos, auditoría y accesibilidad móvil.

**Pausa:** gerente resuelve pendiente desde iPhone; operador no accede a fotos ajenas.

### 6.10 Reconocimiento facial opcional y evaluable

**Prompt:** Solo si fue aprobado, crea adaptador reemplazable para reconocimiento facial con umbral configurable, enrolamiento consentido, prueba de iluminación y métricas de falso positivo/negativo. Nunca confirmar identidad silenciosamente con baja confianza; fallback obligatorio a foto pendiente. No mezcles algoritmo con dominio.

**Pausa:** informe de precisión con usuarios consentidos; criterio empresarial de activación o descarte.

### 6.11 Piloto y cierre

**Prompt:** Ejecuta jornada de asistencia con cámara normal/difícil/ausente, offline, turnos nocturnos, olvido y revisión. Verifica privacidad, sincronización, horas y eliminación según política. Corrige críticos/altos, redacta manual y cierra Sprint 6.

**Pausa:** nadie queda sin marcar por falla técnica; horas aprobadas; compuerta cerrada.
