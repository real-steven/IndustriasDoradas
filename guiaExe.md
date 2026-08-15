# Guía rápida de instalación y compilación

Todos los comandos están preparados para copiarse y pegarse en PowerShell desde
Windows.

## 1. Instalar lo necesario

Instala estas herramientas:

- Git.
- Node.js 24 LTS. El instalador de Node.js incluye `npm`.
- .NET SDK 10.
- Visual Studio 2026 con **Desarrollo de escritorio de .NET**, si quieres abrir
  el proyecto WPF visualmente.

Después de instalar Node.js, cierra y abre nuevamente PowerShell o Visual Studio
Code.

Comprueba Node.js y npm:

```powershell
node --version
npm.cmd --version
```

Instala la versión de pnpm utilizada por el proyecto:

```powershell
npm.cmd install --global pnpm@11.21.0
```

Comprueba las herramientas:

```powershell
pnpm.cmd --version
dotnet --version
git --version
```

> En PowerShell se usa `.cmd` para evitar el error «la ejecución de scripts está
> deshabilitada en este sistema».

## 2. Entrar al proyecto e instalar dependencias

```powershell
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd run setup
```

`setup` instala las dependencias exactas de API/web y restaura las dependencias
de desktop.

## 3. Compilar el API NestJS

```powershell
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd --filter @industrias-doradas/api build
```

Resultado compilado: `apps\api\dist`.

## 4. Compilar la web React

```powershell
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd --filter @industrias-doradas/web build
```

Resultado compilado: `apps\web\dist`.

## 5. Compilar desktop WPF

```powershell
cd C:\Users\titen\IndustriasDoradas
dotnet build apps/desktop/IndustriasDoradas.Desktop.slnx --configuration Release
```

Resultado compilado principal:
`apps\desktop\src\IndustriasDoradas.Desktop\bin\Release\net10.0-windows`.

## 6. Compilar las tres partes juntas

```powershell
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd run build
```

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
