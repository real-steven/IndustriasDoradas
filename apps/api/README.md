# API NestJS

Backend organizado como monolito modular. Contiene infraestructura transversal,
el modulo tecnico `health` y la frontera de identidad/autorizacion con Supabase;
los modulos de negocio se agregan en prompts posteriores.

## Ejecutar

Desde la raiz del repositorio, en PowerShell:

```powershell
$env:NODE_ENV = 'development'
$env:PORT = '3000'
$env:SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co'
$env:SUPABASE_SECRET_KEY = 'YOUR_BACKEND_ONLY_KEY_REPLACE_LOCALLY'
pnpm.cmd --filter @industrias-doradas/api start:dev
```

La comprobacion queda disponible en `GET http://localhost:3000/api/v1/health`.
Las rutas `GET /api/v1/auth/session` y `GET /api/v1/auth/profile` exigen el
access token de una sesion Supabase en `Authorization: Bearer <token>`.
Cada respuesta incluye `x-correlation-id`; los errores incluyen el mismo UUID
en el cuerpo para relacionar peticion, log tecnico y evento de auditoria sin
copiar credenciales.

Para verificar que la configuracion obligatoria falla de forma explicita:

```powershell
Remove-Item Env:NODE_ENV -ErrorAction Ignore
Remove-Item Env:PORT -ErrorAction Ignore
Remove-Item Env:SUPABASE_URL -ErrorAction Ignore
Remove-Item Env:SUPABASE_SECRET_KEY -ErrorAction Ignore
pnpm.cmd --filter @industrias-doradas/api start
```

## Verificar

```powershell
pnpm.cmd --filter @industrias-doradas/api lint
pnpm.cmd --filter @industrias-doradas/api build
pnpm.cmd --filter @industrias-doradas/api test
pnpm.cmd --filter @industrias-doradas/api test:e2e
```

## Dependencias

### Produccion

| Paquete | Proposito |
| --- | --- |
| `@nestjs/common` | Decoradores, contratos HTTP y utilidades base de NestJS. |
| `@nestjs/core` | Contenedor de inyeccion y ciclo de arranque de NestJS. |
| `@nestjs/platform-express` | Adaptador HTTP Express usado por la API y las pruebas smoke. |
| `@nestjs/config` | Carga centralizada y validacion de configuracion al iniciar. |
| `@supabase/supabase-js` | Consulta backend del perfil, rol y permisos en el esquema `app`. |
| `@nestjs/swagger` | Generación del contrato OpenAPI de la API. |
| `class-transformer`, `class-validator` | Transformación y validación estricta de DTO. |
| `jose` | Verifica firma JWKS y claims de los access tokens de Supabase Auth. |
| `reflect-metadata` | Metadatos requeridos por decoradores e inyeccion de dependencias. |
| `rxjs` | Primitivas reactivas requeridas por NestJS. |

### Desarrollo y pruebas

| Paquete | Proposito |
| --- | --- |
| `@nestjs/cli` | Compilar y ejecutar el proyecto con la herramienta oficial. |
| `@nestjs/testing` | Crear aplicaciones Nest aisladas para pruebas. |
| `typescript` | Compilar TypeScript estricto. |
| `eslint`, `@eslint/js`, `typescript-eslint`, `globals` | Analisis estatico con configuracion plana y reglas para TypeScript, Node y Jest. |
| `jest`, `ts-jest`, `@types/jest` | Ejecutar pruebas unitarias y compilar sus archivos TypeScript. |
| `supertest`, `@types/supertest` | Probar el contrato HTTP sin abrir un puerto real. |
| `@types/node`, `@types/express` | Tipos de Node.js y del adaptador HTTP. |

Todas las versiones estan fijadas exactamente en `package.json` y el lockfile del
workspace conserva una instalacion reproducible.

## Variables y secretos

