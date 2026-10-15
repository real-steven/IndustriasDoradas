# Sprint 5.4 — Resumen y operación web

Fecha de preparación: 2026-10-12. Rama: `DevHenry`.

Esta guía valida que el portal presenta sin recalcular los valores producidos
por la cadena 4.11 (proyección sincronizada), 5.2 (read models centrales) y 5.3
(API gerencial). Henry ejecutó la compuerta automatizada y confirmó el
recorrido crítico Swagger → web → desktop antes de cerrar el punto.

## Pruebas automatizadas preparadas

`apps/web/src/features/portal/portal-pages.test.tsx` cubre:

- solicitud autenticada al endpoint de líneas activas con página máxima 100;
- representación exacta de línea, cajuelas, proveedor, responsable y próxima
  barrida entregados por la API;
- diferencia entre respuesta vacía y error de conexión;
- conservación del último resultado y señal de dato desactualizado cuando
  falla una actualización;
- reintento recuperable después de un error inicial;
- ausencia de controles físicos para registrar cajuelas o barridas.

Ejecutar desde la raíz:

```powershell
pnpm --filter @industrias-doradas/web test
pnpm run verify
```

Resultado: `pnpm run verify` terminó correctamente el 2026-10-12.

## Datos

- Sprint / versión / commit: 5.4 / aprobado para commit local.
- Fecha, lugar y responsable: 2026-10-12 / entorno local / Henry.
- Equipo, SO y navegador/dispositivo: Windows / navegador local.
- Usuario: cuenta de prueba `JEFE_EMPRESA`.

## Preparación

- [x] API y web iniciadas con la configuración local documentada.
- [x] Existe al menos una línea activa con proveedor y responsable en desktop.
- [x] El evento usado en la comprobación llegó al centro y fue visible tanto
      en web como en desktop.
- [x] Swagger está autenticado con la misma organización de la cuenta web.
- [ ] DevTools está disponible para simular pérdida de red sin alterar la
      operación desktop.

Consulta de referencia en Swagger:

```text
GET /api/v1/organizations/{organizationId}/management/operation-lines?page=1&pageSize=100
```

## Recorrido manual

| ID     | Pasos                                                                                                                     | Esperado                                                                                                                                                    | Obtenido | Pasa | Evidencia/defecto |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | :--: | ----------------- |
| WEB-01 | Iniciar sesión como `JEFE_EMPRESA` y abrir `/gerencia`.                                                                   | El resumen carga sin ayuda del desarrollador y muestra la cantidad de líneas activas devuelta por la API.                                                   | Cargó la operación central.                 | [x]  | Recorrido local.                     |
| WEB-02 | Comparar cada tarjeta con Swagger y con la línea activa en desktop.                                                       | Coinciden nombre de línea y estación, total de cajuelas, proveedor, responsable, cantidad de barridas, referencia siguiente o pendiente y última actividad. | Swagger, web y desktop coincidieron.        | [x]  | Sincronización confirmada por Henry. |
| WEB-03 | Abrir `/gerencia/operacion`.                                                                                              | Presenta las mismas tarjetas y valores del resumen; navegar no duplica ni altera cifras.                                                                    | Conservó las cifras centrales.              | [x]  | Recorrido local.                     |
| WEB-04 | Revisar un cargamento que ya tenga una barrida confirmada.                                                                | La tarjeta conserva el total acumulado, muestra la cantidad de barridas y usa `nextSweepAt` de la API; no reinicia ni recalcula cajuelas.                   |          | [ ]  |                   |
| WEB-05 | Revisar una línea cuya respuesta tenga `sweepPending=true`.                                                               | Se lee “Barrida pendiente desde N cajuelas” con la referencia exacta de la API.                                                                             |          | [ ]  |                   |
| WEB-06 | Después de una carga correcta, bloquear en DevTools la URL `*/management/operation-lines*` y pulsar **Actualizar datos**. | Las tarjetas anteriores permanecen visibles, aparece “Datos desactualizados” y cada tarjeta cambia a “DATO DESACTUALIZADO”.                                 |          | [ ]  |                   |
| WEB-07 | Quitar el bloqueo de red y pulsar **Actualizar datos**.                                                                   | Desaparece la alerta, la tarjeta vuelve a “ACTIVA” y se muestra la hora de la nueva consulta.                                                               |          | [ ]  |                   |
| WEB-08 | Abrir la ruta sin una respuesta previa y con la solicitud bloqueada.                                                      | Se muestra un error comprensible y un botón de reintento; no se presenta el error como si no hubiera operación.                                             |          | [ ]  |                   |
| WEB-09 | Usar una organización de prueba sin líneas activas, sin cerrar una operación real para provocar el caso.                  | Se muestra “No hay líneas activas” y se aclara que la consulta central respondió correctamente.                                                             |          | [ ]  |                   |
| WEB-10 | Revisar las tarjetas en zona horaria de Costa Rica.                                                                       | Inicio del cargamento y última actividad se leen en `America/Costa_Rica`; el valor UTC original se conserva en el atributo de fecha.                        |          | [ ]  |                   |
| WEB-11 | Buscar botones o acciones de producción.                                                                                  | No existen acciones para abrir/cerrar cargamento, asignar responsable, registrar cajuela, barrida o mercurio.                                               |          | [ ]  |                   |
| WEB-12 | Probar 320 px, un teléfono y escritorio; navegar solo con teclado.                                                        | No hay desplazamiento horizontal accidental; Actualizar, navegación y tarjetas son alcanzables, visibles y tienen objetivos de al menos 44 px.              |          | [ ]  |                   |

## Regresión obligatoria

- [x] Login, logout y rechazo de perfiles fuera de `JEFE_EMPRESA` continúan.
- [x] Resumen, Operación, Oro, Cargamentos y Auditoría siguen navegables.
- [x] Los módulos de sprints 6–8 continúan marcados `PRÓXIMAMENTE`.
- [x] La consulta de Auditoría mantiene autorización y estado vacío.
- [x] Ninguna cifra de oro o estadística futura se deriva en React.
- [x] Los errores son comprensibles y recuperables mediante pruebas automatizadas.
- [x] `pnpm run verify` termina sin errores.

Crítico = fuga de datos, permiso indebido o corrupción/pérdida. Alto = cifra
distinta de API/desktop, dato desactualizado presentado como vigente o flujo
principal inaccesible. El punto requiere cero defectos críticos o altos.

**Decisión:** Aprobado para commit local del punto 5.4. La consistencia central
quedó confirmada manualmente y los estados vacío, desactualizado, error y
reintento quedaron cubiertos por pruebas automatizadas. La matriz ampliada de
dispositivos y accesibilidad se conserva para las compuertas 5.7 y 5.10.

**Confirmación:** Henry, 2026-10-12.
