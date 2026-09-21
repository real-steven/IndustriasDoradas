# Validación de Sprint 3.8 — Estado y diagnóstico

Fecha de implementación y cierre: 2026-09-20. Rama: `DevHenry`.

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
- PostgreSQL convierte cada mutación exitosa, autenticada y con cambios
  auditados seguros en una entidad `ADMINISTRATIVE_CORRECTION` del feed. No
  publica rechazos ni auditorías vacías. Esto incluye catálogos, permisos y
  las demás acciones administrativas registradas por el API.
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

Las migraciones propias de 3.8 son:

- `20260920230039_sync_diagnostics_corrections.sql`;
- `20260921013125_expand_sync_administrative_corrections.sql`.

Después de revisar el dry run:

```powershell
npx.cmd supabase db push --linked
npx.cmd supabase migration list --linked
```

La última lista debe mostrar ambos identificadores en Local y Remote. El
2026-09-20 el segundo `dry-run` mostró únicamente la ampliación `20260921013125`;
se aplicó y Supabase confirmó las catorce migraciones alineadas. Una consulta
posterior verificó que la función desplegada ya no limita la publicación a una
acción concreta y que todavía descarta auditorías sin cambios.

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
5. Desde **Usuarios administradores**, abre **Editar permisos** sobre una cuenta
   administrativa de prueba distinta de la sesión actual. Anota la selección,
   cambia un permiso y guarda. Sin cerrar ni reiniciar desktop, espera la
   sincronización, entra en modo jefe de planta y confirma la notificación
   lateral. Después de validar, restaura exactamente la selección original.
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

## Resultado de la validación

La validación automática y la pausa manual quedaron aprobadas el 2026-09-20:

1. `pnpm verify` terminó correctamente antes de la validación manual.
2. Diagnóstico mostró la estación `34000000-0000-4000-8000-000000000001`,
   versión `0.3.0`, desviación de `0 s`, el pie `Sprint 3` y la causa segura de
   los 31 elementos que requieren revisión.
3. Modo Operación bloqueó Diagnóstico y conservó únicamente los conteos simples.
4. El JSON de soporte se exportó sin credenciales, PIN ni payloads operativos.
5. Una corrección controlada cambió `Proveedor ficticio 3` a
   `Proveedor ficticio 3 prueba 3.8`. Sin reiniciar desktop apareció una
   notificación con `Administración de desarrollo`, rol `ADMINISTRADOR`, motivo
   `PRUEBA_MANUAL_3_8`, fecha y valor anterior/nuevo.
6. La restauración del nombre produjo una segunda corrección append-only con
   motivo `RESTAURACION_PRUEBA_3_8`; ambas permanecieron visibles y el registro
   original no fue reescrito.
7. Al desconectar Internet, la red cambió a
   `Sin sincronización · SERVER_TEMPORARY_FAILURE`. El almacenamiento siguió
   disponible con 0 pendientes, 31 en revisión y las correcciones visibles.
8. Al reconectar Internet, el siguiente ciclo cambió automáticamente a
   `Nube disponible` y actualizó la hora de sincronización.

## Asesores posteriores a la migración

La ampliación reemplaza una función de captura; no crea tablas, claves foráneas
ni índices. Los asesores no informaron un hallazgo nuevo atribuible a 3.8.
Persisten avisos anteriores: las tablas privadas `app.sync_changes`,
`app.sync_clients` y `app.user_permission_grants` tienen RLS sin políticas de
cliente porque solo las usa el backend, y la protección de contraseñas filtradas
continúa desactivada en el proyecto de desarrollo. Los índices recién creados o
con poco tráfico permanecen sin uso medido; no se eliminan durante el sprint.

No se hizo `push` ni merge de Git.
