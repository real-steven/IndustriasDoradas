# Registro local de cajuela — Sprint 2.6

**Fecha:** 2026-08-26

**Estado:** aprobado técnica y manualmente por el responsable del proyecto el
2026-08-26; autorizado para continuar con 2.7

## 1. Alcance

Este mini paso implementa `RegisterCajuela` para responder desde SQLite sin
esperar Internet. Cada pulsación válida crea un evento `CAJUELA_ADDED`, su
Outbox y actualiza un contador local reconstruible.

No agrega barridas, umbral de 50, reversión, sincronización, controlador físico
ni pantalla. Esos comportamientos corresponden a 2.7–2.10 y Sprint 3.

## 2. Identidad e idempotencia

`RegisterCajuelaHandler.CreateCommand(...)` genera un UUID y captura la hora de
la pulsación. El adaptador de entrada futuro debe conservar el mismo objeto de
comando cuando reintenta una pulsación cuya respuesta se perdió.

El UUID del comando es también `client_event_id`:

- primer intento: se guarda normalmente;
- mismo UUID, estación y hora: se devuelve el evento original y el contador
  actual sin insertar otra fila ni otra Outbox;
- mismo UUID con contenido distinto: se rechaza como conflicto.

`recorded_at` conserva la hora del primer guardado. Un reintento posterior no
reescribe el hecho ni sus horas.

## 3. Transacción local

El repositorio abre una transacción SQLite inmediata para serializar
pulsaciones concurrentes de la estación. Dentro de ella:

1. busca un evento previo con el UUID del comando;
2. exige sesión, cargamento y asignación de responsable activos;
3. calcula la siguiente secuencia monotónica de la estación;
4. crea el evento inmutable con el contexto confirmado y jornada derivada;
5. inserta el evento;
6. incrementa el read model `production_counters`;
7. inserta la Outbox `PRODUCTION_EVENT_CREATED`;
8. confirma y devuelve UUID, evento, total, duplicado y duración.

Si falla contexto, evento, contador u Outbox, la transacción completa se
revierte. La respuesta de éxito nunca se produce antes del commit local.

## 4. Read model derivable

La migración `003_production_counter_read_model` crea un contador por
`(line_id, shipment_id)` con alcance de organización, planta y ciclo. No es una
segunda verdad: la migración lo reconstruye desde los eventos existentes y las
pruebas comparan su valor con `ProductionEventCounter`.

Una pérdida del read model puede recuperarse recorriendo eventos; nunca se
modifican los eventos para hacer coincidir un total.

## 5. Secuencia y contexto

- `client_sequence` inicia en 1 y crece por estación bajo el bloqueo de
  escritura;
- el evento toma organización, planta, línea, ciclo, cargamento y responsable
  desde la sesión confirmada, no desde la tecla;
- la jornada se deriva de `occurred_at` en `America/Costa_Rica`;
- una sesión completada, un cargamento completado o una asignación ausente
  bloquean el registro;
- un relevo confirmado afecta solo pulsaciones posteriores.

## 6. Rendimiento y evidencia

El caso mide con reloj monotónico desde antes de abrir la operación SQLite hasta
después del commit. La prueba de aceptación ejecuta bases independientes con 1,
10 y 50 pulsaciones y exige para cada registro menos de 300 ms.

La suite de escritorio contiene 57 pruebas y cubre:

- 1, 10 y 50 UUID distintos;
- igualdad entre número de eventos, Outbox, contador derivado y read model;
- secuencias continuas desde 1;
- repetición del mismo comando sin duplicados;
- conflicto de UUID con contenido diferente;
- bloqueo sin contexto, después del cierre y sin asignación vigente;
- rollback de evento y contador ante un fallo simulado de Outbox;
- migración desde versión 2 que reconstruye el contador de eventos existentes;
- objetivo local menor de 300 ms por pulsación.

## 7. Pausa de aprobación

La acción aún no está conectada a la UI; las 120 pulsaciones manuales pertenecen
a los pasos de entrada y pantalla posteriores. En esta pausa debe iniciarse la
aplicación dos veces para aplicar de forma real la migración 003 y confirmar que
el segundo arranque sigue siendo idempotente. Después se inspeccionarán versión,
integridad y existencia de `production_counters` antes del commit.

**Evidencia manual y real:** la aplicación inició correctamente dos veces. La
base de la estación confirmó `integrity_check=ok`, WAL activo, cero violaciones
de claves foráneas, las tres migraciones esperadas y la tabla
`production_counters`. Eventos, Outbox de producción y contador permanecen en
cero, resultado esperado mientras `RegisterCajuela` no esté conectado a la UI.

**Resultado:** pausa 2.6 aprobada por el responsable del proyecto el 2026-08-26.
