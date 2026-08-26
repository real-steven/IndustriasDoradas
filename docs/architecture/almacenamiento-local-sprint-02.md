# Almacenamiento local — Sprint 2.4

**Fecha:** 2026-08-26

**Estado:** aprobado el 2026-08-26; autorizado para iniciar 2.5

## 1. Alcance

Este mini paso implementa la persistencia SQLite por estación para catálogos,
cargamentos, responsables, sesión operativa, eventos inmutables y Outbox. No
implementa todavía la preparación/cierre del ciclo, `RegistrarCajuela`, la
sincronización remota ni la UI; corresponden a 2.5, 2.6, Sprint 3 y 2.8.

## 2. Ruta y arranque

La ruta predeterminada es:

```text
%LOCALAPPDATA%\IndustriasDoradas\stations\<station-id-N>\operation.sqlite3
```

Cada UUID de estación produce una ruta independiente. `LocalDatabase:BaseDirectory`
solo permite cambiar la raíz para pruebas o una instalación controlada. Al
arrancar WPF, un servicio aplica las migraciones pendientes antes de mostrar la
ventana; un fallo detiene el inicio con un mensaje y no continúa sobre un
esquema parcialmente preparado.

SQLite no guarda PIN, verificadores, claves ni tokens de Supabase. Esos datos
siguen la política de almacén seguro descrita en
[`identidad-y-acceso-offline.md`](identidad-y-acceso-offline.md).

## 3. Esquema versionado

| Versión | Contenido |
| --- | --- |
| `001_initial_operation` | Catálogos de proveedores, trabajadores y líneas; cargamentos; historial de responsables; sesión por estación; eventos de producción; Outbox. |
| `002_operation_indexes_and_immutability` | Índices de consulta/pendientes, unicidad de responsable y sesión activos, y triggers que rechazan `UPDATE`/`DELETE` de eventos. |
| `003_production_counter_read_model` | Contador reconstruible por línea y cargamento; pertenece al paso 2.6. |
| `004_immediate_cajuela_correction` | Unicidad de reversión y auditoría inmutable de la corrección inmediata; pertenece al paso 2.7. |

`local_schema_migrations` registra versión, nombre y fecha. El migrador rechaza
un historial que no coincida con el catálogo conocido. Cada versión y su
registro se aplican dentro de una única transacción.

Las restricciones físicas relevantes son:

- claves foráneas activas en cada conexión y comprobadas después de migrar;
- UUID único por evento y secuencia única por `(station_id, client_sequence)`;
- un responsable vigente por ciclo y una sesión activa por línea;
- estados y tipos limitados mediante `CHECK`;
- JSON válido en el payload de Outbox;
- eventos inmutables; las correcciones serán eventos compensatorios.

## 4. Durabilidad y concurrencia

- `journal_mode=WAL` se exige al preparar la base. La aplicación falla de forma
  segura si el sistema de archivos configurado no lo admite.
- `synchronous=FULL`, `foreign_keys=ON` y un timeout ocupado de 5 segundos se
  configuran en cada conexión.
- el autocheckpoint WAL queda en 1000 páginas.
- evento y mensaje Outbox se insertan en la misma transacción; si cualquiera
  falla, ninguno queda guardado.
- el contador no se almacena como una segunda verdad: se reconstruye desde los
  eventos de línea y cargamento.

La aplicación usa una base local, no un archivo SQLite compartido por red. La
extensión nativa queda fijada en `SQLitePCLRaw.bundle_e_sqlite3` 3.0.5 para usar
SQLite 3.53.4 y evitar la versión vulnerable que resolvía inicialmente la
dependencia transitiva.

## 5. Repositorios y diagnóstico

La capa de aplicación depende de interfaces para catálogos, cargamentos, sesión
operativa, eventos, Outbox y diagnóstico. Las implementaciones SQLite permanecen
en infraestructura y usan comandos parametrizados.

La copia de diagnóstico se crea con la API de backup de SQLite hacia un archivo
nuevo con marca UTC. Esto conserva una instantánea consistente aunque la base
use WAL; no se copian directamente `operation.sqlite3`, `-wal` y `-shm`.

## 6. Evidencia automatizada

Las pruebas cubren:

1. aislamiento de ruta por estación;
2. creación desde cero, dos migraciones, WAL, `synchronous=FULL`, FK,
   `integrity_check` y versión nativa segura;
3. segundo arranque idempotente con catálogo conservado;
4. actualización de versión 1 a 2 sin perder datos;
5. rechazo por clave foránea;
6. persistencia de catálogo, cargamento y sesión entre instancias;
7. atomicidad evento + Outbox y rollback ante fallo;
8. rechazo físico de edición/borrado de eventos;
9. copia de diagnóstico independiente y legible.

## 7. Pausa de aprobación

La aplicación inició correctamente dos veces en la estación configurada. La
inspección de solo lectura de la base generada confirmó:

- `integrity_check=ok`, `journal_mode=wal` y SQLite 3.53.4;
- dos migraciones aplicadas con sus nombres esperados;
- cero violaciones en `foreign_key_check`;
- todas las tablas de 2.4 presentes;
- cero filas operativas, resultado esperado porque los catálogos y el inicio de
  operación se implementan a partir de 2.5.

Con esta evidencia queda cumplida la pausa de 2.4 y se autoriza iniciar 2.5.
