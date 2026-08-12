# Sprint 7 — Inventario (semanas 14–15)

**Objetivo:** herramientas, materiales e insumos mediante movimientos trazables.

**Entregable:** entradas, consumos, devoluciones, ajustes, kardex y mínimos.

## Orden de trabajo

1. Clasificar consumible/herramienta, unidad, ubicación y mínimo.
2. Movimientos inmutables `ENTRADA/SALIDA/CONSUMO/DEVOLUCION/AJUSTE`; existencia = suma.
3. CRUD + API transaccional con permisos/auditoría.
4. Desktop local-first y sync idempotente.
5. Mercurio de barrida referencia exactamente un movimiento.
6. Asignación/devolución de herramientas a operario.
7. Web: kardex, existencias, filtros y mínimos.
8. Importación inicial solo si hay catálogo limpio, con previsualización/validación.

**Pruebas:** concurrencia, UUID repetido, decimales/unidades, insuficiente, reverso, permisos y mercurio único.

**Prueba manual:** conteo físico pequeño, carga, dos estaciones offline, sincronización y conciliación.

**Aceptación:** conteo = movimientos; ajustar exige motivo/permiso; ningún movimiento confirmado se borra silenciosamente.

## Mini pasos, pausas y prompts

### 7.1 Levantamiento y alcance de inventario

**Prompt:** Identifica con empresa artículos, herramientas, insumos, mercurio, unidades, ubicaciones, responsables, mínimos, entradas/salidas, préstamos y conteo físico. Decide si se permiten existencias negativas y conversiones de unidad. Separa necesidades actuales de compras/contabilidad fuera de alcance.

**Pausa:** validar catálogo de ejemplo y flujo de cinco movimientos reales.

### 7.2 Modelo de catálogo y kardex

**Prompt:** Diseña artículo/tipo/unidad/ubicación y movimientos inmutables `ENTRADA`, `SALIDA`, `CONSUMO`, `DEVOLUCION`, `AJUSTE`, `REVERSO`. Define existencia derivada, costo opcional necesario para precio/calidad, lotes si aplican y estados de herramienta. Implementa dominio y pruebas.

**Pausa:** calcular a mano un kardex con reversos y comparar dominio.

### 7.3 Migraciones e integridad

**Prompt:** Implementa esquemas PostgreSQL/SQLite, checks decimales, FK, índices, UUID/idempotencia y restricciones de unidad. Prueba actualización desde Sprint 6 y concurrencia. No mantengas un campo stock editable como única verdad.

**Pausa:** base vacía/actualizada y restricciones contra cantidad inválida verificadas.

### 7.4 Catálogo y movimientos API

**Prompt:** Implementa casos/API para administrar artículos y registrar/revertir movimientos transaccionales. Ajustes requieren permiso/motivo; desactivar conserva kardex. Define error de existencia insuficiente según política y añade auditoría/integración.

**Pausa:** Swagger recorre entrada→consumo→reverso→ajuste y roles rechazados.

### 7.5 Inventario local-first

**Prompt:** Implementa en WPF los movimientos esenciales disponibles offline con catálogo cacheado, outbox e indicador de existencia local/última central. Evita prometer stock global exacto mientras otras estaciones están offline; muestra advertencia comprensible.

**Pausa:** dos estaciones registran movimientos desconectadas y la UI no presenta una certeza falsa.

### 7.6 Sincronización y concurrencia

**Prompt:** Extiende protocolo a inventario con idempotencia y política para consumos concurrentes que superen stock al consolidar. Ningún movimiento desaparece: aceptar, rechazar para revisión o compensar según decisión aprobada. Añade pruebas de carreras y llegada fuera de orden.

**Pausa:** dos consumos simultáneos ensayados y resultado central explicable/auditable.

### 7.7 Mercurio integrado

**Prompt:** Al cerrar/confirmar consumo de mercurio de una barrida, genera o referencia exactamente un movimiento de inventario mediante operación idempotente. Define comportamiento sin artículo configurado, corrección y reverso. No dupliques la cantidad en cálculos independientes.

**Pausa:** repetir sincronización/corrección y comprobar un solo efecto neto.

### 7.8 Herramientas asignadas

**Prompt:** Implementa asignación/devolución de herramientas a operario con estado, fecha, condición y observación. Evita prestar una herramienta no disponible y conserva historial. No agregues órdenes de mantenimiento; un daño puede crear evento básico relacionado.

**Pausa:** préstamo, intento doble, devolución dañada y trazabilidad por operario.

### 7.9 Kardex y alertas web

**Prompt:** Implementa web responsive con existencias, kardex, filtros, mínimos y herramientas asignadas. Diferencia saldo confirmado central de pendientes locales conocidos; permisos por rol. Prioriza tablas exportables y alertas accionables, no gráficos decorativos.

**Pausa:** conciliar artículo seleccionado desde movimiento inicial hasta saldo mostrado.

### 7.10 Carga inicial y conciliación

**Prompt:** Si existe catálogo confiable, implementa importación CSV/Excel con plantilla, previsualización, validación por fila y aplicación transaccional/idempotente; si no, documenta carga manual. Ejecuta conteo piloto, dos estaciones offline, sync y conciliación. Completa pruebas/manual Sprint 7.

**Pausa:** saldo físico = kardex para muestra aprobada; cero críticos/altos.
