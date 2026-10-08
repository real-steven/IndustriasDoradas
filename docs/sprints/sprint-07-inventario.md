# Sprint 7 — Inventario y mantenimiento básico (semanas 14–15)

**Objetivo:** conocer existencias y vida útil de herramientas/componentes
mediante movimientos y revisiones trazables, sin construir compras,
contabilidad ni un CMMS.

**Entregable:** catálogo validado, kardex append-only sin negativos, revisiones
físicas, operación local-first para `JEFE_PLANTA`, consulta/corrección gerencial,
registro básico de instalación/retiro de componentes de rastra y novedades
simples de paro/mantenimiento transferidas desde 4.10.

## Dependencias y límites heredados

1. Reutiliza catálogos, desactivación y auditoría de Sprint 1.
2. Reutiliza persistencia local, outbox y sincronización idempotente de Sprints
   2–4.
3. Reutiliza API, filtros, frescura y shell web de Sprint 5. No depende
   funcionalmente de asistencia, aunque se ejecute después de Sprint 6.
4. Desktop pertenece a `JEFE_PLANTA`; web pertenece a `JEFE_EMPRESA`.
   `ADMINISTRADOR` no forma parte del alcance vigente.
5. Las mediciones `SWEEP_INPUT/SWEEP_REMAINDER` de mercurio no son movimientos
   de inventario ni permiten inferir consumo, pérdida o merma.
6. El nombre técnico y la unidad del componente de desgaste de las rastras
   deben validarse en 7.1; no se codifica “neumático”, “forro” u otro término
   provisional como verdad del dominio.
7. Asignar herramientas a un operario es opcional y solo se implementa si el
   flujo real lo requiere.

## Orden de trabajo

1. Levantar catálogo, unidades, responsables, ubicación lógica y componentes
   reemplazables reales.
2. Diseñar artículos, movimientos inmutables, reversos y revisiones físicas.
3. Diseñar historial de instalación/retiro/condición de componentes de rastra,
   más novedades simples de planta/línea, sin órdenes de mantenimiento.
4. Implementar PostgreSQL/SQLite, integridad, idempotencia e índices.
5. Implementar API transaccional y permisos vigentes.
6. Implementar movimientos/revisiones local-first en desktop.
7. Extender push/pull y resolver concurrencia sin ocultar conflictos.
8. Implementar en web existencias, kardex, revisiones y vida útil.
9. Integrar mercurio únicamente si se aprueba un movimiento físico separado;
   nunca derivarlo de las mediciones de barrida.
10. Carga inicial, conciliación y cierre.

**Pruebas:** UUID repetido, entrada/salida/reverso, unidad inválida, stock
insuficiente, dos estaciones offline, llegada fuera de orden, ajuste con motivo,
revisión sin diferencias, reemplazo de componente conservando historial y
novedad que atraviesa un cambio de jornada.

**Prueba manual:** conteo físico pequeño, carga inicial, movimientos desde
desktop, desconexión, consolidación, consulta web y conciliación con la misma
fecha de corte.

**Aceptación:** existencia = suma explicable de movimientos vigentes; ninguna
confirmación desaparece; los conflictos offline quedan visibles; cada ajuste o
reemplazo conserva actor, motivo y estado anterior/nuevo.

## Mini pasos, pausas y prompts

### 7.1 Levantamiento y vocabulario

**Prompt:** Identifica con la empresa herramientas, consumibles, envases,
unidades, ubicación y responsables reales. Confirma el nombre del componente de
desgaste de cada rastra, intervalo aproximado de reemplazo y datos que se anotan
hoy. Parte de una sola planta y cantidades enteras solo cuando la unidad lo
permita. Deja compras, costos y múltiples bodegas fuera de alcance.

**Pausa:** catálogo y cinco movimientos/reemplazos reales aprobados.

### 7.2 Kardex y revisiones

