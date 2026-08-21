# Modelo de amenazas básico — Sprint 1

## Alcance y límites de confianza

El análisis cubre Supabase Auth, el esquema `app` en PostgreSQL, la API NestJS,
el portal React y la estación WPF. El navegador y desktop reciben únicamente
la clave publicable de Supabase; la clave secreta vive solo en el proceso API.
Los datos funcionales cruzan NestJS y no se consultan directamente desde los
clientes.

Los límites principales son:

1. persona → Supabase Auth;
2. cliente web/desktop → API mediante JWT bearer;
3. API → Supabase mediante secreto de backend;
4. estación online → estado offline protegido con DPAPI;
5. organización solicitada → organización resuelta desde el perfil.

## Activos y actores

Activos: credenciales, JWT y refresh token, PIN/verificador, perfiles y roles,
asignación de estación, catálogos, solicitudes/trabajadores, eventos de
auditoría, eventos offline pendientes y futura evidencia fotográfica.

Actores legítimos: `JEFE_EMPRESA`, `ADMINISTRADOR`, `JEFE_PLANTA`, Modo
Operación sin cuenta y servicios internos. Actores adversarios considerados:
persona sin autenticar, cuenta legítima que intenta exceder su rol, usuario de
otra organización, atacante con token robado y persona con acceso al disco de
la estación.

## Amenazas, controles y evidencia

| Amenaza | Control aplicado | Evidencia / riesgo residual |
|---|---|---|
| Abuso, confusión o escalada de privilegios | Cuenta gerencial superadministradora, permisos individuales de administrador, guards por permiso y delegación limitada al subconjunto que posee el actor | Pruebas SQL, unitarias, e2e y de rutas web; revocación consultada en cada solicitud y auditoría de concesiones |
| Acceso cruzado entre organizaciones | La organización del JWT no se acepta como dato funcional; la API resuelve perfil y compara `organizationId` de ruta | e2e devuelve `403` antes de consultar el repositorio; toda consulta de repositorio conserva filtro de organización |
| Robo o reutilización de token | Firma, emisor, audiencia y expiración validados; perfil/rol/estado se recargan; respuestas v1 usan `Cache-Control: no-store`; logout y revocación online invalidan la autorización local | El bearer sigue siendo reutilizable hasta expirar si se roba; TLS, MFA y dispositivos autorizados son compuertas obligatorias antes de producción |
| Enumeración de cuentas o catálogos | No hay endpoints públicos de búsqueda; listados requieren rol, permiso y organización; errores de autenticación no devuelven existencia de correo | Supabase Auth controla su propia respuesta de login/recuperación; revisar rate limits antes de producción |
| Acceso directo a tablas | RLS niega acceso de clientes a `app`; solo backend usa el secreto | Pruebas SQL y asesor de seguridad; proteger y rotar el secreto fuera de Git |
| Manipulación de auditoría | Eventos append-only, funciones restringidas y rechazo de campos sensibles | `004_audit_trail.sql`; el respaldo/retención operacional se completa en entrega |
| PIN adivinado o verificador malicioso | PBKDF2-SHA256 con 600 000 iteraciones exactas, comparación constante, cinco intentos/15 min, bloqueo de 15 min y segundo bloqueo en 24 h exige reautenticación | Pruebas API/desktop y `006_station_pin_workflows.sql`; el PIN no sustituye la contraseña para abrir estación |
| Robo del archivo local | DPAPI ligado al usuario/equipo de Windows; autorización offline expira a las 24 h; revalidación limpia autorización revocada sin borrar eventos | Una sesión Windows ya comprometida queda fuera de la protección de DPAPI; aplicar bloqueo de Windows y cifrado de disco antes de producción |
| Verificador PIN filtrado por caché o logs | Respuestas API v1 no se almacenan; auditoría/logs prohíben PIN, token, contraseña y fotografía | e2e valida `no-store`; el snapshot solo se entrega a un jefe activo asignado a la estación |
| Suspensión sin motivo real | La API exige razón y la web obliga a escribirla; no usa un motivo prellenado | Prueba de interacción web y auditoría de gobierno |
| CORS/CSRF | Web usa `/api` en mismo origen y bearer en encabezado, no cookie funcional; no se habilita CORS abierto | El despliegue debe mantener mismo origen o aprobar una lista explícita; cualquier cambio se reevalúa |
| Caída de red | Contingencia offline máxima de 24 h y Modo Operación no se bloquea por fallos de elevación | Los eventos pendientes todavía se sincronizarán en el Sprint 3; no se inventó sincronización en este sprint |
| Fotografía/biometría | Solo existe el puerto de evidencia y hoy registra ausencia; no hay biometría ni almacenamiento de fotos | Cuando se implemente, la retención queda indefinida según la decisión actual, pero exige política, consentimiento, almacenamiento privado y nueva revisión antes de activarse |

## Hallazgos corregidos en 1.10

- Se añadió `Cache-Control: no-store`, `Pragma: no-cache`, protección contra
  MIME sniffing, framing y fuga de referrer en la API v1.
- El verificador PIN acepta exactamente el formato/costo aprobado y rechaza
  costos arbitrarios o Base64 malformado sin derribar la estación.
- La suspensión web exige una razón escrita por la persona responsable; se
  eliminó el motivo genérico que podía falsear la auditoría.
- Se añadió una ruta e2e satisfactoria identidad → autorización de estación y
  se conservan las pruebas negativas de rol y organización.

No se encontró un bypass de permisos en el alcance automatizado. Los índices
del esquema `app` no tienen advertencias de claves foráneas sin cobertura; los
avisos de índices todavía no utilizados son esperables en una base de
desarrollo reciente. `demo_supervisor` sigue siendo solamente una guía y sus
avisos no autorizan modificarlo como esquema productivo.

## Compuertas pendientes antes de producción

- Activar MFA y enrolamiento/revocación de dispositivos administrativos.
- Activar la protección de contraseñas filtradas de Supabase Auth:
  <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>.
- Forzar TLS, endurecimiento y cifrado del equipo, copias de seguridad,
  restauración probada y rotación de secretos.
- Aprobar rate limits, origen web definitivo y políticas de fotografía antes de
  habilitar evidencia real.
- Completar la revisión manual consolidada de roles, Chrome/Safari y desktop.
