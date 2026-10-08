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
