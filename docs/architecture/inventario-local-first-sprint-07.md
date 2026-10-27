# Inventario local-first — Sprint 7.6

**Estado:** implementado y verificado automáticamente
**Fecha:** 2026-10-26

## Flujo local

La pantalla `Inventario` pertenece al Modo Jefe de Planta. Consulta el catálogo
SQLite activo de la organización/planta y permite registrar entrada, salida,
consumo, devolución y ajuste motivado. También permite un conteo físico parcial
del artículo seleccionado. Destino, observación y trabajador responsable son
opcionales; una entrada no asigna trabajador.

Cada movimiento se guarda junto con `INVENTORY_MOVEMENT_RECORDED` en la misma
transacción SQLite. Cada revisión guarda cabecera, línea y
`INVENTORY_REVIEW_RECORDED` de igual forma. La secuencia comparte
`station_sequence_state` con el resto de hechos de la estación. Si falla el
saldo, la precisión, una referencia o el outbox, no queda ninguna escritura
parcial.

Una revisión conserva el saldo local esperado y la cantidad física contada. No
crea movimiento ni altera el kardex; una diferencia requiere un ajuste separado
y motivado.

## Saldos y frescura

La vista presenta dos cifras distintas desde 7.7:

- **saldo local:** espejo central confirmado más movimientos del equipo que
  siguen pendientes o rechazados;
- **central conocido:** suma exclusiva de movimientos publicados por el
  servidor mediante pull.

Se muestra además la fecha central del último pull, estado reciente de red y
cantidad de hechos pendientes. La advertencia aclara que ninguna cifra puede
incluir movimientos que todavía estén offline en otra estación. No existe una
promesa de existencia global exacta mientras haya trabajo desconectado.

## Integración completada en 7.7

El worker ya reclama los mensajes de inventario. El contrato central normaliza,
ingiere y publica catálogos, movimientos y revisiones. Un rechazo central queda
visible localmente y no desaparece. La política y evidencia se describen en
[`sincronizacion-inventario-sprint-07.md`](sincronizacion-inventario-sprint-07.md).

## Evidencia

- movimiento + outbox atómicos y saldo recuperado tras recrear el repositorio;
- salida que excede el saldo revierte movimiento y outbox;
- revisión con diferencia no modifica el kardex y se sincroniza como hecho;
- navegación WPF y compilación XAML;
- regresión desktop completa de 7.7: 275 de 275 pruebas.

El catálogo ya puede poblarse por pull. La prueba visual de registrar, cerrar,
reiniciar y continuar offline queda a cargo del desarrollador antes del cierre
7.10.
