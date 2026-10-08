# Sprint 5 — Portal web gerencial (semanas 10–11)

**Objetivo:** entregar a Lucía un portal web mobile-first para consultar la planta, registrar el oro total de cada cargamento cerrado y revisar información trazable sin depender de perfiles administrativos adicionales.

**Entregable inicial confirmado:** una única cuenta `JEFE_EMPRESA` consulta resumen, operación, cargamentos y auditoría, y registra o corrige un único total de oro por cargamento cerrado. Trabajadores/horas, estadísticas avanzadas, reportes Excel, inventario/mantenimiento y configuración autoservicio aparecen como `Próximamente` y no bloquean el primer entregable.

## Decisiones de alcance

1. La gerente es la única usuaria funcional de la web en el MVP. No se diseñan pantallas de roles, delegación ni permisos de administradores.
2. El oro se anota físicamente durante el trabajo y después puede registrarse en web como un total por cargamento cerrado, no por barrida. No se cargan resultados anteriores a la puesta en marcha.
3. Vacío significa no registrado y `0,00` significa resultado medido en cero. Cada corrección conserva valor anterior, autora, fecha y motivo.
4. Desktop nunca consulta ni almacena cantidades de oro.
5. La operación en vivo debe mostrar frescura. SSE/polling avisa que hay cambios y Sprint 4.11 ya entrega las proyecciones operativas compartidas; la web debe consumir read models centrales, no inventar totales en el cliente.
6. La configuración futura permitirá renombrar, colorear, agregar y desactivar líneas/catálogos. Desactivar conserva historial y se bloquea mientras haya operación activa; no se usa borrado físico.

## Orden de trabajo

1. ~~Cerrar Sprint 4.11: sincronización central de cargamentos, responsables, cajuelas, barridas y mercurio entre estaciones.~~ Cerrado técnica y manualmente el 2026-10-08.
2. Confirmar wireframes y las preguntas gerenciales del MVP.
3. Crear read models y definiciones únicas de totales.
4. Implementar API paginada con fecha, planta, línea, proveedor, responsable y cargamento.
5. Implementar resumen y operación con frescura visible.
6. Implementar historial/detalle y auditoría agrupada por cargamento.
7. Implementar registro y corrección del oro total por cargamento.
8. Validar responsive, accesibilidad, sesión, errores y rendimiento.
9. Dejar módulos futuros visibles como `Próximamente`, sin construir su lógica todavía.

**Pruebas:** filtros y totales SQL conocidos; rutas de `JEFE_EMPRESA`; E2E login → resumen → línea → cargamento cerrado → oro total → auditoría; ausencia de oro en desktop; actualización entre estaciones solo después de aprobar 4.11.

**Prueba manual:** iPhone Safari, Android Chrome y PC con red lenta; comparar web, API y desktop y verificar que la fecha de actualización sea comprensible.

**Aceptación:** la gerente completa el recorrido sin ayuda, distingue dato reciente/offline, obtiene los mismos totales con los mismos filtros y ninguna vista mezcla cargamentos, proveedores o líneas.

## Mini pasos, pausas y prompts

### 5.1 Necesidades gerenciales y wireframes

**Prompt:** Diseña y valida un portal mobile-first para la única cuenta `JEFE_EMPRESA`: Resumen, Operación, Oro por cargamento, Cargamentos y Auditoría. Muestra Estadísticas, Trabajadores, Reportes, Inventario y Configuración como `Próximamente`. Prioriza lectura; no agregues gobierno de usuarios ni permisos delegables. Toda mutación queda auditada.

**Pausa:** Lucía encuentra operación actual, cargamento y oro pendiente sin explicación del desarrollador.

### 5.2 Read models y definiciones de totales

**Prompt:** Diseña consultas/read models centrales derivados de eventos confirmados. Define cajuelas, barridas, cargamentos cerrados, resultado total de oro, cortes temporales, reversos y datos tardíos. Un cargamento tiene cero o un resultado total de oro; no sumes resultados por barrida. Evita duplicar lógica en React.

**Pausa:** cinco escenarios manuales producen totales esperados y explicables.

### 5.3 API de consulta

**Prompt:** Implementa endpoints paginados/filtrables por fechas, planta, línea, proveedor, responsable y cargamento. Usa DTO estables, límites máximos, orden determinista e índices medidos. Autoriza únicamente `JEFE_EMPRESA` en el alcance actual y añade pruebas contra un dataset conocido.

**Pausa:** Swagger devuelve páginas estables, filtros combinados y 401/403 correctos.

### 5.4 Resumen y operación web

**Prompt:** Implementa dashboard con líneas activas, cajuelas, meta de barrida, cargamento, proveedor, responsable, novedades y última sincronización. Muestra frescura por estación y estado desactualizado. No inventes tiempo real hasta que 4.11 proyecte toda la operación compartida.

**Pausa:** cada tarjeta coincide con API/desktop y distingue estación desactualizada.

### 5.5 Historial, detalle y auditoría

**Prompt:** Implementa cargamentos cerrados con semana actual, semana anterior, fecha específica, línea y proveedor. Conserva filtros en URL, pagina y abre detalle con cajuelas, barridas, mercurio, responsables y cambios auditados. Diferencia hora de dispositivo y servidor.

**Pausa:** una URL filtrada reproduce exactamente la consulta en móvil y PC.

### 5.6 Oro total por cargamento

**Prompt:** Permite a `JEFE_EMPRESA` registrar o corregir opcionalmente un único total de oro en gramos para un cargamento cerrado. Acepta entero o hasta dos decimales, vacío no registrado y cero válido; muestra palos solo como equivalencia `1 palo = 0,10 g`. Conserva autora, fecha, valor anterior, nuevo valor y motivo. No crees resultados parciales por barrida, no cargues datos históricos previos a la puesta en marcha ni sincronices oro a desktop. Las comparaciones por proveedor muestran cobertura de cargamentos registrados y excluidos.

**Pausa:** el dataset manual coincide por cargamento, línea, proveedor y período, sin contar dos veces.

### 5.7 Responsive, accesibilidad y navegadores

**Prompt:** Refina layout mobile-first para iPhone Safari, Android Chrome y escritorio. Prueba textos largos, teclado, lector, contraste, objetivos táctiles, zoom, orientación y safe areas.

**Pausa:** recorrido completo sin scroll horizontal accidental ni controles inaccesibles.

### 5.8 Sesión, privacidad y errores

**Prompt:** Endurece renovación y cierre de sesión, 401/403, caché por usuario, estados vacío/carga/error/offline y reintento controlado. Evita que datos de una sesión queden visibles después de salir y no expongas tokens, fotos ni diagnósticos técnicos.

**Pausa:** cerrar y reabrir sesión produce cero fuga de caché.

### 5.9 Rendimiento y frescura

**Prompt:** Genera volumen de un año, mide endpoints/render y agrega solo índices, caché o paginación justificados. Consume la señal de cambios respaldada por pull incremental, muestra la fecha efectiva de actualización y conserva un botón manual. Evita polling agresivo.

**Pausa:** objetivos acordados se cumplen en móvil/red lenta sin degradar la sincronización de desktop.

### 5.10 E2E y aceptación gerencial

**Prompt:** Automatiza E2E: login gerencial → resumen → operación → cargamento → registro/corrección de oro total → auditoría → cierre de sesión. Comprueba filtros, totales, pendientes, cero válido, ausencia de oro en desktop y módulos futuros sin acciones falsas.

**Pausa:** Lucía completa las tareas sin ayuda y aprueba la compuerta.
