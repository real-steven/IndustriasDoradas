# Sprint 5 — Portal web gerencial (semanas 10–11)

**Objetivo:** seguimiento remoto bilingüe, claro y seguro, separado de la administración.

**Entregable:** jefe de empresa consulta toda la operación y auditoría, confirma/rechaza entregas de oro y ejerce gobierno limitado sobre administradores desde móvil/PC en español o inglés.

## Orden de trabajo

1. Read models solo después de estabilizar eventos.
2. API paginada con fecha, planta, línea, jornada, proveedor, responsable y cargamento.
3. Dashboard: línea activa, cajuelas, cercanía de barrida, última sync y alertas.
4. Oro bajo custodia y entrega: notificación, confirmación/rechazo y discrepancia.
5. Historial/detalle/auditoría, diferenciando hora de dispositivo/servidor.
6. React mobile-first bilingüe; vacío/carga/error/offline en Safari iOS y Chrome.
7. Cuenta jefe de empresa y cuenta administrador separadas; gerencia solo muta entregas de oro y gobierno limitado de administradores.
8. Actualización casi en tiempo real con frescura visible y respaldo incremental.
9. Rendimiento con datos proyectados de un año.

**Pruebas:** filtros/totales SQL conocidos, rutas/roles y E2E login → línea → cargamento → barrida.

**Prueba manual:** iPhone Safari, Android Chrome y PC con red lenta; comparar con API/desktop.

**Aceptación:** se distingue dato actualizado/offline; mismos filtros = mismos totales; gerencia no muta operación salvo confirmar/rechazar entrega de oro y aprobar/suspender administradores.

## Mini pasos, pausas y prompts

### 5.1 Necesidades gerenciales y wireframes

**Prompt:** Diseña wireframes mobile-first para jefe de empresa: resumen, línea, cargamento, barrida, oro/custodia, asistencia, inventario, historial y gobierno de administradores. Incluye español/inglés, preferencia por cuenta y frescura. No muestres administración operativa; las únicas mutaciones gerenciales son confirmar/rechazar entrega de oro y aprobar/suspender administradores con auditoría.

**Pausa:** gerente encuentra tres respuestas clave en prototipo sin explicación del desarrollador.

### 5.2 Read models y definiciones de totales

**Prompt:** Diseña consultas/read models centrales derivados de eventos confirmados. Define formalmente cada total, corte temporal, estado sincronizado y tratamiento de reversos/datos tardíos. Evita duplicar lógica en React y documenta SQL/servicio fuente.

**Pausa:** cinco escenarios manuales producen el total esperado y explicable.

### 5.3 API de consulta

**Prompt:** Implementa endpoints de consulta paginados/filtrables por fechas, planta, línea, jornada, proveedor, responsable y cargamento. Usa DTO estables, límites máximos, orden determinista e índices medidos. Añade autorización y pruebas contra dataset conocido.

**Pausa:** Swagger devuelve páginas estables, filtros combinados y 403 correctos.

### 5.4 Resumen operativo web

**Prompt:** Implementa dashboard React con líneas operando/detenidas, cajuelas totales/progreso, cargamento/proveedor, jornada, responsable, novedades, barridas, oro y última sincronización. Usa TanStack Query, i18n y componentes accesibles; no agregues gráficos sin decisión asociada.

**Pausa:** comparar cada tarjeta con API/desktop y distinguir claramente estación desactualizada.

### 5.5 Historial y detalle

**Prompt:** Implementa listado/historial con filtros conservados en URL, paginación y detalle de jornada/cargamento/barrida. Diferencia hora del dispositivo y servidor, eventos corregidos y datos pendientes/tardíos. Maneja vacío y filtros sin resultados.

**Pausa:** abrir/enviar URL filtrada en móvil y reproducir exactamente la consulta.

### 5.6 Auditoría visible para autorizados

**Prompt:** Añade vista de auditoría de lectura para roles permitidos con actor, acción, entidad, motivo y correlación, redactando datos sensibles. El jefe de empresa ve estado/revisiones relevantes; el administrador ve detalle de mutaciones. No expongas tokens ni fotos.

**Pausa:** un usuario autorizado explica quién corrigió un dato y por qué; una cuenta no autorizada recibe 403 y ningún trabajador posee acceso web.

### 5.7 Responsive, accesibilidad y navegadores

**Prompt:** Refina layout mobile-first bilingüe para iPhone Safari, Android Chrome y escritorio. Prueba cambio es/en, textos largos ingleses, teclado, lector, contraste, objetivos táctiles, zoom, orientación y safe areas.

**Pausa:** recorrido completo en dispositivos reales o emulación validada, sin scroll horizontal accidental.

### 5.8 Sesiones, privacidad y errores

**Prompt:** Endurece rutas/sesión: renovación, cierre, 401/403, revocación y caché por usuario. Evita que datos de una sesión queden visibles a la siguiente; mensajes no revelan existencia de usuarios. Implementa boundary de error y reintento controlado.

**Pausa:** cambiar de usuario/rol en mismo navegador y verificar cero fuga de caché.

### 5.9 Rendimiento y frescura

**Prompt:** Genera volumen de un año, mide endpoints/render, agrega solo índices/caché/paginación justificados. Define intervalo de refresco y botón manual; evita polling agresivo. Muestra fecha de actualización y mide conexión satelital lenta.

**Pausa:** objetivos acordados cumplidos en móvil/red lenta y sin degradar API de sincronización.

### 5.10 E2E y aceptación gerencial

**Prompt:** Automatiza E2E es/en: login→dashboard→línea→cargamento→barrida→entrega de oro→auditoría→gobierno limitado de administrador. Verifica cuenta gerencial frente a la segunda cuenta administrativa separada en iPhone/Android/PC; impide autoaprobación y fuga de permisos/caché entre ambas, compara totales y corrige críticos/altos.

**Pausa:** gerente completa tareas sin ayuda; compuerta aprobada.
