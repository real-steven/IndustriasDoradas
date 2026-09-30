# Sprint 3.10 — Ensayo multiestación y cierre

Fecha de preparación: 2026-09-22. Rama: `DevHenry`.

## Implementación y defecto corregido

SQLite ya separaba los datos por `Station:Id`, pero la sesión DPAPI se guardaba
en un archivo común. Dos instancias en el mismo usuario de Windows podían
sobrescribir su sesión protegida. `DpapiStationStore` guarda ahora el estado en
el directorio de cada estación y migra el archivo histórico solo cuando su
`StationId` corresponde al perfil configurado.

El primer arranque de dos ventanas reveló además que `appsettings.Local.json`
se agregaba después de la configuración de línea de comandos. Por eso ambas
ventanas usaban la Estación 1 aunque la segunda recibiera otro `Station:Id`.
Los argumentos se agregan ahora al final de la configuración y tienen la
prioridad esperada para ejecutar perfiles aislados.

La primera selección simultánea reveló un tercer defecto: la caché local sí
recibía `STATION_LINE_SCOPE`, pero el selector y el tablero consultaban todas
las líneas activas de la planta. Ambas consultas exigen ahora un alcance activo
para el `StationId` de la instancia. Así, la Estación 1 solo muestra Líneas 1–2
y la Estación 2 solo Líneas 3–4; una línea ajena tampoco aparece en Modo
Operación. La corrección usa el pull ya existente y no necesita una migración
adicional de Supabase.

Al reiniciar el ensayo en un directorio local nuevo se detectó además
`STATION_SEQUENCE_CONFLICT` en la Estación 1. El servidor conservaba secuencias
de pruebas anteriores y la SQLite nueva comenzaba otra vez en 1. El snapshot de
estación devuelve ahora la siguiente secuencia central disponible; la migración
SQLite 11 conserva ese mínimo y todos los productores de outbox lo respetan.
Una reinstalación puede continuar el contador sin modificar ni reutilizar
mensajes históricos.

El helper `scripts/sync-multistation-fixture.mjs` prepara dos perfiles, divide
temporalmente las líneas 1–2 y 3–4, modifica/restaura un proveedor, consulta
conteos centrales, permite reiniciar la línea base después de cerrar operaciones
históricas y limpia el fixture sin borrar el historial de producción. No
contiene claves y lee las credenciales desde `apps/api/.env.local`.

## Línea base central capturada

Preparación ejecutada contra el Supabase de desarrollo:

- Estación 1 `34000000-0000-4000-8000-000000000001`: Líneas 1 y 2.
- Estación 2 `34000000-0000-4000-8000-000000000002`: Líneas 3 y 4.
- Inicio del ensayo: `2026-09-23T05:49:39.202Z`.
- Desde ese instante: 0 cargamentos, 0 eventos, total 0 y 0 recibos en ambas.
- La Estación 1 ya tenía cliente central; la Estación 2 aún no había enviado su
  primer lote.

El estado reversible se conserva en
`TestResults/sprint-03-10-multistation.json`, ruta ignorada por Git.

Si un ensayo interrumpido deja un cargamento activo en una línea objetivo,
primero se cierra desde la base local que lo creó. Cuando Línea 2 y Línea 3 ya
no tienen cargamentos centrales activos, el siguiente comando mueve el inicio
del conteo sin eliminar recibos ni producción histórica:

```powershell
pnpm sync:multistation rebaseline
```

El comando se niega a continuar si detecta cualquiera de esas líneas activa.

El ensayo se reinició de forma controlada el `2026-09-23T16:47:50.873Z`.
Después del reinicio, la Estación 1 abrió Línea 2 y la Estación 2 abrió Línea 3:
cada una produjo un recibo central único, sin eventos, total 0 y sin
`FAILED_REVIEW`. El snapshot también mostró un cargamento histórico de Línea 1,
anterior a la línea base y fuera de las líneas objetivo del ensayo.

Durante la caída de la API, ambas instancias conservaron el almacenamiento
local y acumularon 3 y 4 eventos respectivamente. Al restablecerla, el snapshot
central confirmó 7 eventos, cantidad total 7, cero identificadores duplicados y
cero recibos `FAILED_REVIEW`. Las dos SQLite locales recibieron además el cambio
del proveedor `957aff63-e775-4838-a5e0-289f1f933a59` a
`Carlos andres prueba 3.10`.

