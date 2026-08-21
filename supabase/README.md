# Base central Supabase/PostgreSQL

Este directorio contiene la infraestructura SQL productiva. El archivo
`demo/esquema-demo-supervisor.sql` sigue siendo exclusivamente visual y no se
aplica como migración.

## Estructura

- `migrations/`: historial SQL ordenado e inmutable.
- `seed.sql`: catálogos y datos de desarrollo completamente ficticios.
- `tests/`: aserciones de restricciones, permisos, RLS e idempotencia.
- `demo/`: material demostrativo aislado.

## Prueba local

```powershell
pnpm.cmd run test:db
```

El runner crea PostgreSQL efímero con PGlite, agrega únicamente los
prerrequisitos que un proyecto Supabase ya proporciona (`auth.users`, `anon`,
`authenticated` y `service_role`), aplica todas las migraciones desde una base
vacía, ejecuta el seed dos veces y corre las pruebas SQL.

PGlite es una dependencia exclusiva de desarrollo. La migración no depende de
PGlite y permanece en SQL PostgreSQL/Supabase.

## Seguridad

- Las tablas viven en el esquema `app`, no en `public`.
- `anon` y `authenticated` no reciben `USAGE` ni permisos directos.
- Todas las tablas tienen RLS habilitado.
- En las tablas operativas, `service_role` recibe `SELECT`, `INSERT` y `UPDATE`,
  nunca `DELETE` físico. `app.audit_events` es una excepción append-only: solo
  permite `SELECT` e `INSERT` y un trigger también rechaza `UPDATE/DELETE` del
  propietario.
- Web y desktop no consultan estas tablas; NestJS será la única puerta remota.
- No se almacenan contraseñas, PIN claros, tokens, fotografías ni datos reales
  en migraciones o seed.

Las migraciones inicial y complementaria de índices quedaron registradas el
2026-08-17 en el proyecto Supabase de desarrollo `ebwedyowyluxjfpdipex` con las
versiones remotas `20260817182220` y `20260817202508`. El seed ficticio se
ejecutó dos veces con conteos idénticos y las pruebas comprueban que toda clave
foránea de `app` comienza por un índice utilizable. El esquema preexistente
`demo_supervisor` no forma parte de estas migraciones ni de los datos
productivos; se conserva únicamente como guía de desarrollo.

La auditoría transversal se agregó el 2026-08-18 mediante la versión remota
`20260818092950`. `tests/004_audit_trail.sql` verifica inserción segura, rechazo
de campos sensibles e inmutabilidad; la comprobación remota equivalente se
ejecutó dentro de una transacción revertida y no dejó eventos ficticios.

Los flujos transaccionales de catálogos se agregaron el 2026-08-19 mediante la
versión remota `20260819063818`. `tests/005_catalog_workflows.sql` comprueba la
solicitud provisional atómica, vencimiento no bloqueante, resolución única y
gobierno jerárquico de cuentas. La prueba remota equivalente se revirtió y no
dejó trabajadores ficticios.

El estado central de intentos de PIN se agregó el 2026-08-19 mediante la
versión remota `20260819071212`. `tests/006_station_pin_workflows.sql` valida
cinco intentos, enfriamiento de 15 minutos, segundo bloqueo en 24 horas y reset
por autenticación completa. La prueba remota se revirtió sin dejar credenciales
ficticias.

La autorización granular se agregó en desarrollo el 2026-08-20 mediante la
versión remota `20260820100224` y el archivo
`20260820100224_granular_administrator_permissions`. Introduce concesiones
individuales sin borrado, convierte `JEFE_EMPRESA` en superadministrador
dinámico y deja a cada `ADMINISTRADOR` con privilegio mínimo.
