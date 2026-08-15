# Sprint 8 — Indicadores, reportes y entrega (semanas 16–17)

**Objetivo:** apoyar decisiones y dejar una versión instalable, recuperable y mantenible.

**Entregable:** comparación de proveedores, Excel bilingüe y ensayo completo de despliegue/recuperación.

## Orden de trabajo

1. Aprobar fórmulas: cajuelas/palo, g/cajuela, oro/cargamento, mercurio/g, costo y rendimiento/precio. Sin denominador = “datos insuficientes”.
2. Servicios versionados y pruebas con datasets conocidos.
3. Web: comparación por proveedor/cargamento/fecha/línea; tablas antes de gráficos decorativos.
4. Excel es/en: resumen, fuente, filtros, unidades, fecha y zona horaria; PDF queda posterior.
5. Reportes de producción, barridas, asistencia e inventario por permiso.
6. Carga, seguridad, accesibilidad, compatibilidad, offline prolongado y regresión.
7. Instalador/actualizador WPF con backup SQLite y rollback.
8. Producción: HTTPS, secretos, alertas, backup/restauración Supabase ensayada.
9. Manuales de instalación, operación, gerencia, contingencia y mantenimiento.
10. Capacitación, piloto en una línea, correcciones críticas y expansión gradual.

**Pruebas:** dataset dorado manual = dashboard/Excel; un año de volumen; instalación/actualización/rollback/restauración; revisión OWASP básica.

**Prueba manual final:** jornada completa con check-in, cargamento, estaciones/líneas, cajuelas, caída de red, barrida, mercurio, oro, inventario, sync, móvil y Excel.

**Aceptación:** cero críticos/altos; restauración demostrada; aceptación gerencial; futuros quedan en backlog, nunca como código incompleto oculto.

## Mini pasos, pausas y prompts

### 8.1 Catálogo de indicadores y fórmulas

**Prompt:** Facilita aprobación de cada indicador con nombre, pregunta que responde, fórmula, unidad, fuente, filtros, periodo, exclusiones, precisión y comportamiento sin datos. Incluye cajuelas/palo, g/cajuela, oro/cargamento, mercurio/g, costo/rendimiento y calidad/precio de proveedor. No programes fórmulas no firmadas.

**Pausa:** gerencia calcula manualmente ejemplos y aprueba definiciones/insumos de costo.

### 8.2 Dataset dorado

**Prompt:** Crea dataset ficticio pequeño pero completo con resultados calculados a mano: varios proveedores/cargamentos, reversos, barridas, mercurio, paros, asistencia e inventario. Versiona entradas y resultados esperados para pruebas de API, web y Excel. No uses datos sensibles reales.

**Pausa:** segunda persona recalcula una muestra sin consultar código.

### 8.3 Servicios de indicadores

**Prompt:** Implementa cálculos versionados en backend/read models usando decimal y reglas aprobadas. Devuelve valor, unidad, periodo, cobertura/frescura y “datos insuficientes” cuando corresponda. Añade pruebas unitarias/integración contra dataset dorado; React no recalcula.

**Pausa:** comparar todas las salidas API con tabla esperada.

### 8.4 Comparación gerencial

**Prompt:** Implementa web para comparar proveedor/cargamento/fecha/línea con tablas ordenables y pocos gráficos justificados. Muestra tamaño de muestra, costo faltante y frescura para evitar conclusiones engañosas. Añade accesibilidad, móvil y permisos.

**Pausa:** gerencia responde cuál proveedor rindió mejor y por qué, sin confundir falta de datos con cero.

### 8.5 Motor de reportes y Excel

**Prompt:** Implementa exportación Excel desde backend con streaming/límites, nombre seguro y hojas de resumen + fuente. Cubre oro, cajuelas/producción, asistencia/horas, actividad de líneas, cargamentos y proveedores. Genera es/en según selección, por defecto preferencia de cuenta. Incluye unidades, zona horaria, versión y autor; evita inyección. No agregues PDF todavía.

