# Dominio de asistencia — Sprint 6.3

**Estado:** dominio y persistencia local/central implementados
**Fecha:** 2026-10-15
**Persistencia:** paso 6.4 completado; UI y sincronización central continúan en 6.5 y 6.7

## Reglas confirmadas

1. El trabajador selecciona su perfil y registra su propia entrada o salida
   desde Modo Operación, sin cuenta ni contraseña.
2. Cada marca conserva hora de ocurrencia, hora de registro y, cuando exista,
   confirmación central. Se almacena en UTC y se presenta en
   `America/Costa_Rica`.
3. La planta opera continuamente. Medianoche no cierra ni divide una jornada;
   su fecha de referencia es la fecha local del check-in.
4. Check-in sin check-out es una jornada abierta. No equivale a cero horas ni
   produce una estimación de pago final.
5. Una jornada abierta durante más de ocho horas genera una incidencia visible.
   No se cierra automáticamente.
6. Por ahora, el jefe de planta corrige olvidos mediante elevación temporal,
   motivo obligatorio y un evento compensatorio. La marca original permanece.
7. La duración se deriva de las marcas válidas con precisión de minuto y no es
   un campo editable.
8. El MVP no captura fotografías ni biometría.

## Eventos

| Tipo | Origen | Propósito |
|---|---|---|
| `CHECK_IN` | Trabajador en Modo Operación | Abre una jornada. |
| `CHECK_OUT` | Trabajador en Modo Operación | Cierra la jornada abierta. |
| `ADJUSTED_CHECK_IN` | Jefe de planta elevado | Compensa una entrada omitida. |
| `ADJUSTED_CHECK_OUT` | Jefe de planta elevado | Compensa una salida omitida y puede cerrar una jornada abierta. |

Todos llevan UUID cliente, organización, planta, estación, trabajador,
secuencia de estación, `occurred_at`, `recorded_at`, `confirmed_at` opcional y
estado de sincronización. Los ajustes agregan actor, motivo y evento relacionado.

La secuencia y el UUID soportan idempotencia. El mismo UUID con contenido
distinto o la misma secuencia de estación asignada a eventos diferentes es un
conflicto, nunca una segunda marca válida.

## Jornadas e incidencias derivadas

La proyección ordena marcas por hora de ocurrencia y secuencia, sin reescribir
eventos:

- una entrada seguida de salida produce una jornada completa;
- una segunda entrada con otra abierta produce `DUPLICATE_CHECK_IN`;
- una salida sin entrada produce `CHECK_OUT_WITHOUT_CHECK_IN`;
- una entrada abierta durante más de ocho horas produce
  `OPEN_SHIFT_EXCEEDED`;
- un ajuste tardío se coloca por su hora real de ocurrencia, mientras su hora de
  registro conserva cuándo y quién corrigió.

Perfiles `PROVISIONAL` y `PROVISIONAL_VENCIDO` pueden originar eventos. Una
proyección nunca descarta horas por un cambio posterior de estado, rechazo o
fusión del trabajador; la referencia persistente apunta al UUID estable del
trabajador y se restringe por organización.

## Tarifa configurable y estimación

La tarifa no vive dentro del evento de asistencia. Cada trabajador puede tener
versiones de política con fecha de vigencia:

- tarifa regular por hora;
- multiplicador nocturno;
- vigencia desde una fecha/hora.

La referencia inicial divide cada jornada completa en:

- regular: 06:00 inclusive a 18:00 exclusiva;
- nocturna: 18:00 inclusive a 06:00 exclusiva;
- tarifa nocturna: tarifa regular del trabajador multiplicada por 1,5.

Así, una persona puede usar ₡1.500 por hora regular y otra una tarifa mayor sin
alterar eventos ni recalcular historia con una tarifa nueva. El paso de
persistencia deberá versionar cambios de tarifa y seleccionar la versión vigente
para cada tramo.

El resultado es una **estimación bruta**. No incluye descansos, horas extra por
duración, feriados, deducciones, impuestos, salario final ni comprobante de
pago. Jornadas abiertas e incidencias no se convierten silenciosamente en cero.

## Persistencia y seguridad

- PostgreSQL conserva eventos y versiones de tarifa en `app`, con RLS,
  privilegios exclusivos para el backend, FK compuestas por organización e
  índices para trabajador, planta, estación y relaciones de ajuste.
- SQLite conserva marcas locales y las agrega al outbox dentro de una misma
  transacción inmediata. Un fallo del outbox revierte también la marca.
- Eventos y tarifas son append-only. Una corrección es otra marca relacionada,
  con perfil de jefe y motivo; no se permiten `UPDATE` ni `DELETE`.
- El mismo UUID con igual contenido es un reintento idempotente. Con contenido
  distinto se rechaza.
- La tarifa solo se guarda centralmente; el desktop no replica información
  gerencial sensible de pago.
- Los permisos `attendance.record`, `attendance.correct`, `attendance.read` y
  `attendance.pay_rates.*` separan operación de planta y consulta gerencial.
  Los endpoints que los consumen se incorporan junto al contrato de sync y los
  read models en 6.7–6.9.

## Implementación de referencia

- `Domain/Attendance/AttendanceEvent.cs`: contrato inmutable del evento.
- `Domain/Attendance/AttendanceProjection.cs`: jornadas e incidencias.
- `Domain/Attendance/WorkerPayPolicy.cs`: tarifa versionada y división de
  minutos regulares/nocturnos.
- `Domain/AttendanceDomainTests.cs`: dataset pequeño exigido por la pausa 6.3.
- `016_attendance_persistence.sql`: tabla local y protección append-only.
- `SqliteAttendanceRepository.cs`: persistencia atómica de marca + outbox.
- `20261015123903_sprint_6_4_attendance_persistence.sql`: tablas centrales,
  permisos, RLS y tarifas versionadas.

Todavía no existen controles reales de UI ni ingestión central del evento de
asistencia. Esos elementos corresponden a 6.5 y 6.7.
