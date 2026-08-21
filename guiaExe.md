# Guía rápida de instalación y compilación

1. API NestJS
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd --filter @industrias-doradas/api start:dev
API: http://localhost:3000
Swagger: http://localhost:3000/api/docs


2. Web React
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd --filter @industrias-doradas/web dev
Web: http://localhost:5173/login


3. Desktop WPF
cd C:\Users\titen\IndustriasDoradas
$env:DOTNET_ENVIRONMENT="Development"
dotnet run --project apps/desktop/src/IndustriasDoradas.Desktop/IndustriasDoradas.Desktop.csproj


## 7. Comandos rápidos de calidad y seguridad

Ejecuta los comandos desde `C:\Users\titen\IndustriasDoradas`.

| Comando | Qué hace |
| --- | --- |
| `pnpm.cmd run secrets:check` | Busca posibles secretos o claves privadas versionadas. |
| `pnpm.cmd run format:check` | Comprueba el formato sin cambiar archivos. |
| `pnpm.cmd run format` | Corrige automáticamente el formato. |
| `pnpm.cmd run lint` | Revisa problemas de TypeScript y .NET. |
| `pnpm.cmd run build` | Compila API, web y desktop. |
| `pnpm.cmd test` | Ejecuta todas las pruebas. |
| `pnpm.cmd run verify` | Ejecuta secretos, formato, lint, build y pruebas. |

Comprobación recomendada antes de compartir cambios:

```powershell
pnpm.cmd run verify
```

## ¿Para qué sirve `secrets:check`?

Revisa los archivos del proyecto buscando señales de credenciales peligrosas,
por ejemplo:

- Claves privadas.
- Claves secretas de Supabase.
- Una `SUPABASE_SERVICE_ROLE_KEY` escrita accidentalmente en el repositorio.

Si encuentra algo sospechoso, el comando falla para evitar que la información se
comparta en Git. No reemplaza una revisión humana, pero funciona como una alarma
rápida antes de hacer commit o push.
