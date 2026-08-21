# Guía de revisión manual — Sprint 1

Ejecuta siempre desde la raíz con el API iniciado en otra terminal. Usa datos
ficticios y la cuenta correspondiente al rol que se indica. Nunca pegues una
clave secreta en Postman, Swagger, web o desktop.

## Prompt 1.6 — API de catálogos

1. Ejecuta `pnpm.cmd --filter @industrias-doradas/api start:dev`.
2. Obtén un access token de Supabase Auth con una cuenta ficticia activa y úsalo
   como `Authorization: Bearer <token>`.
3. Lista plantas con `GET /api/v1/organizations/{organizationId}/plants?page=1&pageSize=25`.
4. Con `JEFE_EMPRESA` o un `ADMINISTRADOR` que tenga
   `organization_catalogs.manage`, crea una planta, consúltala, repite el mismo código y
   confirma `409 CATALOG_DUPLICATE`; desactívala con `PATCH .../{id}/state` y
   cuerpo `{ "active": false }`.
5. Intenta desactivar una referencia protegida y confirma un error estable sin
   borrado físico.
6. Con `JEFE_PLANTA`, crea un proveedor y solicita un trabajador con solo
   `plantId` y `name`. Confirma `PROVISIONAL`, contacto nulo y vencimiento a 72 h.
7. Con `JEFE_EMPRESA` o un `ADMINISTRADOR` con `workers.read` y
   `workers.resolve`, aprueba, rechaza o fusiona solicitudes distintas y
   confirma que una ya resuelta no puede resolverse otra vez.
8. Confirma `403` al usar otra organización o un rol sin permiso.
9. Ejecuta `pnpm.cmd run verify`.

## Prompt 1.7 — OpenAPI y clientes

1. Ejecuta `pnpm.cmd --filter @industrias-doradas/api build` y después
   `node scripts/generate-contracts.mjs`.
2. Ejecuta inmediatamente `node scripts/generate-contracts.mjs --check`; debe
   terminar con código 0 y sin indicar artefactos desactualizados.
3. Inicia el API y abre `http://localhost:3000/api/docs`; confirma seguridad
   bearer, modelos paginados y errores estables.
4. Ejecuta las pruebas web y desktop; ambas incluyen un consumo del endpoint
   tipado de sesión con transporte simulado.
5. Modifica temporalmente una copia local de un archivo generado y confirma que
   `--check` falla; regenera para restaurarlo. No edites código generado a mano.

## Prompt 1.8 — Login y estación desktop

1. Copia `apps/desktop/appsettings.Local.example.json` como
   `apps/desktop/src/IndustriasDoradas.Desktop/appsettings.Local.json` y coloca
   la URL, clave publicable y el ID ficticio de la estación; el archivo local
   está ignorado por Git.
2. Inicia API y desktop con `DOTNET_ENVIRONMENT=Development`.
3. Prueba contraseña inválida y válida de una cuenta `JEFE_PLANTA`; una cuenta
   de otro rol o sin asignación de estación debe ser rechazada.
4. Con un token recién emitido, configura el PIN una vez mediante
   `POST /api/v1/profile/pin`; no uses el PIN real en Postman compartido.
5. Eleva con PIN correcto, escribe un borrador, espera 120 segundos sin teclado
   ni ratón y confirma retorno a Modo Operación con borrador conservado. Prueba
   también el botón de salida explícita.
6. Falla cinco veces dentro de 15 minutos: solo la elevación se bloquea por 15
   minutos. Repite el bloqueo dentro de 24 horas y confirma que exige login
   completo o reset administrativo; Modo Operación sigue disponible.
7. Tras una validación online, corta red y reinicia: debe continuar hasta 24
   horas. Al revocar y reconectar, pierde autorización pero no los eventos
   pendientes.
8. Revisa que `%LOCALAPPDATA%/IndustriasDoradas/station-state.bin` no sea JSON
   legible. No debe existir fotografía ni dato biométrico.

## Prompt 1.9 — Login y administración web

1. Copia `apps/web/.env.example` a `apps/web/.env.local` y coloca URL y clave
   publicable de Supabase; nunca coloques `SUPABASE_SECRET_KEY`.
2. Inicia API y web. Prueba login inválido, recuperación y sesión vencida.
3. Con `JEFE_EMPRESA`, confirma acceso a gerencia, auditoría y al módulo
   `/gerencia/administracion` sin cerrar sesión. Confirma que el panel separa
   administradores, jefes de planta, operarios, proveedores y plantas. Entra a
   `/gerencia/administracion/administradores`, crea/invita un administrador,
   selecciona permisos por área, comprueba el ajuste uno a uno en Opciones
   avanzadas y suspéndelo con una razón real.
