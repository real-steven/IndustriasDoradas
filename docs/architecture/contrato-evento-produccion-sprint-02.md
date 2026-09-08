# Contrato del evento de producción — Sprint 2.3

**Fecha:** 2026-08-26

**Estado:** aprobado provisionalmente para continuar; pendiente de contraste
manual con cinco registros reales de cuaderno/Excel antes de cerrar Sprint 2

**Fuentes:**

- `docs/requirements/linea-base-funcional-v0.1.md`
- `docs/architecture/dominio-operacion-local-sprint-02.md`
- `docs/sprints/dependencias-y-alcance.md`

## 1. Alcance

Este mini paso define el contrato inmutable de una cajuela agregada o revertida
y la forma de derivar su contador. No implementa SQLite, Outbox, sincronización,
el caso de uso de registro, doble confirmación ni UI; corresponden a los pasos
2.4, 2.6 y 2.7.

## 2. Contrato

| Propiedad C# | Nombre lógico | Regla |
| --- | --- | --- |
| `ClientEventId` | `client_event_id` | UUID generado en el cliente; identifica el mismo evento en reintentos. |
| `Context.OrganizationId` | `organization_id` | UUID obligatorio. |
| `Context.PlantId` | `plant_id` | UUID obligatorio. |
| `Context.StationId` | `station_id` | UUID de la estación que originó el evento. |
| `Context.LineId` | `line_id` | UUID de la línea; requerido para el contador. |
| `Context.FeedCycleId` | `feed_cycle_id` | UUID del ciclo de alimentación. |
| `Context.ShipmentId` | `shipment_id` | UUID del cargamento; requerido para el contador. |
| `Context.ResponsibleWorkerId` | `responsible_worker_id` | Responsable vigente cuando ocurrió el evento. |
| `Type` | `event_type` | `CAJUELA_ADDED` o `CAJUELA_REVERSED`. |
| `WorkPeriod` | `work_period` | Se deriva de `OccurredAt`; no se recibe como dato editable. |
| `OccurredAt` | `occurred_at` | Instante del hecho, normalizado a UTC. |
| `RecordedAt` | `recorded_at` | Instante en que el cliente creó el registro, normalizado a UTC. |
| `ClientSequence` | `client_sequence` | Entero positivo, monotónico y único dentro de cada estación. |
| `ReversesClientEventId` | `reverses_client_event_id` | Nulo para agregado; UUID original obligatorio para reversión. |
| `QuantityDelta` | derivado | `+1` para agregado y `-1` para reversión; no se persiste como verdad independiente. |

La marca de aceptación del servidor no pertenece al hecho local inmutable. Se
agregará como metadato de sincronización sin reemplazar `OccurredAt` ni
`RecordedAt`.

## 3. Inmutabilidad e idempotencia

- Evento y contexto exponen únicamente propiedades de lectura.
- Un UUID cliente repetido con contenido idéntico representa un reintento y se
  cuenta una sola vez.
- Un UUID cliente repetido con contenido diferente es corrupción y se rechaza.
- Dos UUID distintos no pueden compartir la misma secuencia en una estación.
- No existe operación para editar tipo, contexto, horas, secuencia o destino de
  reversión.
- Una corrección crea otro evento; nunca usa `DELETE` o `UPDATE` sobre el hecho.

La restricción física única para UUID y `(station_id, client_sequence)` se
implementará en SQLite durante 2.4 y se revalidará en PostgreSQL al sincronizar.

## 4. Reglas de reversión

1. `CAJUELA_REVERSED` requiere `ReversesClientEventId` no vacío.
2. Un evento no puede referenciarse a sí mismo.
3. El objetivo debe existir y ser `CAJUELA_ADDED`.
4. Solo se acepta una reversión efectiva por cajuela agregada.
5. Reversión y original conservan organización, planta, línea, ciclo y
   cargamento.
6. Estación, responsable y jornada pueden reflejar el contexto real del momento
   de la corrección sin reetiquetar el evento original.

