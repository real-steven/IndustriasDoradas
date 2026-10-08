# Sprint 8 — Indicadores, reportes y entrega (semanas 16–17)

**Objetivo:** convertir la información ya validada en decisiones explicables y
entregar una versión instalable, recuperable y mantenible.

**Entregable:** comparación de proveedores con cobertura visible, reportes
Excel del núcleo aprobado, endurecimiento de producción, instalador/rollback,
restauración ensayada, manuales y piloto controlado.

## Dependencias y límites heredados

1. Los indicadores usan los read models y filtros de Sprint 5. React no
   recalcula cifras de negocio.
2. El oro es un único total opcional por cargamento; no existe custodia,
   entrega, existencia acumulada ni importación histórica.
3. Asistencia e inventario aparecen en indicadores/reportes solo si Sprints 6 y
   7 fueron implementados y aceptados. Un módulo aplazado no se simula.
4. Solo `JEFE_EMPRESA` consulta/genera reportes web en el alcance actual.
   `ADMINISTRADOR` no reaparece en entrega, permisos ni manuales del MVP.
5. Precio, kilataje, moneda, costo laboral y fórmulas financieras se incluyen
   únicamente después de definir fuente, vigencia y fórmula con la gerente. El
   sistema no es contabilidad ni nómina.
6. PDF, sensores, reconocimiento facial, multiempresa y CMMS permanecen en
   backlog salvo autorización posterior explícita.

## Orden de trabajo

1. Aprobar preguntas, fórmulas, unidades, cobertura y comportamiento sin datos.
2. Crear dataset dorado ficticio y resultados manuales esperados.
3. Implementar indicadores versionados en backend/read models.
4. Implementar comparación web por proveedor, cargamento, fecha y línea.
5. Implementar Excel seguro con hojas de resumen y fuente trazable.
6. Añadir reportes de módulos realmente cerrados, no de planes futuros.
7. Medir volumen anual, consultas, render y sincronización antes de optimizar.
8. Revisar seguridad, privacidad, sesión, dependencias y configuración.
9. Ensayar respaldo/restauración central y SQLite con RPO/RTO acordados.
10. Crear instalador, actualización y rollback que respeten operación activa.
11. Preparar release API/web con ambientes y secretos separados.
12. Actualizar manuales y contingencia en papel.
13. Ejecutar piloto en una línea y expansión gradual.
14. Retirar ayudas temporales de prueba, cerrar matriz y transferir.

**Pruebas:** dataset dorado = API/web/Excel; cero versus ausente; cobertura de
oro; un año de volumen; instalación limpia/actualización/rollback; restauración;
sesión/403; offline prolongado y regresión completa desktop/API/web.

**Prueba manual final:** login, estación, cuatro líneas, cajuelas, reverso,
caída de red, barrida, mercurio, cierre, oro web, auditoría, filtros, Excel y
recuperación. Asistencia/inventario se incluyen solo si fueron cerrados.

**Aceptación:** cero críticos/altos, cifras reproducibles, restauración
demostrada, aceptación de operario/jefe/gerente y backlog explícito sin código
incompleto oculto.

## Mini pasos, pausas y prompts

### 8.1 Catálogo de indicadores

**Prompt:** Para cada indicador documenta pregunta, fórmula, unidad, fuente,
filtros, período, exclusiones, precisión, cobertura y respuesta sin denominador.
Prioriza cajuelas por cargamento, barridas, oro por cajuela y comparación de
proveedores usando solo cargamentos con oro registrado. Precio/kilataje/costos y
horas monetizadas requieren aprobación separada; no programes fórmulas tomadas
directamente de hojas históricas sin entenderlas.

**Pausa:** la gerente recalcula y aprueba ejemplos del núcleo.

### 8.2 Dataset dorado

**Prompt:** Crea un dataset ficticio versionado con proveedores, cargamentos,
reversos, barridas tardías, mercurio pendiente/completo y oro ausente/cero/
corregido. Añade asistencia e inventario solo si existen. Calcula manualmente
resultados esperados sin usar datos reales de la empresa.

**Pausa:** una segunda persona reproduce una muestra sin consultar código.

### 8.3 Servicios de indicadores

**Prompt:** Implementa cálculos versionados en backend/read models con tipos
decimales. Devuelve valor, unidad, período, cobertura, exclusiones, frescura y
`datos insuficientes`. No sumes revisiones de oro ni mezcles cargamentos,
proveedores o líneas. Añade pruebas contra el dataset dorado.

**Pausa:** API coincide exactamente con la tabla esperada.

### 8.4 Comparación gerencial

