# ADR-0005: NestJS como puerta de negocio

- **Estado:** Aceptada
- **Fecha:** 2026-08-14

## Contexto

Web, desktop y futuras integraciones no deben duplicar permisos ni reglas
centrales. La `service_role` puede omitir RLS y no debe llegar a clientes.

## Decisión

Toda lectura o mutación remota de negocio atraviesa NestJS. La API valida
identidad, rol, organización, estación, versión, reglas, idempotencia y auditoría.
Web y desktop no consultan directamente tablas de negocio de Supabase.

## Alternativas descartadas

- **Clientes conectados directamente a PostgreSQL/Supabase:** distribuye reglas,
  amplía superficie de acceso y arriesga exponer credenciales privilegiadas.
- **Reglas solo en RLS:** RLS protege filas, pero no reemplaza casos de uso,
  compensaciones ni auditoría de dominio.
- **Backend separado para cada cliente:** duplica lógica y contratos.

## Consecuencias

- Existe una autoridad central y auditable.
- La API puede convertirse en cuello de botella y debe observarse/escalarse.
- Desktop conserva validaciones locales para operar sin red, pero la API siempre
  revalida antes de aceptar centralmente.

