# Sprint 2 — Operación esencial local (semanas 4–5)

**Objetivo:** registrar cajuelas con una pulsación aun sin Internet.

**Entregable:** una estación abre 1–10 líneas, inicia turno/cargamento y registra/corrige en SQLite offline.

## Orden de trabajo

1. Cargamento/proveedor, turno, asignación y evento inmutable.
2. Estados `BORRADOR/ACTIVO/CERRADO` y reglas de concurrencia aprobadas.
3. Migraciones SQLite y repositorios por interfaz.
4. `RegistrarCajuela`: validar, UUID, transacción local, contador y outbox.
5. `RevertirÚltimaCajuela`: confirmación, motivo y evento compensatorio.
6. Dashboard WPF adaptable para varias líneas/monitores.
7. `IInputCommandSource`: teclado común/USB HID, mapeo de +1, flechas, OK y cancelar.
8. Feedback visual/sonoro, antirrebote y bloqueo de tecla sostenida.
9. Mostrar guardado local, red y pendientes sin bloquear.

**Pruebas:** 50 pulsaciones = 50 UUID; reinicio abrupto; reverso; doble UUID; 1/4/10 líneas; uso sin mouse.

**Prueba manual:** offline, 120 registros alternados, correcciones y reinicio; cotejar evento por evento con hoja manual.

**Aceptación:** una pulsación por cajuela, <300 ms local y cero pérdida; outbox visible (sin sync aún).

## Mini pasos, pausas y prompts

### 2.1 Observación y contrato del flujo real

**Prompt:** Antes de programar, convierte el cuaderno y conversaciones en un flujo confirmado: quién inicia turno, cómo elige proveedor/cargamento, cuándo cambia responsable, significado exacto de línea, qué ocurre con cambio de turno/proveedor y cómo se corrige. Produce historias, estados, wireframes de baja fidelidad y preguntas bloqueantes pensando en baja alfabetización y manos sucias.

**Pausa:** simular el flujo en papel con un usuario; aprobar palabras, iconos y número de pasos.

### 2.2 Dominio de turno, cargamento y asignación

**Prompt:** Modela agregados/reglas para cargamento, turno y asignación de línea/operario. Define transiciones válidas, simultaneidad, cierre, cambio de proveedor y invariantes. Implementa dominio puro y pruebas de tabla; aún no UI ni persistencia.

**Pausa:** revisar tabla de estados y ejecutar todos los casos inválidos relevantes.

### 2.3 Contrato del evento de producción

**Prompt:** Define `production_event` inmutable con UUID cliente, organización/planta/estación/línea, turno, cargamento, operario, tipo, timestamps, secuencia y metadatos mínimos. Define `CAJUELA_ADDED` y compensación. Documenta cómo se calcula un contador sin almacenar una verdad paralela editable.

**Pausa:** tomar cinco ejemplos del cuaderno y comprobar que pueden representarse sin campos ambiguos.

### 2.4 Esquema SQLite y repositorios locales

**Prompt:** Implementa migraciones SQLite para catálogos cacheados, sesión operativa, eventos y outbox. Configura FK, WAL si resulta seguro, transacciones e índices. Implementa repositorios detrás de interfaces, ruta de base por estación y copia segura para diagnóstico. Prueba migración nueva y actualización.

**Pausa:** inspeccionar base, reiniciar y verificar que datos/catálogo siguen íntegros.

### 2.5 Inicio/cierre operativo local

**Prompt:** Implementa casos de uso locales para preparar estación, abrir/cerrar turno, seleccionar cargamento y asignar líneas/operarios usando catálogos disponibles. Bloquea estados inválidos con mensajes visuales simples. Cada mutación sincronizable debe crear outbox en la misma transacción.

**Pausa:** abrir/cerrar correctamente y provocar cada bloqueo sin necesidad de Internet.

### 2.6 Registro de una cajuela

**Prompt:** Implementa `RegisterCajuela` como caso de uso atómico: validar contexto activo, generar UUID, guardar evento + outbox, actualizar read model local derivable y responder inmediatamente. Hazlo idempotente ante repetición del mismo comando y mide duración. No agregues barrida todavía.

**Pausa:** 1, 10 y 50 pulsaciones; comparar eventos, outbox y contador; objetivo <300 ms.

### 2.7 Corrección segura

**Prompt:** Implementa corrección de última cajuela mediante `CAJUELA_REVERSED`, autorización, confirmación y motivo; nunca DELETE/UPDATE del original. Define límites: línea/turno/cargamento correctos y qué ocurre si ya cerró. Añade pruebas y auditoría local pendiente.

**Pausa:** corregir correcta/incorrecta y demostrar trazabilidad completa.

### 2.8 Pantalla multipanel WPF

**Prompt:** Construye pantalla operativa WPF para una estación que pueda mostrar 1–10 líneas con layout legible, foco visible, contador, proveedor/cargamento, encargado, turno, estado local y acción principal. Optimiza primero para 1 línea pero prueba 4/10; evita ventanas independientes difíciles de controlar.

**Pausa:** revisar a distancia en monitor objetivo y validar comprensión con usuarios.

### 2.9 Entrada por teclado/controlador

**Prompt:** Implementa comandos abstractos de entrada y mapeo configurable por estación para teclado común y futuro USB HID: registrar, flechas, OK, cancelar/corregir. Captura tecla sin escribir caracteres, respeta foco y permite restaurar valores. Añade prueba con teclado numérico convencional.

**Pausa:** operar recorrido completo sin mouse y reconectar el teclado durante ejecución.

### 2.10 Prevención de pulsaciones accidentales

**Prompt:** Añade feedback visual/sonoro configurable, antirrebote medido, bloqueo de auto-repeat en registrar y confirmaciones solo para acciones destructivas. No ralentices la pulsación normal. Registra métricas locales anónimas de latencia/errores útiles para prueba.

**Pausa:** pulsación rápida, sostenida y doble deliberada; el comportamiento debe ser predecible y explicado.

### 2.11 Recuperación y diagnóstico local

**Prompt:** Maneja cierre inesperado, disco lleno, base bloqueada/corrupta, hora incorrecta y configuración perdida con recuperación segura. Muestra pendientes y salud local para supervisor sin exponer complejidad al operario. Documenta copia/restauración de SQLite y no inventes sincronización remota.

**Pausa:** matar proceso tras registrar, reiniciar y comprobar cero pérdida; simular al menos un fallo de escritura.

### 2.12 Validación de jornada offline

**Prompt:** Prepara dataset y prueba automatizada/manual de una jornada offline con múltiples turnos, proveedores, operarios, 1/4/10 líneas, 120 cajuelas, correcciones y reinicios. Contrasta eventos y totales con control manual, corrige defectos y documenta resultados del Sprint 2.

**Pausa:** usuario operativo completa la jornada simulada; cero diferencias y compuerta Sprint 2 aprobada.
