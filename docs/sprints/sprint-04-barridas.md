# Sprint 4 — Alertas, barridas, mercurio y oro (semanas 8–9)

**Objetivo:** completar el ciclo desde la cajuela hasta la barrida, los movimientos de mercurio por rastra y el oro gestionado exclusivamente desde web.

**Entregable:** alertas configurables en múltiplos de 50, barridas con cantidad real, mercurio por rastra-línea-cargamento y oro/custodia en web exclusivamente bajo la cuenta `JEFE_EMPRESA` de la gerente.

## Orden de trabajo

1. Validar unidad/precisión del mercurio, conversión visual de palos y semántica del progreso de barrida.
2. Modelar barrida por eventos incluidos, cantidad real, línea, cargamento y responsable.
3. Separar las alertas de revisión cada 50 de la referencia visual de barrida cada 250, sin bloquear alimentación.
4. Permitir barrida menor, igual o mayor a las referencias; al cerrar, guiar el registro de la barrida final sin exigir mediciones inmediatas.
5. Registrar desde desktop cargas, recargas y recuperación de mercurio por rastra, o dejar los datos pendientes.
6. Registrar oro parcial por barrida únicamente desde la web de `JEFE_EMPRESA`.
7. Consolidar oro por línea, jornada, día, cargamento y proveedor.
8. Registrar custodia y solicitudes de entrega en gramos.
9. Integrar novedades simples de paro/mantenimiento/feriado.
10. Sincronizar y auditar todo idempotentemente.

**Pruebas:** 49/50/55/56, 99/100/105/106, reverso 50→49→50, progreso 249/250/251/500, barrida real en 260 con siguiente meta 510, barrida final de 30, barrida única de 60, rechazo de mezcla entre cargamentos, cargas/recargas/recuperación por rastra, enteros/decimales, datos pendientes, acceso web de `JEFE_EMPRESA`, sesión vencida y llegada fuera de orden.

**Prueba manual:** cargamentos separados en líneas distintas sin repartir ninguno, alertas, barridas reales, mercurio por las tres rastras, oro parcial/definitivo solo en web con cuenta autorizada, desconexión y custodia.

**Aceptación:** trazabilidad oro → barrida real → eventos → cargamento/línea/responsable; total del cargamento exacto; cifras pendientes no se inventan.

## Mini pasos, pausas y prompts

### 4.1 Validar medidas pendientes

**Prompt:** Contrasta con planta la unidad definitiva y precisión del mercurio, rangos razonables, variación de `1 palo = 0,1 g` y cualquier redondeo. Distingue cargas, recargas y recuperación por cada rastra. Mantén gramos como unidad canónica de oro y reserva sus cantidades al canal web de `JEFE_EMPRESA`. Documenta decisiones y no programes fórmulas no aprobadas.

**Decisiones confirmadas el 2026-09-30:**

- Cargas, recargas y recuperación de mercurio, así como oro gerencial, se registran en gramos; aceptan enteros o hasta dos decimales y rechazan negativos.
- Un campo vacío significa medición pendiente y `0,00` significa resultado medido igual a cero.
- Gramos es la unidad canónica de oro; `1 palo = 0,10 g` se usa únicamente como conversión visual y no redondea el valor almacenado.
- El conteo de cajuelas permanece acumulado. La referencia visual inicial de barrida es 250; si se supera sin barrer, el estado pendiente y la referencia permanecen en 250, con la barra completa, hasta confirmar la barrida física.
- Una barrida en una cantidad acumulada arbitraria `N` fija la próxima referencia en `N + 250`; por ejemplo, una barrida en 260 produce `260/510`.
- La referencia no bloquea producción. Al cerrar un cargamento se debe registrar o confirmar la barrida física final; el mercurio puede completarse después en Modo Jefe de Planta y el oro únicamente en web por `JEFE_EMPRESA`, siempre mediante acciones auditadas.
- Una barrida nunca mezcla cajuelas ni resultados de cargamentos distintos.

