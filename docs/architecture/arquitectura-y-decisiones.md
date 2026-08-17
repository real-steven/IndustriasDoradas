# Arquitectura y decisiones técnicas

Este documento reúne los diagramas y las decisiones arquitectónicas aceptadas
el 2026-08-14. Si una decisión cambia, se agrega una sección con fecha y motivo;
no se reescribe el historial silenciosamente.

## Contexto C4

```mermaid
flowchart LR
    OP["Trabajador / Modo Operación"] -->|"Opera y marca asistencia"| SYS["Sistema Industrias Doradas"]
    JP["Jefe de planta"] -->|"Abre estación y eleva permisos"| SYS
    ADM["Administrador"] -->|"Administra y corrige"| SYS
    GER["Jefe de empresa"] -->|"Consulta y reporta"| SYS
    SYS -->|"Identidad, datos y archivos"| SUP["Supabase"]
```

## Contenedores C4

```mermaid
flowchart LR
    subgraph Planta
        DESK["Desktop WPF\nOperación local"] <--> SQLITE[("SQLite\nDatos + Outbox")]
    end

    subgraph Nube
        WEB["React\nPortal web"]
        API["NestJS\nReglas y auditoría"]
        AUTH["Supabase Auth\nIdentidad"]
        PG[("PostgreSQL\nVerdad central")]
        STORAGE["Storage\nArchivos privados"]
    end

    DESK <-->|"REST + sincronización"| API
    WEB <-->|"REST"| API
    DESK -.->|"Sesión"| AUTH
    WEB -.->|"Sesión"| AUTH
    API -->|"Valida JWT"| AUTH
    API <--> PG
    API <--> STORAGE
```

NestJS es la única puerta remota a datos de negocio. Web y desktop usan
Supabase Auth para identidad, no para consultar directamente las tablas.

## Decisiones aceptadas

### 1. Monolito modular

- **Decisión:** una API desplegable organizada por módulos de negocio.
- **Motivo:** equipo pequeño y reglas compartidas entre producción, barridas,
  asistencia e inventario.
- **Descartado:** microservicios, proyecto sin límites y CQRS completo.
- **Consecuencia:** despliegue y transacciones simples; las fronteras deben
  protegerse con revisión y pruebas. Solo se separa un módulo con evidencia.

### 2. Supabase Auth para identidad

- **Decisión:** Supabase emite JWT; NestJS valida sesión y resuelve cuenta, rol,
  organización y permisos propios.
- **Motivo:** evitar autenticación casera sin delegar autorización de negocio.
- **Descartado:** roles únicamente en el JWT y cuentas compartidas con todos los
  privilegios.
- **Consecuencia:** MFA y dispositivos autorizados son obligatorios antes de
  producción; offline admite solo la estación y sesiones previamente validadas
  durante un máximo de 24 horas.

### 3. PostgreSQL central

- **Decisión:** PostgreSQL de Supabase conserva la verdad central mediante
  migraciones, restricciones, UUID, UTC, decimales y auditoría.
- **Motivo:** relaciones, integridad y consolidación multiestación.
- **Descartado:** SQLite compartido por red, base documental y servidor local
  desde el inicio.
- **Consecuencia:** respaldo, restauración y RLS deben ensayarse; la nube nunca
  bloquea el registro local.

### 4. SQLite local-first

- **Decisión:** desktop guarda la mutación y Outbox en una transacción SQLite
  antes de confirmar en pantalla.
- **Motivo:** operar hasta 24 horas sin Internet y confirmar cajuelas rápidamente.
- **Descartado:** nube primero, archivos JSON y servidor local prematuro.
- **Consecuencia:** se requieren migraciones y protección local; durante una
  caída se garantiza convergencia posterior, no simultaneidad.

### 5. NestJS como puerta de negocio

- **Decisión:** toda operación remota atraviesa NestJS, que valida identidad,
  permisos, organización, estación, reglas, idempotencia y auditoría.
