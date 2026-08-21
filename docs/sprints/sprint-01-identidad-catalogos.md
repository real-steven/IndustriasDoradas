# Sprint 1 — Identidad y catálogos (semanas 2–3)

**Objetivo:** modelo central, acceso seguro y datos maestros.

**Entregable:** tres roles autenticados, cuenta `JEFE_EMPRESA` superadministradora, permisos individuales para `ADMINISTRADOR`, una estación compartida con Modo Operación/Modo Jefe de Planta y catálogos configurables para la planta actual, cuatro líneas, molinos/rastras, solicitudes de trabajadores y proveedores.

## Orden de trabajo

1. Modelo/restricciones con UUID, `organization_id`, timestamps y activo.
2. Migración PostgreSQL + seed; índices y claves foráneas.
3. Login, tokens, logout y roles autenticados `JEFE_EMPRESA/ADMINISTRADOR/JEFE_PLANTA`; Modo Operación no es cuenta ni rol de Supabase.
4. Cuenta gerencial única con todos los permisos activos y administración web separada visualmente, no por sesión.
5. Gobierno granular: jefe de empresa crea/suspende administradores y selecciona permisos; un administrador delegado solo gestiona capacidades que posee.
6. Autorización API antes de mutaciones; PIN individual y auditoría de login/elevaciones/cambios.
7. Solicitud de trabajador, estados `PROVISIONAL/PROVISIONAL_VENCIDO/ACTIVO/RECHAZADO`, aprobación, fusión/reasignación y desactivación sin borrar historial.
8. Catálogos, componentes de línea y desactivación en vez de borrado referenciado.
9. Preferencia de idioma `es/en`; OpenAPI y clientes tipados.
10. Desktop: login del jefe, estación, modos y catálogos operativos.
11. Web: datos gerenciales prioritarios y Administración como módulo separado en la misma sesión.

**Pruebas:** rol/tenant, permisos individuales y revocación inmediata, delegación sin escalada, creación/suspensión administrativa, PIN/elevación, autorización offline de 24 horas, provisional vencido, fusión/reasignación, token vencido, idioma, duplicados, restricciones y desactivación.

**Prueba manual:** crear 4 líneas y la estación inicial, solicitar varios trabajadores/proveedores, vencer una solicitud y probar Modo Operación/Modo Jefe de Planta y cada acción con cada rol autenticado.

**Aceptación:** ningún endpoint protegido sin permiso; desactivar conserva historial; tres aplicaciones comparten contrato.

## Mini pasos, pausas y prompts

### 1.1 Decisiones de identidad y acceso offline

**Estado:** propuesta ejecutada el 2026-08-17 en
[`../architecture/identidad-y-acceso-offline.md`](../architecture/identidad-y-acceso-offline.md);
pausa manual aprobada mediante el `R` que inició el prompt 1.2.

**Prompt:** Define y documenta Supabase Auth → JWT → validación NestJS → perfil/rol propio. Usa `JEFE_EMPRESA` como superadministrador desde una sola cuenta, `ADMINISTRADOR` con permisos individuales revocables y `JEFE_PLANTA` para abrir la estación y elevar permisos físicos. Un administrador solo delega capacidades que posee. No crees cuenta `OPERARIO`: define Modo Operación restringido y Modo Jefe de Planta temporal con PIN individual, salida explícita, aviso y bloqueo tras dos minutos de inactividad total sin perder borradores. Define límite/ventana/enfriamiento de PIN, recuperación con contraseña, autorización offline máxima de 24 horas, revalidación, evidencia fotográfica condicionada y MFA/dispositivos como compuerta previa a producción.

**Pausa:** aprobar cuenta gerencial única, matriz granular de administradores, límites de delegación, umbrales de PIN, modos y acciones permitidas durante las 24 horas offline.

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
mantiene únicamente como guía, fuera de las migraciones productivas. Pausa
manual aprobada mediante el `R` que inició el prompt 1.4.

**Prompt:** Implementa migraciones PostgreSQL/Supabase del modelo aprobado y un seed completamente ficticio e idempotente. Configura esquemas, FK, checks, índices, timestamps y aislamiento por `organization_id`. Si se usa RLS como defensa adicional, las tablas de negocio deben negar acceso directo del cliente y permitir el acceso controlado del backend. Añade pruebas de migración desde cero.

**Pausa:** aplicar en base vacía, inspeccionar restricciones y repetir seed sin duplicar.

### 1.4 Validación JWT y autorización API

**Estado:** ejecutado el 2026-08-17 en
[`../../apps/api/src/auth/`](../../apps/api/src/auth/), con endpoints mínimos de
sesión/perfil, guards globales y pruebas negativas unitarias/HTTP. Supabase usa
JWKS asimétrico `ES256`; el perfil, estado, rol, permisos y organización se
resuelven desde `app` con una clave secreta exclusiva del backend. Pausa manual
aprobada el 2026-08-18 mediante el `R` que inició el prompt 1.5; las rutas de
sesión y perfil devolvieron `200` con un token real y los rechazos quedaron
validados por pruebas negativas.

