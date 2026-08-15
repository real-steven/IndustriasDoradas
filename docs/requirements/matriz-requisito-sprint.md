# Matriz requisito → sprint

Fuente: `linea-base-funcional-v0.1.md`. La matriz asigna responsabilidad; no
significa que el requisito ya esté implementado.

| ID | Requisito resumido | Sprint responsable | Evidencia de aceptación prevista |
| --- | --- | ---: | --- |
| RF-01 | Identidad, cuatro roles y cuentas separadas | 1 | Matriz de permisos y accesos rechazados |
| RF-02 | Planta, líneas, componentes, estaciones y catálogos | 1 | Cuatro líneas configurables y desactivación |
| RF-03 | Cargamento y responsable antes de alimentar línea | 2 | Restricciones y recorrido operativo |
| RF-04 | Cajuelas y reversos como eventos inmutables | 2 | Registro/reverso local probado |
| RF-05 | Operación offline y sincronización sin duplicados | 3 | Pruebas de caída, reintento y convergencia |
| RF-06 | Alertas configurables 50–55 y múltiplos | 4 | Casos 49/50/55/56, reverso y siguientes múltiplos |
| RF-07 | Barridas, mercurio y oro trazables | 4 | Barrida final y consolidación por cargamento |
| RF-08 | Custodia y entrega de oro | 4–5 | Solicitud, confirmación, rechazo y discrepancia |
| RF-09 | Portal gerencial responsive bilingüe | 5 | Recorrido español/inglés en móvil y escritorio |
| RF-10 | Asistencia y horas revisables | 6 | Entrada/salida offline y ajustes auditados |
| RF-11 | Inventario sin negativos y revisiones | 7 | Kardex, restricción y revisión sin diferencias |
| RF-12 | Novedades de paro/mantenimiento/emergencia | 7 | Registro simple que puede atravesar jornada |
| RF-13 | Reportes Excel bilingües | 8 | Archivos contrastados con dataset aprobado |
| RF-14 | Auditoría de accesos y mutaciones | 1–8 | Evidencia transversal por módulo |
| RF-15 | Biometría condicionada | 6 | Política y precisión aprobadas o aplazamiento explícito |

## Fundamentos transversales

| Fundamento | Sprint | Evidencia actual |
| --- | ---: | --- |
| Línea base y glosario | 0 | `linea-base-funcional-v0.1.md` |
| Monorepo y versiones | 0 | Workspace, `global.json`, `VERSIONS.md` |
| Shell API/web/desktop | 0 | Health, página de estado y diagnóstico WPF |
| Calidad y secretos | 0 | `pnpm.cmd run verify` en verde |
| Integración continua | 0 | Jobs Linux y Windows en verde |
| Arquitectura y ADR | 0 | `docs/decisions/` y `docs/architecture/` |

Los requisitos no funcionales —seguridad, accesibilidad, rendimiento local,
UTC, decimales, recuperación y observabilidad— se verifican de forma transversal
en el sprint que introduce cada flujo y vuelven a auditarse en Sprint 8.

