# ADR-0006: REST/JSON y OpenAPI

- **Estado:** Aceptada
- **Fecha:** 2026-08-14

## Contexto

Los casos de uso iniciales son recursos y comandos HTTP comprensibles por web y
.NET. El equipo necesita contratos visibles y clientes comprobables.

## Decisión

NestJS publica una API REST/JSON versionada bajo `/api/v1`. OpenAPI describe
operaciones, DTO, errores y autenticación; los cambios incompatibles requieren
versionado o migración explícita.

## Alternativas descartadas

- **GraphQL:** flexibilidad innecesaria y mayor superficie de autorización para
  los recorridos actuales.
- **gRPC:** menos directo para navegador y depuración manual.
- **WebSockets como contrato principal:** no sustituyen comandos idempotentes ni
  recuperación incremental; podrán complementar notificaciones.

## Consecuencias

- Contratos fáciles de probar, documentar y consumir.
- Deben evitarse endpoints que filtren modelos de base de datos.
- La actualización casi en tiempo real necesitará polling, SSE o WebSocket como
  complemento decidido cuando se mida su necesidad.

