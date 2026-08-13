# Portal web React

Shell técnico del portal web. En este paso solo incluye navegación mínima y una
página de estado que consulta `GET /api/v1/health`; no contiene dashboard,
autenticación ni catálogos.

## Ejecutar

Primero inicia la API en el puerto 3000. Después, desde otra terminal situada en
la raíz del repositorio:

```powershell
pnpm.cmd --filter @industrias-doradas/web dev
```

Abre `http://localhost:5173/estado`. El servidor de desarrollo redirige las
solicitudes `/api` hacia `http://127.0.0.1:3000`, por lo que no se necesita una
configuración CORS provisional.

## Verificar

```powershell
pnpm.cmd --filter @industrias-doradas/web lint
pnpm.cmd --filter @industrias-doradas/web build
pnpm.cmd --filter @industrias-doradas/web test
```

## Dependencias

### Producción

| Paquete | Propósito |
| --- | --- |
| `react` y `react-dom` | Renderizar la interfaz y conectarla con el DOM. |
| `react-router-dom` | Declarar la navegación mínima y la ruta de estado. |
| `@tanstack/react-query` | Gestionar la consulta health, caché, reintentos y actualización. |

### Desarrollo y pruebas

| Paquete | Propósito |
| --- | --- |
| `vite` y `@vitejs/plugin-react` | Servidor de desarrollo y build optimizado de React. |
| `typescript` | Comprobación estricta de tipos. |
| `eslint`, `@eslint/js`, `typescript-eslint`, `globals` | Análisis estático de TypeScript y del entorno web. |
| `eslint-plugin-react-hooks` | Verificar el uso correcto de hooks. |
| `eslint-plugin-react-refresh` | Detectar exportaciones incompatibles con recarga rápida. |
| `vitest` y `jsdom` | Ejecutar pruebas en un DOM simulado. |
| `@testing-library/dom`, `@testing-library/react`, `@testing-library/jest-dom` | Probar la interfaz por roles y contenido accesible. |
| `@testing-library/user-event` | Simular interacciones reales, como reintentar la conexión. |
| `@types/node`, `@types/react`, `@types/react-dom` | Tipos de Node.js, React y React DOM. |

Las versiones están fijadas exactamente y se conservan en el lockfile del
workspace.