`.env.example` documenta las variables admitidas sin credenciales reales. Los
valores locales viven en `.env.local`, ignorado por Git. `SUPABASE_SECRET_KEY`
es exclusiva del proceso backend y nunca debe copiarse a web o desktop, incluirse
en respuestas, logs o capturas. La API no necesita el secreto JWT: descubre la
clave publica rotatoria en `SUPABASE_URL/auth/v1/.well-known/jwks.json`.

El Data API del proyecto debe exponer el esquema `app` para que el cliente
backend consulte perfiles. Esto no abre las tablas a los clientes: `anon` y
`authenticated` carecen de `USAGE` y permisos, todas las tablas conservan RLS y
solo el rol interno de la clave secreta tiene acceso. `demo_supervisor` debe
permanecer fuera de los esquemas expuestos.

## Autenticacion y autorizacion

- Se valida firma asimetrica, emisor exacto, audiencia `authenticated`,
  expiracion, `session_id`, correo y sesion no anonima.
- El rol tecnico del token no decide permisos funcionales. Cada peticion carga
  `user_profiles`, rol y permisos centrales para detectar suspensiones sin
  esperar a que venza el JWT.
- `JEFE_EMPRESA` recibe todos los permisos activos. `ADMINISTRADOR` combina el
  mínimo fijo del rol con concesiones vigentes de `user_permission_grants`.
  Crear, gobernar y editar permisos administrativos son capacidades separadas;
  la delegación nunca excede los permisos del actor.
- Los guards globales niegan por defecto; solo `health` esta marcado publico.
- `RequireRoles`, `RequirePermissions` y `RequireOrganizationParam` componen las
  politicas de los futuros controladores sin confiar en IDs de organizacion del
  cliente.

## Auditoria transversal

- Los accesos protegidos aceptados y rechazados se escriben en
  `app.audit_events` mediante la API y su clave exclusiva de backend.
- `AuditTrailService.execute` registra exito solo despues de que termina la
  operacion. Si falla, registra `REJECTED` o `FAILED` sin atribuir cambios que no
  ocurrieron y vuelve a lanzar el error original.
- Cada caso de uso futuro debe declarar una lista blanca de campos escalares que
  puede auditar. PIN, contrasena, token, encabezados de autorizacion, cookies,
  fotografia y biometria se rechazan tanto en la API como en PostgreSQL.
- El repositorio de auditoria solo inserta. PostgreSQL deniega `UPDATE` y
  `DELETE` a `service_role`, mantiene RLS y agrega un trigger defensivo contra
  alteraciones aun por un propietario de tabla.
- La presencia futura de evidencia se representa solo con
  `NOT_APPLICABLE/PENDING/PRESENT/ABSENT`; el archivo, URL o fotografia nunca se
  guarda dentro del evento.

## Catálogos y trabajadores

Las rutas versionadas bajo `/api/v1/organizations/:organizationId` son
específicas por recurso, paginadas y acotadas a la organización autenticada. No
existe `DELETE`: los catálogos y trabajadores se activan o desactivan. Solicitar
un trabajador crea atómicamente solicitud y perfil provisional; a las 72 horas
pasa a `PROVISIONAL_VENCIDO` sin dejar de estar activo. Aprobar, rechazar o
fusionar exige el permiso atómico correspondiente; `JEFE_EMPRESA` siempre lo
posee y cada `ADMINISTRADOR` depende de su concesión. Todo cambio se audita.

## Gobierno de administradores

Las rutas `/api/v1/organizations/:organizationId/accounts` permiten a perfiles
autorizados invitar administradores, listar cuentas, suspender/reactivar y
reemplazar concesiones individuales. La invitación se ejecuta desde NestJS con
Supabase Auth Admin; la clave secreta nunca llega a React. Una falla durante el
aprovisionamiento deja el perfil suspendido de forma segura y auditable.

## OpenAPI

Con el API iniciado, Swagger está en `/api/docs` y el JSON en
`/api/openapi.json`. `node scripts/generate-contracts.mjs` actualiza el contrato
versionado y los clientes web/.NET; `--check` solo compara y se usa en CI. Los
archivos marcados `<auto-generated />` nunca se editan manualmente.
