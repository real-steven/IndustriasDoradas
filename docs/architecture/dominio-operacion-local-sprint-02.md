# Dominio de operación local — Sprint 2.2

**Fecha:** 2026-08-26

**Estado:** implementado y aprobado para continuar con 2.3

**Fuentes:**

- `docs/requirements/linea-base-funcional-v0.1.md`
- `docs/architecture/flujo-operativo-local-sprint-02.md`

## 1. Alcance

Este mini paso implementa únicamente el dominio puro necesario para representar
un cargamento, su ciclo de alimentación, la jornada calculada y el historial de
responsables. No agrega UI, SQLite, Outbox, eventos de producción, API ni
sincronización.

El código vive bajo `Domain/Production` y no depende de WPF, red, base de datos,
reloj del sistema ni servicios externos.

## 2. Modelo

| Tipo | Responsabilidad | Datos principales |
| --- | --- | --- |
| `Shipment` | Raíz del agregado; impide separar cargamento y ciclo | UUID, proveedor, inicio UTC y ciclo único |
| `LineFeedCycle` | Mantiene línea, estado e historial de responsables | UUID, línea, inicio/fin UTC, estado y asignaciones |
| `ResponsibilityAssignment` | Representa un tramo de responsabilidad | trabajador, inicio UTC y fin UTC opcional |
| `WorkPeriodSchedule` | Clasifica un instante sin modificar el ciclo | `Day` o `Night` en `America/Costa_Rica` |

`Shipment.Start(...)` crea simultáneamente el cargamento y su único ciclo. La
línea no tiene un método de sustitución y, por ello, un cargamento no puede
moverse ni repartirse desde este agregado.

## 3. Invariantes implementadas

1. Cargamento, proveedor, línea, ciclo y responsable requieren UUID no vacío.
2. El cargamento posee un solo ciclo y ese ciclo posee una sola línea.
3. Un ciclo nace `Active` con exactamente un responsable vigente.
4. Solo existe un responsable vigente a la vez.
5. Un relevo requiere otra persona y un instante estrictamente posterior al
   inicio del responsable vigente.
6. El relevo cierra la asignación anterior, agrega la nueva y no finaliza el
   ciclo.
7. Finalizar conserva todas las asignaciones y cierra la que estaba vigente.
8. Un ciclo `Completed` no puede recibir relevos ni finalizarse otra vez.
9. El fin no puede ser anterior al inicio de la asignación vigente.
10. Todos los timestamps guardados por el dominio se normalizan a UTC.
11. La jornada es derivada: no se selecciona ni se persiste como estado mutable.
12. No existe una restricción global que impida a un trabajador responder por
    varios cargamentos o líneas.

## 4. Tabla de estados del ciclo

| Estado actual | Acción | Condición | Estado siguiente | Efecto |
| --- | --- | --- | --- | --- |
| inexistente | `Shipment.Start` | Todos los UUID son válidos | `Active` | Fija proveedor, línea, inicio y primer responsable. |
| `Active` | `RelieveResponsible` | Trabajador diferente e instante posterior | `Active` | Cierra el tramo anterior y agrega el nuevo. |
| `Active` | cambio 06:00/18:00 | Se alcanza el límite horario local | `Active` | Solo cambia el valor calculado de jornada. |
| `Active` | `CompleteFeeding` | Fin no anterior al responsable vigente | `Completed` | Cierra el tramo vigente y registra fin. |
| `Completed` | relevar o finalizar | Siempre inválido | `Completed` | Rechaza la operación sin mutar historial. |

No se modela `Draft`: preparar un cambio es un estado de interfaz. El agregado
solo recibe el cambio cuando el jefe lo confirma, preservando la atomicidad
definida en 2.1.

## 5. Jornada automática

La clasificación usa el instante absoluto y la zona fija de Costa Rica
(`UTC-06:00`, sin horario de verano):

| Hora local | Resultado |
| --- | --- |
| 05:59:59 | `Night` |
| 06:00:00 | `Day` |
| 17:59:59 | `Day` |
| 18:00:00 | `Night` |

Consultar la jornada no altera cargamento, ciclo ni responsable. El evento de
producción del paso 2.3 tomará la clasificación correspondiente a su propio
instante.

## 6. Casos inválidos cubiertos

| Caso | Resultado esperado |
| --- | --- |
| UUID obligatorio vacío | `ArgumentException` y no se crea el agregado. |
| Relevo hacia el mismo responsable | `InvalidOperationException`; conserva asignación vigente. |
| Relevo simultáneo o anterior | `ArgumentOutOfRangeException`; no crea historial ambiguo. |
| Final anterior al responsable vigente | `ArgumentOutOfRangeException`; ciclo continúa activo. |
| Relevo después de finalizar | `InvalidOperationException`; historial intacto. |
| Segundo intento de finalizar | `InvalidOperationException`; primer cierre permanece. |

## 7. Evidencia automatizada

Las pruebas de `ProductionDomainTests` cubren:

- límites exactos 06:00 y 18:00 usando instantes UTC;
- creación con una línea, un ciclo y un responsable;
- relevo con dos tramos auditables sin cierre del cargamento;
- finalización y conservación del historial;
- UUID vacíos y transiciones temporales inválidas;
- rechazo de mutaciones después del cierre;
- un mismo trabajador en dos cargamentos independientes;
- cambio automático de jornada sin mutar el ciclo.

## 8. Pausa de revisión 2.2

Antes del commit se debe comprobar con el responsable del proyecto:

1. `Active → Active` es la transición correcta para un relevo.
2. Solo `CompleteFeeding` lleva el ciclo a `Completed`.
3. La jornada de las 06:00 pertenece a diurna y la de las 18:00 a nocturna.
4. El historial final debe mostrar cada responsable con inicio y fin.
5. Un cierre en el mismo instante del inicio vigente puede aceptarse para no
   inventar una duración mínima que la empresa no ha definido.

**Resultado:** aprobada por el responsable del proyecto el 2026-08-26.

Esta pausa fue una revisión de reglas y tabla de estados; todavía no existe una
pantalla que requiera prueba visual u operativa manual.
