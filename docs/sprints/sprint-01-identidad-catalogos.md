# Sprint 1 — Identidad y catálogos (semanas 2–3)

**Objetivo:** modelo central, acceso seguro y datos maestros.

**Entregable:** acceso con cuentas separadas para tres roles autenticados, una estación compartida con Modo Operación/Modo Jefe de Planta y catálogos configurables para la planta actual, cuatro líneas, molinos/rastras, solicitudes de trabajadores y proveedores.

## Orden de trabajo

1. Modelo/restricciones con UUID, `organization_id`, timestamps y activo.
2. Migración PostgreSQL + seed; índices y claves foráneas.
3. Login, tokens, logout y roles autenticados `JEFE_EMPRESA/ADMINISTRADOR/JEFE_PLANTA`; Modo Operación no es cuenta ni rol de Supabase.
4. Cuenta gerencial y segunda cuenta administrativa separadas cuando la misma persona ejerce ambas funciones; no existe rol compuesto.
5. Gobierno: jefe de empresa aprueba/suspende administradores; administrador no se autoaprueba ni altera auditoría.
6. Autorización API antes de mutaciones; PIN individual y auditoría de login/elevaciones/cambios.
7. Solicitud de trabajador, estados `PROVISIONAL/PROVISIONAL_VENCIDO/ACTIVO/RECHAZADO`, aprobación, fusión/reasignación y desactivación sin borrar historial.
8. Catálogos, componentes de línea y desactivación en vez de borrado referenciado.
9. Preferencia de idioma `es/en`; OpenAPI y clientes tipados.
10. Desktop: login del jefe, estación, modos y catálogos operativos.
11. Web: consulta/gobierno gerencial separados de administración.

**Pruebas:** rol/tenant, separación gerencia/administración, aprobación/suspensión administrativa, PIN/elevación, autorización offline de 24 horas, provisional vencido, fusión/reasignación, token vencido, idioma, duplicados, restricciones y desactivación.

**Prueba manual:** crear 4 líneas y la estación inicial, solicitar varios trabajadores/proveedores, vencer una solicitud y probar Modo Operación/Modo Jefe de Planta y cada acción con cada rol autenticado.

**Aceptación:** ningún endpoint protegido sin permiso; desactivar conserva historial; tres aplicaciones comparten contrato.

## Mini pasos, pausas y prompts

### 1.1 Decisiones de identidad y acceso offline

**Estado:** propuesta ejecutada el 2026-08-17 en
[`../architecture/identidad-y-acceso-offline.md`](../architecture/identidad-y-acceso-offline.md);
pausa manual aprobada mediante el `R` que inició el prompt 1.2.

**Prompt:** Define y documenta Supabase Auth → JWT → validación NestJS → perfil/rol propio. Usa `JEFE_EMPRESA` (lectura, Excel, auditoría, confirmación limitada de oro y aprobación/suspensión de administradores), `ADMINISTRADOR` (mutaciones sensibles, aprobación de trabajadores y correcciones profundas, sin reportes) y `JEFE_PLANTA` (abre estación y eleva permisos para operación física). Quien ejerza gerencia y administración usa dos cuentas separadas; no crees rol compuesto. No crees cuenta `OPERARIO`: define Modo Operación restringido de la estación y Modo Jefe de Planta temporal con PIN individual, salida explícita, aviso y bloqueo tras dos minutos de inactividad total sin perder borradores. Define límite/ventana/enfriamiento de intentos de PIN: al excederlos se bloquea solo la elevación, Modo Operación continúa y la recuperación exige contraseña completa en línea o restablecimiento administrativo. Toda cuenta autenticada usa correo válido y recuperación de contraseña de Supabase Auth; nunca envíes PIN. Define autorización offline máxima de 24 horas, revalidación al recuperar red y continuidad sin descartar eventos locales. Documenta fotografía de elevación como evidencia posterior condicionada a política/cámara; si no hay cámara, PIN continúa y genera alerta. Documenta MFA y dispositivos administrativos como compuerta previa a producción, no los adelantes.

**Pausa:** aprobar matriz, cuentas separadas del gerente, gobierno de administradores, umbrales de PIN, modos y acciones permitidas durante las 24 horas offline.

### 1.2 Modelo relacional de identidad y organización

**Estado:** propuesta ejecutada el 2026-08-17 en
[`../architecture/modelo-relacional-identidad-organizacion.md`](../architecture/modelo-relacional-identidad-organizacion.md);
pausa manual aprobada mediante el `R` que inició el prompt 1.3.

**Prompt:** Diseña `organizations`, `plants`, `production_lines`, componentes configurables de línea (molino/rastras), `stations`, `user_profiles`, tres roles autenticados/permisos, preferencia `es/en`, PIN del jefe almacenado solo mediante verificador seguro, `worker_requests`, `workers` y `suppliers`. Modela nombre obligatorio, contacto opcional, estados provisional/vencido/activo/rechazado, plazo de 72 horas, aprobación, fusión y reasignación sin pérdida. Representa cuatro líneas actuales con un molino y tres rastras cada una sin fijar esa cardinalidad. Incluye UUID, timestamps, restricciones, nombres únicos, índices y desactivación. Genera diagrama/diccionario; no crees endpoints/UI ni biometría.

**Pausa:** revisar cardinalidades para una planta inicial, múltiples líneas/estaciones y futura segunda planta.

### 1.3 Migraciones y seed central

