# Dependencias y alcance

```text
Arquitectura/CI
 → modelo/migraciones
 → identidad/roles/catálogos
 → turno/cargamento/línea
 → evento local de cajuela
 → sincronización idempotente
 → barrida/mercurio/resultado
 → indicadores/reportes
```

La web necesita datos centrales sincronizados; una barrida necesita cajuelas válidas; el rendimiento de proveedor necesita cargamento + producción + oro. Por ello no se empieza por dashboards o Excel.

## Imprescindible

Autenticación/roles/auditoría; planta/líneas/estaciones; operarios/proveedores/cargamentos; turnos; cajuelas y correcciones; offline + sincronización; barrida cada 50 cajuelas configurable; mercurio/oro; web básica; Excel y recuperación.

## Incluido si se mantiene el calendario

Check-in con fotografía y revisión; horas para apoyar salarios (no nómina); inventario; indicadores precio/calidad de proveedores; registro básico de paros, incidentes y mantenimiento que afecten una línea.

## Posterior al núcleo

Reconocimiento facial automático solo tras consentimiento y medición de precisión; reportes avanzados; editor visual de teclas.

## Fuera de alcance

Sensores/PLC/IoT/SCADA, automatización física, medición automática, contabilidad/banca/nómina completa, migración masiva de cuadernos, app móvil nativa, administración multiempresa completa y un CMMS/mantenimiento predictivo completo.

## Modelo mínimo

`organizations`, `plants`, `production_lines`, `stations`, `user_profiles`, `roles`, `workers`, `suppliers`, `shipments`, `shifts`, `line_assignments`, `production_events`, `line_events`, `sweeps`, `mercury_usages`, `gold_results`, `attendance_events`, `inventory_items`, `inventory_movements`, `audit_events`, `sync_clients`.

`production_events` guarda UUID del cliente, estación, línea, turno, cargamento, operario, hora del dispositivo/servidor y sincronización. `CAJUELA_ADDED` suma; `CAJUELA_REVERSED` compensa sin borrar.

## Trazabilidad de requisitos

| Requisito | Sprint responsable | Evidencia mínima |
|---|---:|---|
| RF-01 autenticación | 1 | Login, roles y acceso rechazado |
| RF-02–05 producción/cajuelas | 2–3 | Operación offline y convergencia central |
| RF-06 alerta de barrida | 4 | Casos 49/50/51 |
| RF-07 mercurio | 4 y 7 | Barrida + movimiento de inventario |
| RF-08 horas | 6 | Eventos y resumen aprobado |
| RF-09 inventario | 7 | Kardex conciliado |
| RF-10 Excel | 8 | Archivo contrastado con dataset dorado |
| RF-11 indicadores | 8 | Fórmulas aprobadas y probadas |
| RF-12 historial | 5 | Filtros, detalle y paginación |
| RNF-01 interfaz intuitiva | 2 y todos | Prueba con operarios/teclado |
| RNF-02 seguridad | 1 y 8 | Matriz de acceso + revisión final |
| RNF-03 integridad | 2–4 y 7 | Restricciones, idempotencia y recuperación |
| RNF-04 rendimiento | 5 y 8 | Pruebas con volumen proyectado |
| RNF-05 extensibilidad | 0 y todos | Límites modulares y ADR vigentes |

