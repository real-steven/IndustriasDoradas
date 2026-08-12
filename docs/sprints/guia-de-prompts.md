# Cómo ejecutar los prompts y las pausas

## Regla de uso

Los prompts no se ejecutan todos juntos. Para cada mini paso:

1. Copiar un solo prompt en una tarea de desarrollo.
2. Permitir que se inspeccione el repositorio antes de editar.
3. Revisar archivos modificados, comandos y pruebas reportadas.
4. Ejecutar la pausa rápida indicada en el sprint.
5. Corregir cualquier defecto crítico/alto antes del siguiente prompt.
6. Hacer un commit pequeño y descriptivo cuando la pausa sea aprobada.

## Contrato base para todos los prompts

Cada prompt de los sprints hereda estas instrucciones:

> Trabaja en `C:\Users\titen\IndustriasDoradas`, rama `DevSteven`. Antes de editar, lee `README.md`, `docs/sprints/arquitectura-y-calidad.md`, `docs/sprints/dependencias-y-alcance.md`, el documento del sprint actual y las instrucciones del repositorio. Inspecciona el estado Git y conserva cambios ajenos. Implementa únicamente el mini paso solicitado con el diseño más simple que respete la arquitectura. No adelantes funcionalidades de prompts posteriores, no agregues dependencias sin justificar y no uses secretos reales. Añade o actualiza pruebas y documentación proporcionalmente. Ejecuta compilación, análisis y pruebas relevantes. Al finalizar informa: resultado, archivos cambiados, decisiones, comandos/pruebas, riesgos o pendientes y pasos exactos para mi pausa manual. No hagas commit ni push salvo que yo lo pida. Si falta una decisión de negocio que cambie datos o comportamiento, detente y pregúntame; no la inventes.

## Pausa rápida estándar

Después de cada prompt se comprueba:

- [ ] El cambio compila y las pruebas relevantes pasan.
- [ ] El resultado pedido puede demostrarse de forma aislada.
- [ ] No apareció funcionalidad fuera del mini paso.
- [ ] No hay secretos, artefactos generados o archivos personales en Git.
- [ ] Se registró cualquier decisión nueva en ADR/requisitos.
- [ ] El sprint anterior conserva sus pruebas en verde.

Si algo falla, se continúa en el mismo prompt/tarea hasta corregirlo. No se “compensa” un paso roto avanzando al siguiente.

## Convención de commits sugerida

`chore:` infraestructura, `docs:` documentación, `feat:` función, `fix:` corrección, `test:` pruebas, `refactor:` cambio interno sin alterar comportamiento. Un mini paso puede corresponder a uno o pocos commits coherentes.

## Cambios futuros al plan

Actualizar primero requisito/ADR, después dependencias, sprint afectado y pruebas de regresión. Si cambia un contrato de API o base de datos ya compartido, agregar migración/versionado compatible; nunca editar silenciosamente el historial.
