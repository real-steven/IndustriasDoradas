# Integración continua

El workflow `.github/workflows/ci.yml` valida la base del Sprint 0 sin desplegar
ni utilizar credenciales productivas.

## Cuándo se ejecuta

- Push a `main` o `DevSteven`.
- Pull request dirigido a `main` o `DevSteven`.
- Ejecución manual mediante **Actions > CI > Run workflow**.

Si llega un commit nuevo a la misma rama o PR, GitHub cancela la ejecución
anterior para no consumir recursos con resultados obsoletos.

## Trabajos

### API y web (Linux)

1. Instala Node.js desde `.node-version` y pnpm desde `package.json`.
2. Restaura la caché de pnpm usando `pnpm-lock.yaml`.
3. Instala con `--frozen-lockfile`.
4. Revisa secretos, formato y lint.
5. Compila API/web y ejecuta pruebas unitarias, web y E2E del API.

### Desktop WPF (Windows)

1. Instala el SDK indicado en `global.json`.
2. Restaura la caché NuGet usando `packages.lock.json`.
3. Restaura paquetes en modo bloqueado.
4. Comprueba formato y analizadores.
5. Compila en Release y ejecuta las pruebas desktop.

## Seguridad

- El token automático solo tiene permiso `contents: read`.
- Checkout no conserva credenciales en la configuración Git.
- El workflow no declara `secrets`, claves de Supabase ni ambientes de
  producción.
- No publica artefactos ni realiza despliegues.
- Los trabajos tienen un límite de 15 minutos.

## Reproducir localmente

Primero prepara el clon:

```powershell
pnpm.cmd run setup
```

Equivalente al trabajo Linux de API/web:

```powershell
pnpm.cmd run secrets:check
pnpm.cmd run format:typescript:check
pnpm.cmd run lint:typescript
pnpm.cmd run build:typescript
pnpm.cmd run test:api
pnpm.cmd run test:web
```

Equivalente al trabajo Windows de desktop:

```powershell
dotnet restore apps/desktop/IndustriasDoradas.Desktop.slnx --locked-mode
pnpm.cmd run format:dotnet:check
pnpm.cmd run lint:dotnet
pnpm.cmd run build:dotnet
pnpm.cmd run test:desktop
```

La comprobación completa local sigue siendo:

```powershell
pnpm.cmd run verify
```

## Prueba controlada de la pausa 0.8

1. Confirma primero una ejecución verde.
2. Crea una rama temporal y quita un punto y coma de un archivo TypeScript o
   introduce espacios que Prettier rechace.
3. Sube únicamente esa rama de prueba y confirma que falla **API y web (Linux)**
   en el paso de formato.
4. Corrige con `pnpm.cmd run format`, ejecuta `pnpm.cmd run verify` y vuelve a
   subir para confirmar el estado verde.
5. No mezcles el error deliberado con una rama que vaya a integrarse.

Un fallo puede reproducirse ejecutando localmente el comando exacto que aparece
en el paso rojo de GitHub Actions.