**Prompt:** Implementa el módulo `Estadísticas` para `JEFE_EMPRESA` con filtros
reutilizables por proveedor/cargamento/fecha/línea. Usa tablas antes que gráficos
y muestra tamaño de muestra, cobertura y frescura para evitar conclusiones
engañosas. Mantén filtros en URL y diseño mobile-first.

**Pausa:** la gerente explica qué proveedor rindió mejor y qué datos se
excluyeron.

### 8.5 Motor Excel

**Prompt:** Genera Excel desde backend con streaming/límites, nombre seguro y
hojas `Resumen`, `Fuente` y `Definiciones`. Incluye filtros, unidades, zona
horaria, versión y fecha de generación. Mitiga inyección de fórmulas y aplica
preferencia es/en si sigue aprobada. PDF permanece fuera de alcance.

**Pausa:** archivo abre correctamente y una muestra coincide celda por celda.

### 8.6 Reportes por alcance cerrado

**Prompt:** Entrega primero cargamentos, cajuelas/producción, barridas/mercurio,
oro y proveedores. Añade asistencia/horas e inventario únicamente si sus
sprints cerraron. No incluyas custodia/entregas de oro, pago estimado ni módulos
`Próximamente`. Documenta campos, cobertura y límites.

**Pausa:** cada reporte coincide con su pantalla/read model para los mismos
filtros.

### 8.7 Regresión, volumen y rendimiento

**Prompt:** Ejecuta la suite completa y volumen proyectado de un año para
registro local, outbox, pull, read models, endpoints, portal y Excel. Perfila
antes de agregar índice/caché. Define umbrales medidos y comprueba que optimizar
no rompe idempotencia ni frescura.

**Pausa:** informe antes/después y recorridos críticos en verde.

### 8.8 Seguridad y privacidad

**Prompt:** Revisa JWT, autorización horizontal, CORS, headers, rate limit,
validación, archivos, caché, logs, secretos, dependencias y Storage solo si se
implementó. Habilita protección de contraseñas filtradas, MFA/dispositivos
administrativos si están disponibles y corrige críticos/altos. No expongas
`service_role` ni vistas `app` al navegador.

**Pausa:** checklist firmado, cero secretos y cero críticos/altos abiertos.

### 8.9 Respaldo y recuperación

**Prompt:** Acordar RPO/RTO, documentar respaldo Supabase, exportación lógica y
copia consistente de SQLite/archivos aplicables. Restaurar en entorno aislado,
comparar conteos/checksums y ensayar reconciliación posterior. No declares éxito
sin una restauración real.

**Pausa:** otra persona sigue el runbook y recupera un dataset verificable.

### 8.10 Instalador y actualización desktop

**Prompt:** Crea empaquetado/instalador, configuración de estación y estrategia
de actualización compatible con las migraciones SQLite. Antes de actualizar,
respalda y verifica espacio; ante fallo, revierte. Nunca actualices durante un
cargamento activo ni borres datos al desinstalar sin advertencia.

**Pausa:** instalación limpia, actualización con datos, fallo simulado y
rollback aprobados.

### 8.11 Despliegue API/web

**Prompt:** Prepara ambientes separados, HTTPS, dominio, variables/secretos,
migraciones controladas, health/readiness, logs/alertas y rollback. Documenta
costos y procedimiento de release. No despliegues producción sin autorización
explícita.

**Pausa:** ensayo no productivo y rollback comprobado.

### 8.12 Manuales y contingencia

**Prompt:** Actualiza manual técnico, instalación, operario, jefe de planta,
gerencia, privacidad, respaldo y solución de problemas. Incluye operación en
papel si falla la computadora y cómo reingresar/conservar datos sin duplicar.
Usa capturas actuales y elimina referencias a roles/módulos descartados.

**Pausa:** cada perfil completa su recorrido sin ayuda verbal.

### 8.13 Piloto de una línea

**Prompt:** Define inicio/parada, responsables, doble registro temporal,
métricas, reunión diaria y rollback. Despliega una línea solo con autorización,
compara contra cuaderno y corrige críticos antes de ampliar a las cuatro.

**Pausa:** piloto sin pérdida y diferencias explicadas/aceptadas.

### 8.14 Cierre y transferencia

**Prompt:** Restaura la espera de seguridad entre cajuelas a 3000 ms, repite
pruebas de doble pulsación y elimina o restringe `+5`. Revisa que oro nunca
aparezca en desktop y que módulos aplazados sigan marcados. Cierra matriz
RF/RNF, versiones, licencias, respaldo, aceptación y backlog.

**Pausa:** cero críticos/altos, restauración demostrada y cierre firmado.
