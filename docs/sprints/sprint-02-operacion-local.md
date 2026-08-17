# Sprint 2 — Operación esencial local (semanas 4–5)

**Objetivo:** registrar cajuelas con una pulsación aun sin Internet.

**Entregable:** la computadora compartida opera en Modo Operación el piloto de una línea, configurable para las cuatro actuales, asigna cargamento/responsable y registra/corrige en SQLite offline mediante clic, teclado o controlador.

## Orden de trabajo

1. Cargamento/proveedor, jornada, ciclo de línea, asignación y evento inmutable.
2. Estados de alimentación/ciclo y reglas de concurrencia aprobadas; jornada no cierra línea.
3. Migraciones SQLite y repositorios por interfaz.
4. `RegistrarCajuela`: validar, UUID, transacción local, contador y outbox.
5. `RevertirÚltimaCajuela`: doble confirmación, motivo automático y evento compensatorio.
6. Dashboard WPF adaptable para varias líneas/monitores.
7. `IInputCommandSource`: clic, teclado común/USB HID, mapeo de +1, flechas, OK y cancelar; sensor automático queda fuera del MVP pero puede usar este puerto después.
8. Feedback visual/sonoro, antirrebote y bloqueo de tecla sostenida.
9. Mostrar guardado local, red y pendientes sin bloquear.

**Pruebas:** 50 pulsaciones = 50 UUID; reinicio abrupto; reverso; doble UUID; 1/4 líneas; uso sin mouse.

**Prueba manual:** offline, 120 registros alternados, correcciones y reinicio; cotejar evento por evento con hoja manual.

**Aceptación:** una pulsación/clic por cajuela, <300 ms local y cero pérdida; outbox visible (sin sync aún). No depende de sensor.

## Mini pasos, pausas y prompts

### 2.1 Observación y contrato del flujo real

**Prompt:** Antes de programar, contrasta cuadernos/Excel con la línea base: una cajuela es un balde variable; una línea tiene molino y rastras; jornada diurna/nocturna no detiene producción; un ciclo necesita cargamento y responsable. Diseña historias/estados/wireframes del Modo Operación para seleccionar proveedor, cargamento, responsable y línea desde listas, pensando en manos sucias, una computadora compartida y elevación breve del jefe sin detener el conteo.

**Pausa:** simular el flujo en papel con un usuario; aprobar palabras, iconos y número de pasos.

### 2.2 Dominio de jornada, cargamento, ciclo y asignación

**Prompt:** Modela cargamento, jornada, ciclo de alimentación y asignación de línea/responsable. Un cargamento pertenece a un proveedor, puede usar varias líneas y no requiere nueva jornada al cambiar. Una línea activa exige responsable; un operario puede llevar varias. Define cierre por fin de cargamento, no por relevo. Implementa dominio puro y pruebas; aún no UI/persistencia.

**Pausa:** revisar tabla de estados y ejecutar todos los casos inválidos relevantes.

### 2.3 Contrato del evento de producción

**Prompt:** Define `production_event` inmutable con UUID cliente, organización/planta/estación/línea, jornada, ciclo, cargamento, responsable asignado, tipo, timestamps y secuencia. Define `CAJUELA_ADDED` y `CAJUELA_REVERSED`. Documenta contador por línea+cargamento sin una verdad paralela editable.

**Pausa:** tomar cinco ejemplos del cuaderno y comprobar que pueden representarse sin campos ambiguos.

### 2.4 Esquema SQLite y repositorios locales

**Prompt:** Implementa migraciones SQLite para catálogos cacheados, sesión operativa, eventos y outbox. Configura FK, WAL si resulta seguro, transacciones e índices. Implementa repositorios detrás de interfaces, ruta de base por estación y copia segura para diagnóstico. Prueba migración nueva y actualización.

**Pausa:** inspeccionar base, reiniciar y verificar que datos/catálogo siguen íntegros.

### 2.5 Inicio/cierre operativo local

**Prompt:** Implementa casos locales para preparar estación, seleccionar jornada, abrir/finalizar ciclo por cargamento y asignar responsable desde catálogos. La línea no se cierra por cambio diurno/nocturno. Bloquea alimentación sin cargamento/responsable. Cada mutación crea outbox en la misma transacción.

**Pausa:** abrir/cerrar correctamente y provocar cada bloqueo sin necesidad de Internet.

### 2.6 Registro de una cajuela

**Prompt:** Implementa `RegisterCajuela` como caso de uso atómico: validar contexto activo, generar UUID, guardar evento + outbox, actualizar read model local derivable y responder inmediatamente. Hazlo idempotente ante repetición del mismo comando y mide duración. No agregues barrida todavía.

**Pausa:** 1, 10 y 50 pulsaciones; comparar eventos, outbox y contador; objetivo <300 ms.

### 2.7 Corrección segura

**Prompt:** Implementa reversión de la última cajuela de la línea seleccionada mediante `CAJUELA_REVERSED`; requiere doble paso, usa motivo automático de error inmediato y nunca DELETE/UPDATE. Solo durante ciclo abierto. Correcciones no inmediatas son del jefe de planta antes del cierre y del administrador después. Añade pruebas y auditoría.

**Pausa:** corregir correcta/incorrecta y demostrar trazabilidad completa.

### 2.8 Pantalla multipanel WPF

**Prompt:** Construye pantalla WPF para 1–4 líneas configurables con panel claro por línea, foco visible, total del cargamento, proveedor/cargamento, responsable, jornada, estado local y acción principal. Optimiza el piloto de una línea y prueba cuatro; evita ventanas independientes.

**Pausa:** revisar a distancia en monitor objetivo y validar comprensión con usuarios.

### 2.9 Entrada por teclado/controlador

**Prompt:** Implementa fuente abstracta de comandos y mapeo configurable por estación/controlador: clic, elegir línea, registrar, flechas, OK y revertir. No dependas de un teclado específico; soporta inicialmente un punto compartido y deja preparado más de un controlador o un adaptador futuro. Añade prueba con teclado convencional. No integres sensor automático en este sprint.

**Pausa:** operar recorrido completo sin mouse y reconectar el teclado durante ejecución.

### 2.10 Prevención de pulsaciones accidentales

**Prompt:** Añade feedback visual/sonoro configurable, antirrebote medido, bloqueo de auto-repeat en registrar y confirmaciones solo para acciones destructivas. No ralentices la pulsación normal. Registra métricas locales anónimas de latencia/errores útiles para prueba.

**Pausa:** pulsación rápida, sostenida y doble deliberada; el comportamiento debe ser predecible y explicado.

### 2.11 Recuperación y diagnóstico local

**Prompt:** Maneja cierre inesperado, disco lleno, base bloqueada/corrupta, hora incorrecta y configuración perdida con recuperación segura. Muestra pendientes y salud local para jefe de planta sin exponer complejidad al operario. Documenta copia/restauración de SQLite y no inventes sincronización remota.

**Pausa:** matar proceso tras registrar, reiniciar y comprobar cero pérdida; simular al menos un fallo de escritura.

### 2.12 Validación de jornada offline

**Prompt:** Prepara prueba de jornada offline con relevo diurno/nocturno sin cerrar línea, múltiples cargamentos/responsables, 1/4 líneas, 120 cajuelas, reversos y reinicios. Contrasta evento por evento con el cuaderno y documenta Sprint 2.

**Pausa:** usuario operativo completa la jornada simulada; cero diferencias y compuerta Sprint 2 aprobada.