La regla «solo la última cajuela y durante ciclo abierto» pertenece al caso de
uso 2.7. El contrato 2.3 conserva la referencia necesaria para poder validarla.

## 5. Contador derivable

El total se obtiene para la clave `(line_id, shipment_id)`:

1. deduplicar eventos por `client_event_id`;
2. validar unicidad de secuencia por estación;
3. seleccionar `CAJUELA_ADDED` de la línea y cargamento;
4. comprobar que cada reversión relevante apunta a uno de esos agregados y
   conserva su alcance productivo;
5. calcular `agregados únicos - objetivos revertidos únicos`.

No se guarda un contador editable en el dominio. En 2.6 podrá existir un read
model local reconstruible para responder rápido, pero los eventos siguen siendo
la fuente de verdad.

## 6. Casos inválidos

| Caso | Resultado |
| --- | --- |
| Algún UUID de contexto está vacío | Se rechaza antes de crear el evento. |
| `ClientSequence <= 0` | Se rechaza. |
| Agregado con objetivo de reversión | No existe fábrica pública que lo permita. |
| Reversión sin objetivo, objetivo vacío o autorreferencia | Se rechaza. |
| UUID repetido con contenido distinto | El contador rechaza el conjunto. |
| Secuencia repetida en la misma estación | El contador rechaza el conjunto. |
| Objetivo ausente | El contador rechaza la reversión. |
| Dos reversos sobre el mismo agregado | El contador rechaza el segundo. |
| Reversión cambia organización/planta/línea/ciclo/cargamento | El contador rechaza la inconsistencia. |

## 7. Cinco ejemplos representativos provisionales

No hay muestras reales en el repositorio. Estos casos ficticios comprueban que
el contrato representa el flujo conocido, pero **no sustituyen** la pausa con
cuaderno/Excel.

Todos usan Línea 1 y el mismo cargamento de `La Esperanza`, iniciado a las
17:42.

| Paso | Evento | Hora local | Responsable | Secuencia | Referencia | Total derivado |
| ---: | --- | --- | --- | ---: | --- | ---: |
| 1 | `CAJUELA_ADDED` E1 | 17:59:59 | Juan | 101 | — | 1 |
| 2 | `CAJUELA_ADDED` E2 | 18:00:00 | Juan | 102 | — | 2 |
| 3 | `CAJUELA_ADDED` E3 | 18:18:00 | Marta | 103 | — | 3 |
| 4 | `CAJUELA_REVERSED` E4 | 18:18:05 | Marta | 104 | E3 | 2 |
| 5 | reintento idéntico de E2 | 18:00:00 | Juan | 102 | mismo UUID E2 | 2 |

Los pasos 1 y 2 prueban el cambio automático de jornada sin cerrar el
cargamento. El paso 3 conserva al responsable vigente después del relevo. El
paso 4 compensa sin borrar. El paso 5 demuestra idempotencia.

## 8. Evidencia automatizada

`ProductionEventTests` comprueba contexto completo, UTC, jornada derivada,
tipos/deltas, objetivo de reversión, UUID y secuencia inválidos, filtro por
línea+cargamento, reintento idéntico, conflicto de UUID, conflicto de secuencia,
objetivo ausente, doble reversión y cambio ilegal de alcance.

## 9. Pausa 2.3

La evidencia automatizada está completa. Para aprobar manualmente el mini paso
se necesita una muestra anonimizada de cinco filas del cuaderno/Excel y confirmar
que cada una puede convertirse al contrato sin inventar campos.

Mientras la empresa no entregue esa muestra, el responsable del proyecto puede
autorizar un cierre **provisional**, manteniendo esta validación como deuda antes
del cierre del Sprint 2.

**Resultado:** aprobada provisionalmente por el responsable del proyecto el
2026-08-26. La comparación con cinco registros reales permanece abierta y no se
considerará cumplida solo con los ejemplos ficticios de este documento.
