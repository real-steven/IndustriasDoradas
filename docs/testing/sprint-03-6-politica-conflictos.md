# Sprint 3.6 — Política de conflictos

Fecha de implementación y cierre: 2026-09-20. Rama: `DevHenry`.

## Comportamiento implementado

- La configuración central es autoritativa antes de aplicar cada elemento.
- Estación revocada, línea o alcance revocados, versión de permisos obsoleta y
  reloj futuro quedan en `FAILED_REVIEW` con códigos estables.
- La tolerancia de reloj es de cinco minutos y solo clasifica horas futuras;
  una cola offline antigua continúa siendo válida.
- Cada conflicto crea recibo terminal y auditoría sin insertar cargamentos,
  asignaciones ni eventos de producción.
- Los eventos centrales existentes permanecen append-only y las referencias
  históricas locales no se eliminan.
- El API permite que una estación previamente autorizada entregue elementos
  para clasificación aunque su configuración ya esté inactiva. PostgreSQL
  decide el resultado dentro de la transacción autoritativa.
- WPF conserva códigos seguros enviados por NestJS en rechazos HTTP para que
  la revisión no termine como `HTTP_CLIENT_REJECTION` genérico.

## Cambio de base de datos

La migración aplicada al Supabase compartido es:

`20260920173623_sync_conflict_policy.sql`

La migración mantiene las funciones en el esquema privado `app`, usa
`security invoker` y concede ejecución únicamente a `service_role`.
`supabase migration list` confirmó las once migraciones alineadas.

## Verificación automática

- 11 pruebas SQL aprobadas desde una base vacía, incluido un lote con estación
  revocada, línea revocada, reloj futuro, versión obsoleta y elemento válido.
- 79 pruebas unitarias de API aprobadas.
- 21 pruebas E2E de API aprobadas.
- 123 pruebas desktop aprobadas.
- Build de NestJS, ESLint, Prettier y `dotnet format` aprobados.

## Resultado de la pausa manual

La validación manual fue aprobada con la Línea ficticia 1:

1. Con la API detenida y la línea desactivada centralmente, una cajuela local
   pasó de pendiente a revisión al recuperar conexión: revisión aumentó de 30
   a 31.
2. Después de reactivar la línea, una nueva cajuela sincronizó correctamente:
   sincronizados aumentó de 18 a 19.
3. El rechazo anterior permaneció en revisión y no desapareció ni se convirtió
   en sincronizado.
4. Al desactivar la Línea 1 seleccionada, la interfaz mostró automáticamente
   Línea 2; al reactivarla volvió a Línea 1. El dato no invalida 3.6 y queda
   registrado como entrada obligatoria de diseño para 3.7.

Los asesores de Supabase no detectaron una exposición nueva por esta migración.
Persisten avisos generales previos: [protección de contraseñas
filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
desactivada y [tablas privadas con RLS sin
políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
`app.sync_changes` continúa sin acceso de clientes y solo el backend con
`service_role` consulta el feed.

No se hizo push ni merge de Git.