**Pausa:** abrir en Excel/iPhone si aplica y cotejar dataset dorado celda por celda en muestra.

### 8.6 Reportes por módulo

**Prompt:** Añade reportes priorizados de producción/cajuelas, actividad de línea, cargamentos/proveedores, barridas/mercurio/oro/custodia/entregas y asistencia/horas. Inventario/novedades se incluyen solo si fueron aprobados. Respeta que jefe de empresa genera reportes y cuenta administrativa no. Documenta campos/límites.

**Pausa:** cada responsable valida al menos un reporte contra pantalla/fuente.

### 8.7 Regresión, rendimiento y estabilidad

**Prompt:** Ejecuta suite completa y pruebas con volumen proyectado de un año: registro local, outbox grande, sincronización, API concurrente, dashboard y Excel. Perfila antes de optimizar; corrige bloqueos, fugas y consultas lentas con evidencia. Establece umbrales medidos.

**Pausa:** informe comparativo antes/después y todos los recorridos críticos en verde.

### 8.8 Revisión de seguridad y privacidad

**Prompt:** Revisa amenazas y OWASP aplicables: autenticación/autorización horizontal, validación, rate limit, CORS, headers, archivos, logs, dependencias, secretos, Storage privado, caché y biometría. Ejecuta escaneos permitidos, actualiza dependencias con prudencia y corrige críticos/altos sin cambios masivos innecesarios.

**Pausa:** checklist firmado, cero secretos y cero hallazgos críticos/altos abiertos.

### 8.9 Respaldo y recuperación

**Prompt:** Define RPO/RTO con empresa. Configura/verifica respaldos Supabase disponibles, exportación lógica y respaldo consistente de SQLite/fotos. Escribe runbook y realiza restauración aislada, comprobando conteos/checksums y reconciliación posterior. No declares éxito sin restaurar.

**Pausa:** otra persona sigue runbook y recupera dataset verificable.

### 8.10 Instalador y actualización desktop

**Prompt:** Crea empaquetado/instalador firmado si hay certificado, configuración de estación y estrategia de actualización compatible con SQLite. Antes de actualizar: backup y comprobación de espacio; ante fallo: rollback seguro. No actualices automáticamente durante operación activa.

**Pausa:** instalación limpia, actualización con datos, fallo simulado, rollback y desinstalación sin borrar datos sin aviso.

### 8.11 Despliegue API/web y operación

**Prompt:** Prepara ambientes, HTTPS, dominios, variables/secretos, migraciones controladas, logs/alertas, health/readiness y rollback para API/web. Separa desarrollo/producción y principio de mínimo privilegio. Documenta costos/servicios y procedimiento de liberación; no despliegues sin autorización explícita.

**Pausa:** ensayo de release en ambiente no productivo y rollback comprobado.

### 8.12 Manuales y contingencia

**Prompt:** Redacta manual técnico, instalación, operador visual, gerencia, administración, privacidad, respaldo y solución de problemas. Incluye procedimiento en papel si PC falla, cómo reingresar/conservar datos y canales responsables. Usa capturas actuales y lenguaje comprensible.

**Pausa:** operario y administrador ejecutan tareas siguiendo manual, sin ayuda verbal.

### 8.13 Piloto de una línea

**Prompt:** Planifica piloto controlado en una línea con criterios de inicio/parada, responsables, doble registro temporal para comparar, métricas de adopción, fallos y reunión diaria. Despliega solo con autorización, recopila evidencia y corrige críticos antes de ampliar.

**Pausa:** periodo piloto acordado sin pérdida; diferencia con cuaderno explicada y aceptación de usuario.

### 8.14 Cierre y transferencia

**Prompt:** Ejecuta prueba final y matriz de requisitos. Organiza deuda/backlog (PDF, sensores, multiempresa, biometría si siguió aplazada), habilita MFA y dispositivos administrativos autorizados antes de producción, revisa versiones/licencias y entrega por canal seguro. Registra aceptación y continuidad.

**Pausa:** cero críticos/altos, todos los RF/RNF con evidencia, restauración demostrada y cierre firmado.
