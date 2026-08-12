# Sprint 1 — Identidad y catálogos (semanas 2–3)

**Objetivo:** modelo central, acceso seguro y datos maestros.

**Entregable:** administrador inicia sesión y gestiona planta, líneas, estaciones, usuarios, operarios y proveedores.

## Orden de trabajo

1. Modelo/restricciones con UUID, `organization_id`, timestamps y activo.
2. Migración PostgreSQL + seed; índices y claves foráneas.
3. Login, hash, tokens, logout y roles `ADMIN/GERENCIA/SUPERVISOR/OPERADOR`.
4. Autorización API antes de CRUD; auditoría de login/cambios.
5. CRUD de catálogos y desactivación en vez de borrado referenciado.
6. OpenAPI y clientes tipados.
7. Desktop: login, estación y catálogos operativos.
8. Web: login responsive y gestión administrativa.

**Pruebas:** rol/tenant, token vencido, duplicados, restricciones, formularios y desactivación.

**Prueba manual:** crear 4 líneas, 2 estaciones y varios operarios/proveedores; intentar cada acción con cada rol.

**Aceptación:** ningún endpoint protegido sin permiso; desactivar conserva historial; tres aplicaciones comparten contrato.

## Mini pasos, pausas y prompts

### 1.1 Decisiones de identidad y acceso offline

**Prompt:** Define y documenta el flujo Supabase Auth → JWT → validación NestJS → perfil/rol propio. Propón la política mínima para que una estación previamente autorizada continúe operando durante una caída sin permitir administración offline peligrosa. Define roles, matriz de permisos, expiración, revocación y recuperación de cuenta. No implementes hasta señalar preguntas que requieren aprobación.

**Pausa:** aprobar matriz y decidir qué puede hacer un operador cuando no hay Internet.

### 1.2 Modelo relacional de identidad y organización

**Prompt:** Diseña `organizations`, `plants`, `production_lines`, `stations`, `user_profiles`, roles/permisos, `workers` y `suppliers`. Incluye UUID, estados, restricciones, normalización, nombres únicos por ámbito, índices y política de desactivación. Genera diagrama y diccionario; no crees aún endpoints/UI.

**Pausa:** revisar cardinalidades para una planta inicial, múltiples líneas/estaciones y futura segunda planta.

### 1.3 Migraciones y seed central

**Prompt:** Implementa migraciones PostgreSQL/Supabase del modelo aprobado y un seed completamente ficticio e idempotente. Configura esquemas, FK, checks, índices, timestamps y aislamiento por `organization_id`. Si se usa RLS como defensa adicional, las tablas de negocio deben negar acceso directo del cliente y permitir el acceso controlado del backend. Añade pruebas de migración desde cero.

**Pausa:** aplicar en base vacía, inspeccionar restricciones y repetir seed sin duplicar.

### 1.4 Validación JWT y autorización API

**Prompt:** Integra Supabase Auth en NestJS validando firma, emisor, audiencia y expiración; carga el perfil y aplica guards/policies por rol y organización. No implementes contraseñas propias ni expongas `service_role`. Añade endpoints mínimos de sesión/perfil y pruebas negativas exhaustivas.

**Pausa:** tokens ausente, vencido, alterado, usuario inactivo y rol incorrecto deben ser rechazados.

### 1.5 Auditoría transversal

**Prompt:** Implementa auditoría central para acceso y mutaciones: actor, organización, estación, acción, entidad, ID, momento, correlación y cambios permitidos. Evita datos sensibles y define retención. Prueba que una falla de negocio no deje una auditoría falsa de éxito.

**Pausa:** ejecutar login, rechazo y cambio; revisar eventos legibles sin token/contraseña.

### 1.6 API de catálogos

**Prompt:** Implementa casos de uso y endpoints paginados para plantas, líneas, estaciones, operarios y proveedores, con validación, búsqueda, activación/desactivación y códigos de error estables. No hagas CRUD genérico ni borrado físico. Añade unitarias e integración de permisos/restricciones.

**Pausa:** Postman/Swagger crea, consulta, duplica, desactiva y prueba referencias protegidas.

### 1.7 Contrato OpenAPI y clientes

**Prompt:** Completa OpenAPI con modelos, errores, seguridad, paginación y ejemplos ficticios. Automatiza generación o validación de clientes tipados para web/.NET sin editar código generado a mano. Añade comprobación CI de contrato desactualizado.

**Pausa:** regenerar desde cero sin diferencias inesperadas y consumir un endpoint desde una prueba de cada cliente.

### 1.8 Login y estación en desktop

**Prompt:** Implementa login WPF, sesión segura, selección/activación administrada de estación y pantalla según rol. Guarda tokens con mecanismo seguro del sistema, no en texto plano. Maneja expiración, falta de red y estación revocada conforme a la política aprobada. No implementes producción todavía.

**Pausa:** probar credenciales válidas/inválidas, token vencido, reinicio, offline permitido y revocación.

### 1.9 Login y administración web

**Prompt:** Implementa Supabase Auth en React, protección de rutas y pantallas responsive de catálogos. Usa API NestJS para datos de negocio, TanStack Query para servidor y formularios accesibles con validación. Maneja sesión vencida, 403, vacío, carga y error.

**Pausa:** verificar matriz de roles en Safari/Chrome y que ninguna clave privilegiada aparezca en bundle/red.

### 1.10 Prueba integrada y amenaza básica

**Prompt:** Ejecuta integración completa identidad→API→desktop/web. Haz threat modeling sencillo de activos, actores, abuso de rol, robo de token, enumeración y acceso cruzado entre organizaciones. Corrige hallazgos críticos, completa prueba manual y documentación de soporte.

**Pausa:** cero bypass de permisos; catálogos consistentes; compuerta Sprint 1 aprobada.