**Estado:** ejecutado el 2026-08-17 mediante
[`../../supabase/migrations/20260817182220_identity_organization.sql`](../../supabase/migrations/20260817182220_identity_organization.sql),
[`../../supabase/migrations/20260817202508_add_missing_foreign_key_indexes.sql`](../../supabase/migrations/20260817202508_add_missing_foreign_key_indexes.sql),
[`../../supabase/seed.sql`](../../supabase/seed.sql) y
[`../../supabase/tests/`](../../supabase/tests/). La migración se aplicó al
proyecto Supabase de desarrollo con versiones remotas `20260817182220` y
`20260817202508`; el seed se repitió sin duplicados y `app` no conserva claves
foráneas sin índice de soporte. El esquema preexistente `demo_supervisor` se
mantiene únicamente como guía, fuera de las migraciones productivas. La pausa
manual queda lista para aprobación; no iniciar 1.4 hasta recibir el siguiente
`R`.

**Prompt:** Implementa migraciones PostgreSQL/Supabase del modelo aprobado y un seed completamente ficticio e idempotente. Configura esquemas, FK, checks, índices, timestamps y aislamiento por `organization_id`. Si se usa RLS como defensa adicional, las tablas de negocio deben negar acceso directo del cliente y permitir el acceso controlado del backend. Añade pruebas de migración desde cero.

**Pausa:** aplicar en base vacía, inspeccionar restricciones y repetir seed sin duplicar.

### 1.4 Validación JWT y autorización API

**Prompt:** Integra Supabase Auth en NestJS validando firma, emisor, audiencia y expiración; carga el perfil y aplica guards/policies por rol y organización. No implementes contraseñas propias ni expongas `service_role`. Añade endpoints mínimos de sesión/perfil y pruebas negativas exhaustivas.

**Pausa:** tokens ausente, vencido, alterado, usuario inactivo y rol incorrecto deben ser rechazados.

### 1.5 Auditoría transversal

**Prompt:** Implementa auditoría central para acceso, elevación con PIN, gobierno de cuentas y mutaciones: actor, organización, estación, acción, entidad, ID, momento, correlación, resultado, presencia/ausencia futura de evidencia y cambios permitidos. No guardes PIN, contraseña, token ni fotografía en logs/auditoría. Prueba que una falla de negocio no deje una auditoría falsa de éxito y que nadie altere eventos auditados.

**Pausa:** ejecutar login, rechazo y cambio; revisar eventos legibles sin token/contraseña.

### 1.6 API de catálogos

**Prompt:** Implementa casos de uso y endpoints paginados para plantas, líneas/componentes, estaciones, solicitudes/trabajadores y proveedores, con validación, búsqueda, activación/desactivación y errores estables. Jefe de planta solicita trabajador con nombre obligatorio y contacto opcional; nace provisional, vence a las 72 horas sin bloquear trabajo y solo administrador aprueba, rechaza, fusiona o reasigna. Jefe de planta gestiona proveedores; administrador gestiona cuentas privilegiadas/configuración y jefe de empresa aprueba/suspende administradores. No hagas CRUD genérico ni borrado físico. Añade pruebas de permisos, historial inmutable y restricciones.

**Pausa:** Postman/Swagger crea, consulta, duplica, desactiva y prueba referencias protegidas.

### 1.7 Contrato OpenAPI y clientes

**Prompt:** Completa OpenAPI con modelos, errores, seguridad, paginación y ejemplos ficticios. Automatiza generación o validación de clientes tipados para web/.NET sin editar código generado a mano. Añade comprobación CI de contrato desactualizado.

**Pausa:** regenerar desde cero sin diferencias inesperadas y consumir un endpoint desde una prueba de cada cliente.

### 1.8 Login y estación en desktop

**Prompt:** Implementa login WPF del `JEFE_PLANTA`, recuperación de contraseña de Supabase Auth, sesión segura y autorización de la única estación inicial. Crea Modo Operación restringido sin cuenta compartida y Modo Jefe de Planta temporal con PIN individual, salida explícita, aviso y bloqueo tras dos minutos de inactividad total sin perder borradores. Aplica los límites aprobados de PIN; el bloqueo afecta solo la elevación y se recupera con contraseña completa en línea o restablecimiento administrativo. Registra elevaciones y fallos; deja la evidencia fotográfica detrás de un puerto para implementarla solo tras aprobar su política, sin biometría ahora. Permite hasta 24 horas offline tras validación previa, revalida al recuperar conexión y maneja expiración/revocación sin borrar eventos locales. Guarda tokens y verificadores con mecanismo seguro. No implementes producción ni asistencia todavía.

**Pausa:** probar credenciales válidas/inválidas, token vencido, reinicio, offline permitido y revocación.

### 1.9 Login y administración web

**Prompt:** Implementa Supabase Auth en React y rutas separadas para cuenta gerencial y administrativa. Añade preferencia editable español/inglés. Gerencia ve lectura/reportes/auditoría y acciones limitadas para aprobar/suspender administradores; administración ve mutaciones, solicitudes y correcciones, pero no reportes. Impide autoaprobación, alteración de auditoría y desactivación de la última cuenta gerencial. Usa API NestJS, TanStack Query y formularios accesibles. Maneja sesión vencida, 403, vacío, carga y error.

**Pausa:** verificar matriz de roles en Safari/Chrome y que ninguna clave privilegiada aparezca en bundle/red.

### 1.10 Prueba integrada y amenaza básica

**Prompt:** Ejecuta integración completa identidad→API→desktop/web. Haz threat modeling sencillo de activos, actores, abuso de rol, robo de token, enumeración y acceso cruzado entre organizaciones. Corrige hallazgos críticos, completa prueba manual y documentación de soporte.

**Pausa:** cero bypass de permisos; catálogos consistentes; compuerta Sprint 1 aprobada.
