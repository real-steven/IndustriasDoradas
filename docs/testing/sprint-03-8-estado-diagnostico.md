# Validación de Sprint 3.8 — Estado y diagnóstico

## Alcance implementado

- SQLite migra a la versión 10, registra la hora local en que acepta cada
  página pull. La pantalla compara esa hora con `serverTimeUtc` para mostrar la
  desviación del reloj.
- El estado de red proviene del último intento real de pull contra la nube. Una
  API local todavía activa no se confunde con conectividad a Supabase.
- La última sincronización combina la última recepción pull y la última
  confirmación de Outbox.
- Los elementos `FAILED_REVIEW` muestran operación, código, causa explicada,
  intentos y último intento. No se pueden resolver desde la pantalla.
- PostgreSQL convierte cada `business.mutation` exitosa, autenticada y con
  cambios seguros en una entidad `ADMINISTRATIVE_CORRECTION` del feed. No
  publica rechazos ni auditorías vacías.
- La notificación de corrección solo aparece cuando el modo jefe de planta
  permite abrir Diagnóstico. Modo Operación conserva únicamente el resumen de
  pendientes/revisión/sincronizados.
- El reporte exportado contiene conteos, códigos, horarios y cambios de
  auditoría ya filtrados. No contiene tokens, PIN, cabeceras ni payloads de
  operación.
- La aplicación se identifica como `0.3.0` y el pie muestra `Sprint 3`.

## Comandos de validación

Desde la raíz del repositorio:

```powershell
pnpm verify
pnpm test:db
pnpm test:api
pnpm test:web
pnpm test:desktop
```

Antes de aplicar la migración central:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --dry-run
```

Debe aparecer únicamente
`20260920230039_sync_diagnostics_corrections.sql`. Después de revisar el dry
run:

```powershell
npx.cmd supabase db push --linked
npx.cmd supabase migration list --linked
```

La última lista debe mostrar el mismo identificador en Local y Remote.

## Pausa manual

1. Inicia API y desktop con conexión. Entra como jefe de planta y abre
   **Diagnóstico**.
2. Confirma estación, versión `0.3.0`, red disponible, hora de última
   sincronización y una desviación horaria razonable. El pie debe decir
   `Operación local · Sprint 3`.
3. Usa un `FAILED_REVIEW` ya existente. Confirma que la pantalla muestra su
   código y causa sin abrir SQLite ni Supabase y que no ofrece botones para
   alterarlo.
4. Vuelve a Modo Operación. Diagnóstico debe quedar bloqueado y solo debe verse
   el resumen simple de sincronización.
5. Desde el portal web cambia un campo no sensible de proveedor, trabajador o
   catálogo. Sin cerrar ni reiniciar desktop, espera la sincronización, entra
   en modo jefe de planta y confirma la notificación lateral.
6. Abre la notificación. La auditoría debe mostrar administrador, rol, motivo,
   fecha y el valor anterior/nuevo. El registro original local no debe ser
   reemplazado por la corrección.
7. Pulsa **Exportar diagnóstico seguro**. Abre el JSON creado en
   `Documentos\IndustriasDoradas\Diagnostico` y confirma que no aparecen
   `token`, `authorization`, `PIN`, contraseñas ni payloads operativos.
8. Desconecta la red y actualiza Diagnóstico. Debe cambiar a “Sin conexión con
   sincronización” con un código de red, aunque la API local continúe activa;
   el guardado local y los datos ya recibidos deben seguir visibles.

La pausa queda aprobada cuando el jefe de planta puede localizar la causa de
un evento fallido usando solo la pantalla y el archivo exportado, y Modo
Operación no permite intervenir en fallos técnicos.
