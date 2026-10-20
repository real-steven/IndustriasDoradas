# Sprint 5 — Portal web gerencial (semanas 10–11)

**Objetivo:** entregar a Lucía un portal web mobile-first para consultar la planta, registrar el oro total de cada cargamento cerrado y revisar información trazable sin depender de perfiles administrativos adicionales.

**Entregable inicial confirmado:** una única cuenta `JEFE_EMPRESA` consulta resumen, operación, cargamentos y auditoría, y registra o corrige un único total de oro por cargamento cerrado. Trabajadores/horas, estadísticas avanzadas, reportes Excel, inventario/mantenimiento y configuración autoservicio aparecen como `Próximamente` y no bloquean el primer entregable.

## Punto de partida y frontera

- Sprint 4.11 ya centraliza cargamentos, responsables, cajuelas, correcciones,
  barridas y mercurio entre estaciones. Sprint 5 consume esa verdad; no crea un
  segundo protocolo de sincronización.
- 5.1 a 5.10 están cerrados técnica y manualmente.
- 5.11 es una mejora técnica posterior al cierre, acordada por el grupo. No
  reabre la aceptación de 5.1–5.10 ni modifica desktop.
- El paso 4.8 de oro quedó transferido al portal: 5.2 creó el modelo canónico
  por cargamento y 5.6 construyó su API e interfaz. El modelo legado por
  barrida no se reutiliza.
- La web actual pertenece a `JEFE_EMPRESA`. `ADMINISTRADOR` permanece solo como
  compatibilidad histórica y no forma parte de navegación, aceptación ni
  matriz funcional del MVP.
- Desktop conserva toda la operación física y nunca recibe cantidades de oro.

## Decisiones de alcance

1. La gerente es la única usuaria funcional de la web en el MVP. No se diseñan pantallas de roles, delegación ni permisos de administradores.
2. El oro se anota físicamente durante el trabajo y después puede registrarse en web como un total por cargamento cerrado, no por barrida. No se cargan resultados anteriores a la puesta en marcha.
3. Vacío significa no registrado y `0,00` significa resultado medido en cero. Cada corrección conserva valor anterior, autora, fecha y motivo.
4. Desktop nunca consulta ni almacena cantidades de oro.
5. La operación en vivo debe mostrar frescura. SSE/polling avisa que hay cambios y Sprint 4.11 ya entrega las proyecciones operativas compartidas; la web debe consumir read models centrales, no inventar totales en el cliente.
6. La configuración futura permitirá renombrar, colorear, agregar y desactivar líneas/catálogos. Desactivar conserva historial y se bloquea mientras haya operación activa; no se usa borrado físico.

## Orden de trabajo

1. ~~Cerrar Sprint 4.11: sincronización central de cargamentos, responsables, cajuelas, barridas y mercurio entre estaciones.~~ Cerrado técnica y manualmente el 2026-10-08.
2. ~~Confirmar wireframes y las preguntas gerenciales del MVP.~~ Cerrado el 2026-10-08 con el concepto aprobado y el recorrido documentado.
3. ~~Crear read models y definiciones únicas de totales.~~ Cerrado el 2026-10-08 con vistas centrales y pruebas SQL reproducibles.
4. ~~Implementar API paginada con fecha, planta, línea, proveedor, responsable y cargamento sobre los read models de 5.2.~~ Cerrado técnica y manualmente el 2026-10-12.
5. ~~Implementar resumen y operación de solo lectura con frescura visible.~~ Cerrado técnica y manualmente el 2026-10-12.
6. ~~Implementar historial/detalle y auditoría agrupada por cargamento.~~ Cerrado técnica y manualmente el 2026-10-12.
7. ~~Implementar registro y corrección del oro total opcional por cargamento cerrado.~~ Cerrado técnica y manualmente el 2026-10-12.
8. ~~Validar responsive, accesibilidad, sesión, errores y rendimiento.~~ Cerrado técnica y manualmente el 2026-10-13, con las verificaciones menores de dispositivos físicos y lector de pantalla documentadas en 5.7.
9. ~~Dejar módulos futuros visibles como `Próximamente`, sin construir su lógica todavía.~~ Cerrado técnica y manualmente el 2026-10-13.

**Pruebas:** filtros y totales SQL conocidos; rutas de `JEFE_EMPRESA`; E2E login → resumen → línea → cargamento cerrado → oro total → auditoría; ausencia de oro en desktop; actualización web basada en la verdad central aprobada en 4.11.

**Prueba manual:** iPhone Safari, Android Chrome y PC con red lenta; comparar web, API y desktop y verificar que la fecha de actualización sea comprensible.

