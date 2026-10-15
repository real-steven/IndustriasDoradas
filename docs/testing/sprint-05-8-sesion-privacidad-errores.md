# Sprint 5.8 — Sesión, privacidad y errores

## Objetivo

Confirmar que la sesión gerencial se renueva y cierra sin mezclar datos entre
cuentas, y que los estados de autorización, conexión y servicio se explican sin
mostrar tokens ni diagnósticos técnicos.

## Cobertura automatizada preparada

- `TOKEN_REFRESHED` vuelve a consultar `/auth/session` con el token nuevo sin
  borrar el perfil vigente durante la renovación.
- `SIGNED_OUT`, cierre manual y 401 vacían inmediatamente la caché de React
  Query.
- El cierre usa el alcance `local`, por lo que no expulsa otros dispositivos.
- Un 401 finaliza la sesión y muestra un mensaje seguro; un 403 no se reintenta
  ni muestra el diagnóstico del servidor.
- Las solicitudes no salen cuando el navegador informa que está offline.
- La restauración inicial y cada llamada a la API abandonan la carga después de
  15 segundos si el servicio no responde, en lugar de dejar el portal cargando
  indefinidamente.
- Fallas de red, 5xx, validación y permisos tienen política de reintento
  diferenciada; solo una falla transitoria recibe un reintento.
- El portal anuncia el modo offline y conserva los datos previamente cargados.
- Estados de error usan avisos accesibles y textos orientados a la usuaria.

Henry ejecuta las pruebas automatizadas mediante `pnpm run verify`.

## Recorrido manual

### SES-01 — Renovación transparente

1. Inicie sesión y abra Resumen, Cargamentos y Oro.
2. Abra Edge DevTools con **F12**, seleccione **Aplicación** > **Almacenamiento
   local** y ubique la clave `sb-...-auth-token` del origen local.
3. En **Consola**, fuerce únicamente la fecha de vencimiento del valor guardado:

   ```js
   const key = Object.keys(localStorage).find(
     (item) => item.startsWith("sb-") && item.endsWith("-auth-token"),
   );
   if (!key) throw new Error("No hay una sesión Supabase local");
   const storedSession = JSON.parse(localStorage.getItem(key));
   storedSession.expires_at = Math.floor(Date.now() / 1000) - 10;
   localStorage.setItem(key, JSON.stringify(storedSession));
   location.reload();
   ```

4. En **Red**, filtre por `token` y después actualice los datos. No copie ni
   muestre el contenido del token en capturas o registros.

**Esperado:** la sesión continúa, el perfil sigue siendo `JEFE_EMPRESA`, no hay
parpadeo hacia el login y las consultas posteriores usan la sesión renovada.

### SES-02 — Cierre y botón Atrás

1. Abra un cargamento y Oro para llenar la caché.
2. Pulse **Cerrar sesión**.
3. Use el botón Atrás del navegador y vuelva a `/gerencia`.

**Esperado:** aparece el login y ningún nombre, cargamento, total de oro ni dato
de auditoría vuelve a ser visible.

### SES-03 — Aislamiento entre cuentas

1. Cierre la sesión gerencial.
2. Inicie con otra cuenta disponible o una cuenta sin rol gerencial.

**Esperado:** no aparece contenido de la sesión anterior. Una cuenta sin
`JEFE_EMPRESA` recibe acceso restringido y no hereda filtros ni respuestas
privadas desde memoria.

### SES-04 — Sesión vencida / 401

1. Con la web abierta, invalide o reemplace temporalmente la sesión mediante el
   procedimiento de prueba disponible.
2. Pulse **Actualizar datos**.

**Esperado:** la web limpia los datos privados, vuelve al login y muestra
`La sesión venció. Inicie sesión nuevamente.` sin enseñar JWT, token ni detalle
interno.

### SES-05 — Sin permiso / 403