**Prompt:** Diseña artículo, unidad y movimientos append-only `ENTRADA`,
`SALIDA`, `CONSUMO`, `DEVOLUCION`, `AJUSTE` y `REVERSO`. La existencia se deriva
de movimientos y no puede quedar negativa. Modela revisión
`SIN_DIFERENCIAS/CON_DIFERENCIAS`; una revisión sin diferencias no reescribe
stock.

**Pausa:** un kardex manual con reverso/ajuste coincide con el dominio.

### 7.3 Componentes de rastra y novedades

**Prompt:** Diseña un historial mínimo de componente instalado: rastra, tipo,
identificador opcional, fecha de instalación, retiro, condición, responsable y
observación. El reemplazo cierra una instalación y abre otra sin borrar la
anterior. Modela además una novedad simple con planta/línea, tipo opcional,
descripción, responsable, inicio y fin opcional para explicar paros, feriados,
emergencias o mantenimiento. Puede atravesar jornada. No agregues órdenes,
repuestos, predicción ni agenda CMMS.

**Pausa:** dos reemplazos producen una línea temporal clara y una novedad
explica un período sin producción.

### 7.4 Migraciones e integridad

**Prompt:** Implementa PostgreSQL/SQLite con aislamiento por organización,
checks de cantidad/unidad, FK, índices, UUID, append-only y actualización desde
Sprint 6. No mantengas un `stock` editable como única verdad. Prueba base vacía,
actualización e historial referenciado.

**Pausa:** migraciones repetibles y restricciones verificadas.

### 7.5 API y autorización

**Prompt:** Implementa casos específicos para catálogo, movimientos, reversos,
ajustes, revisiones y componentes. `JEFE_PLANTA` opera desde desktop y
`JEFE_EMPRESA` consulta/corrige desde web según política. Ajuste y corrección
requieren motivo; desactivar conserva kardex; no implementes CRUD genérico ni
borrado físico.

**Pausa:** OpenAPI recorre entrada→salida→reverso→ajuste y rechaza accesos no
autorizados.

### 7.6 Inventario local-first

**Prompt:** Implementa WPF para movimientos y revisiones esenciales con
catálogo cacheado, evento + outbox atómicos y última frescura central. Mientras
otra estación esté offline, presenta saldo local/central con advertencia y no
prometas existencia global exacta.

**Pausa:** registrar, reiniciar y continuar offline sin perder movimientos.

### 7.7 Sincronización y concurrencia

**Prompt:** Extiende push/pull con idempotencia y llegada fuera de orden. Define
la política cuando dos salidas desconectadas superarían el stock central:
ningún movimiento desaparece; el servidor acepta, rechaza para revisión o exige
compensación según la regla aprobada. Añade pruebas de carrera y convergencia.

**Pausa:** dos estaciones producen un resultado central auditable y comprensible.

### 7.8 Inventario web

**Prompt:** Implementa el módulo `Inventario` de Sprint 5 para
`JEFE_EMPRESA`: existencias, kardex, diferencias, fecha de corte, última
revisión e historial de componentes. Conserva filtros en URL, paginación y
frescura. Recordatorios de revisión/reemplazo son informativos y configurables,
nunca bloquean.

**Pausa:** un artículo y una rastra se reconstruyen desde su primer evento.

### 7.9 Frontera con mercurio y asignaciones

**Prompt:** No conviertas entrada menos remanente de mercurio en consumo de
inventario. Si la empresa confirma un acto físico separado de retiro/ingreso de
mercurio, enlaza ese movimiento idempotentemente con la barrida sin duplicar
cantidades. Implementa asignación de herramientas a trabajador únicamente si
7.1 confirmó responsable, entrega y devolución.

**Pausa:** repetir sincronización/corrección mantiene un solo efecto neto y las
mediciones de barrida permanecen intactas.

### 7.10 Carga inicial y cierre

**Prompt:** Si existe catálogo confiable, ofrece plantilla CSV/Excel con
previsualización y aplicación transaccional; de lo contrario usa carga manual.
Ejecuta conteo piloto, dos estaciones offline, conciliación, regresión y cierre.
No importes cuadernos sin fecha/unidad verificable.

**Pausa:** muestra física = kardex para el mismo corte y cero críticos/altos.