**Aceptación:** la gerente completa el recorrido sin ayuda, distingue dato reciente/offline, obtiene los mismos totales con los mismos filtros y ninguna vista mezcla cargamentos, proveedores o líneas.

## Mini pasos, pausas y prompts

### 5.1 Necesidades gerenciales y wireframes

**Estado:** cerrado el 2026-10-08. El alcance verificable está en
`docs/product/gerencia-web-mvp.md`; la referencia visual aprobada es
`docs/design/gerencia-web-concept.html`. Las rutas confirmadas y los módulos
futuros tienen cobertura en las pruebas del portal.

**Prompt:** Diseña y valida un portal mobile-first para la única cuenta `JEFE_EMPRESA`: Resumen, Operación, Oro por cargamento, Cargamentos y Auditoría. Muestra Estadísticas, Trabajadores, Reportes, Inventario y Configuración como `Próximamente`. Prioriza lectura; no agregues gobierno de usuarios ni permisos delegables. Toda mutación queda auditada.

**Pausa:** Lucía encuentra operación actual, cargamento y oro pendiente sin explicación del desarrollador.

### 5.2 Read models y definiciones de totales

**Estado:** cerrado el 2026-10-08. La migración
`20261008120214_sprint_5_2_management_read_models.sql` incorpora el resultado
canónico de oro por cargamento y vistas privadas para operación, cargamentos y
mercurio. La prueba SQL 017 cubre reversos, barrida tardía, datos confirmados
después, cero versus ausente y correcciones append-only sin doble conteo.

**Prompt:** Diseña consultas/read models centrales derivados de eventos confirmados. Define cajuelas, barridas, cargamentos cerrados, resultado total de oro, cortes temporales, reversos y datos tardíos. Un cargamento tiene cero o un resultado total de oro; no sumes resultados por barrida. Evita duplicar lógica en React.

**Pausa:** cinco escenarios manuales producen totales esperados y explicables.

### 5.3 API de consulta

**Estado:** cerrado técnica y manualmente el 2026-10-12. `pnpm run verify` y la
pausa manual en Swagger fueron aprobados por Henry. El API expone líneas
activas, cargamentos cerrados, detalle de cargamento y barridas/mercurio bajo
`/api/v1/organizations/{organizationId}/management`. Todas las listas usan
páginas de máximo 100 elementos y desempate estable por identificadores.

Los filtros `fromUtc` inclusivo y `toUtc` exclusivo se pueden combinar con
planta, línea, proveedor, responsable y cargamento. Las consultas reutilizan
las vistas privadas e índices parciales medidos en 5.2, filtran nuevamente por
organización en el backend y exigen el rol `JEFE_EMPRESA`; no se expone acceso
directo a Supabase ni se adelantan las mutaciones de oro de 5.6.

**Prompt:** Implementa endpoints paginados/filtrables por fechas, planta, línea, proveedor, responsable y cargamento. Usa DTO estables, límites máximos, orden determinista e índices medidos. Autoriza únicamente `JEFE_EMPRESA` en el alcance actual y añade pruebas contra un dataset conocido.

**Pausa:** Swagger devuelve páginas estables, filtros combinados y 401/403 correctos.

### 5.4 Resumen y operación web

**Estado:** cerrado técnica y manualmente el 2026-10-12. `pnpm run verify`
terminó correctamente y el recorrido Swagger → web → desktop confirmó los
mismos cargamentos y totales después de sincronizar una operación real. El
portal consume `management/operation-lines` sin recalcular cifras, presenta la
actividad efectiva de cada estación y conserva la última respuesta marcada
como desactualizada cuando una actualización falla. La matriz de aceptación
está en `docs/testing/sprint-05-4-resumen-operacion-web.md`.

**Prompt:** Implementa dashboard con líneas activas, cajuelas, próxima referencia de barrida, cantidad de barridas, cargamento, proveedor, responsable y última actividad. Muestra frescura por estación y estado desactualizado. Consume únicamente la proyección central de 4.11 y los read models de 5.2; no recalcules totales en React ni agregues controles físicos de desktop.

**Pausa:** cada tarjeta coincide con API/desktop y distingue estación desactualizada.

### 5.5 Historial, detalle y auditoría

**Estado:** cerrado el 2026-10-12 después de que Henry confirmó `pnpm run
verify` y el recorrido manual. Cargamentos consulta únicamente la proyección
central, conserva período, fecha, línea, proveedor, responsable y página en la
URL, y abre una ficha trazable con cajuelas, barridas, mercurio, responsable al
cierre y cambios auditados. La auditoría agrupa por cargamento y presenta por
separado `occurredAt` y `recordedAt` como ocurrencia y confirmación central. La
matriz de aceptación
está en `docs/testing/sprint-05-5-historial-detalle-auditoria.md`.