**Pausa cumplida:** responsable confirmó unidad/decimales, conversión de oro, mediciones pendientes y comportamiento del conteo/barrida. No iniciar 4.2 sin la siguiente autorización.

### 4.2 Modelo de barrida real

**Prompt:** Modela barrida como registro explícito de línea+cargamento y conjunto/rango verificable de eventos. La cantidad puede ser menor, igual o mayor a las referencias; nunca mezcla cargamentos y existe barrida final. Incluye responsable, momentos y estado separado para la recuperación de mercurio pendiente. El oro no pertenece al dominio operativo de desktop: se incorporará como registro gerencial web, vinculado a la barrida, sin revelar cantidades en planta.

**Pausa:** ejemplos ficticios de cargamentos 30, 60 y 130 quedan representados sin ambigüedad.

**Resultado 2026-10-02:**

- `ProductionSweep` representa una barrida física inmutable, asociada a una sola organización, planta, estación, línea, ciclo y cargamento. Puede marcarse como barrida final sin exigir una cantidad predeterminada.
- La barrida conserva el UUID y la secuencia local de cada evento incluido; la cantidad neta se deriva de altas y reversos ya validados, y los responsables se obtienen de esos eventos.
- Los ejemplos automatizados de 30, 60 y 130 cajuelas quedan representados exactamente, incluida una barrida final de 30, sin asumir múltiplos de 50 ni 250.
- Barrida física y recuperación de mercurio tienen estados separados. La recuperación comienza pendiente; vacío no equivale a cero, mientras `0` sí es una medición válida.
- Cada medición o corrección de mercurio agrega una entrada nueva con perfil y momento. El modelo desktop no expone métodos, estado ni historial de oro.
- La validación entre barridas distintas —eventos solapados, doble barrida final e idempotencia persistida— queda expresamente para la persistencia y el servicio de registro de 4.3 y 4.6.

**Pausa cumplida:** modelo y pruebas de dominio aprobados técnicamente. No iniciar 4.3 sin una nueva `R`.

### 4.3 Migraciones central/local

**Prompt:** Implementa migraciones PostgreSQL/SQLite del modelo aprobado con checks decimales, unidades, FK, índices e idempotencia. Modela las rastras como equipos identificables de su línea; conserva movimientos de carga, recarga y recuperación de mercurio. En PostgreSQL separa oro/custodia con políticas para `JEFE_EMPRESA`; impide acceso a jefe de planta y SQLite desktop no guarda cantidades de oro. Prueba actualización desde Sprint 3.

**Pausa:** migración nueva/actualizada conserva producción y no permite mezclar cargamentos.

**Resultado 2026-10-02:**

- PostgreSQL incorpora barridas inmutables con sus eventos exactos, conteo neto validado al confirmar la transacción, una sola barrida final por cargamento y claves compuestas que impiden mezclar organización, línea, ciclo o cargamento. Un evento de producción solo puede pertenecer a una barrida.
- Carga inicial, recarga y recuperación de mercurio se conservan como movimientos inmutables por rastra. El valor canónico es gramos con hasta dos decimales; `NULL` permanece pendiente y cero es una medición válida. Las correcciones agregan una nueva versión enlazada y no reemplazan el historial.
- PostgreSQL separa resultados de oro y decisiones de entrega del dominio operativo. Se añadieron `gold.read`, `gold.results.manage` y `gold.deliveries.manage`; `JEFE_EMPRESA` obtiene toda capacidad activa y `JEFE_PLANTA` no obtiene acceso. Las capacidades administrativas creadas previamente quedan como compatibilidad técnica y no se exponen en el flujo actual.
- Las tablas centrales nuevas mantienen RLS y acceso directo revocado para `anon` y `authenticated`; el API sigue siendo la única puerta de negocio mediante `service_role` y `app.profile_has_permission`.
- SQLite avanza de versión 11 a 12 con rastras locales, barridas, eventos incluidos y movimientos de mercurio en centigramos exactos. No contiene tablas ni columnas de oro.
- La actualización automatizada desde una base Sprint 3 conserva cargamentos y eventos existentes. PostgreSQL local rechazó solapamiento y mezcla; SQLite rechazó reutilizar eventos y registrar mercurio contra un componente que no sea rastra.
- La migración `20261002083007_sprint_4_3_sweeps_mercury_gold` quedó aplicada únicamente en Supabase de desarrollo. Antes y después permanecieron `19` cargamentos, `67` eventos de producción y `175` recibos de sincronización; las nuevas tablas iniciaron vacías.

