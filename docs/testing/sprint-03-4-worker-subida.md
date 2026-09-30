# Sprint 3.4 — Worker de subida desktop

Fecha de implementación local: 2026-09-19. Rama: `DevHenry`.

## Comportamiento implementado

- El worker se ejecuta como servicio en segundo plano y no espera desde el hilo
  de WPF.
- La migración SQLite 007 conserva la Outbox existente, asigna una secuencia
  estable por estación y mapea estados heredados a
  `PENDING/SYNCING/SYNCED/FAILED_REVIEW`.
- Cada lote se reclama dentro de una transacción inmediata con `claimId` y lease.
  Un lease vencido vuelve a `PENDING` y puede reclamarse después de reiniciar.
- `attemptCount` aumenta al reclamar para un intento de red. Los reintentos usan
  backoff exponencial limitado a cinco minutos y jitter inyectable.
- La autorización, actor y ventana offline quedan capturados con la mutación
  local. Un inicio de sesión posterior no cambia la atribución del evento.
- El cliente envía el contrato push v1 con un máximo configurable de 500
  elementos y aplica cada resultado por separado.
- `APPLIED/ALREADY_APPLIED` requieren recibo central y terminan en `SYNCED`.
  `RETRY_LATER` vuelve a `PENDING`; `FAILED_REVIEW` se conserva sin reintento.
- Red, timeout, 401, 408, 429 y 5xx son transitorios. Otros 4xx son permanentes.
  Respuestas incompletas o inválidas no confirman mensajes.
- Un error inesperado no derriba la aplicación; el lease evita que el lote quede
  bloqueado indefinidamente.
- El panel separa los estados: `PENDING/SYNCING` se muestran como pendientes,
  `FAILED_REVIEW` como elementos que requieren revisión y `SYNCED` como
  sincronizados. Un rechazo permanente ya no se presenta como si todavía fuera
  a enviarse.
- El transporte de sincronización usa lotes de 10 y un timeout propio de 30
  segundos. Las comprobaciones breves de salud de la API conservan su timeout
  independiente de 5 segundos.

## Verificación automática

- 119 pruebas desktop aprobadas, incluida la lectura separada de pendientes,
  revisión y sincronizados después de completar un lote mixto.
- Compilación Release sin advertencias.
- Casos nuevos: migración de Outbox, reclamo y secuencia, backoff determinista,
  respuesta parcial, recibo obligatorio, recuperación de lease, falta de sesión,
  429, 503, 400 y serialización del envelope HTTP.
- Las 76 pruebas de API y las 9 pruebas SQL ya validaban la contraparte del push
  antes de iniciar este punto.

## Pausa manual pendiente

La aceptación de 3.4 aún requiere ejecutar el escritorio contra un API y
PostgreSQL reales, cortar la conexión antes, durante y después de la respuesta,
cerrar el proceso con un lote `SYNCING` y confirmar recuperación sin duplicados.
También debe comprobarse visualmente que la captura de cajuelas conserva su
latencia y que la UI continúa respondiendo.

Al cerrar 3.4 no se aplicaron migraciones remotas ni se hizo push. El pull 3.5
se inició después y tiene su propia evidencia de pruebas.

## Entorno aislado para repetir la aceptación

La prueba manual completa debe ejecutarse en un Supabase local para no mezclar
eventos ficticios con el proyecto compartido. En esta máquina, al cerrar esta
revisión, no están instalados Docker ni Supabase CLI y todavía no existe
`supabase/config.toml`; por eso no se levantó ni se modificó ninguna base.

Una vez instalado Docker Desktop y con su motor en ejecución:

```powershell
npx.cmd supabase --help
npx.cmd supabase init
npx.cmd supabase start
npx.cmd supabase db reset --local
pnpm.cmd run test:db
```

`supabase start` debe ejecutarse desde la raíz del repositorio. La salida de
`supabase status` proporciona la URL local y las claves locales que se copian a
archivos `.env.local` y `appsettings.Local.json`; ambos están ignorados por Git.
Nunca se deben copiar claves del proyecto compartido a esta prueba.

El seed actual crea únicamente catálogos, estación y alcances ficticios. Antes
de probar inicio de sesión y subida desde WPF hace falta crear en el Supabase
local un usuario de Auth y su perfil/autorización de estación correspondientes.
Ese fixture de identidad se mantiene fuera del seed base hasta definirlo en un
paso específico y repetible.

La secuencia manual de aceptación es:

1. Iniciar Supabase local, restablecerlo con `db reset --local` e iniciar el API
   apuntando a la URL y clave secreta locales.
2. Iniciar el escritorio con la URL local del API y la clave publicable local.
3. Desconectar la red, registrar varias cajuelas y comprobar que aumente solo
   el contador de pendientes.
4. Cerrar y abrir WPF sin red; el total productivo y los pendientes deben
   conservarse.
5. Restaurar la red local, esperar al worker y pulsar **Actualizar**. Los
   aplicados deben pasar a sincronizados y los rechazos a requieren revisión.
6. Interrumpir el proceso durante una subida y abrirlo después de que venza el
   lease. El lote debe reintentarse sin duplicar eventos centrales.
