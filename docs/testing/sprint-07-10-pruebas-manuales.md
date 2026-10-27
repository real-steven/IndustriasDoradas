# Pruebas manuales — Sprint 7.10

**Estado:** recorrido de una estación aprobado el 2026-10-27. La sección de dos
estaciones queda preparada y condicionada a que la empresa adopte esa topología.

## Condiciones previas

- Usar una planta de prueba o datos autorizados por la empresa.
- No copiar cantidades del audio ni de cuadernos sin unidad y fecha verificadas.
- Tener una cuenta `JEFE_EMPRESA` y una cuenta `JEFE_PLANTA` con elevación. Dos
  estaciones autorizadas solo son necesarias si la empresa despliega más de una.
- Elegir al menos un artículo retornable y uno consumible con unidad confirmada.
- Anotar la hora de corte usada para comparar conteo, kardex y existencia.

## A. Catálogo y entrada inicial

1. En web, abrir `Inventario > Catálogo`.
2. Crear o elegir un tipo y una unidad con la precisión correcta.
3. Crear el artículo. Confirmar que aparece con saldo cero y que no se crea un
   movimiento por esta acción.
4. En desktop, actualizar el catálogo, seleccionar el artículo y registrar una
   `Entrada` con la cantidad físicamente contada.
5. Sincronizar y confirmar en web que la existencia coincide y el kardex muestra
   una sola entrada inicial.

## B. Flujo operativo y correcciones

1. Registrar una `Salida` de una herramienta y, si existe, elegir responsable.
2. Registrar un `Reintegro / devolución`, elegir la salida original y usar una
   cantidad menor o igual a la pendiente.
3. Confirmar que el saldo aumenta y que ambos hechos permanecen en el kardex.
4. Registrar un `Consumo` del artículo consumible; confirmar que una cantidad
   superior al saldo es rechazada con un mensaje comprensible.
5. Registrar deliberadamente un movimiento de prueba equivocado y usar
   `Anular movimiento` con motivo. Confirmar que el original no desaparece, el
   reverso aparece una sola vez y un segundo intento es rechazado.

## C. Revisión física

1. Contar un artículo y registrar el mismo valor que el saldo esperado.
2. Confirmar `SIN DIFERENCIAS` y que no se agregó un movimiento.
3. Repetir con una diferencia controlada. Confirmar que el conteo no cambia el
   saldo por sí solo.
4. Registrar después un `Ajuste` por la diferencia con motivo; verificar que el
   nuevo saldo coincide con el conteo.

## D. Gerencia web

1. En `Inventario > Registrar`, ejecutar una entrada o salida excepcional.
2. Dejar destino y observación vacíos y confirmar que el formulario lo permite.
3. Ejecutar una revisión, un ajuste motivado y un reverso. Confirmar que cada
   acción aparece en kardex, diferencias o auditoría según corresponda.
4. Verificar que artículo y unidad no pueden omitirse y que la unidad no se
   cambia dentro del movimiento.

## E. Dos estaciones offline

**Condicional:** ejecutar antes de habilitar una segunda estación real. El
despliegue vigente usa una sola estación para todas las líneas; mientras se
mantenga esa topología, la integración automatizada cubre este conflicto.

1. Sincronizar ambas estaciones y anotar el saldo central conocido.
2. Desconectar ambas. Registrar salidas concurrentes cuya suma exceda el saldo.
3. Reconectar la primera y luego la segunda.
4. Confirmar que el servidor acepta solo lo compatible con el saldo, que el
   rechazo permanece visible para revisión y que ningún hecho desaparece.
5. Actualizar ambas estaciones y web; deben converger al mismo saldo central.

## F. Componentes y novedades

Ejecutar esta sección únicamente después de aplicar la migración remota de
7.10.4 y sincronizar el catálogo en desktop.

1. En desktop, activar `Modo Jefe de Planta`, abrir `Inventario` y actualizar.
2. En `Componentes de rastra`, elegir rastra, `Instalar componente`, artículo,
   cantidad y condición. Guardar y comprobar que aparece pendiente de
   sincronización, pero que la existencia del artículo no cambia.
3. Sincronizar y abrir en web `Inventario > Componentes`. Confirmar que la
   instalación muestra rastra, artículo, cantidad, condición, fecha y actor.
4. Desde desktop o web, reemplazar esa instalación indicando condición anterior,
   condición nueva y motivo. Sincronizar y confirmar que el historial conserva
   ambas instalaciones y deja solo la nueva activa.
5. En desktop, abrir una novedad de toda la planta o de una línea, elegir una
   categoría si corresponde y escribir una descripción sencilla. Sincronizar.
6. En web, abrir `Inventario > Novedades`, confirmar alcance, categoría, inicio y
   estado abierto; cerrarla y comprobar que conserva apertura, cierre y duración.
7. Confirmar que ninguna de estas acciones creó una orden de trabajo, una agenda
   de mantenimiento ni un movimiento automático de inventario.

## Evidencia de cierre

Guardar capturas o acta breve con:

- artículo, unidad, conteo físico y hora de corte;
- suma del kardex y existencia para ese mismo corte;
- salida, reintegro enlazado, revisión, ajuste y reverso;
- resultado de dos estaciones, cuando esa topología esté habilitada;
- instalación y reemplazo del componente, más apertura/cierre de una novedad;
- `pnpm run verify` aprobado;
- cero defectos críticos o altos.

No cerrar 7.10 mientras la captura de componentes/novedades de 7.10.4 siga
pendiente o alguna de estas evidencias no tenga resultado verificable.
