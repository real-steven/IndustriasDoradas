# Sprint 4 — Alertas, barridas, mercurio y oro (semanas 8–9)

**Objetivo:** completar el ciclo desde la cajuela hasta oro certificado y custodia.

**Entregable:** alertas configurables en múltiplos de 50, barridas con cantidad real, mercurio/oro por línea-cargamento y solicitud de entrega.

## Orden de trabajo

1. Validar unidad/precisión del mercurio y conversión/redondeo real de palos.
2. Modelar barrida por eventos incluidos, cantidad real, línea, cargamento y responsable.
3. Alertas visuales/sonoras 50–55, 100–105, etc., sin bloquear alimentación.
4. Permitir barrida menor, igual o mayor a 50; barrida final obligatoria al terminar cargamento.
5. Registrar mercurio posterior a barrida en decimal y unidad aprobada.
6. Registrar oro parcial por barrida y certificarlo por jefe de planta.
7. Consolidar oro por línea, jornada, día, cargamento y proveedor.
8. Registrar custodia y solicitudes de entrega en gramos.
9. Integrar novedades simples de paro/mantenimiento/feriado.
10. Sincronizar y auditar todo idempotentemente.

**Pruebas:** 49/50/55/56, 99/100/105/106, reverso 50→49→50, barrida final de 30, barrida única de 60, rechazo de segunda línea para el mismo cargamento, decimales, doble certificación y llegada fuera de orden.

**Prueba manual:** cargamentos separados en líneas distintas sin repartir ninguno, alertas, barridas reales, mercurio, oro parcial/definitivo, desconexión y solicitud de entrega.

**Aceptación:** trazabilidad oro → barrida real → eventos → cargamento/línea/responsable; total del cargamento exacto; cifras pendientes no se inventan.

## Mini pasos, pausas y prompts

### 4.1 Validar medidas pendientes

**Prompt:** Contrasta con planta la unidad definitiva y precisión del mercurio, rangos razonables, variación de `1 palo = 0,1 g` y cualquier redondeo. Mantén gramos como unidad canónica de oro. Documenta decisiones y no programes fórmulas no aprobadas.

**Pausa:** responsable confirma unidad/decimales de mercurio y conversión/redondeo de oro.

### 4.2 Modelo de barrida real

**Prompt:** Modela barrida como registro explícito de línea+cargamento y conjunto/rango verificable de eventos. La cantidad puede ser menor, igual o mayor a 50; nunca mezcla cargamentos y existe barrida final. Incluye responsable, momentos, estado, mercurio y resultado certificado. Define correcciones sin borrar.

**Pausa:** ejemplos ficticios de cargamentos 30, 60 y 130 quedan representados sin ambigüedad.

### 4.3 Migraciones central/local

**Prompt:** Implementa migraciones PostgreSQL/SQLite del modelo aprobado con checks decimales, unidades, FK, índices e idempotencia. Incluye resultados parciales, consolidación derivable y custodia/entrega sin columnas duplicadas. Prueba actualización desde Sprint 3.

**Pausa:** migración nueva/actualizada conserva producción y no permite mezclar cargamentos.

### 4.4 Servicio de alertas

**Prompt:** Implementa servicio puro con umbral configurable inicialmente 50. Activa alerta en 50–55 y repite 100–105, 150–155, etc.; reverso 50→49 la retira y volver a 50 la reactiva. La señal grande dura aproximadamente 10 segundos, no bloquea y no presupone que la barrida ocurrió.

**Pausa:** tabla automatizada cubre límites, múltiplos, reversos y conteo continuo.

### 4.5 Alerta operacional

**Prompt:** Integra alerta WPF visual muy llamativa y sonora perceptible/no molesta, identificando claramente la línea. Tras el aviso grande conserva la señal acordada dentro del intervalo y retírala al superar 55. Permite continuar sin confirmación ni máximo rígido.

**Pausa:** prueba con ruido, a distancia, pulsaciones rápidas y dos líneas alertando.

### 4.6 Registro de barrida

**Prompt:** Implementa registro simple de la barrida efectivamente realizada: línea, cargamento, eventos/cajuelas incluidos, cantidad real, responsable y tiempos. El operario principal decide cuándo barrer; el jefe de planta registra/certifica datos resultantes. Evita solapamiento y doble registro.

**Pausa:** registrar barrida de 50, final de 30 y única de 60; reconstruir eventos exactos.

### 4.7 Mercurio

**Prompt:** Registra mercurio después de la barrida con cantidad decimal, unidad aprobada, responsable y observación. Prepara referencia a inventario posterior sin descontar dos veces. Correcciones posteriores al cierre son administrativas y auditadas.

**Pausa:** validar decimales, unidad, cero/negativo/extremo y reversión idempotente.

### 4.8 Oro parcial y definitivo

**Prompt:** Registra oro parcial por barrida en gramos decimales, certificado por jefe de planta. Deriva automáticamente totales por línea, jornada, día (medianoche Costa Rica), cargamento y proveedor. El definitivo del cargamento es la suma de sus barridas en la única línea asignada. Muestra palos solo con conversión aprobada.

**Pausa:** dataset manual coincide por todos los cortes y no cuenta dos veces un parcial.

### 4.9 Custodia y entrega

**Prompt:** Modela oro bajo custodia y solicitud de entrega en gramos desde desktop. Conserva cantidad solicitada, jefe de planta, receptora, fechas y estado. La confirmación/rechazo se completará en web; discrepancia guarda cantidad recibida y motivo. No agregues venta, transporte ni contabilidad.

**Pausa:** producido − entregado confirmado = custodia; rechazo no descuenta silenciosamente.

### 4.10 Novedades operativas

**Prompt:** Implementa notas simples para paro, mantenimiento, emergencia, feriado u otro motivo: línea/planta, tipo opcional, descripción, responsable e inicio/fin si aplica. Puede atravesar jornada. No construyas CMMS ni categorías rígidas no existentes.

**Pausa:** explicar un periodo sin producción desde historial y conservarlo tras reinicio.

### 4.11 Sincronización, trazabilidad y cierre

**Prompt:** Extiende push/pull/idempotencia a alertas emitidas, barridas, mercurio, oro, custodia, entregas y novedades. Añade consulta oro→barrida→cajuelas→cargamento/línea/responsable y prueba llegada fuera de orden. Completa ciclo realista y ficha manual.

**Pausa:** totales local/central iguales, cadena completa y compuerta Sprint 4 aprobada.
