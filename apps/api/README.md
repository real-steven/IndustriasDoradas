# API NestJS

Backend base del sistema, organizado como monolito modular. En este paso contiene
solo infraestructura transversal y el modulo tecnico `health`; no incluye modulos
de negocio ni conexion a Supabase.

## Ejecutar

Desde la raiz del repositorio, en PowerShell:

```powershell
$env:NODE_ENV = 'development'
$env:PORT = '3000'
pnpm.cmd --filter @industrias-doradas/api start:dev
```

La comprobacion queda disponible en `GET http://localhost:3000/api/v1/health`.

Para verificar que la configuracion obligatoria falla de forma explicita:

```powershell
Remove-Item Env:NODE_ENV -ErrorAction Ignore
Remove-Item Env:PORT -ErrorAction Ignore
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
