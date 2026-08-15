# Prueba manual — Sprint 0

## Datos

- **Sprint:** 0 — Fundamentos
- **Fecha:** 2026-08-14
- **Rama:** `DevSteven`
- **Responsable técnico:** Steven Venegas
- **Entorno revisado:** Windows, Node.js 24.19.0, pnpm 11.21.0 y .NET SDK 10.0.302
- **Estado del commit:** cambios de ADR/cierre pendientes de commit

## Preparación

- [x] Dependencias Node restauradas con `pnpm-lock.yaml` congelado.
- [x] Dependencias .NET restauradas y lockfiles NuGet válidos.
- [x] Configuración de desarrollo usa únicamente valores locales o ejemplos.
- [x] Revisión automática de secretos sin hallazgos.
- [ ] Reproducción por otro participante desde un clon que incluya 0.9 y 0.10.

## Casos

| ID | Pasos | Esperado | Obtenido | Pasa | Evidencia/defecto |
| --- | --- | --- | --- | :---: | --- |
| PM-00-01 | Ejecutar `node --version`, `pnpm.cmd --version` y `dotnet --version`. | Coinciden con versiones documentadas. | 24.19.0, 11.21.0 y 10.0.302. | Sí | Entorno local. |
| PM-00-02 | Ejecutar `pnpm.cmd run setup`. | Instala lockfile y restaura desktop sin errores. | Código de salida 0. | Sí | Auditoría 2026-08-14. |
| PM-00-03 | Ejecutar `pnpm.cmd run verify`. | Secretos, formato, lint, builds y pruebas en verde. | Código 0; 8 API, 6 web y 3 desktop aprobadas. | Sí | Auditoría 2026-08-14. |
| PM-00-04 | Eliminar `NODE_ENV` y `PORT`; iniciar API. | Falla indicando nombres faltantes sin revelar valores. | Fallo controlado con ambos nombres. | Sí | Pausa 0.7 aprobada. |
| PM-00-05 | Abrir health con API configurada. | Respuesta `status: ok`. | Validado durante el esqueleto API. | Sí | Pruebas E2E y pausa 0.3. |
| PM-00-06 | Abrir web con API activa e inactiva. | Muestra disponible/error recuperable. | Cubierto automáticamente; repetir visualmente en clon final. | Pendiente | Pausa manual final. |
| PM-00-07 | Abrir WPF con API activa e inactiva. | Diagnóstico responde y la ventana no se cierra. | Cubierto por ViewModels; repetir visualmente en clon final. | Pendiente | Pausa manual final. |
| PM-00-08 | Revisar GitHub Actions. | Linux y Windows en verde. | Ambos trabajos verdes. | Sí | Captura aportada por el responsable. |
| PM-00-09 | Explicar ADR, reglas, offline y secretos. | El equipo ubica cada responsabilidad. | Documentación lista; revisión grupal pendiente. | Pendiente | Pausa 0.9/0.10. |

## Regresión aplicable al Sprint 0

- [x] Configuración inválida produce errores recuperables y accionables.
- [x] API, web y desktop conservan sus pruebas smoke.
- [x] No se detectaron secretos ni artefactos generados como archivos fuente.
- [x] CI valida Linux y Windows.
- [ ] Otro participante ejecuta los tres componentes desde un clon definitivo.

Login, permisos funcionales, SQLite, auditoría de negocio y uso de controlador no
se marcan como regresión ejecutable porque corresponden a sprints posteriores.

**Decisión técnica provisional:** Con observaciones  
**Observaciones:** completar PM-00-06, PM-00-07 y PM-00-09 desde un clon posterior
al commit de cierre.  
**Confirmación de Gerencia/responsable:** pendiente.

