# Sprint 4 — Barridas, mercurio y oro (semanas 8–9)

**Objetivo:** completar el ciclo desde cajuela hasta resultado.

**Entregable:** alerta al llegar a 50 (configurable), registro de barrida, mercurio y oro por cargamento.

## Orden de trabajo

1. Validar reinicio del conteo, sobrantes y cambio de proveedor.
2. Modelar barrida, eventos incluidos, tres rastras, responsable, tiempos, mercurio y resultado.
3. Umbral persistente/configurable; alertar una vez pese a reinicio/sync.
4. Flujo WPF grande para iniciar/cerrar con autorización.
5. Mercurio decimal/unidad y futura referencia de inventario.
6. Oro canónico en gramos; mostrar palos con `10 palos = 1 g`.
7. Evitar solapamientos; corregir con versión/auditoría.
8. API y sincronización idempotente.

**Pruebas:** 49/50/51, reverso en límite, reinicio, cambio de cargamento, decimales, doble cierre y solapamiento.

**Prueba manual:** ciclo con dos proveedores y sobrantes; cotejar cajuelas, mercurio y oro.

**Aceptación:** trazabilidad oro → barrida → eventos → cargamento/línea/turno; cifras ficticias nunca son reglas reales.

## Mini pasos, pausas y prompts

### 4.1 Validar reglas físicas del ciclo

**Prompt:** Realiza especificación funcional de barrida con responsables de planta: qué dispara las 50 cajuelas, si cuenta por línea/cargamento/rastra, qué ocurre con sobrantes, cambio de proveedor/turno, tres rastras, pausas, reapertura y momento de medir mercurio/oro. Documenta decisiones y casos ilustrados; no programes reglas ambiguas.

**Pausa:** responsable firma ejemplos 49/50/51, sobrantes y cambio de proveedor.

### 4.2 Modelo y estados de barrida

**Prompt:** Modela barrida, inclusión explícita/rango verificable de eventos, rastras, responsable, tiempos, estado, mercurio y resultados. Define estados/transiciones, invariantes, corrección y cierre. Incluye `line_events` para paro/incidente/mantenimiento básico sin diseñar un CMMS.

**Pausa:** diagrama de estado cubre ciclo normal, cancelación autorizada y corrección.

### 4.3 Migraciones central/local

**Prompt:** Implementa migraciones PostgreSQL y SQLite del modelo aprobado con checks decimales, unidades, FK e índices. Evita columnas derivadas inconsistentes; versiona correctamente y prueba actualización desde esquema del Sprint 3 con datos existentes.

**Pausa:** migrar copia con eventos reales de prueba y comprobar que nada se pierde.

### 4.4 Servicio de umbral

**Prompt:** Implementa servicio puro para progreso de barrida y umbral configurable por línea/planta, inicialmente 50. Debe manejar compensaciones, sobrantes, cierre y reinicio sin alertas duplicadas. Persiste el reconocimiento de alerta sin convertir el contador en fuente de verdad.

**Pausa:** tabla automatizada 0/49/50/51, reversos y múltiples ciclos.

### 4.5 Alerta operacional

**Prompt:** Integra alerta WPF visual/sonora grande al alcanzar el umbral, sin perder la pulsación ni bloquear el registro. Permite reconocerla y escalar a supervisor; conserva aviso tras reinicio. Prueba con múltiples paneles para que quede clara la línea afectada.

**Pausa:** prueba a distancia/ruido y con 2 líneas alcanzando umbral casi simultáneo.

### 4.6 Inicio, seguimiento y cierre de barrida

**Prompt:** Implementa casos de uso y UI paso a paso para iniciar, registrar avance de tres rastras y cerrar. Muestra cajuelas/eventos incluidos, cargamento, encargado y tiempos; exige permisos en acciones sensibles. Guarda local + outbox atómicamente y evita doble cierre/solapamiento.

**Pausa:** completar ciclo normal, intentar solapamiento, abandonar/reanudar aplicación.

### 4.7 Registro de mercurio

**Prompt:** Implementa captura de mercurio con cantidad decimal, unidad definida, responsable, momento y observación; valida rangos configurables sin inventar valores clínicos/ambientales. Deja referencia preparada para movimiento de inventario posterior, pero no descuente dos veces.

**Pausa:** probar unidades/decimales, cero/negativo/extremo y corrección auditada.

### 4.8 Resultado de oro y conversiones

**Prompt:** Implementa resultado por barrida/cargamento almacenando gramos decimales como unidad canónica y entrada/visualización opcional en palos (`1 palo = 0,1 g`). Conserva precisión y fuente de medición. Impide sumar resultados preliminares como finales.

**Pausa:** dataset de conversiones manual; 10 palos = 1 g exacto y redondeo solo visual.

### 4.9 Paros, incidentes y mantenimiento básico

**Prompt:** Implementa eventos básicos de línea para inicio/fin de paro, categoría, motivo, responsable e incidencia/mantenimiento relacionado. No planifiques órdenes, repuestos o mantenimiento predictivo. Deben ser offline, sincronizables, auditables y útiles para calcular tiempo detenido futuro.

**Pausa:** paro atraviesa turno, queda abierto tras reinicio y se cierra sin perder duración.

### 4.10 Sincronización y consultas de trazabilidad

**Prompt:** Extiende push/pull/idempotencia a barridas, mercurio, oro y eventos de línea respetando dependencias entre IDs. Añade endpoint de trazabilidad que reconstruya oro→barrida→cajuelas→cargamento/turno/operarios y pruebas de llegada fuera de orden.

**Pausa:** sincronizar offline en orden alterado y recuperar cadena completa sin huérfanos.

### 4.11 Ciclo realista de aceptación

**Prompt:** Prepara y ejecuta un ciclo con dos proveedores, cambios de turno, sobrantes, paro, correcciones, tres rastras, mercurio y resultado. Contrasta a mano, prueba desconexión/reinicio, corrige hallazgos y completa ficha/manual operativo del Sprint 4.

**Pausa:** trazabilidad y totales aprobados por planta; compuerta Sprint 4 cerrada.
