# Entrada por teclado y controlador — Sprint 2.9

**Fecha:** 2026-08-26

**Estado:** aprobada técnica y manualmente el 2026-08-26; autorizado para
continuar con 2.10

## 1. Alcance

El Modo Operación recibe clic y teclado mediante un mismo enrutador de comandos.
La fuente es configurable por controlador y línea, no conoce SQLite ni ejecuta
casos de uso directamente. El piloto conserva una estación, un punto compartido
y una sola línea; una orden destinada a otra línea se rechaza sin mutar el
conteo.

No se integra sensor, PLC, lectura industrial ni HID de fabricante. Un adaptador
futuro puede implementar el mismo `IInputCommandSource`. El antirrebote, bloqueo
de tecla sostenida y feedback visual/sonoro pertenecen a 2.10.

## 2. Contrato de entrada

Cada `OperationInputCommand` contiene:

- UUID propio, reutilizado como UUID del evento cuando registra una cajuela;
- acción semántica independiente de la tecla física;
- tipo de fuente, identificador del controlador y código de señal;
- línea asignada entre 1 y 4;
- indicador `IsRepeat` recibido de Windows;
- hora de recepción.

Las acciones son seleccionar línea, registrar, cuatro flechas, confirmar,
revertir y cancelar. `IInputCommandSource` permite traducir por tipo de adaptador
o por controlador explícito. Así, dos controladores futuros pueden tener mapas y
líneas diferentes sin cambiar el ViewModel.

## 3. Configuración inicial

`OperationInput.Controllers` exige identificadores únicos, adaptador, línea y
bindings válidos. El arranque falla con una regla clara si el teclado inicial no
incluye todas las capacidades obligatorias.

| Tecla física | Señal WPF | Acción |
| --- | --- | --- |
| `1` | `D1` | Seleccionar Línea 1 |
| `+` numérico | `Add` | Registrar cajuela |
| `+` normal | `OemPlus` | Registrar cajuela |
| Flechas | `Up/Down/Left/Right` | Mover foco |
| `Enter` | `Return` | Activar control enfocado |
| `R` | `R` | Preparar reversión |
| `Escape` | `Escape` | Cancelar confirmación |

Las etiquetas visibles usan nombres conocidos por el personal; los códigos WPF
solo aparecen en configuración y pruebas.

## 4. Enrutamiento y foco

Los botones de clic crean comandos con origen `CLICK`. El adaptador WPF crea
comandos `KEYBOARD`, intercepta únicamente señales configuradas y deja pasar las
demás teclas. Ambos llaman `HandleInputCommandAsync`.

En estado normal, las flechas alternan foco entre registrar y corregir. Durante
la doble confirmación alternan entre confirmar y cancelar. `Enter` activa el
control enfocado. `R` abre directamente la preparación segura de 2.7 y
`Escape` la cancela. El indicador de foco WPF sigue visible.

El adaptador se conecta al cargar la vista y se desconecta al descargarla. Una
reconexión conserva la misma fuente y configuración; no recrea el caso de uso.

## 5. Identidad, idempotencia y trazabilidad

Al registrar por una fuente externa, el UUID y la hora del comando llegan a
`RegisterCajuelaHandler`; un reintento del mismo comando conserva la idempotencia
de 2.6. El Outbox de agregado y reversión usa `schemaVersion: 2` e incluye fuente,
controlador, señal, línea y repetición. No se modifica el esquema SQLite ni los
eventos históricos.

`IsRepeat` se conserva pero todavía no se bloquea: 2.10 aplicará la política de
tecla sostenida y antirrebote con medición. Esta separación evita esconder una
regla preventiva dentro del adaptador.

## 6. Evidencia automatizada

La suite de escritorio contiene 81 pruebas correctas y cero errores. Las nueve
pruebas incorporadas en 2.9 cubren:

1. tabla completa de teclas convencionales y ambas variantes de `+`;
2. desconexión y reconexión lógica del adaptador;
3. controlador futuro con Línea 2 y señales propias;
4. rechazo de configuración incompleta;
5. registro por teclado conservando UUID y origen;
6. flechas y `Enter` para preparar, cancelar y confirmar corrección;
7. clic atravesando el mismo enrutador con origen trazable;
8. rechazo de Línea 2 sin alterar el piloto;
9. payload Outbox v2 con origen de agregado y reversión.

## 7. Pausa manual

Con un ciclo preparado, recorrer sin mouse:

1. `1` enfoca la línea;
2. `+` registra exactamente una cajuela;
3. flechas cambian entre registrar y corregir;
4. `Enter` activa el foco;
5. `R`, flecha y `Enter` confirman o `Escape` cancela el reverso;
6. desconectar y reconectar el teclado permite continuar.

La base real actual no contiene un ciclo preparado, por lo que registrar y
revertir permanecen deshabilitados de forma correcta. En esta pausa puede
comprobarse el foco, las instrucciones y la reconexión. El recorrido manual con
mutaciones queda pendiente de disponer de un contexto operativo real o un
fixture aislado; la suite automatizada ya cubre el recorrido completo.

## 8. Evidencia manual

El responsable del proyecto abrió la aplicación y completó correctamente la
prueba disponible sobre la base real: selección de Línea 1, respuesta segura de
registro/reversión sin ciclo y funcionamiento después de desconectar y volver a
conectar el teclado.

No se generaron eventos ficticios ni se alteró la base para simular un ciclo.
Las mutaciones, navegación de confirmación y trazabilidad Outbox con contexto
activo permanecen respaldadas por las pruebas automatizadas de 2.9.

El responsable del proyecto aprobó formalmente la pausa técnica después de
comprobar las teclas y la reconexión sobre la aplicación real.
