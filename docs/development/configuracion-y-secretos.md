# Configuración y secretos

La aplicación distingue `development`, `test` y `production`. Los archivos del
repositorio contienen únicamente valores locales seguros o marcadores; ninguna
credencial real se versiona.

## Responsabilidad por componente

| Valor | API NestJS | Web React | Desktop WPF |
| --- | --- | --- | --- |
| URL del API | No aplica | `VITE_API_BASE_URL` | `Api__BaseUrl` o appsettings de ambiente |
| URL de Supabase | `SUPABASE_URL` | `VITE_SUPABASE_URL` para Auth futuro | No se configura todavía |
| Supabase anon key | `SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` para Auth futuro | No se configura todavía |
| Supabase service role | `SUPABASE_SERVICE_ROLE_KEY` | **Prohibida** | **Prohibida** |

La URL y `anon key` no son secretos administrativos: podrán incluirse en el
cliente web cuando se integre Supabase Auth y su seguridad dependerá de RLS y de
los permisos del API. La `service_role` evita RLS y por eso solo puede residir en
el proceso del API, preferiblemente en el gestor de secretos del proveedor.

Declarar una variable no habilita todavía una conexión productiva a Supabase.
Esa integración corresponde a un sprint posterior.

## Desarrollo

API:

```powershell
Copy-Item apps/api/.env.example apps/api/.env.local
$env:NODE_ENV = "development"
$env:PORT = "3000"
pnpm.cmd --filter @industrias-doradas/api start:dev
```

Los valores de Supabase pueden quedar sin definir mientras no exista la
integración. Si se proporcionan, el API valida URL y longitud al arrancar sin
imprimir el valor recibido.

Web:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm.cmd --filter @industrias-doradas/web dev
```

Sin archivo local, la web usa `/api` y Vite dirige esa ruta al API local. Toda
variable con prefijo `VITE_` termina dentro del JavaScript descargado por el
navegador; nunca debe contener secretos.

Desktop:

```powershell
$env:DOTNET_ENVIRONMENT = "Development"
dotnet run --project apps/desktop/src/IndustriasDoradas.Desktop/IndustriasDoradas.Desktop.csproj
```

El ambiente `Development` contiene una URL local segura. Producción no trae una
URL incorporada y exige proporcionarla externamente:

```powershell
$env:DOTNET_ENVIRONMENT = "Production"
$env:Api__BaseUrl = "https://api.example.invalid/"
```

La validación muestra el nombre y la regla incumplida, nunca tokens o claves.

## Pruebas

- API: Jest establece `NODE_ENV=test` y un puerto local.
- Web: Vitest usa `/api` de forma predeterminada y prueba configuraciones
  válidas e inválidas sin exponer el valor.
- Desktop: `appsettings.Test.json` contiene solo una URL local y timeout corto.

## Producción

- Variables y secretos se inyectan desde la plataforma de despliegue.
- No se copian `.env.local`, appsettings locales ni credenciales al artefacto.
- Se usa HTTPS para API y Supabase.
- `service_role` se concede únicamente al proceso backend y nunca se registra
  en logs, excepciones, auditoría o telemetría.
- Cada ambiente usa un proyecto o credenciales separados; pruebas no acceden a
  datos productivos.

## Rotación y respuesta a filtraciones

1. Revocar o rotar inmediatamente la clave desde Supabase o el proveedor.
2. Actualizar el gestor de secretos del API.
3. Reiniciar el despliegue y comprobar health/autenticación.
4. Revisar auditoría y alcance temporal de la exposición.
5. Eliminar el valor del historial Git si llegó a versionarse; borrar el último
   archivo no elimina el secreto del historial.
6. Documentar el incidente sin copiar la credencial comprometida.

La `anon key` también se rota si se sospecha abuso, aunque sea pública. La
rotación de `service_role` tiene prioridad porque concede acceso privilegiado.

## Archivos que jamás se versionan

- `.env`, `.env.local` y variantes con valores reales.
- Claves `service_role`, JWT secretos y tokens personales.
- Certificados o claves privadas (`.pfx`, `.p12`, `.pem`, `.key`).
- `secrets.json` y appsettings locales.
- Bases SQLite, fotografías, capturas, diagnósticos y exportaciones con datos.

Comprueba antes de revisión:

```powershell
pnpm.cmd run secrets:check
git status --short
pnpm.cmd run verify
```
