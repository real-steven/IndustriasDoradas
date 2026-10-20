# Sprint 5.11 — Usuarios de planta

Mejora técnica posterior al cierre de Sprint 5. No modifica desktop y no
reabre la aceptación de 5.1–5.10.

## Preparación

1. Aplicar la migración
   `20261018182320_sprint_5_11_plant_manager_provisioning.sql` al Supabase de
   desarrollo.
2. Iniciar API y web con la cuenta única `JEFE_EMPRESA`.
3. Confirmar que existe al menos una planta y una estación activas.
4. Usar datos ficticios. No capturar contraseña, PIN, token ni clave secreta en
   screenshots o archivos compartidos.

## Verificación automatizada

La compuerta general que ejecutará Henry es:

```powershell
pnpm run verify
```

Cobertura añadida:

- SQL: aprovisionamiento atómico pendiente, relación planta/estación/PIN,
  activación completa y rechazo de un perfil incompleto.
- API: DTO de contraseña/PIN, creación de `JEFE_PLANTA`, rol/permiso y ausencia
  de secretos en auditoría.
- Web: confirmaciones locales, creación pendiente y activación separada.

## Recorrido manual

### USR-01 — Navegación y alcance

1. Iniciar sesión como `JEFE_EMPRESA`.
2. Abrir **Usuarios**.
3. Confirmar que el módulo dice **Usuarios de planta** y no ofrece crear
   administradores ni trabajadores operativos.

**Esperado:** solo se administran cuentas personales `JEFE_PLANTA`.

### USR-02 — Validaciones locales

1. Escribir contraseñas distintas e intentar crear.
2. Repetir con PIN distintos.
3. Repetir sin seleccionar estación.

**Esperado:** cada caso se rechaza antes de enviar la solicitud y los campos
sensibles conservan tipo contraseña.

### USR-03 — Creación pendiente

1. Completar nombre y correo ficticios.
2. Usar una contraseña de al menos 12 caracteres con mayúscula, minúscula,
   número y símbolo.
3. Usar un PIN de 6 a 12 dígitos.
4. Elegir planta, una o más estaciones e idioma.
5. Crear la cuenta.

**Esperado:** aparece en la lista como **PENDIENTE**, método **Directa**. La
respuesta de Network/Swagger no contiene contraseña, PIN ni verificador.

### USR-04 — Pendiente no autorizado

1. Antes de activar, intentar iniciar sesión en desktop con el correo y la
   contraseña creados.

**Esperado:** Supabase puede reconocer las credenciales, pero el API rechaza el
perfil pendiente y la estación no se abre.

### USR-05 — Activación

1. Entregar correo, contraseña y PIN por un canal directo de prueba.
2. Pulsar **Activar cuenta**.

**Esperado:** el estado cambia a **ACTIVA**. Una segunda activación no está
disponible en la interfaz.

### USR-06 — Contrato desktop sin cambios

1. Iniciar desktop con el usuario activo.
2. Abrir una estación asignada.
3. Entrar al modo elevado con el PIN creado.

**Esperado:** login, snapshot de estación y elevación funcionan con el desktop
existente. Una estación no asignada sigue prohibida.

### USR-07 — Correo duplicado

1. Intentar crear otra cuenta con el mismo correo.

**Esperado:** conflicto legible; no aparece una segunda cuenta ni un perfil
parcial.

### USR-08 — Suspensión

1. Suspender una cuenta activa sin motivo.
2. Escribir un motivo y confirmar.
3. Reintentar acceso online desde desktop.

**Esperado:** no se permite confirmar sin motivo; después se muestra
**SUSPENDIDA** y el API rechaza la cuenta.

### USR-09 — Reactivación

1. Reactivar la cuenta suspendida.
2. Volver a iniciar sesión en desktop.

**Esperado:** recupera estado **ACTIVA** y mantiene sus estaciones y PIN. La
autorización offline previa puede conservar vigencia hasta el límite ya
documentado de 24 horas.

### USR-10 — Privacidad y bilingüismo

1. Cambiar el portal a inglés y repetir la lectura del formulario y estados.
2. Revisar respuesta, consola del navegador, logs del API y Auditoría.

**Esperado:** la interfaz está traducida y no aparece contraseña, PIN,
verificador, token o clave secreta. Auditoría conserva rol, planta, cantidad de
estaciones y método `DIRECT`.

## Mejora posterior reservada

`EMAIL_INVITATION` no se prueba en 5.11. El valor queda reservado para que una
feature posterior envíe correo y permita al usuario establecer personalmente
contraseña y PIN antes de activarse.
