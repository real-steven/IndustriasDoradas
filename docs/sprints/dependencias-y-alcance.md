# Dependencias y alcance

```text
Línea base/arquitectura/CI
 → identidad, cuentas separadas, roles y catálogos
 → cargamento + asignación de línea/responsable
 → evento local de cajuela
 → sincronización idempotente y convergencia multiestación
 → alertas/barridas reales/mercurio/oro/entrega
 → web gerencial bilingüe
 → asistencia básica e inventario
 → indicadores/Excel/entrega
```

La web necesita datos centrales sincronizados; una barrida necesita cajuelas válidas; el rendimiento necesita cargamento + producción + oro certificado. Por ello no se empieza por dashboards o Excel.

## Contexto físico confirmado

- Una planta actual con cuatro líneas; piloto en una.
- Cada línea tiene actualmente un molino y tres rastras, sin fijar esos números en el modelo.
- Un punto de control compartido al inicio, preparado para varias líneas, estaciones y controladores configurables.
- Operación normal continua de lunes a sábado; jornada diurna/nocturna clasifica horas y responsables, no el estado físico de la línea.
- Una línea activa necesita cargamento y operario principal.

## Imprescindible

Autenticación/roles/auditoría; cuentas gerencial/administrativa separadas; planta/líneas/rastras/estaciones; trabajadores/proveedores/cargamentos; responsables/jornadas; cajuelas y reversos; offline + sincronización; alertas configurables cada 50; barridas reales; mercurio/oro/custodia/entrega; web gerencial bilingüe; Excel y recuperación.

## Incluido después del núcleo

Asistencia básica de entrada/salida sin biometría; horas revisables (no nómina); inventario de herramientas sin negativos; revisiones recomendadas; novedades simples de paro, emergencia, feriado o mantenimiento.

## Condicionado

Reconocimiento facial solo tras consentimiento, política de retención, enrolamiento y precisión medida; MFA y dispositivos administrativos autorizados antes de producción; indicadores y umbrales pendientes solo después de aprobación.

## Fuera de alcance

Sensores/PLC/IoT/SCADA, automatización física, medición automática, contabilidad/banca/nómina completa, PDF en la primera versión, migración masiva de cuadernos, app móvil nativa, administración multiempresa completa y CMMS/mantenimiento predictivo.

## Modelo mínimo orientativo

`organizations`, `plants`, `production_lines`, `line_components`, `stations`, `user_profiles`, `roles`, `workers`, `suppliers`, `shipments`, `work_periods`, `line_assignments`, `production_events`, `sweeps`, `mercury_usages`, `gold_results`, `gold_deliveries`, `attendance_events`, `inventory_items`, `inventory_movements`, `inventory_reviews`, `line_events`, `audit_events`, `sync_clients`.

Los nombres son orientativos y se validan en el sprint responsable. `production_events` guarda UUID de origen, estación, línea, jornada, cargamento, responsable, horas dispositivo/servidor y sincronización. `CAJUELA_ADDED` suma y `CAJUELA_REVERSED` compensa sin borrar.

## Trazabilidad de requisitos

| Requisito | Sprint responsable | Evidencia mínima |
|---|---:|---|
| Identidad, roles y cuentas separadas | 1 | Matriz y accesos rechazados |
| Catálogos y cuatro líneas configurables | 1 | Planta, líneas, rastras, estaciones y desactivación |
| Cargamento/responsable/cajuelas | 2 | Operación offline y reverso inmediato |
| Convergencia multiestación | 3 | Sin pérdida/duplicación y aviso de cambio |
| Alertas 50–55 y barridas reales | 4 | Casos 49/50/55/56, múltiplos y barrida final |
| Mercurio/oro/entrega | 4–5 | Parciales, total por cargamento y confirmación |
| Web bilingüe e historial | 5 | Lectura gerencial es/en, móvil y auditoría |
| Asistencia básica | 6 | Entrada/salida offline y horas revisables |
| Biometría condicionada | 6 | Política aprobada y precisión medida o aplazamiento |
| Inventario | 7 | Kardex sin negativos y revisión |
| Excel | 8 | Archivo bilingüe contrastado con dataset dorado |
| Indicadores | 8 | Fórmulas aprobadas y probadas |
| Seguridad/recuperación | todos/8 | Revisión, MFA administrativa y restauración |