**Pausa cumplida:** persistencia central/local verificada y datos del Sprint 3 conservados. No iniciar 4.4 sin una nueva `R`.

### 4.4 Servicio de alertas

**Prompt:** Implementa un servicio puro que separe: a) alertas configurables de revisión inicialmente cada 50, con los intervalos 50–55, 100–105, etc.; y b) progreso/referencia de barrida inicialmente cada 250. El total acumulado nunca se reinicia. Si se supera una referencia sin barrer, conserva `Barrida pendiente`, la barra completa y la misma referencia física. Una barrida real en `N` fija la próxima referencia en `N + 250`. Ninguna señal bloquea ni presupone que la barrida ocurrió.

**Pausa:** tabla automatizada cubre límites, múltiplos, reversos y conteo continuo.

**Resultado 2026-10-03:**

- `ProductionMilestoneService` calcula señales informativas sin estado ni efectos laterales. La alerta de revisión y el progreso de barrida usan configuraciones independientes; sus valores iniciales son 50, una extensión inclusiva de 5 cajuelas y 250 respectivamente.
- Las alertas quedan activas en `50–55`, `100–105` y ventanas equivalentes. Salir por reverso y volver a entrar —por ejemplo `50→49→50`— vuelve a producir el estado activo; la futura interfaz decidirá cómo presentar cada transición sin bloquear la alimentación.
- El total de cajuelas siempre permanece acumulado. Al alcanzar una referencia sin barrer, `IsSweepPending` conserva esa referencia y la barra queda completa: `249/250`, `250/250`, `251/250` y `500/250` hasta registrar la barrida física.
- Una barrida real establece un nuevo origen sin alterar el total. Una barrida en `260` produce el tramo `260/510`; al llegar o superar `510`, la barra queda completa y la referencia permanece en `510` hasta la siguiente barrida real.
- El servicio admite barridas tempranas y totales superiores a 500, no confirma barridas implícitamente y no contiene ninguna regla de bloqueo, persistencia, sonido o interfaz.

**Pausa cumplida:** pruebas automatizadas cubren límites, múltiplos, reverso, configuración independiente, barrida real arbitraria y conteo continuo. No iniciar 4.5 sin una nueva `R`.

### 4.5 Alerta operacional

**Prompt:** Integra alerta WPF visual muy llamativa y sonora perceptible/no molesta, identificando claramente la línea. Tras el aviso grande conserva la señal acordada dentro del intervalo y retírala al superar 55. Permite continuar sin confirmación ni máximo rígido.

**Pausa:** prueba con ruido, a distancia, pulsaciones rápidas y dos líneas alertando.

**Resultado 2026-10-04:**

- Desktop integra el servicio puro de 4.4 en cada tarjeta de línea. Al entrar en un múltiplo de 50 muestra un aviso grande durante ocho segundos, identifica explícitamente la línea y reproduce una secuencia breve de tres notas distinta del sonido normal de registro.
- Después del aviso grande, cada tarjeta conserva una franja visible `REVISAR MERCURIO` dentro de la ventana inclusiva acordada: `50–55`, `100–105` y equivalentes. La señal desaparece al salir de la ventana y puede activarse nuevamente después de un reverso como `50→49→50`.
- Los avisos transitorios de líneas distintas se apilan y pueden coexistir; un aviso nuevo de la misma línea sustituye únicamente al anterior de esa línea. La operación continúa sin confirmación, sin diálogo modal y sin alterar la disponibilidad de agregar o corregir cajuelas.
- La revisión de mercurio y la barrida permanecen separadas. En `250` se conserva la alerta de mercurio, la tarjeta indica `Barrida pendiente` y la barra queda completa en `250`; no se presume ni se registra una barrida.
- La barra usa referencias dinámicas y no impone un máximo al contador. Las pruebas WPF y de vista cubren el intervalo `50–55`, retiro en `56`, reverso, dos líneas simultáneas, acumulado continuo después de `250` y continuidad de los comandos.