## Validación manual completada

### Preparación local

1. Cierre la ventana desktop actual.
2. Mantenga API y Supabase disponibles.
3. Compile una vez:

   ```powershell
   dotnet build apps/desktop/IndustriasDoradas.Desktop.slnx --no-restore --configuration Release
   ```

4. Abra dos PowerShell desde la raíz y ejecute una instancia por terminal:

   ```powershell
   $exe = Resolve-Path "apps/desktop/src/IndustriasDoradas.Desktop/bin/Release/net10.0-windows/IndustriasDoradas.Desktop.exe"
   & $exe --Station:Id=34000000-0000-4000-8000-000000000001 --LocalDatabase:BaseDirectory="$PWD/runtime-data/sprint-03-10"
   ```

   ```powershell
   $exe = Resolve-Path "apps/desktop/src/IndustriasDoradas.Desktop/bin/Release/net10.0-windows/IndustriasDoradas.Desktop.exe"
   & $exe --Station:Id=34000000-0000-4000-8000-000000000002 --LocalDatabase:BaseDirectory="$PWD/runtime-data/sprint-03-10"
   ```

5. Inicie sesión en ambas con el mismo jefe de planta de prueba. Los archivos
   SQLite y DPAPI quedan separados por estación aunque compartan el directorio
   base.

### Ensayo

| ID | Pasos | Esperado | Pasa |
| --- | --- | --- | :---: |
| ME-01 | Confirmar catálogos de ambas ventanas | Estación 1 ve Líneas 1–2; Estación 2 ve Líneas 3–4 | [x] |
| ME-02 | Preparar Línea 2 en Estación 1 y Línea 3 en Estación 2 | Dos cargamentos independientes, total inicial 0 | [x] |
| ME-03 | Detener solo la API local | Ambas muestran sin sincronización; almacenamiento sigue disponible | [x] |
| ME-04 | Sin API, registrar 3 cajuelas en Estación 1 y 4 en Estación 2 | Totales locales 3 y 4; los pendientes aumentan | [x] |
| ME-05 | Ejecutar `pnpm sync:multistation catalog-change` mientras la API sigue detenida | El proveedor cambia centralmente; desktop todavía conserva el valor local | [x] |
| ME-06 | Reiniciar API y esperar dos ciclos | Pendientes 0, nube disponible y ambas reciben el proveedor con sufijo `prueba 3.10` | [x] |
| ME-07 | Ejecutar el snapshot con valores esperados | PostgreSQL/API reportan totales 3 y 4, cero UUID duplicados y cero revisiones nuevas | [x] |
| ME-08 | Ejecutar `catalog-restore` | Ambas recuperan el nombre original mediante pull incremental | [x] |
| ME-09 | Cerrar ambos cargamentos y repetir snapshot | Totales 3 y 4 se conservan; cargamentos quedan `COMPLETED` | [x] |
| ME-10 | Ejecutar `cleanup` | Estación 1 recupera cuatro líneas y Estación 2 queda desactivada | [x] |

Comandos de ME-07 a ME-10:

```powershell
pnpm sync:multistation snapshot -- --expected-one=3 --expected-two=4
pnpm sync:multistation catalog-restore
pnpm sync:multistation snapshot -- --expected-one=3 --expected-two=4
pnpm sync:multistation cleanup
```

## Regresión y cierre

- [x] Dos sesiones protegidas quedan aisladas por estación.
- [x] Selector y tablero filtran líneas por el alcance de la estación.
- [x] Regresión automatizada de aislamiento de líneas aprobada.
- [x] Fixture central y conteo inicial ejecutados.
- [x] Igualdad matemática local/central en ambas estaciones.
- [x] Cero eventos perdidos o duplicados.
- [x] Cambio de catálogo recuperado después de la desconexión.
- [x] `pnpm verify` final aprobado.
- [x] Cero defectos críticos o altos en la validación manual.

**Decisión:** punto 3.10 aprobado y cerrado. Las validaciones manuales y
`pnpm verify` pasaron sobre el cambio completo.
