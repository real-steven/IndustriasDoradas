# Sprint 3.6 — Política de conflictos

Fecha de implementación local: 2026-09-20. Rama: `DevHenry`.

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

La migración pendiente para el Supabase compartido es:

`20260920173623_sync_conflict_policy.sql`

La migración mantiene las funciones en el esquema privado `app`, usa
`security invoker` y concede ejecución únicamente a `service_role`.

## Verificación automática

- 11 pruebas SQL aprobadas desde una base vacía, incluido un lote con estación
  revocada, línea revocada, reloj futuro, versión obsoleta y elemento válido.
- 79 pruebas unitarias de API aprobadas.
- 21 pruebas E2E de API aprobadas.
- 123 pruebas desktop aprobadas.
- Build de NestJS, ESLint, Prettier y `dotnet format` aprobados.

## Pausa manual

Después de aplicar la migración central:

1. Registrar una cajuela normal con estación y línea activas. Debe terminar en
   sincronizada y no en revisión.
2. Desconectar la estación antes de desactivar temporalmente la línea o su
   alcance central; registrar offline y recuperar la red. El elemento debe
   quedar en revisión con `LINE_REVOKED`, conservarse en SQLite y no aumentar
   el total central.
3. Reactivar la línea, renovar la autorización y registrar otra cajuela. El
   nuevo elemento debe sincronizar sin cambiar el elemento anterior.
4. Para estación revocada y reloj desviado se recomienda usar la prueba SQL
   automatizada o un entorno de prueba separado; no alterar la estación ni el
   reloj de una jornada real.
5. Confirmar que el contador local y los eventos históricos siguen visibles y
   que no queda ningún elemento en `SYNCING`.

No se hizo push, merge ni aplicación remota de la migración 3.6.
