# Recuperación y diagnóstico local — Sprint 2.11

## Alcance

La estación conserva SQLite como única fuente operativa local durante este
sprint. No se implementa envío, reintento remoto ni resolución de conflictos.
Los elementos Outbox se cuentan y muestran como **pendientes conservados**; no
se presentan como error mientras la base local esté íntegra.

La pantalla `Diagnóstico` separa la salud local de la disponibilidad de la API.
El operario continúa viendo únicamente `Guardado local disponible/no
disponible`; el jefe de planta puede consultar integridad, pendientes, espacio,
instrucción de recuperación y crear una copia consistente.

## Fallos y comportamiento seguro

| Situación | Detección | Comportamiento |
| --- | --- | --- |
| Cierre inesperado | Reinicio, migraciones idempotentes, `integrity_check` | WAL y `synchronous=FULL` conservan solo transacciones completas; contador y Outbox reaparecen sin reconstrucción manual. |
| Disco casi lleno | Espacio libre inferior a 256 MB | Salud en atención; se solicita liberar espacio antes de una jornada prolongada. |
| SQLite lleno | Código `SQLITE_FULL` | La transacción falla completa, el contador no aumenta y se bloquea el registro hasta liberar espacio. |
| Base ocupada | `SQLITE_BUSY`/`SQLITE_LOCKED` después del timeout | No se fuerza desbloqueo; se pide cerrar otra instancia y reintentar. |
| Corrupción | `integrity_check`, `SQLITE_CORRUPT` o `SQLITE_NOTADB` | No se reemplaza ni crea una base sobre la existente; se detiene la escritura y se solicita una restauración validada. |
| Reloj atrasado | Hora nueva más de cinco minutos anterior al último Outbox | Inicios, relevos, cierres, cajuelas y reversos se rechazan dentro de la transacción. Nunca se reescriben timestamps anteriores. |
| Configuración perdida | Validación de opciones al iniciar | El inicio se detiene con una instrucción para restaurar `appsettings.Local.json`; la base existente no se borra ni cambia de estación. |

La tolerancia de cinco minutos absorbe ajustes menores del reloj sin permitir
que una corrección importante altere el orden auditable. Fecha, hora y zona
horaria deben corregirse en Windows antes de reintentar.

## Copia consistente

`Crear copia de recuperación` usa la API de backup de SQLite con la aplicación
abierta. La copia se escribe en:

```text
Documentos\IndustriasDoradas\Recuperacion
```

El sistema ejecuta `integrity_check` sobre el archivo resultante antes de
mostrar éxito. No se copian directamente `operation.sqlite3`, `-wal` y `-shm`
durante la operación.

## Restauración controlada

La restauración es una acción de soporte y no un botón del operario:

1. cerrar todas las instancias de desktop y confirmar que no exista un proceso
   usando la base;
2. conservar juntos `operation.sqlite3` y cualquier `-wal`/`-shm` como evidencia,
   renombrándolos con fecha; nunca eliminarlos como primer paso;
3. trabajar sobre una **copia** del respaldo y comprobar `PRAGMA
   integrity_check`, `PRAGMA foreign_key_check` y el historial de
   `local_schema_migrations`;
4. verificar que el respaldo pertenece al mismo ID de estación y contrastar
   cargamento, total y pendientes con la evidencia manual disponible;
5. colocar el archivo validado como `operation.sqlite3` únicamente con la
   aplicación cerrada;
6. iniciar, abrir `Diagnóstico` y comprobar integridad, pendientes y contexto
   antes de volver a registrar.

No se fusionan dos bases, no se importan filas manualmente y no se marca Outbox
como enviada. Si no existe una copia válida, se conserva el archivo afectado y
se escala al responsable técnico.

## Evidencia automatizada

Las pruebas cubren reinicio tipo cierre abrupto sin pérdida, copia consistente,
corrupción sin reemplazo, bloqueo concurrente, `SQLITE_FULL` sin escritura
operativa parcial, reloj atrasado sin nuevo evento, clasificación de errores y
presentación independiente de salud local/API.

## Pausa manual

La pausa técnica de 2.11 fue aprobada provisionalmente con la cobertura
automatizada completa. Esta secuencia se realizará una comprobación a la vez
durante 2.12, cuando esté disponible la elevación de jefe de planta documentada
en `DT-S2-001`.

1. con Línea 1 activa, registrar una cajuela y anotar el total;
2. finalizar el proceso desde el Administrador de tareas inmediatamente después
   del mensaje de éxito;
3. reiniciar y confirmar el mismo total y los pendientes en `Diagnóstico`;
4. crear una copia de recuperación y confirmar que la ruta se muestra;
5. ejecutar la prueba automatizada de bloqueo o disco lleno y comprobar que no
   cambia ningún evento ni pendiente operativo.
