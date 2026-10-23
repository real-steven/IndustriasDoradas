# Sprint 6.10 — Piloto integral de asistencia

**Estado:** cierre técnico automatizado aprobado el 2026-10-20. La revisión
manual en la aplicación instalada queda pendiente antes de iniciar Sprint 7.

## Objetivo

Comprobar sin datos reales que una jornada de asistencia puede nacer offline,
cruzar medianoche, sobrevivir un reinicio, permanecer abierta ante una salida
olvidada, cerrarse mediante una corrección motivada, sincronizarse sin duplicar
y aparecer con el mismo total en la consulta gerencial.

La fotografía y la biometría están aplazadas y no forman parte de este piloto.

## Jornada ficticia controlada

Todas las horas visibles usan `America/Costa_Rica`; los registros se almacenan
en UTC.

| Momento local    | Acción                                                    | Resultado esperado                                                                                       |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 20 oct, 17:30    | El operario registra entrada sin red.                     | SQLite guarda la marca y el outbox en una sola transacción.                                              |
| 21 oct, 02:30    | Han transcurrido nueve horas y la aplicación se reinicia. | La entrada reaparece pendiente, la jornada sigue abierta y se genera la incidencia de más de ocho horas. |
| 21 oct, 07:15    | El operario ya salió, pero olvidó marcar.                 | El historial no inventa salida ni convierte la jornada en cero.                                          |
| 21 oct, 08:00    | El jefe registra la salida real de las 07:15 con motivo.  | Se agrega `ADJUSTED_CHECK_OUT`; la entrada original permanece.                                           |
| Al recuperar red | La estación sincroniza y otra estación recibe el cambio.  | Reintentos no duplican; ambas estaciones convergen.                                                      |
| Consulta web     | Gerencia abre Trabajadores para el 20–21 de octubre.      | Muestra 13 h 45 min, es decir 825 minutos, una jornada confirmada y el ajuste con actor y motivo.        |

La fecha de referencia permanece en el 20 de octubre, día local de la entrada,
aunque la salida ocurra al día siguiente.

## Evidencia automatizada

| ID     | Comprobación                                    | Evidencia                                                                                                                                                      |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PIL-01 | Offline, reinicio, alerta y corrección nocturna | `PilotKeepsOvernightOfflineShiftAcrossRestartAndMotivatedCorrection` reabre el repositorio dos veces y obtiene exactamente 825 minutos.                        |
| PIL-02 | Cero pérdida local                              | `SqliteAttendanceRepositoryTests` prueba transacción marca + outbox, rollback ante fallo e historial append-only.                                              |
| PIL-03 | Recuperación de red y multiestación             | `AttendanceSyncTests` aplica una jornada y corrección tras 24 horas offline; un replay no duplica y las dos bases convergen.                                   |
| PIL-04 | Total central                                   | `attendance-read-model.spec.ts` proyecta el mismo piloto nocturno en `attendance-hours-v1`: 825 minutos, cero abiertas, cero incidencias vigentes y un ajuste. |
| PIL-05 | Consulta gerencial                              | `attendance.test.tsx` conserva fecha/trabajador en URL y presenta horas, pendientes, exclusiones, autor y motivo.                                              |
| PIL-06 | Privacidad                                      | No existen cámara, captura, bucket ni URL de evidencia; la decisión está en `docs/security/decision-fotografia-asistencia.md`.                                 |
| PIL-07 | Regresión completa                              | `pnpm run verify` migra desde cero y valida DB, API, web, desktop, contratos, formato, lint y compilación.                                                     |

Comandos puntuales:

```powershell
dotnet test apps/desktop/IndustriasDoradas.Desktop.slnx --no-restore --configuration Release --filter "FullyQualifiedName~PilotKeepsOvernightOfflineShiftAcrossRestartAndMotivatedCorrection"
pnpm --filter @industrias-doradas/api exec jest src/attendance/attendance-read-model.spec.ts -t "projects the Sprint 6 overnight pilot" --runInBand
pnpm --filter @industrias-doradas/web exec vitest run src/features/attendance/attendance.test.tsx
pnpm run verify
```

## Revisión manual pendiente

Esta revisión no debe sustituirse por la automatización. Puede ejecutarse sin
cambiar el reloj del equipo; la precisión nocturna ya está cubierta por el
dataset automatizado.

| ID     | Acción                                                          | Resultado esperado                                                                                           | Estado    |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| MAN-01 | Desconectar la red y registrar una entrada.                     | La aplicación confirma guardado local y muestra la jornada abierta.                                          | Pendiente |
| MAN-02 | Cerrar y volver a abrir desktop todavía sin red.                | La marca y el trabajador continúan visibles; no aparecen cero horas.                                         | Pendiente |
| MAN-03 | Elevar Modo Jefe, completar la salida omitida e indicar motivo. | Se cierra una sola vez, conserva el motivo y no permite una segunda corrección local sobre la misma omisión. | Pendiente |
| MAN-04 | Recuperar la red y esperar sincronización automática.           | Pendientes llegan a cero sin duplicar las marcas.                                                            | Pendiente |
| MAN-05 | Abrir Trabajadores en web y filtrar por fecha y persona.        | Horas, estado y ajuste coinciden con desktop; actor y motivo son legibles.                                   | Pendiente |
| MAN-06 | Recargar web y reiniciar desktop una vez más.                   | El resultado permanece igual y no depende de pulsar otro control para actualizarse.                          | Pendiente |

## Resultado y puerta de cierre

- Pérdida o duplicación detectada por pruebas: **0**.
- Defectos críticos conocidos: **0**.
- Defectos altos conocidos: **0**.
- Fotografía/biometría: **omitida por decisión**, no simulada.
- Cálculo de pago: **fuera de esta pantalla y del piloto**.

El cierre técnico está aprobado. Sprint 6 queda en la pausa de aceptación
manual MAN-01–MAN-06; no se debe iniciar Sprint 7 hasta que el responsable haga
esa revisión o acepte expresamente diferirla.