- **Motivo:** una autoridad central sin duplicar reglas en clientes.
- **Descartado:** acceso directo de clientes a Supabase, reglas solo en RLS y un
  backend distinto por cliente.
- **Consecuencia:** la API puede ser cuello de botella; desktop valida lo mínimo
  offline y NestJS siempre revalida al sincronizar.

### 6. REST/JSON y OpenAPI

- **Decisión:** API versionada bajo `/api/v1`, descrita con OpenAPI.
- **Motivo:** contratos sencillos para navegador, .NET y pruebas manuales.
- **Descartado:** GraphQL, gRPC y WebSockets como contrato principal.
- **Consecuencia:** cambios incompatibles exigen versión o migración; SSE,
  polling o WebSocket podrán complementar notificaciones.

### 7. Outbox e idempotencia

- **Decisión:** cada mutación usa UUID de origen; desktop reintenta el mismo
  evento y PostgreSQL registra una clave única dentro de la transacción.
- **Motivo:** una respuesta perdida no debe perder ni duplicar cajuelas.
- **Descartado:** enviar una vez, sobrescribir contadores, cola externa inicial y
  último escritor gana para todo.
- **Consecuencia:** se necesitan estados, reintentos e índices únicos; la
  idempotencia evita duplicados pero no resuelve conflictos semánticos.

### 8. React para web

- **Decisión:** React + TypeScript + Vite, React Router y TanStack Query.
- **Motivo:** portal responsive, bilingüe y accesible sin aplicación móvil nativa.
- **Descartado:** app móvil, Blazor, HTML sin framework y acceso directo a
  Supabase.
- **Consecuencia:** deben probarse navegadores, accesibilidad, idiomas y estados
  vacío/carga/error; todo valor `VITE_*` es público.

## Dónde se valida cada regla

| Capa | Responsabilidad |
| --- | --- |
| Desktop | Experiencia, reglas necesarias offline y transacción SQLite + Outbox. |
| Web | Formularios y presentación; nunca es autoridad de permisos. |
| NestJS | Casos de uso, identidad, permisos, reglas, idempotencia y auditoría. |
| PostgreSQL | Relaciones, unicidad, restricciones y transacciones finales. |
| Supabase Auth | Identidad y sesiones; no define roles funcionales. |

Validar en el cliente mejora la experiencia, pero no reemplaza NestJS ni las
restricciones de PostgreSQL.

## Registro offline y sincronización

```mermaid
sequenceDiagram
    actor O as Modo Operación
    participant D as Desktop
    participant S as SQLite
    participant A as NestJS
    participant P as PostgreSQL

    O->>D: Registrar cajuela
    D->>S: Transacción: evento UUID + Outbox
    S-->>D: Commit local
    D-->>O: Confirmación inmediata

    alt Con conexión
        D->>A: Enviar evento
        A->>A: Validar identidad, permisos y reglas
        A->>P: Guardar o recuperar por UUID
        P-->>A: Único resultado central
        A-->>D: Confirmación + cursor
        D->>S: Marcar sincronizado
    else Sin conexión o respuesta perdida
        D->>S: Mantener pendiente
        loop Al recuperar conexión
            D->>A: Reintentar el mismo UUID
            A->>P: Deduplicar y responder
            A-->>D: Confirmación
            D->>S: Marcar sincronizado
        end
    end
```

Una corrección administrativa llega después del cursor local, se aplica como
cambio trazable y genera una notificación. Nunca se borra el historial para
forzar coincidencia.

## Secretos

| Dato | Permitido | Prohibido |
| --- | --- | --- |
| URL y anon key | API y cliente web cuando se integre Auth | Usarlas como permiso administrativo |
| `service_role` | Gestor de secretos del proceso NestJS | Web, desktop, Git, logs y capturas |
| Sesión | Almacenamiento seguro del cliente | URL, logs y repositorio |
| Claves privadas | Gestor de secretos del despliegue | Archivos versionados |

