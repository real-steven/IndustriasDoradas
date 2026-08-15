# Calidad y comandos unificados

Esta guía corresponde al prompt 0.6 del Sprint 0. Todos los comandos se ejecutan
desde la raíz del repositorio y usan herramientas fijadas localmente o incluidas
en el SDK de .NET. No se requiere instalar globalmente ESLint, Prettier, NestJS,
Vite ni `dotnet-format`.

## Requisitos en Windows

- Windows 10 u 11.
- Node.js 24.19.0 LTS.
- pnpm 11.21.0. En PowerShell se recomienda escribir `pnpm.cmd`.
- .NET SDK 10.0.302 o una banda estable posterior de .NET 10 aceptada por
  `global.json`.
- Visual Studio 2026 con la carga **Desarrollo de escritorio de .NET**, o Visual
  Studio Code para API y web.

Comprueba el entorno:

```powershell
node --version
pnpm.cmd --version
dotnet --version
```

## Preparar un clon

```powershell
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd run setup
```

`setup` instala exactamente el lockfile de pnpm y restaura la solución WPF. No
actualiza versiones. Si cambia una dependencia, debe modificarse explícitamente
el manifiesto y regenerarse `pnpm-lock.yaml` como parte del mismo cambio.

## Comandos principales

| Comando | Resultado |
| --- | --- |
| `pnpm.cmd run format` | Aplica Prettier a TypeScript/configuración y `dotnet format` a WPF. |
| `pnpm.cmd run format:check` | Comprueba formato sin modificar archivos. |
| `pnpm.cmd run lint` | Ejecuta ESLint tipado y analizadores de .NET. |
| `pnpm.cmd run build` | Compila API, web y desktop en configuración Release. |
| `pnpm.cmd test` | Ejecuta pruebas unitarias/E2E de API, web y desktop. |
| `pnpm.cmd run verify` | Ejecuta formato, análisis, compilación y todas las pruebas. |

El comando normal antes de solicitar revisión es:

```powershell
pnpm.cmd run verify
```

Debe terminar con código de salida `0`. Cualquier fallo detiene la cadena y debe
corregirse antes de continuar con otro prompt.

## Qué valida cada plataforma

### API y web

- Prettier 3.9.6 comprueba un formato determinista.
- ESLint analiza TypeScript con información de tipos.
- TypeScript estricto se comprueba durante el build.
- Jest/Vitest ejecutan pruebas; el API incluye además su smoke E2E.

### Desktop

- `dotnet format` comprueba espacios, estilo y analizadores.
- Nullable, analizadores recomendados y advertencias como errores se habilitan
  centralmente en `apps/desktop/Directory.Build.props`.
- `dotnet build --configuration Release` verifica compilación determinista.
- `dotnet test` ejecuta las pruebas de ViewModels mediante Microsoft Testing
  Platform.

## Prueba deliberada de la pausa 0.6

Esta comprobación demuestra que el verificador detecta un error de formato sin
dejarlo en el repositorio:

1. Abre `apps/web/src/main.tsx`.
2. Agrega espacios innecesarios o elimina un punto y coma.
3. Ejecuta:

   ```powershell
   pnpm.cmd run format:check
   ```

4. Confirma que el comando falla y señala `apps/web/src/main.tsx`.
5. Ejecuta `pnpm.cmd run format` para corregirlo automáticamente.
6. Repite `pnpm.cmd run verify` y confirma que todo queda en verde.

Antes de aceptar la pausa, `git status --short` no debe mostrar `node_modules`,
`bin`, `obj`, `dist`, cobertura, secretos ni otros artefactos generados.

