# Portal web React

Portal React con Supabase Auth y una experiencia gerencial orientada a datos
para `JEFE_EMPRESA`. La navegación vigente separa Resumen, Operación, Oro,
Cargamentos y Auditoría. Estadísticas, Trabajadores, Reportes, Inventario y
Configuración permanecen visibles como módulos futuros, sin acciones falsas.

El MVP no ofrece gobierno de administradores ni delegación de permisos. La
arquitectura puede admitir más cuentas gerenciales en el futuro, pero la
experiencia actual corresponde a Lucía como única usuaria funcional.

El oro es un resultado opcional por cargamento cerrado desde la puesta en
marcha. Vacío significa no registrado y nunca se interpreta como cero. No se
modelan custodia, entrega, existencia acumulada ni carga histórica. Las
comparaciones futuras por proveedor deberán indicar la cobertura de cargamentos
con resultado registrado.

La estructura visual no presenta cifras ficticias. Operación y cargamentos se
conectarán cuando la sincronización central proyecte datos completos entre
estaciones; Auditoría conserva su consulta real a la API.

## Ejecutar

Primero inicia la API en el puerto 3000. Después, desde otra terminal situada en
la raíz del repositorio:

```powershell
pnpm.cmd --filter @industrias-doradas/web dev
```

Abre `http://localhost:5173/login`. El servidor de desarrollo redirige las
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
| `react-router-dom` | Declarar la navegación gerencial y la ruta de estado. |
| `@tanstack/react-query` | Gestionar consultas de API, caché, reintentos y actualización. |
| `@supabase/supabase-js` | Login, sesión, refresh y recuperación de contraseña. |

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

## Variables y secretos

`.env.example` documenta URL del API, URL Supabase y clave publicable. Todo
valor `VITE_*` queda visible en el navegador; nunca debe contener
`SUPABASE_SECRET_KEY`, `service_role` ni otro secreto administrativo. Web no
consulta tablas Supabase: después de Auth, envía el access token a Nest.
