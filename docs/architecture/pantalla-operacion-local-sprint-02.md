# Pantalla de operación local — Sprint 2.8

**Fecha:** 2026-08-26

**Estado:** aprobada técnica y manualmente el 2026-08-26; autorizado para
continuar con 2.9

## 1. Alcance

La aplicación abre en `Modo Operación` y muestra un único panel para la línea
piloto. El panel presenta el contexto confirmado de SQLite y permite registrar
una cajuela con un clic o iniciar la doble confirmación de corrección inmediata.

No se construye un wireframe de cuatro líneas ni ventanas independientes. La
entrada abstracta de teclado/controlador, el antirrebote, bloqueo de tecla
sostenida y feedback sonoro pertenecen a 2.9–2.10. La preparación privilegiada
del cargamento y responsable conserva sus casos de uso de 2.5; esta pantalla no
inventa un CRUD operativo.

## 2. Límites de presentación

La implementación separa:

- `SqliteOperationDashboardRepository`: obtiene una instantánea de solo lectura
  con sesión, nombres, relevo anterior, total y pendientes;
- `OperationViewModel`: coordina actualización, registro y corrección sin SQL ni
  dependencias visuales;
- `OperationLinePanelViewModel`: estado presentable de una línea;
- `OperationView`: encabezado y estado del punto de control;
- `OperationLinePanel`: componente visual reutilizable para una línea.

Esta división permite agregar después una colección de paneles sin duplicar el
caso de uso ni acoplar el dominio a `Línea 1`. En el MVP no aparece un selector
redundante: la única línea se considera seleccionada y usa borde dorado cuando
está lista.

## 3. Estados visibles

| Estado | Presentación | Registro |
| --- | --- | :---: |
| Contexto activo | Línea lista, proveedor/inicio, responsables, jornada y total | Sí |
| Sin contexto | Línea sin preparar e instrucción para el jefe | No |
| SQLite disponible | `Guardado local disponible` y pendientes separados | Según contexto |
| Fallo de SQLite | `Guardado local no disponible` e instrucción clara | No |
| Corrección preparada | Resumen del cambio de total y botones confirmar/cancelar | Pausado en la vista |

La jornada se deriva de `America/Costa_Rica` y las horas visibles usan UTC−06:00.
El estado de Internet no se confunde con el guardado: los pendientes se muestran
por separado y el registro no espera a la red.

## 4. Acciones

`REGISTRAR CAJUELA` es el control dominante, con tamaño apto para clic y nombre
de automatización accesible. Solo se habilita con ciclo activo y almacenamiento
local confirmado. Al terminar actualiza total, pendientes y resultado visible.

`Corregir última cajuela` reutiliza 2.7:

1. prepara sin escribir y muestra el cambio esperado;
2. exige `Sí, corregir última` o permite cancelar;
3. al confirmar refresca total y pendientes;
4. si cambió el contexto, informa que debe prepararse nuevamente.

Los controles conservan el indicador global de foco de WPF. El mapeo de teclas
y controladores no se adelanta a 2.9.

## 5. Evidencia automatizada

La suite de escritorio contiene 72 pruebas correctas y cero errores. Las ocho
pruebas incorporadas en 2.8 cubren:

1. instantánea SQLite con cargamento activo, proveedor, relevo, contador y
   Outbox pendiente;
2. estado sin ciclo que conserva la línea piloto y bloquea el registro;
3. representación del contexto activo y acción principal habilitada;
4. un clic que registra una vez y actualiza el total visible;
5. corrección que no escribe durante el primer paso y escribe al confirmar;
6. contexto inactivo con ambas mutaciones deshabilitadas;
7. fallo del almacenamiento local visible y acción principal bloqueada.
8. confirmación obsoleta cerrada con instrucción para preparar nuevamente.

## 6. Pausa manual

En el monitor donde operará la estación se debe comprobar:

1. que el nombre de línea, estado, total y botón principal se leen a distancia;
2. que una ventana pequeña conserva acceso mediante desplazamiento y no corta
   los controles;
3. que `Línea sin preparar` explica por qué no se puede registrar;
4. que una línea preparada permite registrar y el total cambia una sola vez;
5. que la corrección muestra un segundo paso claro y cancelar no cambia el total;
6. que el personal distingue guardado local de pendientes por enviar.

La comprensión final con usuarios de planta sigue siendo deuda explícita hasta
la reunión posterior ya registrada en 2.1.

## 7. Evidencia manual

El responsable del proyecto inició la aplicación dos veces sin errores y
confirmó que la pantalla se ve correctamente en el monitor utilizado. Con la
base todavía sin un ciclo preparado, la vista mostró el estado seguro esperado:
línea sin preparar, total cero y mutaciones deshabilitadas.

La validación de comprensión con personal de planta continúa pendiente porque
depende de la reunión posterior con la empresa; no se interpreta esta revisión
técnica como sustituto de esa validación de usuario final.

El responsable del proyecto aprobó formalmente la pausa técnica después de
revisar los dos arranques y la presentación en el monitor objetivo.
