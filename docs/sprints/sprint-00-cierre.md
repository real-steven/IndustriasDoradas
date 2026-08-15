# Cierre del Sprint 0 — Fundamentos

**Fecha de auditoría:** 2026-08-14  
**Estado:** técnicamente listo; compuerta final pendiente de reproducción
independiente y firma.

## Evidencia obtenida

- `pnpm.cmd run setup`: correcto.
- `pnpm.cmd run verify`: correcto.
- Revisión de secretos: sin patrones detectados.
- API: 6 pruebas unitarias y 2 E2E aprobadas.
- Web: 6 pruebas aprobadas.
- Desktop: 3 pruebas aprobadas.
- Compilación .NET Release: 0 errores y 0 advertencias.
- GitHub Actions: API/web Linux y desktop Windows en verde.
- Configuración inválida del API: fallo accionable sin revelar valores.
- ADR, C4 y secuencia offline/sync documentados.

## Entregables

- Línea base funcional y glosario.
- Monorepo y política de versiones.
- Esqueleto NestJS con health.
- Shell React con estado de API.
- Shell WPF con diagnóstico.
- Comandos unificados de calidad.
- Configuración por ambiente y política de secretos.
- CI multiplataforma.
- ADR y diagramas.
- Ficha manual y matriz requisito→sprint.

## Hallazgos de la auditoría

1. El workspace usado no estaba limpio porque 0.9 y este cierre aún no tenían
   commit. Por eso la reproducción independiente definitiva sigue pendiente.
2. Las comprobaciones automáticas cubren la base técnica, pero web y WPF deben
   abrirse visualmente una vez desde el clon definitivo.
3. `guiaExe.md` fue simplificada por solicitud del responsable y se concentra en
   instalación/compilación; README conserva los comandos para levantar los tres
   componentes.
4. El SQL `supabase/demo/esquema-demo-supervisor.sql` es solo demostrativo y no
   constituye una migración productiva.

## Riesgos abiertos para Sprint 1

| Riesgo | Tratamiento |
| --- | --- |
| Matriz detallada de permisos aún no implementada | Resolver antes de endpoints de catálogos |
| Integración real con Supabase Auth pendiente | Usar ADR-0002; probar rechazo y revocación |
| RLS, migraciones productivas y aislamiento organizacional pendientes | Diseñar migración desde base vacía y pruebas reales |
| Política de eliminación/corrección administrativa pendiente | Confirmar protocolo antes de exponer acciones sensibles |
| Sesión offline y autorización de estación pendientes | Diseñar en Sprint 1 y completar en Sprint 3 |
| Datos demostrativos podrían confundirse con producción | Mantener esquema `demo_supervisor` aislado y rotulado |

## Compuerta de cierre

Para aprobar definitivamente Sprint 0:

1. Hacer commit/push de 0.9 y 0.10.
2. Confirmar GitHub Actions en verde.
3. Otro participante clona el repositorio y ejecuta:

   ```powershell
   pnpm.cmd run setup
   pnpm.cmd run verify
   ```

4. Abre API, web y desktop siguiendo README y completa PM-00-06/07.
5. El equipo explica la tabla de responsabilidades y secretos del documento de
   arquitectura.
6. Registrar nombre/fecha y aprobar la ficha manual.

Hasta completar esos puntos, Sprint 1 puede prepararse pero la compuerta formal
de Sprint 0 permanece **con observaciones**.

