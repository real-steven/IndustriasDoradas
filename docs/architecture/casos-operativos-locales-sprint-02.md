# Casos operativos locales — Sprint 2.5

**Fecha:** 2026-08-26

**Estado:** aprobado técnicamente por el responsable del proyecto el 2026-08-26;
autorizado para continuar con 2.6

## 1. Alcance

Este mini paso implementa los casos de aplicación para preparar y confirmar un
cargamento, relevar al responsable, finalizar la alimentación y consultar el
contexto vigente. Usa los catálogos SQLite de 2.4 y no depende de Internet.

No implementa todavía `RegistrarCajuela`, reversión, sincronización ni UI. La
creación o edición de catálogos tampoco se convierte aquí en un CRUD genérico:
2.5 exige seleccionar proveedor, línea y responsable activos ya disponibles en
el catálogo local.

## 2. Preparar y confirmar

`LocalOperationService` separa cada cambio en dos momentos:

1. **Preparar:** valida autorización y catálogos y devuelve un borrador en
   memoria. No escribe en SQLite y el contexto confirmado sigue vigente.
2. **Confirmar:** toma la hora del reloj inyectado y envía una sola mutación al
   repositorio transaccional.

Un cargamento nuevo genera UUID para cargamento, ciclo, primera asignación y
Outbox. Proveedor, línea y responsable se revalidan dentro de la misma
transacción para impedir que un catálogo desactivado después de preparar sea
confirmado parcialmente.

## 3. Autorización y jornada

`OperationAuthority` conserva únicamente perfil actor, organización, planta,
estación y versión de permisos. Puede construirse desde el estado protegido de
la estación y rechaza una sesión cuya organización no coincida con la
autorización. Tokens, PIN y verificadores nunca entran en SQLite ni en Outbox.

La jornada se calcula mediante `WorkPeriodSchedule.At(...)` al consultar el
contexto. Cambiar de 17:59 a 18:00 o de 05:59 a 06:00 no modifica la sesión, el
cargamento ni la asignación.

`CanRegisterCajuela` solo es verdadero cuando existe una sesión `ACTIVE` con
cargamento, ciclo y responsable. El caso de uso de 2.6 volverá a exigir este
contexto dentro de su propia transacción.

## 4. Mutaciones atómicas

| Confirmación | Escrituras en una transacción | Outbox |
| --- | --- | --- |
| Inicio | cargamento + primera asignación + sesión activa | `OPERATION_STARTED` |
| Relevo | cierre de asignación anterior + asignación nueva + responsable de sesión | `RESPONSIBLE_RELIEVED` |
| Finalización | cierre de asignación + cargamento completado + sesión completada | `OPERATION_COMPLETED` |

Si cualquier escritura o la Outbox falla, la transacción completa se revierte.
El payload usa JSON versión 1 e incluye alcance, actor, versión de autorización
y hora UTC, pero no credenciales.

Relevo y finalización incluyen el `updated_at_utc` del contexto preparado como
control de concurrencia optimista. Si otro cambio fue confirmado mientras el
borrador estaba abierto, el borrador obsoleto se rechaza y no sobrescribe el
contexto nuevo.

## 5. Reglas y bloqueos

- proveedor, línea y responsable deben existir, estar activos y pertenecer al
  alcance autorizado;
- no puede iniciarse otro cargamento mientras la estación tenga uno activo;
- relevar exige otro responsable activo y una hora posterior a la asignación;
- finalizar exige cargamento, sesión y asignación todavía activos;
- una sesión completada no habilita alimentación;
- el historial de responsables y cargamentos nunca se elimina;
- un contexto obsoleto o un cambio de catálogo provoca rollback completo.

## 6. Evidencia automatizada

La suite de escritorio contiene 50 pruebas y cubre para 2.5:

1. preparar inicio sin cambiar SQLite y confirmar sus cuatro escrituras;
2. Outbox con actor y operación correctos;
3. preparar relevo manteniendo al responsable anterior hasta confirmar;
4. dos asignaciones históricas y una sola vigente después del relevo;
5. cambio automático de jornada sin mutar la sesión;
6. finalización que conserva historial y bloquea alimentación;
7. borrador obsoleto rechazado sin filas ni Outbox parciales;
8. catálogo desactivado después de preparar rechazado sin escrituras parciales;
9. recuperación del contexto tras crear nuevas instancias de servicio y
   repositorio;
10. autorización incoherente entre sesión y organización rechazada.

## 7. Pausa de aprobación

No hay una pantalla operativa conectada todavía, por lo que la prueba manual de
botones corresponde a 2.8. En esta pausa se revisan los estados observables en
las pruebas SQLite: iniciar, relevar, finalizar y provocar cada bloqueo sin
servidor ni conexión a Internet.

**Resultado:** pausa técnica aprobada por el responsable del proyecto el
2026-08-26.
