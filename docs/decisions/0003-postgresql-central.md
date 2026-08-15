# ADR-0003: PostgreSQL central administrado por Supabase

- **Estado:** Aceptada
- **Fecha:** 2026-08-14

## Contexto

Gerencia necesita una vista consolidada y varias estaciones deben converger sin
duplicar eventos. El modelo tiene relaciones, restricciones y reportes.

## Decisión

PostgreSQL de Supabase conserva la verdad central consolidada. Migraciones y
restricciones viven en el repositorio; UUID, UTC, decimales y auditoría forman
parte de los contratos persistentes.

## Alternativas descartadas

- **Una base SQLite compartida por red:** no es adecuada para concurrencia remota
  ni operación desconectada de varias estaciones.
- **Base documental:** aporta menos valor para relaciones, restricciones y
  reportes tabulares del dominio.
- **Servidor PostgreSQL local en planta:** añade operación y recuperación sin una
  necesidad medida; puede reevaluarse si la conectividad real lo exige.

## Consecuencias

- Se obtienen integridad relacional, migraciones y consultas consolidadas.
- La nube no puede bloquear el registro local de planta.
- Respaldo, restauración, RLS y capacidad deben ensayarse antes de producción.

