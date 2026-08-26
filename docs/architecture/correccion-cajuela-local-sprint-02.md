# Corrección inmediata de cajuela — Sprint 2.7

**Fecha:** 2026-08-26

**Estado:** aprobada técnica y manualmente el 2026-08-26; autorizado para
continuar con 2.8

## 1. Alcance

El caso de uso local corrige únicamente un error de digitación inmediato en un
ciclo que continúa abierto. Compensa la última `CAJUELA_ADDED` efectiva de la
línea seleccionada mediante un evento `CAJUELA_REVERSED`; nunca edita ni elimina
el evento original.

No es un flujo de corrección administrativa. Una corrección no inmediata antes
del cierre corresponde al jefe de planta mediante un caso de uso privilegiado
separado. Después del cierre corresponde a `JEFE_EMPRESA` o a un
`ADMINISTRADOR` con el permiso atómico requerido. Este manejador local no amplía
silenciosamente esas facultades.

## 2. Doble paso y vigencia

1. `PrepareAsync` localiza la última cajuela efectiva y entrega un resumen con
   UUID de objetivo, contexto operativo, total esperado, UUID de reversión y UUID
   de confirmación. Esta preparación no escribe en la base.
2. La interfaz debe mostrar ese resumen como segundo paso explícito.
3. `ConfirmAsync` vuelve a leer el contexto dentro de una transacción inmediata.
   Solo confirma si el ciclo sigue abierto, la sesión y el responsable no
   cambiaron, y el objetivo continúa siendo la última cajuela efectiva.

Si entra otra cajuela o cambia el contexto entre ambos pasos, la confirmación se
rechaza completa. El operario debe preparar de nuevo sobre el estado visible más
reciente.

El motivo es siempre `IMMEDIATE_INPUT_ERROR`. No se acepta texto libre ni un
motivo proporcionado por el llamador.

## 3. Escritura atómica y trazabilidad

La confirmación exitosa realiza en una sola transacción SQLite:

- inserción del `CAJUELA_REVERSED` con UUID y secuencia propios, apuntando al
  `CAJUELA_ADDED` original;
- decremento del contador derivable de línea y cargamento;
- auditoría en `production_event_corrections`, con objetivo, reversión, UUID de
  confirmación, motivo automático y horas de preparación/confirmación;
- inserción del mensaje Outbox con el evento compensatorio.

Un índice parcial único impide dos reversos del mismo evento. La auditoría tiene
triggers que rechazan `UPDATE` y `DELETE`, igual que los eventos de producción.
Repetir la misma confirmación devuelve el resultado existente sin duplicar
evento, auditoría, contador ni Outbox. Cualquier fallo revierte toda la mutación.

## 4. Evidencia automatizada

Las pruebas verifican:

1. preparación sin escritura y confirmación con evento, contador, auditoría y
   Outbox coherentes;
2. idempotencia de una confirmación repetida;
3. rechazo de una preparación obsoleta cuando entra una nueva cajuela;
4. bloqueo sin evento corregible, con ciclo cerrado o contexto cambiado;
5. correcciones consecutivas sobre la última cajuela efectiva restante;
6. rollback total cuando falla Outbox;
7. imposibilidad de reemplazar el motivo automático por texto libre;
8. migración nueva, actualización de bases anteriores e inmutabilidad física.

La suite de escritorio finalizó con 64 pruebas correctas y cero errores. La
verificación manual debe demostrar una corrección aceptada y otra rechazada,
comprobando que el original permanece y que la cadena objetivo → reversión →
auditoría → Outbox es completa.

## 5. Comprobación de la base real

El responsable inició correctamente la aplicación dos veces. Después, una
inspección de solo lectura confirmó:

- `integrity_check=ok` y `journal_mode=wal`;
- cuatro migraciones y una sola aplicación de
  `004_immediate_cajuela_correction`;
- tabla de auditoría, índice de reversión única y ambos triggers de
  inmutabilidad presentes;
- cero violaciones en `foreign_key_check`;
- cero reversos y auditorías, resultado esperado antes de disponer de la
  interfaz del paso 2.8.

La aceptación/rechazo funcional y la trazabilidad completa están cubiertos por
pruebas automatizadas en 2.7. La demostración manual mediante interfaz queda
unida a 2.8, cuando exista la acción visible de doble confirmación.

El responsable del proyecto aprobó la pausa técnica después de comprobar los
dos arranques y revisar esta evidencia.
