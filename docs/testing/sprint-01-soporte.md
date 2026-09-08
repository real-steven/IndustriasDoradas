# Soporte y diagnóstico — Sprint 1

## Flujo esperado

Supabase Auth entrega un token al web o desktop. El cliente lo envía a NestJS;
la API valida el token, vuelve a cargar perfil/rol/organización desde `app` y
recién entonces consulta o modifica datos. React nunca usa el secreto ni las
tablas funcionales. Desktop solo conserva la autorización offline protegida
por DPAPI durante un máximo de 24 horas.

## Diagnóstico rápido

### `401 Invalid or expired access token`

1. Inicia sesión otra vez y usa el `access_token`, no la clave publicable ni el
   refresh token.
2. Comprueba que API y cliente apuntan al mismo proyecto Supabase.
3. Revisa reloj/zona horaria del equipo y que el token no haya expirado.
4. Reinicia la API después de cambiar `.env.local`.
5. No pegues el token en URL, capturas, Git ni reportes de soporte.

### `403`

Comprueba que el perfil existe, está `ACTIVE`, su rol está activo y la
organización de la ruta coincide. Para desktop confirma además que la cuenta es
`JEFE_PLANTA` y mantiene una asignación activa a la estación. Un `403` en
`/gerencia` para `ADMINISTRADOR` es correcto. `JEFE_EMPRESA` administra desde
`/gerencia/administracion`; `/administracion` permanece como raíz de las
cuentas administrativas. En estas últimas, confirma también que la concesión
individual requerida esté activa.

### PIN bloqueado o reset requerido

Cinco fallos dentro de 15 minutos bloquean solamente la elevación por 15
minutos. Un segundo bloqueo dentro de 24 horas exige contraseña completa online
o reset administrativo. Modo Operación debe seguir disponible. Nunca se envía
ni recupera el PIN por correo.

### Desktop no continúa offline

Debe existir una validación online previa, el estado protegido debe pertenecer
al mismo usuario/equipo Windows y `offlineValidUntil` debe seguir vigente. Si la
API respondió `401/403` al reconectar, la autorización se limpia de forma
intencional; los eventos pendientes se conservan.

### Web no llega a la API

En desarrollo abre Vite en `http://localhost:5173`: su proxy envía `/api` a
`http://127.0.0.1:3000`. No habilites `*` en CORS como arreglo. En un despliegue
se debe mantener mismo origen o aprobar explícitamente los orígenes.

### Contrato desactualizado

Ejecuta `pnpm.cmd run contract:generate` y después
`pnpm.cmd run contract:check`. No edites a mano
`apps/web/src/api/generated/api-client.ts` ni
`apps/desktop/src/IndustriasDoradas.Desktop/Generated/ApiClient.g.cs`.

### Migraciones o base de desarrollo

La historia esperada termina en
`20260820100224_granular_administrator_permissions`. Aplica
migraciones únicamente al proyecto Supabase de desarrollo. `demo_supervisor`
no es una migración, no es fuente funcional y no debe promoverse a producción.

### Cámara o evidencia ausente

Es el comportamiento esperado del Sprint 1. El puerto de captura devuelve
ausencia y la elevación por PIN sigue operando. No existe biometría ni captura
fotográfica productiva todavía.

## Respuesta a incidentes

1. Suspende la cuenta afectada desde el rol superior correspondiente.
2. Revoca sesiones en Supabase Auth y rota el secreto si pudo filtrarse.
3. Conserva correlación, hora, ruta y código de error; no copies credenciales.
4. Revisa auditoría por organización y actor sin intentar modificar eventos.
5. Si una estación fue comprometida, invalida su autorización, repara el equipo
   y exige una validación online antes de permitir otra contingencia.
