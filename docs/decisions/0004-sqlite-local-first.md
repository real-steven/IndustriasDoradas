# ADR-0004: SQLite local-first por estación

- **Estado:** Aceptada
- **Fecha:** 2026-08-14

## Contexto

La conexión satelital puede faltar uno o dos días y registrar una cajuela debe
confirmarse en menos de 300 ms. Cerrar la aplicación o perder energía no puede
eliminar operaciones confirmadas.

## Decisión

Cada estación desktop persiste primero en SQLite. La mutación de dominio y su
entrada Outbox se guardan en la misma transacción; la interfaz confirma después
del commit local y la sincronización ocurre en segundo plano.

## Alternativas descartadas

- **Nube primero:** hace depender la producción de Internet y latencia remota.
- **Archivos JSON:** ofrecen menos garantías transaccionales, consultas y
  migraciones.
- **Servidor local desde el inicio:** aumenta instalación y soporte del piloto.

## Consecuencias

- La planta continúa offline y reinicia sin perder confirmados.
- Deben existir migraciones, respaldo, cifrado/protección del equipo y límites de
  almacenamiento local.
- Durante una desconexión no se promete simultaneidad entre estaciones, sino
  convergencia posterior.