**Prompt:** Integra Supabase Auth en NestJS validando firma, emisor, audiencia y expiración; carga el perfil y aplica guards/policies por rol y organización. No implementes contraseñas propias ni expongas `service_role`. Añade endpoints mínimos de sesión/perfil y pruebas negativas exhaustivas.

**Pausa:** tokens ausente, vencido, alterado, usuario inactivo y rol incorrecto deben ser rechazados.

### 1.5 Auditoría transversal

**Estado:** ejecutado el 2026-08-18 mediante
[`../../supabase/migrations/20260818092950_audit_trail.sql`](../../supabase/migrations/20260818092950_audit_trail.sql),
[`../../supabase/tests/004_audit_trail.sql`](../../supabase/tests/004_audit_trail.sql)
y [`../../apps/api/src/audit/`](../../apps/api/src/audit/). La migración quedó
registrada en Supabase de desarrollo con versión remota `20260818092950`; la
API correlaciona solicitudes y audita accesos/rechazos, y PostgreSQL impide
alterar eventos o insertar campos sensibles. Pausa manual aprobada mediante el
`R` que inició el prompt 1.6.

**Prompt:** Implementa auditoría central para acceso, elevación con PIN, gobierno de cuentas y mutaciones: actor, organización, estación, acción, entidad, ID, momento, correlación, resultado, presencia/ausencia futura de evidencia y cambios permitidos. No guardes PIN, contraseña, token ni fotografía en logs/auditoría. Prueba que una falla de negocio no deje una auditoría falsa de éxito y que nadie altere eventos auditados.

**Pausa:** ejecutar login, rechazo y cambio; revisar eventos legibles sin token/contraseña.

### 1.6 API de catálogos

**Estado:** ejecutado el 2026-08-19. La API expone casos de uso paginados y
específicos para plantas, líneas/componentes, estaciones, proveedores,
solicitudes/trabajadores y gobierno jerárquico de cuentas. La versión remota
`20260819063818` quedó aplicada solo en Supabase de desarrollo. La creación de
cuentas Auth nuevas permanece fuera de este prompt hasta definir el iniciador y
la compensación entre Auth y el perfil; no impide gobernar cuentas existentes.
Pausa manual pendiente; consulta la guía de pruebas del Sprint 1.

La revisión 1.11 cerró ese pendiente: la invitación se inicia desde NestJS por
un perfil con `administrators.create`; una falla posterior deja el perfil
suspendido y auditable, sin acceso parcial.

**Prompt:** Implementa casos de uso y endpoints paginados para plantas, líneas/componentes, estaciones, solicitudes/trabajadores y proveedores, con validación, búsqueda, activación/desactivación y errores estables. Jefe de planta solicita trabajador con nombre obligatorio y contacto opcional; nace provisional, vence a las 72 horas sin bloquear trabajo y solo administrador aprueba, rechaza, fusiona o reasigna. Jefe de planta gestiona proveedores; administrador gestiona cuentas privilegiadas/configuración y jefe de empresa aprueba/suspende administradores. No hagas CRUD genérico ni borrado físico. Añade pruebas de permisos, historial inmutable y restricciones.

**Pausa:** Postman/Swagger crea, consulta, duplica, desactiva y prueba referencias protegidas.

### 1.7 Contrato OpenAPI y clientes

**Estado:** ejecutado el 2026-08-19. Nest sirve Swagger en `/api/docs` y el
contrato en `/api/openapi.json`; el artefacto versionado y los clientes mínimos
TypeScript/.NET se regeneran únicamente con `scripts/generate-contracts.mjs`.
`contract:check` falla si cualquiera queda desactualizado y forma parte de
`verify`. Ambos clientes consumen sesión mediante pruebas automatizadas. Pausa
manual pendiente.

**Prompt:** Completa OpenAPI con modelos, errores, seguridad, paginación y ejemplos ficticios. Automatiza generación o validación de clientes tipados para web/.NET sin editar código generado a mano. Añade comprobación CI de contrato desactualizado.

**Pausa:** regenerar desde cero sin diferencias inesperadas y consumir un endpoint desde una prueba de cada cliente.

### 1.8 Login y estación en desktop

**Estado:** ejecutado el 2026-08-19. Desktop autentica con Supabase Auth,
autoriza la estación mediante Nest, protege tokens/verificador con DPAPI y
mantiene contingencia local máxima de 24 horas. La elevación usa PIN individual
PBKDF2, bloqueo 5/15/15, reautenticación tras el segundo bloqueo en 24 horas y
retorno automático a Modo Operación tras 120 segundos sin perder el borrador.
La evidencia fotográfica es un puerto que actualmente registra ausencia; no hay
biometría, producción ni asistencia. La migración remota de desarrollo es
`20260819071212`. Pausa manual pendiente.

