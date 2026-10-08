# Dependencias y alcance

```text
Línea base/arquitectura/CI
 → identidad vigente (`JEFE_EMPRESA` web y `JEFE_PLANTA` desktop), estación compartida, modos y catálogos
 → cargamento + asignación de línea/responsable
 → evento local de cajuela
 → sincronización idempotente y convergencia multiestación
 → alertas/barridas reales/mercurio y convergencia operacional
 → web gerencial + oro total opcional por cargamento
 → trabajadores/asistencia e inventario/mantenimiento básico
 → indicadores/Excel/entrega técnica
```

La web necesita datos centrales sincronizados; una barrida necesita cajuelas válidas; el rendimiento necesita cargamento + producción + oro registrado por gerencia. Por ello no se empieza por dashboards o Excel.

## Contexto físico confirmado

- Una planta actual con cuatro líneas; piloto en una.
- Cada línea tiene actualmente un molino y tres rastras, sin fijar esos números en el modelo.
- Una computadora/estación y un punto de control compartidos al inicio, preparados para varias líneas, estaciones y controladores configurables en el futuro.
- Operación normal continua de lunes a sábado; jornada diurna/nocturna clasifica horas y responsables, no el estado físico de la línea.
- Una línea activa necesita cargamento y operario principal.

## Imprescindible

Autenticación de `JEFE_EMPRESA` y `JEFE_PLANTA`; Modo Operación sin cuenta
compartida; auditoría; solicitudes/estados de trabajadores;
planta/líneas/rastras/estaciones; proveedores/cargamentos; responsables;
cajuelas y reversos; offline de 24 horas + sincronización; alertas cada 50;
barridas reales; entrada/saldo final de mercurio por rastra; oro total opcional
por cargamento solo en web; portal gerencial; Excel del núcleo aprobado y
recuperación. `ADMINISTRADOR`, custodia y entregas permanecen únicamente como
compatibilidad histórica, no como alcance funcional.

## Incluido después del núcleo

Asistencia local-first, trabajadores provisionales/vencidos y horas revisables
(no nómina), con fotografía solo si se aprueba su política; inventario de
herramientas sin negativos; revisiones recomendadas; vida útil básica de
componentes y novedades simples de paro, emergencia, feriado o mantenimiento.

## Condicionado

Fotografía de asistencia solo tras política aprobada; reconocimiento facial
queda en backlog hasta consentimiento, enrolamiento y precisión medida; sensor
sencillo solo después de validar clic/teclado/controlador; tarifas, kilataje,
precios o estimaciones laborales solo después de aprobar fuente/fórmula; MFA y
dispositivos administrativos autorizados antes de producción.

## Fuera de alcance

Sensor automático como criterio del MVP, PLC/IoT/SCADA, automatización física, medición automática, contabilidad/banca/nómina completa, PDF en la primera versión, migración masiva de cuadernos, app móvil nativa, administración multiempresa completa y CMMS/mantenimiento predictivo. Un sensor USB/HID sencillo queda en backlog y nunca sustituye la entrada manual de contingencia.

## Modelo mínimo orientativo

El núcleo existente usa `organizations`, `plants`, `production_lines`,
`line_components`, `stations`, `user_profiles`, `worker_requests`, `workers`,
`suppliers`, `shipments`, `responsibility_assignments`, `production_events`,
`production_sweeps`, `sweep_production_events`, `mercury_movements`,
`shipment_gold_result_entries`, `audit_events`, `sync_clients` y
`sync_changes`. Asistencia e inventario añadirán sus tablas únicamente en sus
sprints. Los modelos legados de oro por barrida/custodia no alimentan nuevas
funciones.

Los nombres son orientativos y se validan en el sprint responsable. `production_events` guarda UUID de origen, estación, línea, jornada, cargamento, responsable, horas dispositivo/servidor y sincronización. `CAJUELA_ADDED` suma y `CAJUELA_REVERSED` compensa sin borrar.

## Trazabilidad de requisitos

| Requisito | Sprint responsable | Evidencia mínima |
|---|---:|---|
| Identidad vigente, cuenta gerencial única, jefe de planta y modos | 1 | Sesión, elevación, revocación y accesos rechazados; legado administrativo fuera del MVP |
| Catálogos y cuatro líneas configurables | 1 | Planta, líneas, rastras, estaciones y desactivación |
| Cargamento/responsable/cajuelas | 2 | Operación offline y reverso inmediato |
| Convergencia multiestación | 3 | Sin pérdida/duplicación y aviso de cambio |
| Alertas y barridas reales | 4 | Límites, barrida arbitraria/final y eventos exactos |
| Mercurio por rastra | 4 | Entrada/saldo final, pendientes y correcciones append-only |
| Web, historial y oro por cargamento | 5 | Lectura gerencial móvil, auditoría y total opcional sin desktop |
| Trabajadores/asistencia | 6 | Entrada/salida offline, ajustes y horas; fotografía solo si se aprueba |
| Inventario/mantenimiento básico | 7 | Kardex sin negativos, revisión e historial de componentes |
| Excel | 8 | Archivo bilingüe contrastado con dataset dorado |
| Indicadores | 8 | Fórmulas aprobadas y probadas |
| Seguridad/recuperación | todos/8 | Revisión, MFA administrativa y restauración |
