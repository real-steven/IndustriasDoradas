# Dominio de inventario — Sprint 7.2

**Estado:** diseño y dominio puro implementados
**Fecha:** 2026-10-24
**Persistencia:** reservada para 7.4
**API y sincronización:** reservadas para 7.5 y 7.7

## Propósito

Definir un kardex explicable para una planta minera pequeña sin codificar el
catálogo físico de la empresa. Los nombres de artículos, tipos y unidades son
datos configurables; las reglas invariables son append-only, precisión por
unidad, idempotencia, saldo derivado y prohibición de existencias negativas.

Este paso no crea tablas, endpoints ni pantallas. Su resultado es un dominio
probado que esas capas deben respetar después.

## Vocabulario estable

| Interfaz en español | Nombre técnico | Efecto |
| --- | --- | ---: |
| Entrada | `ENTRY` | Suma cantidad. |
| Salida | `EXIT` | Resta cantidad que podría reintegrarse. |
| Consumo | `CONSUMPTION` | Resta cantidad usada definitivamente. |
| Reintegro / Devolución | `RETURN` | Suma cantidad y puede referenciar una salida. |
| Ajuste | `ADJUSTMENT` | Suma o resta una diferencia física motivada. |
| Anular movimiento | `REVERSAL` | Agrega una compensación exacta del movimiento original. |

Las etiquetas visibles pueden refinarse en 7.10 sin cambiar los tipos técnicos
ni reescribir historia. Un reverso no es `DELETE`: original y compensación
permanecen auditables y un movimiento solo puede revertirse una vez.

## Catálogo

### Tipo de artículo

`InventoryItemType` conserva UUID, código normalizado, nombre visible, indicador
de tipo particular y estado activo. Es catálogo, no `enum`, porque la empresa
puede crear un tipo nuevo desde la opción `Otro`.

### Unidad

`InventoryUnit` conserva UUID, código, nombre y precisión entre cero y tres
decimales. La unidad valida cada cantidad:

- unidades, cajas, paquetes y sacos comienzan con precisión cero;
- peso, volumen y longitud pueden admitir fracciones;
- una unidad particular puede configurarse sin modificar el dominio;
- no se convierten cajas a unidades ni gramos a kilogramos en este sprint.

### Artículo

`InventoryItem` exige organización, planta, tipo, nombre y una unidad base. Un
movimiento copia el código de unidad esperado y el kardex rechaza mezclar otra
unidad. Cambiar la unidad de un artículo con historia requerirá una política
explícita posterior; 7.4 no debe permitirlo como una edición común.

Desactivar tipo o artículo impide uso nuevo, pero nunca elimina movimientos,
revisiones o reportes históricos.

## Movimiento inmutable

Cada `InventoryMovement` conserva:

- UUID cliente;
- organización, planta y artículo;
- unidad;
- tipo y delta firmado;
- actor autenticado;
- estación y secuencia cuando nace offline en desktop;
- trabajador responsable opcional;
- ocurrencia y registro en UTC;
- destino y observación opcionales;
- motivo obligatorio para ajuste y reverso;
- movimiento relacionado opcional para reintegro y obligatorio para reverso.

Una mutación gerencial web no inventa estación o secuencia, pero siempre conserva
actor y UUID. Una mutación desktop lleva estación y secuencia juntas. La API y
PostgreSQL deberán validar de nuevo permisos, alcance e idempotencia.

## Proyección del kardex

`InventoryLedger.Project` recibe los movimientos en el orden aceptado por la
autoridad correspondiente y deriva el saldo sin modificar eventos:

1. El mismo UUID con contenido idéntico es un reintento y cuenta una vez.
2. El mismo UUID con contenido distinto es conflicto.
3. Una estación no reutiliza la misma secuencia para dos movimientos.
4. Un kardex no mezcla artículo, unidad, planta u organización.
5. Cada delta se aplica al saldo anterior; si produciría negativo se rechaza
   indicando cantidad solicitada y existencia disponible.
6. Un reintegro vinculado referencia una salida anterior y la suma de sus
   reintegros no puede excederla.
7. Un reverso referencia un movimiento anterior, usa el delta exactamente
   opuesto y no se repite.
8. Una salida con reintegros parciales no puede anularse completa; requiere un
   ajuste o una corrección coherente que no duplique el efecto.

La llegada concurrente desde dos estaciones se resolverá transaccionalmente en
7.7. La decisión vigente es rechazar para revisión el movimiento que encuentre
saldo central insuficiente, conservarlo visible y nunca descartarlo.

## Revisiones físicas

Una `InventoryReview` contiene uno o más artículos de la misma organización y
planta. Cada línea conserva saldo esperado, conteo físico, unidad y diferencia.

- todas las diferencias en cero producen `SIN_DIFERENCIAS`;
- cualquier diferencia produce `CON_DIFERENCIAS`;
- la revisión no altera el kardex;
- una diferencia confirmada origina después un `AJUSTE` separado y motivado;
- no se permiten cantidades negativas, artículos duplicados ni mezcla de
  plantas en una revisión.

## Dataset manual aprobado

### Martillos

| Orden | Movimiento | Delta | Saldo |
| ---: | --- | ---: | ---: |
| 1 | Entrada inicial de 10 unidades | +10 | 10 |
| 2 | Salida de 4 unidades | -4 | 6 |
| 3 | Reintegro de 2 asociado a la salida | +2 | 8 |
| 4 | Ajuste físico provisional | -1 | 7 |
| 5 | Reverso del ajuste digitado para artículo incorrecto | +1 | 8 |

Una salida posterior de 9 se rechaza porque solo existen 8. El historial sigue
mostrando los cinco eventos y señala qué ajuste fue revertido.

### Otros escenarios

- Sal: entrada de 20 kg y consumo de 3 kg producen 17 kg.
- Filtros: saldo esperado 5 y conteo 4 producen revisión con diferencias; el
  saldo continúa en 5 hasta confirmar un ajuste de -1.
- Un reintegro relacionado de 5 no puede referenciar una salida de 4.
- Un reintento idéntico no duplica; UUID o secuencia reutilizados con otro
  contenido se rechazan.
- Un movimiento web conserva actor aunque no tenga estación.

## Cambios seguros en 7.10

Sin rehacer el dominio se podrán agregar o desactivar tipos, unidades y
artículos; ajustar nombres visibles; cambiar precisión antes de que una unidad
tenga historia; completar el catálogo físico; y refinar campos opcionales.

Requerirían revisar diseño y migraciones: múltiples unidades simultáneas por
artículo, conversiones, varias bodegas con saldos separados, existencias
negativas o cambiar el significado contable de un tipo de movimiento.

## Implementación de referencia

- `Domain/Inventory/InventoryCatalog.cs`: tipo, unidad y artículo.
- `Domain/Inventory/InventoryMovement.cs`: hechos inmutables y contexto de
  estación/web.
- `Domain/Inventory/InventoryLedger.cs`: idempotencia, reversos, reintegros,
  alcance y saldo.
- `Domain/Inventory/InventoryReview.cs`: conteos sin modificación automática.
- `InventoryDomainTests.cs`: dataset manual, precisión, negativos, conflictos,
  revisiones y aislamiento.

La persistencia de 7.4 debe representar estos hechos sin introducir un campo
`stock` editable como autoridad. Un saldo materializado futuro solo podrá ser
una proyección reconstruible desde el kardex.
