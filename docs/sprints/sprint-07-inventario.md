# Sprint 7 — Inventario (semanas 14–15)

**Objetivo:** herramientas y utensilios mediante movimientos y revisiones trazables.

**Entregable:** entradas, salidas, devoluciones, ajustes, kardex sin negativos y revisión periódica.

## Orden de trabajo

1. Levantar catálogo real de palas, escaleras, tornillos, taladros y otros; validar unidades enteras/consumibles.
2. Movimientos inmutables `ENTRADA/SALIDA/CONSUMO/DEVOLUCION/AJUSTE`; existencia = suma.
3. CRUD + API transaccional con permisos/auditoría.
4. Desktop local-first y sync idempotente.
5. Mercurio de barrida referencia exactamente un movimiento.
6. Asignación/devolución de herramientas a operario.
7. Web: kardex, existencias, última revisión y recordatorios; sin mínimos inicialmente.
8. Importación inicial solo si hay catálogo limpio, con previsualización/validación.

**Pruebas:** concurrencia, UUID repetido, decimales/unidades, insuficiente, reverso, permisos y mercurio único.

**Prueba manual:** conteo físico pequeño, carga, dos estaciones offline, sincronización y conciliación.

**Aceptación:** conteo = movimientos; ajustar exige motivo/permiso; ningún movimiento confirmado se borra silenciosamente.

## Mini pasos, pausas y prompts

### 7.1 Levantamiento y alcance de inventario

**Prompt:** Identifica catálogo real de herramientas/utensilios, unidades y responsables. Parte de cantidades enteras y una sola ubicación lógica (planta), sin mínimos ni negativos. Valida consumibles/envases como gasolina antes de modelarlos. Separa compras/contabilidad fuera de alcance.

**Pausa:** validar catálogo de ejemplo y flujo de cinco movimientos reales.

### 7.2 Modelo de catálogo y kardex

**Prompt:** Diseña artículo/tipo/unidad y movimientos inmutables `ENTRADA`, `SALIDA`, `CONSUMO`, `DEVOLUCION`, `AJUSTE`, `REVERSO`, además de revisión `SIN_DIFERENCIAS/CON_DIFERENCIAS`. Define existencia derivada sin negativos y estados de herramienta. No agregues costo/lotes sin aprobación.

**Pausa:** calcular a mano un kardex con reversos y comparar dominio.

### 7.3 Migraciones e integridad

**Prompt:** Implementa esquemas PostgreSQL/SQLite, checks decimales, FK, índices, UUID/idempotencia y restricciones de unidad. Prueba actualización desde Sprint 6 y concurrencia. No mantengas un campo stock editable como única verdad.

**Pausa:** base vacía/actualizada y restricciones contra cantidad inválida verificadas.

### 7.4 Catálogo y movimientos API

**Prompt:** Implementa casos/API para artículos, movimientos y revisiones. Jefe de planta/administrador registran; ajustes requieren motivo; desactivar conserva kardex; existencia insuficiente siempre rechaza. Una revisión sin diferencias no reescribe cantidades.

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

**Prompt:** Implementa web de lectura con existencias, kardex, última revisión, diferencias y tiempo transcurrido. Recordatorios configurables orientativos (24/36/48/72 h), visibles para jefe de planta y jefe de empresa, no bloquean. Sin mínimos inicialmente.

**Pausa:** conciliar artículo seleccionado desde movimiento inicial hasta saldo mostrado.

### 7.10 Carga inicial y conciliación

**Prompt:** Si existe catálogo confiable, implementa importación CSV/Excel con plantilla, previsualización, validación por fila y aplicación transaccional/idempotente; si no, documenta carga manual. Ejecuta conteo piloto, dos estaciones offline, sync y conciliación. Completa pruebas/manual Sprint 7.

**Pausa:** saldo físico = kardex para muestra aprobada; cero críticos/altos.
