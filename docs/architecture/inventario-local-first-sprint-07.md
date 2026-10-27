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

La vista presenta dos cifras distintas:

- **saldo local:** todos los movimientos conservados en el equipo;
- **central conocido:** saldo local menos movimientos de esta estación que aún
  no fueron confirmados por el servidor.

Se muestra además la fecha central del último pull, estado reciente de red y
cantidad de hechos pendientes. La advertencia aclara que ninguna cifra puede
incluir movimientos que todavía estén offline en otra estación. No existe una
promesa de existencia global exacta mientras haya trabajo desconectado.

## Frontera con 7.7

Los mensajes de inventario quedan `PENDING` y son visibles en diagnóstico, pero
el worker no los reclama todavía. El contrato sync central de los Sprints 3–4
no conoce esos tipos; enviarlos antes de 7.7 los convertiría incorrectamente en
fallos permanentes. El siguiente paso agregará normalización, ingestión, pull de
catálogos/hechos y resolución visible de concurrencia, y entonces habilitará su
envío.

## Evidencia

- movimiento + outbox atómicos y saldo recuperado tras recrear el repositorio;
- salida que excede el saldo revierte movimiento y outbox;
- revisión con diferencia no modifica el kardex y queda pendiente para 7.7;
- navegación WPF y compilación XAML;
- regresión desktop completa: 273 de 273 pruebas.

La prueba manual de registrar, cerrar, reiniciar y continuar offline queda para
el desarrollador cuando el catálogo de la estación pueda poblarse por el pull
de 7.7 o mediante un dataset de validación controlado.