1. Inicie sesión en la web con una cuenta `JEFE_PLANTA` disponible.
2. Copie temporalmente solo su `access_token` desde la clave local
   `sb-...-auth-token`, abra **Authorize** en Swagger y péguelo en el campo
   Bearer. No lo guarde en archivos, capturas o mensajes.
3. Ejecute, por ejemplo,
   `GET /api/v1/organizations/{organizationId}/management/operation-lines` con
   `page=1` y `pageSize=10`.
4. Quite la autorización de Swagger al terminar.

**Esperado:** Swagger responde 403; la web informa que la cuenta no tiene
permiso. No reintenta repetidamente ni presenta códigos internos como una falla
de conexión. Sin credenciales de una cuenta no gerencial, el 403 manual no es
ejecutable; un token ausente solo comprueba 401 y un `JEFE_EMPRESA` comprueba
200.

### SES-06 — Offline con datos previos

1. Cargue Operación con conexión.
2. En Edge DevTools cambie Network a **Offline**.
3. Pulse **Actualizar datos** y recorra Cargamentos/Oro.

**Esperado:** aparece `Sin conexión`, Operación conserva su última respuesta
marcada como desactualizada y ninguna pantalla confunde vacío con error.

### SES-07 — Recuperación de red y reintento

1. Desde SES-06, restaure Network a **Online**.
2. Pulse el botón de actualización o reintento una vez.

**Esperado:** desaparece el aviso offline, se obtiene información actual y no se
generan solicitudes repetitivas.

### SES-08 — Estados vacío, carga y error

1. Use filtros que no devuelvan cargamentos.
2. Compare ese estado con Offline y con API detenida temporalmente.

**Esperado:** vacío afirma que la consulta respondió; carga pide esperar;
offline indica ausencia de red; y servicio no disponible ofrece reintento. Los
cuatro estados son visual y textualmente distintos.

### SES-09 — Privacidad de mensajes

1. Revise login, errores de Operación, Oro, Cargamentos y Auditoría.
2. Busque visualmente cadenas `Bearer`, `JWT`, direcciones internas, stack trace
   o fotografías. Como apoyo, ejecute en la consola:

   ```js
   /(Bearer\s|JWT|sb_(?:secret|publishable)_|authorization:|stack trace)/i.test(
     document.body.innerText,
   );
   ```

**Esperado:** no se muestra ninguna de esas cadenas ni imágenes personales. Los
mensajes solo explican sesión vencida, permiso, conexión o indisponibilidad. La
expresión anterior devuelve `false`. El encabezado Authorization visible dentro
de la herramienta **Red** no cuenta como una fuga de la interfaz.

### SES-10 — Recuperación de contraseña

1. Solicite recuperación con un correo válido y con uno inexistente.

**Esperado:** ambos casos muestran el mismo mensaje genérico para no revelar si
la cuenta existe. Esta igualdad de respuesta sí se puede comprobar localmente;
la recepción real del correo se registra aparte como no ejecutada si todavía no
hay buzón o configuración de entrega disponible.

## Registro de cierre

- `pnpm run verify`: aprobado por Henry el 2026-10-13 después de la corrección
  final de restauración de sesión y del manejo del timeout.
- Renovación activa y restauración después de recargar: conformes según
  recorrido de Henry el 2026-10-13; SES-01 aprobado. Cierre y botón Atrás:
  SES-02 aprobado.
- Aislamiento entre cuentas y sesión vencida: SES-03 y SES-04 aprobados.
- 403 gerencial: aprobado por Henry el 2026-10-13 con una cuenta no autorizada;
  Swagger respondió `HTTP_403`; SES-05 aprobado.
- Offline, reconexión y estados vacío/carga/error: SES-06, SES-07 y SES-08
  aprobados.
- Privacidad de mensajes: SES-09 aprobado.
- Recuperación de contraseña: respuesta genérica conforme el 2026-10-13; la
  entrega real del correo queda como prueba menor no bloqueante.
- Resultado final: Sprint 5.8 aprobado por Henry el 2026-10-13.
