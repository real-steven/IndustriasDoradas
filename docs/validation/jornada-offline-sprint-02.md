# Validación de jornada offline — Sprint 2.12

## Estado y alcance

La preparación técnica está implementada. La compuerta manual y la aprobación
final del Sprint 2 permanecen pendientes. La prueba usa una estación, la única
Línea 1 y SQLite sin sincronización remota. La ampliación y validación simultánea
de hasta cuatro líneas queda expresamente fuera del MVP hasta estabilizar el
piloto.

La muestra real de cuaderno/Excel aún no fue entregada. Por eso el cotejo con la
empresa sigue pendiente: esta guía no inventa columnas faltantes ni considera
una hoja simulada como aprobación empresarial.

## Evidencia automatizada

`OfflineShiftPreservesTwoShipmentsReliefs120CajuelasReversalsAndRestarts`
ejecuta y contrasta, evento por evento, este escenario reproducible:

| Elemento | Resultado esperado |
| --- | ---: |
| Línea | 1 |
| Cargamentos | 2 |
| Responsables distintos | 3 |
| Cajuelas agregadas | 120 |
| Reversos inmutables | 3 |
| Eventos de producción | 123 |
| Total final cargamento A | 59 |
| Total final cargamento B | 58 |
| Cambios de responsable sin cerrar línea | 2 |
| Outbox local del escenario | 129 |
| Integridad SQLite | `ok` |

El primer cargamento comienza en jornada diurna y continúa en nocturna después
de las 18:00 de Costa Rica sin cambiar su UUID, ciclo ni línea. Los repositorios
y servicios se vuelven a crear dos veces y recuperan el contexto persistido.

## Preparación manual

La comprobación se hará **una prueba a la vez**. No se avanza hasta anotar el
resultado de la anterior.

- contar con el procedimiento autorizado para configurar el PIN individual de
  `JEFE_PLANTA` (`DT-S2-001`);
- disponer de un proveedor, tres responsables y exactamente una Línea 1 activos;
- no borrar ni reemplazar la base SQLite existente;
- anotar el número inicial de pendientes como `P0` antes del escenario oficial;
- usar un cuaderno u hoja temporal con las columnas: número manual, cargamento,
  responsable, acción, hora mostrada, total esperado, total observado y
  diferencia.

## Comprobaciones secuenciales

### C1 — Acceso y contexto inicial

1. iniciar la API y desktop;
2. abrir la estación y elevar con el PIN individual;
3. comprobar que aparecen proveedor, responsables y únicamente Línea 1;
4. entrar a `Diagnóstico`, anotar `P0` y confirmar integridad local disponible.

**Aprueba si:** la elevación es individual, los catálogos son correctos y no se
expone ningún secreto.

### C2 — Comportamiento de entrada pendiente de 2.10

En un cargamento preparatorio, probar individual, sostenida, rápida, doble
deliberada y una corrección confirmada. Anotar cada total observado. Finalizar
ese cargamento antes de tomar el nuevo valor `P0` del escenario oficial.

**Aprueba si:** auto-repeat no multiplica registros, la doble deliberada produce
dos registros, la corrección resta uno sin borrar el evento y el resultado se
entiende sin explicación técnica.

### C3 — Cargamento A y primeros 30 registros

Preparar cargamento A con responsable 1, desconectar la red y registrar del 1
al 30 en la hoja manual.

**Aprueba si:** el total termina en 30, cada acción tiene una fila y la pantalla
permanece en `Guardado local disponible`.

### C4 — Relevo sin cierre

Elevar nuevamente, seleccionar responsable 2, preparar el relevo y comprobar
que el responsable 1 sigue vigente. Confirmar y volver a Modo Operación.

**Aprueba si:** cargamento, línea y total siguen iguales; solo cambia el
responsable desde la hora de confirmación.

### C5 — Cierre inesperado y cero pérdida

Registrar del 31 al 60. Inmediatamente después del éxito del registro 60,
finalizar desktop desde el Administrador de tareas, reiniciar y pulsar
`Actualizar` en Modo Operación.

**Aprueba si:** reaparecen cargamento A, responsable 2 y total 60. No se repite
ni desaparece el último registro.

### C6 — Reverso y cierre del cargamento A

Preparar y confirmar un reverso. El total debe quedar en 59. Elevar, preparar el
cierre y comprobar que la línea aún permite registrar antes de confirmarlo;
después confirmar el cierre.

**Aprueba si:** el reverso conserva trazabilidad, el cierre solo ocurre al
confirmar y después ya no se puede registrar sobre cargamento A.

### C7 — Cargamento B, reinicio y relevo

Preparar cargamento B con responsable 3. Registrar 30 cajuelas, cerrar desktop
normalmente, reiniciar y confirmar total 30. Relevar al responsable 1 sin cerrar
el cargamento.

**Aprueba si:** el segundo cargamento tiene identidad y total independientes y
el reinicio conserva su contexto.

### C8 — Completar las 120 cajuelas y cerrar

Registrar otras 30 cajuelas en cargamento B. El total debe ser 60. Aplicar dos
reversos confirmados y comprobar 58. Finalizar cargamento B.

**Aprueba si:** se registraron exactamente 120 cajuelas entre A y B, existen
tres reversos y los totales finales son A=59 y B=58.

### C9 — Salud, copia y pendientes

Elevar, entrar a `Diagnóstico`, comprobar integridad, crear una copia consistente
y anotar la ruta. Respecto del `P0` tomado después de C2, el escenario C3–C8
agrega 129 pendientes locales.

**Aprueba si:** la base está íntegra, la copia validada existe y los pendientes
no se presentan como sincronizados ni enviados.

### C10 — Cotejo con cuaderno/Excel y compuerta

Cuando la empresa entregue la muestra, ordenar ambos registros cronológicamente
y contrastar UUID/contexto técnico contra cargamento, proveedor, responsable,
acción, hora y total manual. Toda diferencia se anota; no se corrige la base a
mano.

**Aprueba si:** hay cero diferencias y el jefe de desarrollo acepta la compuerta
del Sprint 2. Sin muestra real y sin su aprobación, el cierre sigue provisional.

## Registro de resultados

| Comprobación | Estado | Evidencia/observación |
| --- | --- | --- |
| C1 | Parcial | El 2026-08-28 se aprobó restauración automática de estación, elevación individual, indicador `Procesando` y bloqueo de botones. El catálogo continúa con cero responsables; el `seed` no crea trabajadores. Requiere solicitar responsables para la planta y refrescar antes de cerrar C1. |
| C2 | Pendiente | — |
| C3 | Pendiente | — |
| C4 | Pendiente | — |
| C5 | Pendiente | — |
| C6 | Pendiente | — |
| C7 | Pendiente | — |
| C8 | Pendiente | — |
| C9 | Pendiente | — |
| C10 | Pendiente | Requiere muestra real y aprobación del jefe de desarrollo. |