**Prompt:** Implementa cargamentos cerrados con semana actual, semana anterior, fecha específica, línea, proveedor y responsable. Conserva filtros en URL, pagina con orden determinista y abre detalle con cajuelas, barridas, mercurio, responsables y cambios auditados. Agrupa Auditoría por cargamento y diferencia hora de ocurrencia de hora de confirmación central.

**Pausa:** una URL filtrada reproduce exactamente la consulta en móvil y PC.

### 5.6 Oro total por cargamento

**Estado:** cerrado técnica y manualmente el 2026-10-12. Henry confirmó
`pnpm run verify`, el recorrido completo y ORO-08 con rechazo explícito cuando
la corrección repite el valor vigente. La API registra entradas append-only
únicamente para cargamentos cerrados, exige motivo al corregir y conserva cero
como valor registrado. La web mantiene período, línea, proveedor y página en la
URL, muestra equivalencia visual en palos e informa cobertura
registrada/excluida por proveedor sin sumar revisiones históricas. No se agregó
oro al contrato desktop. La matriz de aceptación está en
`docs/testing/sprint-05-6-oro-cargamento.md`.

**Prompt:** Sobre `app.shipment_gold_result_entries`, permite a `JEFE_EMPRESA` registrar o corregir opcionalmente un único total de oro en gramos para un cargamento cerrado. Acepta entero o hasta dos decimales, vacío no registrado y cero válido; muestra palos solo como equivalencia `1 palo = 0,10 g`. Conserva autora, fecha, valor anterior, nuevo valor y motivo mediante entradas append-only. No uses `gold_result_entries` legado, no crees resultados parciales por barrida, no cargues datos históricos previos a la puesta en marcha ni sincronices oro a desktop. Las comparaciones por proveedor muestran cobertura de cargamentos registrados y excluidos.

**Pausa:** el dataset manual coincide por cargamento, línea, proveedor y período, sin contar dos veces.

### 5.7 Responsive, accesibilidad y navegadores

**Estado:** cerrado técnica y manualmente el 2026-10-12. Henry aprobó
`pnpm run verify`, teclado, escritorio y emulación responsive de
iPhone/Android en Edge. El lector de pantalla y la comprobación en dispositivos
físicos quedan como verificaciones menores no bloqueantes para cuando exista un
entorno accesible fuera de la máquina local. El portal permite reflujo desde
320 px, respeta las áreas seguras del dispositivo, conserva objetivos táctiles,
convierte la comparación de proveedores en tarjetas móviles y evita que textos
largos ensanchen la página. El registro de oro expone un diálogo modal con foco
inicial, ciclo de tabulación, cierre con Escape y devolución del foco. Se
reforzaron nombres, avisos, encabezados de tabla, contraste y ampliación de
texto. La matriz está en
`docs/testing/sprint-05-7-responsive-accesibilidad.md`.

**Prompt:** Refina layout mobile-first para iPhone Safari, Android Chrome y escritorio. Prueba textos largos, teclado, lector, contraste, objetivos táctiles, zoom, orientación y safe areas.

**Pausa:** recorrido completo sin scroll horizontal accidental ni controles inaccesibles.

### 5.8 Sesión, privacidad y errores

**Estado:** completado y aprobado por Henry el 2026-10-13 con `pnpm run verify`
y recorrido manual SES-01 a SES-10. La entrega real del correo de recuperación
queda como prueba menor no bloqueante. La web revalida el perfil cuando Supabase
renueva el token, restaura la sesión después de recargar, cierra únicamente la
sesión del dispositivo actual y vacía toda la caché privada al salir, vencer la
sesión o cambiar de identidad. Los 401 terminan la sesión, los 403 se presentan
sin diagnósticos internos y el reintento automático queda limitado a una falla
transitoria. El modo offline conserva la última respuesta visible, anuncia su
estado y se actualiza al volver la red. La matriz está en
`docs/testing/sprint-05-8-sesion-privacidad-errores.md`.

**Prompt:** Endurece renovación y cierre de sesión, 401/403, caché por usuario, estados vacío/carga/error/offline y reintento controlado. Evita que datos de una sesión queden visibles después de salir y no expongas tokens, fotos ni diagnósticos técnicos.

**Pausa:** cerrar y reabrir sesión produce cero fuga de caché.

### 5.9 Rendimiento y frescura

