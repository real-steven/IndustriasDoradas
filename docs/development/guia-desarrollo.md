# Guía de desarrollo

Reúne instalación, calidad, ambientes, secretos e integración continua. Todos
los comandos parten de `C:\Users\titen\IndustriasDoradas`.

## Requisitos

- Windows 10/11.
- Node.js 24.19.0 LTS y pnpm 11.21.0.
- .NET SDK 10.0.302 o versión compatible aceptada por `global.json`.
- Visual Studio 2026 con **Desarrollo de escritorio de .NET**, o VS Code.

```powershell
node --version
pnpm.cmd --version
dotnet --version
pnpm.cmd run setup
```

`setup` instala `pnpm-lock.yaml` sin actualizarlo y restaura la solución WPF.

## Comandos principales

| Comando | Resultado |
| --- | --- |
| `pnpm.cmd run secrets:check` | Busca patrones de claves privadas y secretos. |
| `pnpm.cmd run format:check` | Comprueba formato sin modificar. |
| `pnpm.cmd run format` | Corrige formato TypeScript y .NET. |
| `pnpm.cmd run lint` | Ejecuta ESLint y analizadores .NET. |
| `pnpm.cmd run build` | Compila API, web y desktop Release. |
| `pnpm.cmd test` | Ejecuta pruebas de base, API, web, E2E y desktop. |
| `pnpm.cmd run test:db` | Aplica migraciones desde cero, repite el seed y prueba restricciones/RLS en PostgreSQL efímero. |
| `pnpm.cmd run verify` | Ejecuta secretos, formato, lint, build y pruebas. |

Antes de compartir cambios:

```powershell
pnpm.cmd run verify
git status --short
```

## Configuración por ambiente

El sistema distingue desarrollo, pruebas y producción.

### API

```powershell
Copy-Item apps/api/.env.example apps/api/.env.local
$env:NODE_ENV = "development"
$env:PORT = "3000"
pnpm.cmd --filter @industrias-doradas/api start:dev
```

Orden de carga: variables del proceso, `.env.{ambiente}.local`,
`.env.{ambiente}`, `.env.local` y `.env`.

### Web

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm.cmd --filter @industrias-doradas/web dev
```

Sin archivo local usa `/api` y el proxy hacia `127.0.0.1:3000`.

### Desktop

```powershell
$env:DOTNET_ENVIRONMENT = "Development"
dotnet run --project apps/desktop/src/IndustriasDoradas.Desktop/IndustriasDoradas.Desktop.csproj
```

Producción no incorpora la URL del API; se inyecta con `Api__BaseUrl`.

## Reglas de secretos

| Valor | API | Web | Desktop |
| --- | --- | --- | --- |
| URL/publishable key Supabase | URL en API; publishable no requerido | Público para Auth futuro | No usado todavía |
| `SUPABASE_SECRET_KEY`/`service_role` heredado | Solo gestor de secretos del API | Prohibido | Prohibido |

Toda variable `VITE_*` es visible en el navegador. Nunca se versionan `.env`,
claves privadas, `secrets.json`, appsettings locales, SQLite, fotos, diagnósticos
o datos reales.

Si una clave se filtra: revocarla, rotarla, actualizar el gestor de secretos,
reiniciar, revisar auditoría y limpiar el historial Git. Borrar solo el archivo
actual no elimina el secreto del historial.

## Integración continua

`.github/workflows/ci.yml` se ejecuta en pushes/PR de `main` y `DevSteven`, o
manualmente. Cancela ejecuciones obsoletas, usa `contents: read` y no despliega.

- **Linux:** restaura caché pnpm; revisa secretos, formato, lint, build y pruebas
  de API/web.
- **Windows:** restaura caché NuGet y lockfiles; analiza, compila y prueba WPF.

Reproducir el trabajo Linux:

```powershell
pnpm.cmd run secrets:check
pnpm.cmd run format:typescript:check
pnpm.cmd run lint:typescript
pnpm.cmd run build:typescript
pnpm.cmd run test:db
pnpm.cmd run test:api
pnpm.cmd run test:web
```

Reproducir el trabajo Windows:

```powershell
dotnet restore apps/desktop/IndustriasDoradas.Desktop.slnx --locked-mode
pnpm.cmd run format:dotnet:check
pnpm.cmd run lint:dotnet
pnpm.cmd run build:dotnet
pnpm.cmd run test:desktop
```

Un fallo de CI se reproduce ejecutando localmente el comando del paso rojo.

## Comprobaciones controladas

- Para probar formato: altera temporalmente un `.ts`, ejecuta
  `pnpm.cmd run format:check` y restaura con `pnpm.cmd run format`.
- Para probar configuración: elimina `NODE_ENV` y `PORT`; el API debe fallar
  nombrando variables, nunca valores.
- Para validar un clon: ejecuta `setup`, `verify` y abre API, web y desktop según
  README.
