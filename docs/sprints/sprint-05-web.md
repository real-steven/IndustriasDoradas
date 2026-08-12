# Sprint 5 — Portal web gerencial (semanas 10–11)

**Objetivo:** seguimiento remoto claro y seguro.

**Entregable:** gerencia consulta líneas, sincronización, historial, cargamentos y barridas desde móvil/PC.

## Orden de trabajo

1. Read models solo después de estabilizar eventos.
2. API paginada con fecha, planta, línea, turno, proveedor, operario y cargamento.
3. Dashboard: línea activa, cajuelas, cercanía de barrida, última sync y alertas.
4. Historial/detalle/auditoría, diferenciando hora de dispositivo/servidor.
5. React mobile-first; vacío/carga/error/offline en Safari iOS y Chrome.
6. Permisos gerencia/supervisor.
7. Refresco razonable/manual; tiempo real solo si aporta valor medido.
8. Rendimiento con datos proyectados de un año.

**Pruebas:** filtros/totales SQL conocidos, rutas/roles y E2E login → línea → cargamento → barrida.

**Prueba manual:** iPhone Safari, Android Chrome y PC con red lenta; comparar con API/desktop.

**Aceptación:** se distingue dato actualizado/offline; mismos filtros = mismos totales; web aún no ejecuta acciones operativas críticas.

## Mini pasos, pausas y prompts

### 5.1 Necesidades gerenciales y wireframes

**Prompt:** Entrevista/revisa necesidades de gerente y socios viajeros. Prioriza preguntas que la web debe responder, no gráficos deseados. Diseña wireframes mobile-first de resumen, línea, cargamento, barrida e historial; muestra frescura/sincronización. Valida lenguaje, privacidad y acciones permitidas antes de código.

**Pausa:** gerente encuentra tres respuestas clave en prototipo sin explicación del desarrollador.

### 5.2 Read models y definiciones de totales

**Prompt:** Diseña consultas/read models centrales derivados de eventos confirmados. Define formalmente cada total, corte temporal, estado sincronizado y tratamiento de reversos/datos tardíos. Evita duplicar lógica en React y documenta SQL/servicio fuente.

**Pausa:** cinco escenarios manuales producen el total esperado y explicable.

### 5.3 API de consulta

**Prompt:** Implementa endpoints de consulta paginados/filtrables por fechas, planta, línea, turno, proveedor, operario y cargamento. Usa DTO estables, límites máximos, orden determinista e índices medidos. Añade autorización y pruebas contra dataset conocido.

**Pausa:** Swagger devuelve páginas estables, filtros combinados y 403 correctos.

### 5.4 Resumen operativo web

**Prompt:** Implementa dashboard React con estado de líneas, cajuelas desde última barrida, cargamento/proveedor, turno, paro, alerta y última sincronización. Usa TanStack Query y componentes accesibles; no agregues gráficos sin decisión asociada.

**Pausa:** comparar cada tarjeta con API/desktop y distinguir claramente estación desactualizada.

### 5.5 Historial y detalle

**Prompt:** Implementa listado/historial con filtros conservados en URL, paginación y detalle de turno/cargamento/barrida. Diferencia hora del dispositivo y servidor, eventos corregidos y datos pendientes/tardíos. Maneja vacío y filtros sin resultados.

**Pausa:** abrir/enviar URL filtrada en móvil y reproducir exactamente la consulta.

### 5.6 Auditoría visible para autorizados

**Prompt:** Añade vista de auditoría para roles permitidos con actor, acción, entidad, motivo y correlación, redactando datos sensibles. Ofrece trazabilidad desde registros corregidos sin exponer tokens/fotos. Prueba paginación y permisos.

**Pausa:** supervisor explica quién corrigió un dato y por qué; operador recibe 403.

### 5.7 Responsive, accesibilidad y navegadores

**Prompt:** Refina layout mobile-first para iPhone Safari, Android Chrome y escritorio. Prueba teclado, lector básico, contraste, objetivos táctiles, zoom, orientación y safe areas. No escondas información esencial solo por tamaño; documenta matriz de compatibilidad.

**Pausa:** recorrido completo en dispositivos reales o emulación validada, sin scroll horizontal accidental.

### 5.8 Sesiones, privacidad y errores

**Prompt:** Endurece rutas/sesión: renovación, cierre, 401/403, revocación y caché por usuario. Evita que datos de una sesión queden visibles a la siguiente; mensajes no revelan existencia de usuarios. Implementa boundary de error y reintento controlado.

**Pausa:** cambiar de usuario/rol en mismo navegador y verificar cero fuga de caché.

### 5.9 Rendimiento y frescura

**Prompt:** Genera volumen de un año, mide endpoints/render, agrega solo índices/caché/paginación justificados. Define intervalo de refresco y botón manual; evita polling agresivo. Muestra fecha de actualización y mide conexión satelital lenta.

**Pausa:** objetivos acordados cumplidos en móvil/red lenta y sin degradar API de sincronización.

### 5.10 E2E y aceptación gerencial

**Prompt:** Automatiza E2E login→dashboard→línea→cargamento→barrida→auditoría con roles. Ejecuta prueba manual en iPhone/Android/PC, compara totales y registra feedback. Corrige críticos/altos, actualiza manual y cierra Sprint 5.

**Pausa:** gerente completa tareas sin ayuda; compuerta aprobada.
