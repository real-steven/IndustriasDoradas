# Portal gerencial web — alcance validado del MVP

**Referencia visual aprobada:** `docs/design/gerencia-web-concept.html`.

**Usuaria del primer entregable:** Lucía, con una única cuenta funcional
`JEFE_EMPRESA`. La interfaz es mobile-first, prioriza lectura y conserva la
misma identidad visual del sistema desktop sin copiar su densidad operativa.

## Recorrido principal

| Módulo | Pregunta que responde | Acción principal | Estado vacío útil |
| --- | --- | --- | --- |
| Resumen | ¿Qué está ocurriendo en la planta ahora? | Abrir una línea o un cargamento pendiente de oro | Explicar que aún no hay datos en vivo y mostrar la última actualización |
| Operación | ¿Qué línea está activa, con qué proveedor, responsable y total? | Consultar detalle; los controles físicos permanecen en desktop | Distinguir planta sin operación de conexión desactualizada |
| Oro | ¿Qué cargamentos cerrados todavía no tienen resultado? | Registrar o corregir un total opcional en gramos | Vacío significa no registrado; `0,00` es una medición válida |
| Cargamentos | ¿Qué ocurrió en un período, línea o proveedor? | Filtrar y abrir el detalle trazable | Mantener los filtros y explicar que no hubo coincidencias |
| Auditoría | ¿Quién corrigió qué, cuándo y por qué? | Abrir el cargamento relacionado | Mostrar lenguaje operativo; los códigos técnicos quedan fuera de esta vista |

El recorrido prioritario es **Resumen → línea → cargamento cerrado → oro
pendiente → auditoría**. Debe poder completarse sin conocer términos técnicos
de sincronización ni permisos.

## Reglas visibles del producto

- El resultado de oro es un único total opcional por cargamento cerrado, no un
  valor por barrida.
- No se registra custodia, existencia acumulada, venta ni oro anterior a la
  puesta en marcha.
- Desktop no muestra, almacena ni sincroniza oro.
- Cajuelas, reversos, barridas y datos tardíos se calculan en modelos centrales;
  React solo presenta esos valores.
- Toda cifra operativa muestra su momento de actualización. Un dato atrasado no
  puede parecer actual.
- Estadísticas, Trabajadores, Reportes, Inventario y Configuración se muestran
  como `Próximamente`, sin botones que aparenten funcionar.
- El MVP no incluye administración de usuarios, roles delegables ni pantallas
  de permisos.

## Estados y comportamiento responsive

Cada módulo contempla carga, vacío, error recuperable, sesión vencida y dato
desactualizado. En móvil se conserva una acción primaria por bloque, objetivos
táctiles de al menos 44 px, orden de lectura lógico y cero desplazamiento
horizontal. En escritorio se aprovecha el ancho sin convertir el portal en una
mesa de controles de planta.

Los filtros de cargamentos se conservan en la URL y cubren semana actual,
semana anterior, fecha específica, planta, línea y proveedor. La paginación y
el orden definitivo pertenecen a la API del paso 5.3.

### Períodos rápidos del expediente del trabajador

El expediente de cada trabajador (Trabajadores → Abrir) conserva los
selectores exactos «Desde» y «Hasta» (ambos inclusive) y ofrece accesos
rápidos. Todos se calculan con la fecha de hoy en `America/Costa_Rica`,
nunca con la zona horaria del navegador:

| Acceso          | Desde                                      | Hasta                                                   |
| --------------- | ------------------------------------------ | ------------------------------------------------------- |
| Esta semana     | lunes de la semana actual                  | domingo de la semana actual                             |
| Semana anterior | lunes de la semana anterior                | domingo de la semana anterior                           |
| Quincena actual | día 1 si hoy es del 1 al 15; si no, día 16 | día 15 si hoy es del 1 al 15; si no, último día del mes |
| Mes actual      | día 1 del mes actual                       | último día del mes actual (28, 29, 30 o 31)             |

**Quincena.** No existía una definición previa en el negocio ni en el código,
así que se usa la quincena calendario: primera quincena del día 1 al 15 y
segunda quincena del día 16 al último día del mes (en febrero, del 16 al 28 o
29). No significa «últimos 15 días».

Las semanas van de lunes a domingo, igual que la pre-nómina semanal existente,
y pueden cruzar de un mes a otro. Al abrir el expediente se usa «Esta semana».
Si se cambia a mano «Desde» o «Hasta», el acceso queda en «Personalizado». El
período se mantiene mientras el expediente está abierto y vuelve a «Esta
semana» al cerrarlo. Horas, jornadas, incidencias, tarifa y bruto los calcula
la API para el período elegido; las jornadas abiertas no se cuentan como cero
horas ni como pago, solo se avisan.

## Proveedores dentro de Trabajadores

No hay módulo de Configuración: la ruta `/gerencia/configuracion` redirige a
Trabajadores. Las líneas, las reglas operativas y la estación no se editan
desde la web.

Trabajadores muestra tres bloques, en este orden: **Proveedores**, **Jefes de
planta** y **Operarios**. El buscador filtra los tres. Solo el bloque de
operarios se pagina.

- Un proveedor no es un usuario: no inicia sesión ni tiene asistencia, tarifa
  ni planilla. Se le paga aparte, con un monto que la aplicación no calcula.
- Guarda únicamente el nombre de la empresa, el correo y el teléfono.
- Se crea desde «+ Agregar nuevo», con la opción «Proveedor».
- Se edita desde su ficha, y se suspende o reactiva desde ahí; suspender exige
  un motivo. Nunca se elimina, así que su historial de cargamentos se conserva.
- «Material propio» aparece primero, con la etiqueta «Predeterminado», y no se
  puede suspender ni renombrar, porque desktop lo reconoce por su nombre.
- Un proveedor suspendido deja de ofrecerse al preparar cargamentos en
  desktop después de la siguiente sincronización.
- Cada cambio queda en la auditoría con quién lo hizo, el valor anterior, el
  valor nuevo, la fecha y el motivo cuando corresponde.

## Criterio de aceptación de 5.1

5.1 queda aprobado cuando:

1. las cinco rutas confirmadas existen bajo `/gerencia`;
2. Lucía puede identificar operación actual, cargamento y oro pendiente desde
   el concepto sin explicación adicional;
3. el portal explica la diferencia entre oro ausente y oro medido en cero;
4. los módulos futuros están separados y marcados como `Próximamente`;
5. no aparecen custodia, gobierno de usuarios ni acciones operativas de
   desktop.

El concepto aprobado y las pruebas del shell web cubren esta compuerta. Los
datos mostrados siguen siendo estados honestos hasta conectar la API en 5.3.