**Estado:** cerrado el 2026-10-13. Henry aprobó `pnpm run verify`, REN-01 a
REN-05 y el benchmark anual de 1.460 cargamentos y 36.500 eventos. La señal
gerencial consulta el feed incremental de 4.11 mediante el índice existente,
sondea cada 30 segundos solo con la pestaña visible, invalida las proyecciones
cuando avanza el cursor y mantiene actualización manual. Primera y última
página midieron aproximadamente 69 ms, sin degradación que justificara índices,
caché o una paginación distinta. La evidencia está en
`docs/testing/sprint-05-9-rendimiento-frescura.md`.

**Prompt:** Genera volumen de un año, mide endpoints/render y agrega solo índices, caché o paginación justificados. Consume la señal de cambios respaldada por pull incremental, muestra la fecha efectiva de actualización y conserva un botón manual. Evita polling agresivo.

**Pausa:** objetivos acordados se cumplen en móvil/red lenta sin degradar la sincronización de desktop.

### 5.10 E2E y aceptación gerencial

**Estado:** cerrado técnica y manualmente el 2026-10-13. Henry confirmó
`pnpm run verify` y aprobó MAN-01 a MAN-10 con el recorrido real documentado en
capturas. La prueba integrada
`apps/web/src/features/portal/manager-journey.test.tsx` recorre autenticación,
resumen, operación, filtro y detalle de cargamento, registro explícito de cero,
corrección append-only, auditoría, módulos futuros y cierre local con limpieza
de caché. La ausencia de oro en desktop permanece cubierta en las fronteras
SQL y .NET existentes. La matriz automatizada y manual está en
`docs/testing/sprint-05-10-e2e-aceptacion-gerencial.md`.

**Prompt:** Automatiza E2E: login gerencial → resumen → operación → cargamento → registro/corrección de oro total → auditoría → cierre de sesión. Comprueba filtros, totales, pendientes, cero válido, ausencia de oro en desktop y módulos futuros sin acciones falsas.

**Pausa:** Lucía completa las tareas sin ayuda y aprueba la compuerta.

### 5.11 Mejora técnica — usuarios de planta

**Estado:** implementado el 2026-10-18 y pendiente de la validación automatizada
y manual de Henry. Es una mejora acordada fuera del alcance cerrado de
5.1–5.10.

La cuenta única `JEFE_EMPRESA` puede crear desde web un `JEFE_PLANTA` para
desktop mediante aprovisionamiento directo: nombre, correo, contraseña
temporal, PIN individual, planta, estaciones e idioma. El perfil se prepara en
`PENDING_APPROVAL`; no puede autenticarse contra el API hasta que gerencia lo
active expresamente. La activación en PostgreSQL exige alcance de planta,
autorización de estación y verificador PIN completos.

Supabase Auth se administra únicamente desde NestJS con la clave secreta. La
contraseña y el PIN nunca se incluyen en respuestas, logs ni auditoría; el PIN
se transforma con el mismo verificador PBKDF2-SHA256 usado por desktop. La
creación de perfil, alcance, estaciones y credencial PIN es una única
transacción SQL. Si esa transacción falla, el API elimina compensatoriamente el
usuario recién creado en Auth.

`user_profiles.provisioning_method` diferencia `DIRECT` del futuro
`EMAIL_INVITATION`. Esta entrega implementa solo `DIRECT`. Una mejora posterior
podrá enviar una invitación para que el jefe confirme el perfil y establezca su
propia contraseña y PIN desde web, conservando intacto el contrato de desktop.

**Prompt:** Implementa en web/API/PostgreSQL la creación directa y activación
separada de `JEFE_PLANTA`. Limita la acción a la cuenta `JEFE_EMPRESA` con
`plant_managers.manage`, exige una planta y al menos una estación activa, usa
Supabase Auth solo desde backend y conserva secretos fuera de respuestas,
logs y auditoría. No modifiques desktop. Deja explícita la estrategia de
aprovisionamiento para admitir invitación por correo después de la entrega.

**Pruebas:** `supabase/tests/018_sprint_5_11_plant_manager_provisioning.sql`,
contrato/E2E del API y recorrido React cubren creación pendiente, validación de
credenciales, ausencia de secretos en auditoría, compuerta de activación y
activación explícita. La matriz manual está en
`docs/testing/sprint-05-11-usuarios-planta.md`.

**Pausa:** Henry crea una cuenta pendiente, comprueba que aún no abre desktop,
la activa y confirma login, autorización de estación y elevación con el PIN
entregado, sin cambios en el ejecutable WPF.
