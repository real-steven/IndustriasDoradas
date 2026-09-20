# Sprint 3.5 — Pull incremental de configuración

Fecha de implementación local: 2026-09-19. Rama: `DevHenry`.

## Comportamiento implementado

- PostgreSQL mantiene `app.sync_changes` como feed append-only con secuencia
  global, versión, acción, hora central y payload autoritativo.
- La migración agrega triggers y bootstrap para proveedores, trabajadores,
  líneas, componentes, estaciones, alcances, cargamentos y asignaciones.
- NestJS expone `GET .../sync/changes` con cursor opaco, límite máximo de 100,
  filtrado por organización/planta/estación y autorización vigente.
- `GET .../sync/signal` usa SSE para anunciar que hay cambios. La señal no
  contiene datos de negocio; WPF siempre obtiene la página por el endpoint pull.
- WPF guarda cursor, entidad/versiones, cambios aplicados y conflictos de
  contenido. Una página y su cursor se confirman en una sola transacción.
- Proveedores, trabajadores, líneas, cargamentos y asignaciones actualizan las
  proyecciones operativas existentes. Componentes, estaciones y alcances se
  conservan además en el caché genérico versionado para su uso posterior.
- `DEACTIVATE` inactiva la proyección sin borrar referencias históricas.
- La misma versión con contenido distinto queda en `sync_pull_reviews`.
- El worker vacía páginas consecutivas, escucha la señal SSE y mantiene polling
  cada 30 segundos como respaldo.
- `CORRECTION_APPENDED` está admitido por contrato y caché. El productor central
  se agregará cuando exista la entidad de corrección administrativa de 3.6.

## Verificación automática

- 122 pruebas desktop aprobadas, incluida la señal SSE y el rollback de cursor.
- 79 pruebas API aprobadas, incluida la señal sin contenido de negocio.
- 10 pruebas SQL aprobadas desde una base vacía, con seed repetido.
- Compilaciones API y desktop sin errores.

## Estado del Supabase compartido

La consulta MCP de solo lectura mostró que el proyecto
`ebwedyowyluxjfpdipex` llega hasta `20260916035845_sync_receipt_concurrency`.
No se aplicaron cambios remotos. Antes de una prueba real deben aplicarse, en
orden, estas migraciones revisadas:

1. `20260919205346_sync_ingestion_error_recovery.sql`.
2. `20260920013000_sync_incremental_pull.sql`.

## Pruebas manuales disponibles ahora

Sin modificar Supabase se puede comprobar:

1. Abrir la aplicación compilada y confirmar que la migración SQLite 008 inicia
   sin perder el total, la sesión o la Outbox anterior.
2. Desconectar Internet, registrar cajuelas, cerrar y abrir WPF. El total y los
   estados locales deben conservarse.
3. En **Diagnóstico**, comprobar que API no disponible no bloquea el guardado
   local y que pendientes, revisión y sincronizados permanecen separados.
4. Restaurar Internet. Mientras las migraciones remotas sigan pendientes, el
   pull puede recibir error del API, pero WPF debe continuar operando y el
   cursor local no debe avanzar.

Después de aplicar las migraciones centrales:

1. Iniciar sesión y esperar el bootstrap. Reiniciar WPF y confirmar que la
   segunda ejecución continúa desde el cursor sin duplicar catálogos.
2. Crear suficientes cambios para dos páginas; cerrar WPF entre páginas y
   comprobar que retoma la página pendiente.
3. Desactivar un proveedor, trabajador o línea desde la administración central.
   La señal debe adelantar el pull; el elemento deja de estar disponible para
   nuevas selecciones, pero las operaciones históricas conservan nombre e ID.
4. Cortar la red durante una página y restaurarla. Ningún cambio parcial ni
   cursor adelantado debe quedar en SQLite.

No se hizo push, merge ni migración remota.
