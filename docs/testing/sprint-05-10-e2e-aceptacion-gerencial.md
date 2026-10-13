# Sprint 5.10 — E2E y aceptación gerencial

**Estado:** aprobado el 2026-10-13. `pnpm run verify` y MAN-01 a MAN-10
terminaron correctamente; MAN-03 confirmó además que los filtros permanecen en
la URL, el detalle y el regreso al historial.

## Objetivo

Cerrar el Sprint 5 con un recorrido reproducible que compruebe la experiencia
completa de la única cuenta `JEFE_EMPRESA`, desde el acceso hasta el cierre de
sesión, sin introducir funciones administrativas ni controles físicos propios
de desktop.

## Cobertura automatizada

La prueba integrada
`apps/web/src/features/portal/manager-journey.test.tsx` usa el enrutador, el
proveedor de autenticación y la caché reales del portal. El backend simulado
conserva estado durante el recorrido para que el registro y la corrección de oro
se comporten como mutaciones consecutivas y reaparezcan en las consultas.

| ID | Comprobación | Evidencia esperada |
| --- | --- | --- |
| E2E-01 | Login gerencial | Valida sesión y abre Resumen como `JEFE_EMPRESA`. |
| E2E-02 | Resumen y operación | Muestra la línea, 260 cajuelas, proveedor y referencia de 510 cajuelas entregados por API. |
| E2E-03 | Filtros | Seleccionar proveedor genera una consulta con `supplierId` y conserva el resultado. |
| E2E-04 | Cargamento | Abre detalle con cajuelas, barrida, mercurio y cambio operativo auditado. |
| E2E-05 | Pendiente y cero válido | Empieza sin resultado y registra `{ amountGrams: 0 }`, no vacío. |
| E2E-06 | Corrección append-only | Registra `1,25 g` con motivo y conserva dos entradas auditables. |
| E2E-07 | Auditoría | Agrupa las dos mutaciones de oro bajo el cargamento y permite abrir su ficha. |
| E2E-08 | Módulos futuros | Estadísticas muestra `PRÓXIMAMENTE` sin enlaces, botones ni acciones falsas en el contenido. |
| E2E-09 | Cierre de sesión | Usa cierre local, vuelve al login y deja la caché privada vacía. |

La ausencia de oro en desktop no se simula en React: ya está protegida en su
frontera real por
`supabase/tests/016_sprint_4_11_complete_station_sync.sql` (el feed no contiene
oro) y
`apps/desktop/tests/IndustriasDoradas.Desktop.Tests/Infrastructure/LocalSqliteStorageTests.cs`
(SQLite no contiene tablas ni columnas de oro). Ambas se ejecutan dentro de
`pnpm run verify`.

## Ejecución automatizada

```powershell
pnpm --filter @industrias-doradas/web test -- manager-journey
pnpm run verify
```

## Recorrido manual de aceptación

Use un cargamento cerrado de prueba y anote sus valores antes de comenzar.

| ID | Acción | Resultado esperado |
| --- | --- | --- |
| MAN-01 | Iniciar sesión con la cuenta gerencial. | Abre Resumen sin rutas administrativas. |
| MAN-02 | Comparar Resumen y Operación con Swagger/desktop. | Línea, cargamento, proveedor, responsable, cajuelas, barridas y frescura coinciden. |
| MAN-03 | En Cargamentos combinar período, línea y proveedor; abrir la ficha. | La URL conserva filtros y el detalle corresponde al mismo cargamento. |
| MAN-04 | Revisar barridas, mercurio y tiempos del detalle. | Valores y momentos coinciden con API; ocurrido y confirmado no se mezclan. |
| MAN-05 | Abrir Oro y registrar explícitamente `0`. | Deja de aparecer pendiente, muestra `0 g` y cobertura registrada. |
| MAN-06 | Corregir el resultado a un valor distinto con motivo. | Muestra el nuevo vigente, incrementa revisiones y conserva la entrada anterior. |
| MAN-07 | Abrir Auditoría y localizar el cargamento. | Las mutaciones aparecen bajo el cargamento y su enlace abre la ficha correcta. |
| MAN-08 | Abrir Estadísticas, Trabajadores, Reportes, Inventario y Configuración. | Todos indican `PRÓXIMAMENTE`; ninguno ofrece acciones funcionales. |
| MAN-09 | Cerrar sesión y volver atrás/recargar. | No reaparecen datos privados y se solicita iniciar sesión. |
| MAN-10 | Revisar desktop tras registrar/corregir oro en web. | La operación sigue sincronizando, pero desktop no muestra ni almacena cantidades de oro. |

## Criterio de cierre

El mini-sprint se cierra cuando `pnpm run verify` pasa y Lucía completa MAN-01
a MAN-10 sin ayuda. Las pruebas en navegadores/dispositivos físicos que aún no
estén disponibles conservan la clasificación menor documentada en 5.7.