La conexión productiva, SQLite y sincronización se implementan en sus sprints;
este documento define sus límites, no afirma que ya existan.

La matriz detallada, el flujo Supabase Auth/JWT, los modos, PIN, bloqueos y
contingencia offline se especifican en
[`identidad-y-acceso-offline.md`](identidad-y-acceso-offline.md).

## Decisiones complementarias del 2026-08-17

### 9. Estación compartida y elevación temporal

- **Decisión:** el MVP usa una sola computadora compartida. Un jefe de planta
  autentica y habilita la estación; la interfaz permanece normalmente en Modo
  Operación, que no es una cuenta de Supabase.
- **Elevación:** cada jefe usa un PIN individual para entrar temporalmente al
  Modo Jefe de Planta. Existe salida explícita y bloqueo tras dos minutos de
  inactividad total con aviso previo; un formulario incompleto se conserva
  detrás del bloqueo.
- **Auditoría:** cada elevación registra jefe, estación, hora y resultado. Cuando
  exista captura aprobada, intenta adjuntar foto; una cámara dañada no bloquea,
  marca `sin_foto` y genera alerta administrativa.
- **Consecuencia:** actividad automática, sincronización, cajuelas y check-in no
  prolongan una sesión privilegiada. Solo la interacción del jefe cuenta como
  actividad para el bloqueo.
- **Recuperación:** exceder el límite configurable de PIN bloquea únicamente la
  elevación y alerta; Modo Operación continúa. Recuperar exige contraseña
  completa en línea o restablecimiento administrativo. Supabase Auth envía la
  recuperación de contraseña al correo de la cuenta, nunca el PIN.

### 10. Roles autenticados y gobierno gerencial

- **Decisión confirmada:** las identidades son `JEFE_EMPRESA`,
  `ADMINISTRADOR` y `JEFE_PLANTA`. Los trabajadores no tienen cuenta.
- **Separación:** quien ejerza gerencia y administración utiliza dos cuentas; su
  perfil administrativo es otra cuenta `ADMINISTRADOR`, no un rol compuesto.
  Jefe de empresa puede aprobar/suspender administradores y consultar su
  auditoría, pero no editar datos operativos ordinarios.
- **Restricciones:** administrador no se autoaprueba, no altera auditoría y no
  desactiva la última cuenta gerencial activa.

### 11. Trabajador provisional y evidencia de asistencia

- **Decisión:** jefe de planta solicita un trabajador con nombre obligatorio y
  contacto opcional. El perfil puede registrar horas inmediatamente como
  `PROVISIONAL`; tras 72 horas sin resolución pasa a `PROVISIONAL_VENCIDO` sin
  bloquear ni perder marcas.
- **Resolución:** administrador aprueba, rechaza, fusiona duplicados o reasigna
  horas/evidencias. Ninguna resolución borra eventos ya confirmados.
- **Asistencia inicial:** check-in/out crea fotografía pendiente y conserva hora
  original. Jefe de planta revisa pendientes/recientes durante 24 horas;
  administrador mantiene acceso posterior protegido y auditado.
- **Retención provisional:** no hay borrado automático; las fotos se conservan
  indefinidamente hasta aprobar una política definitiva en Sprint 6. El objeto
  vive en Storage privado y la auditoría conserva referencia lógica, checksum y
  contexto, nunca el binario ni una URL permanente.
- **Biometría:** reconocimiento facial sigue condicionado a política,
  consentimiento, retención, enrolamiento multiángulo y precisión medida.

### 12. Entrada manual antes de sensor

- **Decisión:** clic, teclado y controlador USB/HID son las fuentes obligatorias
  del MVP. Comparten un puerto de entrada reemplazable y generan eventos
  inmutables con origen trazable.
- **Posterior:** un sensor sencillo puede añadirse al mismo puerto después de
  validar el flujo manual; no forma parte de la aceptación inicial ni habilita
  PLC, IoT o automatización industrial.
