# Sprint 5.6 — Oro total por cargamento

Fecha de preparación: 2026-10-12. Rama: `DevHenry`.

Esta guía valida el registro gerencial de un único resultado vigente de oro por
cargamento cerrado. Las correcciones crean nuevas entradas; no actualizan ni
eliminan el historial. El oro no se envía a desktop y no representa custodia,
existencia ni entregas.

## Pruebas automatizadas preparadas

Las pruebas de API y web cubren:

- cero registrado frente a resultado ausente;
- entero o decimal con máximo dos posiciones;
- vacío rechazado como registro para evitar convertirlo en cero;
- motivo obligatorio y referencia al resultado anterior en correcciones;
- escritura append-only y auditoría vinculada al cargamento;
- permisos `gold.read` y `gold.results.manage` de `JEFE_EMPRESA`;
- cobertura registrada/excluida y oro por cajuela por proveedor;
- autora, fecha, valor y motivo en el historial;
- contrato OpenAPI sin añadir cantidades de oro al cliente desktop.

Ejecutar desde la raíz:

```powershell
pnpm --filter @industrias-doradas/api test
pnpm --filter @industrias-doradas/api test:e2e
pnpm --filter @industrias-doradas/web test
pnpm run verify
```

## Consultas de referencia en Swagger

Reemplace los identificadores por los de la sesión de prueba:

```text
GET /api/v1/organizations/{organizationId}/management/gold-summary?fromUtc={inclusive}&toUtc={exclusive}&productionLineId={lineId}&supplierId={supplierId}
GET /api/v1/organizations/{organizationId}/management/shipments/{shipmentId}/gold-results
POST /api/v1/organizations/{organizationId}/management/shipments/{shipmentId}/gold-results
```

Registro inicial válido, incluido cero:

```json
{
  "amountGrams": 0
}
```

Corrección válida:

```json
{
  "amountGrams": 12.5,
  "correctionReason": "Corrección de pesada"
}
```

No envíe `correctionReason` en el primer registro. Después del primer registro,
el motivo es obligatorio y el nuevo valor debe ser distinto del vigente.

## Datos

- Sprint / versión / commit: 5.6 / pendiente de commit tras aprobación.
- Fecha, lugar y responsable: ________________________________
- Equipo, SO y navegador/dispositivo: ________________________________
- Usuario: cuenta de prueba `JEFE_EMPRESA`.
- Cargamento cerrado sin oro: ________________________________
- Cargamento cerrado con oro: ________________________________

## Preparación

- [ ] API y web iniciadas con la configuración local documentada.
- [ ] Existe un cargamento cerrado sin resultado de oro.
- [ ] Existe otro cargamento cerrado con un resultado vigente.
- [ ] Swagger está autenticado con la misma organización de la cuenta web.
- [ ] No se usan datos históricos anteriores a la puesta en marcha.

## Recorrido manual

| ID | Pasos | Esperado | Obtenido | Pasa | Evidencia/defecto |
| --- | --- | --- | --- | :---: | --- |
| ORO-01 | Abrir `/gerencia/oro` y elegir período, línea y proveedor. Recargar la URL. | Los filtros se conservan y lista, resumen y proveedores representan el mismo conjunto de cargamentos cerrados. | | [ ] | |
| ORO-02 | Abrir un cargamento pendiente y dejar vacío el campo. Pulsar **Registrar resultado**. | No se envía una solicitud y el cargamento continúa como `No registrado`; vacío no se convierte en cero. | | [ ] | |
| ORO-03 | Registrar `0`. | Swagger, lista e historial muestran `0 g`; cuenta como registrado para cobertura y se diferencia de pendiente. | | [ ] | |
| ORO-04 | Registrar un entero y luego un valor con dos decimales en otro cargamento. | Ambos se aceptan y la equivalencia visual usa `1 palo = 0,10 g` sin modificar gramos almacenados. | | [ ] | |
| ORO-05 | Intentar `1,234`, negativo o texto. | La web no envía el valor inválido; Swagger responde `400` si se intenta saltar la interfaz. | | [ ] | |
| ORO-06 | Abrir un resultado existente, cambiar el valor y dejar vacío el motivo. | La corrección no se envía hasta escribir un motivo. | | [ ] | |
| ORO-07 | Guardar la corrección con motivo. | Se crea otra entrada, conserva valor anterior, autora, fecha y motivo; la vigente cambia sin sumar ambas. | | [ ] | |
| ORO-08 | Repetir exactamente el valor vigente. | Swagger responde `409 GOLD_AMOUNT_UNCHANGED`, la web explica que el valor debe ser diferente y no se crea revisión. | | [ ] | |
| ORO-09 | Comparar el resumen con los cargamentos del período. | Registrados + excluidos = total; cero cuenta registrado y solo registrados aportan oro/cajuelas al rendimiento. | | [ ] | |
| ORO-10 | Comparar dos proveedores. | Cada fila muestra cobertura y excluidos; `g/cajuela` usa únicamente cargamentos con oro vigente y no revisiones previas. | | [ ] | |
| AUD-01 | Abrir Auditoría después de registrar y corregir. | Los cambios aparecen bajo el cargamento con valor anterior/nuevo y actor gerencial. | | [ ] | |
| SEC-01 | Probar sin token y con un rol distinto de `JEFE_EMPRESA`. | Se obtienen `401` y `403`; no se crea ninguna entrada. | | [ ] | |
| DESK-01 | Sincronizar y revisar desktop. | Desktop continúa sin mostrar, guardar ni sincronizar cantidades de oro. | | [ ] | |

## Regresión obligatoria

- [ ] Cargamentos y detalle continúan mostrando sus proyecciones de 5.5.
- [ ] Resumen y Operación no incorporan controles físicos nuevos.
- [ ] El modelo legado `app.gold_result_entries` no recibe escrituras.
- [ ] Custodia y entregas de oro continúan fuera de alcance.
- [ ] Los archivos del Sprint 6 no fueron modificados.
- [ ] `pnpm run verify` termina sin errores.

Crítico = fuga de organización, permiso indebido, oro visible en desktop o
pérdida/cambio de historial. Alto = vacío convertido en cero, doble conteo de
revisiones, corrección sin motivo o cobertura incorrecta. El punto requiere cero
defectos críticos o altos.

**Decisión:** Pendiente de ejecución y confirmación de Henry.

**Confirmación de Gerencia:** ________________________________