4. Con `ADMINISTRADOR`, confirma que solo aparecen plantas, proveedores,
   solicitudes, cuentas, auditoría o reportes expresamente concedidos;
   `/gerencia` debe responder con pantalla 403.
5. Cambia español/inglés y recarga el perfil. Prueba listas vacías, carga, 403 y
   API fuera de línea.
6. En DevTools revisa Network y el bundle: solo pueden aparecer URL y clave
   `sb_publishable_`; nunca una clave `sb_secret_`, contraseña, PIN ni foto.
7. Repite la matriz en Chrome y Safari. La parte Safari es revisión manual
   final; las rutas y permisos están automatizados en Vitest/e2e.

## Prompt 1.10 — Integración y amenaza básica

### Parte automatizada

1. Ejecuta `pnpm.cmd run verify`; debe comprobar secretos, formato, análisis,
   builds, contrato y todas las pruebas.
2. Confirma que las pruebas incluyen: JWT ausente/alterado/vencido, cuenta
   inactiva, rol incorrecto, organización ajena, estación no asignada, snapshot
   autorizado sin caché, PIN con verificador inválido, permisos web granulares y
   clientes TypeScript/.NET.
3. Ejecuta las pruebas SQL de `supabase/tests/`; deben pasar todas y dejar la
   transacción sin datos ficticios persistentes.
4. Ejecuta `pnpm.cmd run contract:check`; no debe haber diferencias generadas.

### Revisión manual final

1. Usa cuentas ficticias de `JEFE_EMPRESA`, `ADMINISTRADOR` y
   `JEFE_PLANTA`. Obtén tokens nuevos sin copiarlos a archivos ni URLs.
2. Con cada token llama a `/api/v1/auth/session` y confirma rol/organización;
   revisa además `Cache-Control: no-store`.
3. En Swagger intenta el mismo catálogo con su organización y con otro UUID:
   espera `200` y `403`, respectivamente. Ninguna respuesta debe revelar datos
   de la organización ajena.
4. Recorre web en Chrome y Safari: gerencia prioriza datos, Administración abre
   en la misma sesión y cada administrador muestra solo sus concesiones.
5. En desktop prueba login de jefe asignado, PIN válido/inválido, salida,
   inactividad de 120 segundos, reinicio offline permitido y revocación online.
6. Crea o verifica la planta, cuatro líneas configurables, un molino y tres
   rastras por línea, estación inicial y proveedores. Duplica y desactiva sin
   borrado físico; confirma consistencia al volver a listar.
7. Solicita un trabajador con nombre solamente, confirma plazo exacto de 72
   horas y que vencido no bloquea trabajo; aprueba/rechaza/fusiona con
   administrador y verifica historial.
8. Revisa auditoría: acceso, rechazo, elevación y mutación deben tener actor,
   correlación y resultado, sin token, contraseña, PIN, foto ni identificador
   Auth expuesto en el portal.
9. Revisa Network y los bundles: solo URL y clave `sb_publishable_` pueden estar
   en clientes. El secreto debe existir únicamente en el entorno de la API.
10. Registra resultado y observaciones. La compuerta del Sprint 1 permanece
    pendiente hasta aprobar esta revisión manual completa.

## Prompt 1.11 — Superadministración y permisos granulares

1. Aplica la migración `20260820100224_granular_administrator_permissions`
   únicamente en Supabase de desarrollo y ejecuta el seed idempotente.
2. Inicia sesión como `JEFE_EMPRESA`; confirma que `/auth/session` devuelve los
   permisos activos y que puede crear/editar catálogos desde la misma cuenta.
3. Desde `/gerencia/administracion`, entra al módulo de usuarios administradores
   e invita una cuenta con solo permisos de inventario. Confirma que no ve
   asistencia, catálogos ni gobierno de cuentas.
4. Añade un permiso y repite la solicitud sin renovar el JWT: debe autorizarse.
   Retíralo y confirma `403` inmediato en la solicitud siguiente.
5. Concede a un administrador `administrators.create` y
   `administrators.permissions.manage`; confirma que puede crear/delegar solo
   permisos que posee y que no puede cambiar los propios.
6. Suspende la cuenta y confirma rechazo inmediato. Revisa auditoría de alta,
   concesión, revocación y suspensión sin correo, token, PIN ni contraseña.

Consulta también
[`../security/modelo-amenazas-sprint-01.md`](../security/modelo-amenazas-sprint-01.md)
y [`sprint-01-soporte.md`](sprint-01-soporte.md).
