# Runbook de sincronización de estaciones

Este runbook cubre la operación y recuperación del cliente desktop de Sprint 3.
No requiere acceso directo a SQLite para resolver incidentes normales.

## Estados visibles

- `PENDING`: guardado local confirmado; espera envío.
- `SYNCING`: reclamado temporalmente por el worker.
- `SYNCED`: recibo central confirmado.
- `FAILED_REVIEW`: rechazo durable; conservar el código para soporte.
- `Nube disponible`: API y ciclo remoto respondieron.
- `Sin sincronización`: la operación local continúa y el worker reintentará.

Modo Operación nunca debe esperar a PostgreSQL. Una cajuela aceptada aparece
primero en el total local y en Outbox. La recuperación de red envía la misma
identidad de mensaje; un reintento central responde `ALREADY_APPLIED` sin crear
un segundo efecto.

## Comprobación inicial

1. Mantenga la API en ejecución y abra **Diagnóstico** como jefe de planta.
2. Compruebe estación, versión, almacenamiento local, pendientes, revisión,
   última sincronización y desviación del reloj.
3. Si hay pendientes, espere un ciclo. No cierre ni borre la base local.
4. Si aparece `FAILED_REVIEW`, exporte el diagnóstico seguro y conserve su
   código. No edite SQLite ni reenvíe manualmente el evento.

## Corte y recuperación

1. Para simular que desktop no llega al servicio, detenga la API local. El
   Internet puede permanecer activo para modificar el catálogo central.
2. Registre la operación necesaria. El total debe cambiar localmente y el
   contador de pendientes debe aumentar.
3. Reinicie la API. El worker recupera leases abandonados y reintenta con
   backoff; el pull incremental conserva su cursor.
4. Espere hasta que pendientes llegue a cero y Diagnóstico muestre
   `Nube disponible`.
5. Compare total local, suma central de `quantity_delta`, cantidad de eventos y
   UUID. Deben coincidir y no existir UUID duplicados.

## Cambio de catálogo durante desconexión

Un cambio central no reemplaza eventos operativos. Al volver la conexión, el
pull aplica el cambio en una transacción y avanza el cursor únicamente después
de completar la página. Si la línea seleccionada deja de estar autorizada, la
selección queda vacía; desktop nunca cambia de línea por su cuenta.

Para el ensayo de Sprint 3.10 se usan estos comandos desde la raíz:

```powershell
pnpm sync:multistation prepare
pnpm sync:multistation catalog-change
pnpm sync:multistation snapshot -- --expected-one=3 --expected-two=4
pnpm sync:multistation catalog-restore
pnpm sync:multistation cleanup
```

`cleanup` se niega a continuar si la Estación 2 conserva un cargamento activo.
Primero debe cerrarse desde desktop. La limpieza restaura las cuatro líneas de
la Estación 1, restaura el proveedor y desactiva la estación temporal; conserva
el historial de producción.

## Escalamiento

Exporte el diagnóstico seguro antes de reiniciar o modificar configuración.
Entregue a soporte: estación, versión, hora, estado de red, conteos y códigos de
revisión. El reporte omite tokens, PIN y payloads operativos. Nunca copie
`appsettings.Local.json`, `station-state.bin` ni la base SQLite a mensajería.
