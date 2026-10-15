# Sprint 5.5 — Historial, detalle y auditoría

Fecha de preparación: 2026-10-12. Rama: `DevHenry`.

Esta guía valida que la web consulta los cargamentos cerrados y su trazabilidad
desde las proyecciones centrales de 4.11, 5.2 y 5.3. No modifica datos
operativos, no recalcula totales en React y no incorpora lógica del Sprint 6.

## Pruebas automatizadas preparadas

Las pruebas de API y web cubren:

- exposición separada de `occurredAt` y `recordedAt` en auditoría;
- fecha de Costa Rica convertida a `fromUtc` inclusivo y `toUtc` exclusivo;
- período, fecha, línea, proveedor, responsable y página enviados a la API;
- conservación de filtros en la URL y al volver desde el detalle;
- detalle con cajuelas, barridas y mediciones de mercurio por rastra;
- agrupación de cambios auditados por cargamento;
- estados vacío y de error de las consultas centrales.

Ejecutar desde la raíz:

```powershell
pnpm --filter @industrias-doradas/api test
pnpm --filter @industrias-doradas/web test
pnpm run verify
```

## Consultas de referencia en Swagger

Reemplace los identificadores por los de la sesión de prueba:

```text
GET /api/v1/organizations/{organizationId}/management/shipments?page=1&pageSize=10&fromUtc={inclusive}&toUtc={exclusive}
GET /api/v1/organizations/{organizationId}/management/shipments/{shipmentId}
GET /api/v1/organizations/{organizationId}/management/shipments/{shipmentId}/sweeps?page=1&pageSize=100
GET /api/v1/organizations/{organizationId}/audit-events?page=1&pageSize=100&search=shipment
```

En la respuesta de auditoría, `occurredAt` representa la ocurrencia registrada
y `recordedAt` la confirmación almacenada en el centro.

## Datos

- Sprint / versión: 5.5 / cierre aprobado en `DevHenry`.
- Fecha, lugar y responsable: 2026-10-12 / prueba local / Henry.
- Equipo, SO y navegador/dispositivo: ________________________________
- Usuario: cuenta de prueba `JEFE_EMPRESA`.
- Cargamento cerrado usado: ________________________________

## Preparación

- [x] API y web iniciadas con la configuración local documentada.
- [x] Existe al menos un cargamento cerrado confirmado en Supabase.
- [x] El cargamento tiene proveedor y responsable al cierre.
- [x] Para validar el detalle completo, existe una barrida con alguna medición
      de mercurio; vacío debe continuar apareciendo como pendiente.
- [x] Swagger está autenticado con la misma organización de la cuenta web.

## Recorrido manual

| ID | Pasos | Esperado | Obtenido | Pasa | Evidencia/defecto |
| --- | --- | --- | --- | :---: | --- |
| HIS-01 | Abrir `/gerencia/cargamentos` y seleccionar **Esta semana**. | La URL y la solicitud representan la semana de lunes a lunes en Costa Rica; los cargamentos están ordenados por cierre descendente. | Conforme | [x] | |
| HIS-02 | Elegir **Semana anterior** y recargar la URL resultante. | Se reproducen exactamente el período, los filtros y la página seleccionada. | Conforme | [x] | |
| HIS-03 | Elegir **Fecha específica** y consultar un día conocido. | La API recibe inicio inclusivo a las `06:00Z` y fin exclusivo a las `06:00Z` del día siguiente; no mezcla cierres vecinos. | Conforme | [x] | |
| HIS-04 | Combinar línea, proveedor y responsable. | Cada fila pertenece a todos los filtros seleccionados y las opciones no dependen solo de los diez registros visibles. | Conforme | [x] | |
| HIS-05 | Usar Anterior/Siguiente cuando existan más de diez resultados. | Cambia `page` en la URL, conserva los demás filtros y no duplica ni omite el desempate de la API. | Conforme | [x] | |
| DET-01 | Abrir un cargamento desde el historial. | La URL conserva la consulta anterior y muestra una sola ficha con línea, proveedor, estación, cajuelas, barridas y responsable al cierre. | Conforme | [x] | |
| DET-02 | Comparar la ficha con Swagger y desktop. | Cajuelas, barridas, proveedor y responsable coinciden; React no suma ni reconstruye valores. | Conforme | [x] | |
| DET-03 | Revisar barridas y mercurio. | Cada barrida aparece una vez y agrupa sus rastras; cero medido se distingue de `Pendiente`. | Conforme | [x] | |
| DET-04 | Pulsar **Volver al historial**. | Regresa al mismo período, filtros y página de origen. | Conforme | [x] | |
| AUD-01 | Abrir `/gerencia/auditoria`. | Los movimientos `shipment` se agrupan por cargamento y cada grupo abre su ficha trazable. | Conforme | [x] | Historial inmutable puede incluir entidades ausentes de la proyección actual. |
| AUD-02 | Comparar un evento con Swagger. | Actor y resultado coinciden, y se muestran por separado **Ocurrió** y **Confirmado en centro**. | Conforme en web | [x] | Swagger quedó cargando al consultar el historial amplio. |
| ERR-01 | Consultar un período sin resultados. | Se explica que la consulta central respondió sin coincidencias; no se presenta como error. | Conforme | [x] | |
| ERR-02 | Bloquear temporalmente `*/management/shipments*`. | Se presenta un error comprensible sin inventar filas ni mezclar datos de otra consulta. | Conforme | [x] | |

## Regresión obligatoria

- [x] Resumen y Operación continúan consultando las líneas activas.
- [x] Oro permanece sin mutaciones hasta el punto 5.6.
- [x] Los módulos de los Sprints 6–8 continúan como `PRÓXIMAMENTE`.
- [x] Un perfil distinto de `JEFE_EMPRESA` no entra al portal gerencial.
- [x] `pnpm run verify` termina sin errores.

Crítico = fuga de organización, permiso indebido o corrupción/pérdida. Alto =
cifras distintas de API/desktop, filtros no reproducibles o mezcla de dos
cargamentos. El punto requiere cero defectos críticos o altos.

## Observaciones no bloqueantes

- `app.audit_events` es un historial inmutable y append-only. Por diseño puede
  conservar eventos de datos de prueba o de cargamentos que ya no aparecen en
  la proyección vigente; no deben eliminarse para forzar coincidencia.
- La consulta amplia de auditoría quedó cargando en Swagger durante la prueba.
  La web sí respondió y el recorrido funcional fue aprobado. El endpoint hace
  una consulta paginada, aunque el conteo exacto y la búsqueda parcial pueden
  encarecerla cuando crece el historial; queda como seguimiento de rendimiento,
  no como defecto funcional del 5.5.

**Decisión:** Aprobado por Henry el 2026-10-12; cero defectos críticos o altos.

**Confirmación de Gerencia:** Henry, recorrido manual y `pnpm run verify`
conformes.
