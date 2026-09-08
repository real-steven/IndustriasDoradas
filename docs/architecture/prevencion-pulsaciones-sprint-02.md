# Prevención de pulsaciones accidentales — Sprint 2.10

## Decisión operativa

`Registrar cajuela` continúa siendo una acción inmediata y sin confirmación.
La aplicación no usa pausas ni temporizadores antes de escribir: compara marcas
de tiempo monotónicas y acepta la primera pulsación en el mismo recorrido de
entrada de 2.9.

El filtro eléctrico inicial permanece en **75 ms**, configurable entre 25 y
500 ms mediante `OperationSafety:DebounceMilliseconds`. Además, la decisión
operativa fija una espera de **3000 ms después de cada registro aceptado**,
configurable mediante `OperationSafety:RegistrationCooldownMilliseconds`:

- toda señal marcada `IsRepeat` se rechaza, sin importar cuánto dure;
- una segunda pulsación antes de 75 ms se considera rebote;
- cualquier intento antes de completar 3000 ms desde el último registro se
  ignora, aunque provenga de otra fuente como clic o teclado;
- a los 3000 ms exactos o después se permite la siguiente cajuela;
- el antirrebote se separa por controlador y línea, mientras que la espera de
  seguridad se comparte por línea.

La corrección `CAJUELA_REVERSED` conserva preparación y confirmación porque
reduce el conteo. Registrar, elegir línea, mover foco y cancelar no agregan una
confirmación.

## Feedback configurable

El resultado operativo existente actúa como región viva y cambia de color:
verde para éxito, ámbar para prevención/advertencia y rojo para error. Cada
cajuela aceptada reproduce un tono ascendente corto propio. Los intentos
suprimidos mantienen el aviso ámbar pero son silenciosos para no convertir una
doble pulsación en una alarma molesta. Un error real conserva una señal distinta.
`VisualFeedbackEnabled` y `SoundFeedbackEnabled` pueden desactivarse por
configuración sin cambiar el caso de uso.

Al sostener `+` se explica que debe soltarse antes de un nuevo registro. Para un
rebote se muestra el intervalo medido, de modo que la conducta sea visible y
predecible durante la prueba.

## Métricas locales anónimas

La migración `005_operation_input_metrics` añade un historial inmutable. Una
cola acotada lo escribe en segundo plano para que una base lenta o un fallo de
métricas no afecte la pulsación principal. Se guardan únicamente:

- acción y tipo genérico de fuente;
- resultado (`ACCEPTED`, `SUPPRESSED`, `UNAVAILABLE` o `FAILED`);
- latencia, intervalo entre pulsaciones y marca de repetición;
- código técnico de error y tiempos UTC.

No se guardan trabajador, proveedor, cargamento, evento de producción,
controlador, estación ni línea. La tabla rechaza `UPDATE` y `DELETE`.

## Cobertura y pausa

Las pruebas automatizadas demuestran pulsación sostenida bloqueada, segundo
intento por otra fuente a 2999 ms bloqueado, nueva cajuela a 3000 ms aceptada,
feedback de éxito y persistencia inmutable sin identificadores operativos.

Pausa manual propuesta con un contexto activo:

1. en `Estación`, elevar al jefe, seleccionar proveedor y responsable, preparar
   el resumen y confirmar Línea 1;
2. volver a `Modo Operación`, pulsar `+` una vez y comprobar un único incremento inmediato y feedback verde;
3. sostener `+` y comprobar que no aumenta repetidamente y aparece la explicación;
4. hacer una doble pulsación y comprobar un solo incremento, aviso visual sin
   sonido de error; esperar tres segundos y confirmar que la siguiente sí suma;
5. preparar una corrección con `R`, confirmar que exige `Enter`, y cancelar otra con `Esc`;
6. opcionalmente desactivar sonido en `appsettings.Local.json`, reiniciar y comprobar que la protección permanece.

## Validación manual diferida

La pausa manual quedó registrada como `DT-S2-001` en la guía del Sprint 2, bajo
responsabilidad de `DevHenry`. La implementación y sus pruebas automatizadas
permiten continuar con 2.11, pero esta deuda debe cerrarse con el procedimiento
de PIN aprobado y la validación del jefe de desarrollo antes del cierre formal
del sprint.