**Prompt:** Implementa login WPF del `JEFE_PLANTA`, recuperación de contraseña de Supabase Auth, sesión segura y autorización de la única estación inicial. Crea Modo Operación restringido sin cuenta compartida y Modo Jefe de Planta temporal con PIN individual, salida explícita, aviso y bloqueo tras dos minutos de inactividad total sin perder borradores. Aplica los límites aprobados de PIN; el bloqueo afecta solo la elevación y se recupera con contraseña completa en línea o restablecimiento administrativo. Registra elevaciones y fallos; deja la evidencia fotográfica detrás de un puerto para implementarla solo tras aprobar su política, sin biometría ahora. Permite hasta 24 horas offline tras validación previa, revalida al recuperar conexión y maneja expiración/revocación sin borrar eventos locales. Guarda tokens y verificadores con mecanismo seguro. No implementes producción ni asistencia todavía.

**Pausa:** probar credenciales válidas/inválidas, token vencido, reinicio, offline permitido y revocación.

### 1.9 Login y administración web

**Estado:** ejecutado el 2026-08-19 y revisado el 2026-08-20. React usa Supabase Auth con clave
publicable y consulta exclusivamente Nest para datos funcionales. Las rutas de
gerencia y administración aplican permisos vigentes: `JEFE_EMPRESA` prioriza
datos/reportes y abre Administración en la misma sesión; cada administrador ve
solo los módulos concedidos. Incluye
preferencia es/en, recuperación, estados accesibles y pruebas de separación de
roles. Los reportes muestran su autorización/indisponibilidad sin adelantar
cálculos de sprints posteriores. Pausa manual pendiente.

**Prompt:** Implementa Supabase Auth en React. Añade preferencia editable español/inglés. La cuenta `JEFE_EMPRESA` muestra primero lectura/reportes/auditoría y abre un módulo Administración sin cambiar de sesión. Cada `ADMINISTRADOR` muestra solo módulos y acciones concedidos. Impide autoasignación, escalada de delegación, alteración de auditoría y desactivación de la última cuenta gerencial. Usa API NestJS, TanStack Query y formularios accesibles. Maneja sesión vencida, 403, vacío, carga y error.

**Pausa:** verificar matriz de roles en Safari/Chrome y que ninguna clave privilegiada aparezca en bundle/red.

### 1.10 Prueba integrada y amenaza básica

**Estado:** implementación ejecutada el 2026-08-19. Se completó la cadena
automatizada identidad → API → clientes web/desktop, el modelo de amenazas y la
guía de soporte. Se corrigieron caché de respuestas v1, costo no acotado de un
verificador PIN y suspensión web con motivo genérico. No se detectó bypass de
rol u organización en las pruebas. Supabase de desarrollo conserva como aviso
la protección de contraseñas filtradas desactivada; MFA, dispositivos
autorizados y esa opción siguen como compuertas previas a producción. El Sprint
1 queda pendiente de revisión manual consolidada, especialmente Chrome/Safari
y el flujo físico desktop.

**Prompt:** Ejecuta integración completa identidad→API→desktop/web. Haz threat modeling sencillo de activos, actores, abuso de rol, robo de token, enumeración y acceso cruzado entre organizaciones. Corrige hallazgos críticos, completa prueba manual y documentación de soporte.

**Pausa:** cero bypass de permisos; catálogos consistentes; compuerta Sprint 1 aprobada.

### 1.11 Revisión de superadministración y permisos granulares

**Estado:** implementado y aplicado en Supabase de desarrollo el 2026-08-20 con
versión remota `20260820100224`; pendiente de revisión manual consolidada.

**Prompt:** Sustituye las cuentas separadas del gerente por una única cuenta
`JEFE_EMPRESA` con todos los permisos activos. Implementa concesiones
individuales, revocables y auditadas para `ADMINISTRADOR`; creación/invitación,
selección inicial, edición posterior, suspensión y reactivación. Separa
`administrators.create`, `administrators.permissions.manage` y
`administrators.govern`. Un administrador nunca cambia sus propios permisos ni
concede o retira capacidades que no posee. Conserva acceso efectivo de cuentas
existentes durante la migración, no borres historial y recalcula permisos en
cada solicitud. En web prioriza datos gerenciales y mueve ediciones a un módulo
Administración dentro de la misma sesión.

**Pausa:** probar gerente con una sola cuenta, administrador sin permisos,
concesión/revocación inmediata, delegación por subconjunto, invitación y
suspensión; confirmar auditoría y ausencia de claves privilegiadas en clientes.
