# ADR-0008: React para el portal web

- **Estado:** Aceptada
- **Fecha:** 2026-08-14

## Contexto

Gerencia y administración necesitan acceso adaptable desde computadora y móvil,
en español e inglés, sin instalar una aplicación nativa.

## Decisión

El portal usa React, TypeScript estricto y Vite. React Router organiza rutas y
TanStack Query administra estado remoto. La web consume NestJS y usa Supabase
Auth únicamente para identidad cuando se integre.

## Alternativas descartadas

- **Aplicación móvil nativa:** duplica interfaces y distribución sin ser requisito.
- **Blazor:** viable, pero el equipo ya definió TypeScript/React y su ecosistema
  web para interfaz responsive.
- **HTML sin framework:** simple al inicio, pero menos adecuado para estados,
  permisos, tablas, filtros e interacción bilingüe previstos.
- **Acceso directo a Supabase:** contradice la puerta única de negocio.

## Consecuencias

- Un único portal cubre escritorio y móvil.
- Deben probarse accesibilidad, navegadores, estados vacío/carga/error e idiomas.
- Todo valor `VITE_*` es público; ningún secreto administrativo puede incluirse.

