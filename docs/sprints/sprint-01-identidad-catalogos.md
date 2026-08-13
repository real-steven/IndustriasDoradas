# Sprint 1 — Identidad y catálogos (semanas 2–3)

**Objetivo:** modelo central, acceso seguro y datos maestros.

**Entregable:** acceso con cuentas separadas y catálogos configurables para la planta actual, cuatro líneas, molinos/rastras, estaciones, trabajadores y proveedores.

## Orden de trabajo

1. Modelo/restricciones con UUID, `organization_id`, timestamps y activo.
2. Migración PostgreSQL + seed; índices y claves foráneas.
3. Login, tokens, logout y roles `JEFE_EMPRESA/ADMINISTRADOR/JEFE_PLANTA/OPERARIO`.
4. Cuentas gerencial y administrativa separadas cuando una persona ejerce ambos roles.
5. Autorización API antes de mutaciones; auditoría de login/cambios.
6. Catálogos, componentes de línea y desactivación en vez de borrado referenciado.
7. Preferencia de idioma `es/en`; OpenAPI y clientes tipados.
8. Desktop: login, estación y catálogos operativos.
9. Web: consulta gerencial separada de administración.

**Pruebas:** rol/tenant, separación gerencia/administración, token vencido, idioma, duplicados, restricciones y desactivación.

**Prueba manual:** crear 4 líneas, 2 estaciones y varios operarios/proveedores; intentar cada acción con cada rol.

**Aceptación:** ningún endpoint protegido sin permiso; desactivar conserva historial; tres aplicaciones comparten contrato.

## Mini pasos, pausas y prompts

### 1.1 Decisiones de identidad y acceso offline

**Prompt:** Define y documenta Supabase Auth → JWT → validación NestJS → perfil/rol propio. Usa `JEFE_EMPRESA` (lectura, Excel y confirmación limitada de entregas de oro), `ADMINISTRADOR` (mutaciones sensibles, sin reportes), `JEFE_PLANTA` (operación física) y `OPERARIO` (cajuelas). Separa cuentas gerencial/administrativa aunque pertenezcan a la misma persona. Propón la política mínima para que una estación autorizada opere offline sin administración peligrosa. Documenta MFA y dispositivos administrativos como compuerta previa a producción, no los adelantes.

**Pausa:** aprobar matriz y decidir qué puede hacer un operador cuando no hay Internet.

### 1.2 Modelo relacional de identidad y organización

**Prompt:** Diseña `organizations`, `plants`, `production_lines`, componentes configurables de línea (molino/rastras), `stations`, `user_profiles`, roles/permisos, preferencia `es/en`, `workers` y `suppliers`. Representa cuatro líneas actuales con un molino y tres rastras cada una sin fijar esa cardinalidad. Incluye UUID, estados, restricciones, nombres únicos, índices y desactivación. Genera diagrama/diccionario; no crees endpoints/UI.

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

**Prompt:** Implementa casos de uso y endpoints paginados para plantas, líneas/componentes, estaciones, trabajadores y proveedores, con validación, búsqueda, activación/desactivación y errores estables. El jefe de planta puede crear trabajadores y proveedores; solo administrador gestiona cuentas privilegiadas y configuración sensible. No hagas CRUD genérico ni borrado físico. Añade pruebas de permisos/restricciones.

**Pausa:** Postman/Swagger crea, consulta, duplica, desactiva y prueba referencias protegidas.

### 1.7 Contrato OpenAPI y clientes

**Prompt:** Completa OpenAPI con modelos, errores, seguridad, paginación y ejemplos ficticios. Automatiza generación o validación de clientes tipados para web/.NET sin editar código generado a mano. Añade comprobación CI de contrato desactualizado.

**Pausa:** regenerar desde cero sin diferencias inesperadas y consumir un endpoint desde una prueba de cada cliente.

### 1.8 Login y estación en desktop

**Prompt:** Implementa login WPF, sesión segura, estación autorizada y pantalla para `JEFE_PLANTA/OPERARIO`. Permite acceso offline limitado solo tras autenticación previa en esa estación. Guarda tokens/autorización con mecanismo seguro, maneja expiración y revocación. No implementes producción todavía.

**Pausa:** probar credenciales válidas/inválidas, token vencido, reinicio, offline permitido y revocación.

### 1.9 Login y administración web

**Prompt:** Implementa Supabase Auth en React y rutas separadas para cuenta gerencial de lectura y cuenta administrativa. Añade preferencia editable español/inglés. La sesión gerencial no muestra mutaciones; la administrativa no muestra reportes por ahora. Usa API NestJS, TanStack Query y formularios accesibles. Maneja sesión vencida, 403, vacío, carga y error.

**Pausa:** verificar matriz de roles en Safari/Chrome y que ninguna clave privilegiada aparezca en bundle/red.

### 1.10 Prueba integrada y amenaza básica

**Prompt:** Ejecuta integración completa identidad→API→desktop/web. Haz threat modeling sencillo de activos, actores, abuso de rol, robo de token, enumeración y acceso cruzado entre organizaciones. Corrige hallazgos críticos, completa prueba manual y documentación de soporte.

**Pausa:** cero bypass de permisos; catálogos consistentes; compuerta Sprint 1 aprobada.
