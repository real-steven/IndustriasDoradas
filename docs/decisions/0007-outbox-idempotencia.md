# ADR-0007: Outbox e idempotencia

- **Estado:** Aceptada
- **Fecha:** 2026-08-14

## Contexto

Una respuesta perdida puede hacer que la estación reintente una operación ya
aceptada. Varias estaciones y desconexiones impiden depender de entrega exacta
una vez por transporte.

## Decisión

Cada mutación recibe un UUID generado en origen. Desktop guarda evento y Outbox
atómicamente; reintenta con retroceso hasta recibir aceptación. NestJS registra
la clave idempotente dentro de la transacción central y devuelve el resultado
previo ante duplicados. Los errores se compensan, no se borran.

## Alternativas descartadas

- **Enviar una sola vez:** pierde datos ante cortes o respuestas perdidas.
- **Sobrescribir contadores:** impide deduplicar, auditar y reconstruir.
- **Cola externa desde el inicio:** agrega infraestructura antes de comprobar que
  PostgreSQL y el worker del monolito sean insuficientes.
- **Último escritor gana para todo:** puede ocultar correcciones administrativas
  y conflictos operativos.

## Consecuencias

- Los reintentos son seguros y la trazabilidad mejora.
- Se requieren índices únicos, estados de Outbox, política de reintento y
  limpieza controlada.
- La idempotencia evita duplicados, pero no decide conflictos semánticos; esas
  políticas se detallan en Sprint 3.

