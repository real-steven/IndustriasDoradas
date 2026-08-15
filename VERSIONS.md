# Política de versiones

## Versiones base del Sprint 0

| Herramienta | Versión del repositorio | Fuente de verdad |
|---|---:|---|
| Node.js | 24.19.0 LTS | `.node-version` y `package.json#engines` |
| npm | 11.x incluido con Node.js | Instalador de Node.js |
| pnpm | 11.21.0 | `package.json#packageManager` |
| .NET SDK | 10.0.302, con avance dentro de .NET 10 | `global.json` |
| Git | Versión estable mantenida | Entorno de desarrollo |

## Reglas

1. Node.js se mantiene en la línea LTS 24 durante el desarrollo inicial. Cambiar de versión mayor requiere validar API, web, CI y documentación.
2. Todos usan la versión exacta de pnpm declarada en `packageManager`. El archivo `pnpm-lock.yaml` se versiona y no se edita manualmente.
3. `global.json` fija el SDK mínimo probado y permite avanzar a una banda estable posterior de .NET 10; no permite versiones preliminares.
4. Las dependencias de aplicación se declararán con versiones exactas y se actualizarán mediante cambios pequeños con build, pruebas y revisión de licencia.
5. No se instalan globalmente NestJS, React, Vite, Tailwind, Supabase CLI ni bibliotecas de aplicación. Se agregan al workspace cuando corresponda.
6. Los cambios de versiones base se realizan en un único cambio coherente que actualiza estos archivos, CI y README.

## Preparación en Windows

Después de instalar Node.js 24 y .NET 10 SDK:

```powershell
npm.cmd install --global pnpm@11.21.0
pnpm.cmd --version
dotnet --version
```

Si una versión instalada no coincide, se corrige el entorno antes de generar proyectos o actualizar el lockfile.