**Pausa parcial:** compilación, render, pulsaciones rápidas y dos líneas quedaron cubiertos automáticamente. La percepción del sonido con ruido real de planta y a distancia requiere validación manual en el equipo físico. No iniciar 4.6 sin esa comprobación o una autorización expresa para continuar.

**Ajuste temporal de pruebas 2026-10-05:** se retiró el botón manual `ENFOCAR` porque la cabecera ya se repliega automáticamente tras ocho segundos de inactividad. Cada tarjeta activa ofrece provisionalmente `+5`, que registra cinco eventos independientes en su propia línea. La espera adicional de tres segundos queda configurada en cero durante las pruebas de volumen; el antirrebote de 75 ms y el bloqueo de pulsación sostenida continúan activos. El cierre 8.14 debe restaurar los 3000 ms y retirar o restringir `+5` antes del piloto.

**Ajuste visual y de responsabilidad 2026-10-05:** los avisos dejaron de ocupar espacio dentro de las tarjetas. La revisión de mercurio aparece transitoriamente arriba a la derecha y la barrida pendiente permanece allí hasta su registro, de modo que las cuatro líneas conservan tamaño estable. Los rechazos técnicos se consultan en Diagnóstico; no se envían como aprobaciones a la gerente.

**Ajuste de lectura del contador 2026-10-06:** la tarjeta distingue tres cifras sin agregar una fila nueva. El valor principal representa cajuelas desde la última barrida y puede superar `250 / 250` mientras siga pendiente; al confirmar la barrida vuelve a `0 / 250`. Dos valores secundarios conservan el total acumulado del cargamento y el total ya incluido en barridas. Por ejemplo: antes de barrer `260 / 250`, total `260`, barridas `0`; después `0 / 250`, total `260`, barridas `260`; la siguiente cajuela muestra `1 / 250`, total `261`, barridas `260`. Es una presentación derivada y reversible: no cambia eventos, barridas ni auditoría.

### 4.6 Registro de barrida

**Prompt:** Implementa registro simple de la barrida efectivamente realizada: línea, cargamento, eventos/cajuelas incluidos, cantidad real, responsable y tiempos. El operario principal decide cuándo barrer; el jefe de planta confirma el registro físico y puede dejar la recuperación de mercurio pendiente. No solicites ni muestres oro en desktop. Al cerrar un cargamento sin barrida final, presenta un flujo de confirmación que registra la barrida antes del cierre. Evita solapamiento, mezcla de cargamentos y doble registro.

**Pausa:** registrar barrida de 50, final de 30 y única de 60; reconstruir eventos exactos.

**Resultado 2026-10-05:**

- La escoba de cada tarjeta prepara una barrida con la línea y el cargamento activos, el conjunto exacto de eventos todavía no barridos, su cantidad neta, los responsables derivados y los momentos de ejecución/registro. Preparar no bloquea nuevas cajuelas; una corrección sí espera a resolver la confirmación para no alterar el conjunto preparado.
- El jefe de planta confirma desde un panel no modal que exige el modo elevado en la interfaz. La barrida se guarda atómicamente en SQLite junto con todos sus eventos; un evento no puede pertenecer a dos barridas y un UUID repetido solo se acepta si coincide también su conjunto exacto.
- El progreso corregido conserva la referencia vencida y la barra completa hasta una barrida real. Por ejemplo, el contador puede continuar a `260/250`; al confirmar en 260, el nuevo tramo es `260/510` sin reiniciar el total.
- Finalizar un cargamento prepara primero una barrida final con las cajuelas posteriores a la última barrida, la muestra en el resumen y la registra antes del cierre. Si no quedan cajuelas pendientes no inventa una barrida vacía. La recuperación de mercurio queda pendiente y desktop no solicita ni muestra oro.
- Las correcciones ya no pueden retirar un evento incluido en una barrida. El panel operativo reconstruye la última cantidad acumulada barrida desde SQLite después de reiniciar la aplicación.
- Las pruebas automatizadas verifican barridas exactas de 50, final de 30 y única de 60, reintento idempotente, vínculos de todos los eventos, mercurio pendiente y cierre guiado con barrida final. La sincronización de estos registros se mantiene deliberadamente para 4.11 y no genera mensajes incompatibles en la cola actual.

**Pausa cumplida:** registro local y flujo de cierre verificados. No iniciar 4.7 sin una nueva autorización.

**Refinamiento operativo 2026-10-05:** el operario puede corregir la última cajuela no barrida durante cinco minutos. Después requiere Modo Jefe de Planta y motivo obligatorio. SQLite conserva actor, rol, motivo y total anterior/posterior. Auditoría presenta un resumen por cargamento finalizado con proveedor, línea, periodo, responsables, barridas, correcciones y estado pendiente/completo de mercurio; las correcciones forman una lista separada. La web queda reservada a la gerente y este refinamiento no inicia 4.7.

### 4.7 Mercurio

**Prompt:** Registra en desktop los movimientos reales de mercurio por rastra, línea y cargamento: carga inicial, cada recarga adicional y recuperación asociada a la barrida cuando corresponda. Acepta gramos enteros o con hasta dos decimales, vacío pendiente y cero medido; rechaza negativos y no impongas un máximo no validado. Permite completar datos más tarde en Modo Jefe de Planta, conserva cada cambio auditado y no califica automáticamente la diferencia como pérdida o consumo. Prepara referencia a inventario posterior sin descontar dos veces.

**Pausa:** validar decimales, unidad, cero/negativo/extremo y reversión idempotente.

### 4.8 Oro parcial y definitivo

**Prompt:** Implementa en web el registro de oro parcial por barrida en gramos, aceptando enteros o hasta dos decimales, vacío pendiente y cero medido. Solo `JEFE_EMPRESA` puede consultar, crear y corregir en el alcance actual. No sincronices cantidades a SQLite desktop. Deriva automáticamente totales por línea, jornada, día (medianoche Costa Rica), cargamento y proveedor sin tratar pendientes como cero. El definitivo del cargamento es la suma de sus barridas en la única línea asignada. Muestra palos solo como conversión visual `1 palo = 0,10 g` sin alterar el valor canónico.

**Pausa:** dataset manual coincide por todos los cortes y no cuenta dos veces un parcial.

### 4.9 Custodia y entrega

**Prompt:** Modela oro bajo custodia y su entrega exclusivamente en web para `JEFE_EMPRESA`. Una discrepancia conserva cantidad registrada, cantidad recibida y motivo. Desktop no consulta cantidades ni inicia solicitudes. No agregues venta, transporte ni contabilidad.

**Pausa:** producido − entregado confirmado = custodia; rechazo no descuenta silenciosamente.

### 4.10 Novedades operativas

**Prompt:** Implementa notas simples para paro, mantenimiento, emergencia, feriado u otro motivo: línea/planta, tipo opcional, descripción, responsable e inicio/fin si aplica. Puede atravesar jornada. No construyas CMMS ni categorías rígidas no existentes.

**Pausa:** explicar un periodo sin producción desde historial y conservarlo tras reinicio.

### 4.11 Sincronización, trazabilidad y cierre

**Prompt:** Extiende push/pull/idempotencia a alertas emitidas, barridas y mercurio. Mantén oro, custodia y entregas fuera del pull de desktop; expón su consulta trazable en web solo a `JEFE_EMPRESA` como oro→barrida→cajuelas→cargamento/línea/responsable. Prueba llegada fuera de orden, sesión vencida y completa ciclo realista y ficha manual.

**Pausa:** totales local/central iguales, cadena completa y compuerta Sprint 4 aprobada.
