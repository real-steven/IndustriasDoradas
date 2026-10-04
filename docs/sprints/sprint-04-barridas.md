# Sprint 4 — Alertas, barridas, mercurio y oro (semanas 8–9)

**Objetivo:** completar el ciclo desde la cajuela hasta la barrida, los movimientos de mercurio por rastra y el oro gestionado exclusivamente desde web.

**Entregable:** alertas configurables en múltiplos de 50, barridas con cantidad real, mercurio por rastra-línea-cargamento y oro/custodia en web bajo autoridad gerencial o permiso administrativo explícito.

## Orden de trabajo

1. Validar unidad/precisión del mercurio, conversión visual de palos y semántica del progreso de barrida.
2. Modelar barrida por eventos incluidos, cantidad real, línea, cargamento y responsable.
3. Separar las alertas de revisión cada 50 de la referencia visual de barrida cada 250, sin bloquear alimentación.
4. Permitir barrida menor, igual o mayor a las referencias; al cerrar, guiar el registro de la barrida final sin exigir mediciones inmediatas.
5. Registrar desde desktop cargas, recargas y recuperación de mercurio por rastra, o dejar los datos pendientes.
6. Registrar oro parcial por barrida únicamente desde la web, siempre para `JEFE_EMPRESA` y por concesión explícita para administradores de confianza.
7. Consolidar oro por línea, jornada, día, cargamento y proveedor.
8. Registrar custodia y solicitudes de entrega en gramos.
9. Integrar novedades simples de paro/mantenimiento/feriado.
10. Sincronizar y auditar todo idempotentemente.

**Pruebas:** 49/50/55/56, 99/100/105/106, reverso 50→49→50, progreso 249/250/251/500, barrida real en 260 con siguiente meta 510, barrida final de 30, barrida única de 60, rechazo de mezcla entre cargamentos, cargas/recargas/recuperación por rastra, enteros/decimales, datos pendientes, acceso web autorizado al oro, revocación y llegada fuera de orden.

**Prueba manual:** cargamentos separados en líneas distintas sin repartir ninguno, alertas, barridas reales, mercurio por las tres rastras, oro parcial/definitivo solo en web con cuenta autorizada, desconexión y custodia.

**Aceptación:** trazabilidad oro → barrida real → eventos → cargamento/línea/responsable; total del cargamento exacto; cifras pendientes no se inventan.

## Mini pasos, pausas y prompts

### 4.1 Validar medidas pendientes

**Prompt:** Contrasta con planta la unidad definitiva y precisión del mercurio, rangos razonables, variación de `1 palo = 0,1 g` y cualquier redondeo. Distingue cargas, recargas y recuperación por cada rastra. Mantén gramos como unidad canónica de oro y reserva sus cantidades al canal web: siempre `JEFE_EMPRESA` y administradores con concesión explícita. Documenta decisiones y no programes fórmulas no aprobadas.

**Decisiones confirmadas el 2026-09-30:**

- Cargas, recargas y recuperación de mercurio, así como oro gerencial, se registran en gramos; aceptan enteros o hasta dos decimales y rechazan negativos.
- Un campo vacío significa medición pendiente y `0,00` significa resultado medido igual a cero.
- Gramos es la unidad canónica de oro; `1 palo = 0,10 g` se usa únicamente como conversión visual y no redondea el valor almacenado.
- El conteo de cajuelas permanece acumulado. La referencia visual inicial de barrida es 250; si se supera sin barrer, el estado pendiente permanece y la barra avanza por tramos de 250.
- Una barrida en una cantidad acumulada arbitraria `N` fija la próxima referencia en `N + 250`; por ejemplo, una barrida en 260 produce `260/510`.
- La referencia no bloquea producción. Al cerrar un cargamento se debe registrar o confirmar la barrida física final; el mercurio puede completarse después en Modo Jefe de Planta y el oro únicamente en web por `JEFE_EMPRESA` o un administrador autorizado, siempre mediante acciones auditadas.
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

**Prompt:** Implementa migraciones PostgreSQL/SQLite del modelo aprobado con checks decimales, unidades, FK, índices e idempotencia. Modela las rastras como equipos identificables de su línea; conserva movimientos de carga, recarga y recuperación de mercurio. En PostgreSQL separa oro/custodia con políticas para `JEFE_EMPRESA` y administradores con permisos específicos; impide acceso a jefe de planta y SQLite desktop no guarda cantidades de oro. Prueba actualización desde Sprint 3.

**Pausa:** migración nueva/actualizada conserva producción y no permite mezclar cargamentos.

**Resultado 2026-10-02:**

- PostgreSQL incorpora barridas inmutables con sus eventos exactos, conteo neto validado al confirmar la transacción, una sola barrida final por cargamento y claves compuestas que impiden mezclar organización, línea, ciclo o cargamento. Un evento de producción solo puede pertenecer a una barrida.
- Carga inicial, recarga y recuperación de mercurio se conservan como movimientos inmutables por rastra. El valor canónico es gramos con hasta dos decimales; `NULL` permanece pendiente y cero es una medición válida. Las correcciones agregan una nueva versión enlazada y no reemplazan el historial.
- PostgreSQL separa resultados de oro y decisiones de entrega del dominio operativo. Se añadieron `gold.read`, `gold.results.manage` y `gold.deliveries.manage`; `JEFE_EMPRESA` obtiene toda capacidad activa, un administrador requiere concesión individual y `JEFE_PLANTA` no obtiene acceso.
- Las tablas centrales nuevas mantienen RLS y acceso directo revocado para `anon` y `authenticated`; el API sigue siendo la única puerta de negocio mediante `service_role` y `app.profile_has_permission`.
- SQLite avanza de versión 11 a 12 con rastras locales, barridas, eventos incluidos y movimientos de mercurio en centigramos exactos. No contiene tablas ni columnas de oro.
- La actualización automatizada desde una base Sprint 3 conserva cargamentos y eventos existentes. PostgreSQL local rechazó solapamiento y mezcla; SQLite rechazó reutilizar eventos y registrar mercurio contra un componente que no sea rastra.
- La migración `20261002083007_sprint_4_3_sweeps_mercury_gold` quedó aplicada únicamente en Supabase de desarrollo. Antes y después permanecieron `19` cargamentos, `67` eventos de producción y `175` recibos de sincronización; las nuevas tablas iniciaron vacías.

**Pausa cumplida:** persistencia central/local verificada y datos del Sprint 3 conservados. No iniciar 4.4 sin una nueva `R`.

### 4.4 Servicio de alertas

**Prompt:** Implementa un servicio puro que separe: a) alertas configurables de revisión inicialmente cada 50, con los intervalos 50–55, 100–105, etc.; y b) progreso/referencia de barrida inicialmente cada 250. El total acumulado nunca se reinicia. Si se supera una referencia sin barrer, conserva `Barrida pendiente` y avanza visualmente por tramos de 250. Una barrida real en `N` fija la próxima referencia en `N + 250`. Ninguna señal bloquea ni presupone que la barrida ocurrió.

**Pausa:** tabla automatizada cubre límites, múltiplos, reversos y conteo continuo.

**Resultado 2026-10-03:**

- `ProductionMilestoneService` calcula señales informativas sin estado ni efectos laterales. La alerta de revisión y el progreso de barrida usan configuraciones independientes; sus valores iniciales son 50, una extensión inclusiva de 5 cajuelas y 250 respectivamente.
- Las alertas quedan activas en `50–55`, `100–105` y ventanas equivalentes. Salir por reverso y volver a entrar —por ejemplo `50→49→50`— vuelve a producir el estado activo; la futura interfaz decidirá cómo presentar cada transición sin bloquear la alimentación.
- El total de cajuelas siempre permanece acumulado. Al alcanzar una referencia sin barrer, `IsSweepPending` conserva la primera referencia física pendiente, mientras la referencia visual pasa al siguiente tramo: `249/250`, `250/500`, `251/500` y `500/750`.
- Una barrida real establece un nuevo origen sin alterar el total. Una barrida en `260` produce referencia física y visual `510`; al llegar a `510`, la barrida queda pendiente y la vista avanza hacia `760`.
- El servicio admite barridas tempranas y totales superiores a 500, no confirma barridas implícitamente y no contiene ninguna regla de bloqueo, persistencia, sonido o interfaz.

**Pausa cumplida:** pruebas automatizadas cubren límites, múltiplos, reverso, configuración independiente, barrida real arbitraria y conteo continuo. No iniciar 4.5 sin una nueva `R`.

### 4.5 Alerta operacional

**Prompt:** Integra alerta WPF visual muy llamativa y sonora perceptible/no molesta, identificando claramente la línea. Tras el aviso grande conserva la señal acordada dentro del intervalo y retírala al superar 55. Permite continuar sin confirmación ni máximo rígido.

**Pausa:** prueba con ruido, a distancia, pulsaciones rápidas y dos líneas alertando.

**Resultado 2026-10-04:**

- Desktop integra el servicio puro de 4.4 en cada tarjeta de línea. Al entrar en un múltiplo de 50 muestra un aviso grande durante ocho segundos, identifica explícitamente la línea y reproduce una secuencia breve de tres notas distinta del sonido normal de registro.
- Después del aviso grande, cada tarjeta conserva una franja visible `REVISAR MERCURIO` dentro de la ventana inclusiva acordada: `50–55`, `100–105` y equivalentes. La señal desaparece al salir de la ventana y puede activarse nuevamente después de un reverso como `50→49→50`.
- Los avisos transitorios de líneas distintas se apilan y pueden coexistir; un aviso nuevo de la misma línea sustituye únicamente al anterior de esa línea. La operación continúa sin confirmación, sin diálogo modal y sin alterar la disponibilidad de agregar o corregir cajuelas.
- La revisión de mercurio y la barrida permanecen separadas. En `250` se conserva la alerta de mercurio, la tarjeta indica `Barrida pendiente` y el progreso avanza hacia `500`; no se presume ni se registra una barrida.
- La barra usa referencias dinámicas y no impone un máximo al contador. Las pruebas WPF y de vista cubren el intervalo `50–55`, retiro en `56`, reverso, dos líneas simultáneas, acumulado `250/500` y continuidad de los comandos.

**Pausa parcial:** compilación, render, pulsaciones rápidas y dos líneas quedaron cubiertos automáticamente. La percepción del sonido con ruido real de planta y a distancia requiere validación manual en el equipo físico. No iniciar 4.6 sin esa comprobación o una autorización expresa para continuar.

### 4.6 Registro de barrida

**Prompt:** Implementa registro simple de la barrida efectivamente realizada: línea, cargamento, eventos/cajuelas incluidos, cantidad real, responsable y tiempos. El operario principal decide cuándo barrer; el jefe de planta confirma el registro físico y puede dejar la recuperación de mercurio pendiente. No solicites ni muestres oro en desktop. Al cerrar un cargamento sin barrida final, presenta un flujo de confirmación que registra la barrida antes del cierre. Evita solapamiento, mezcla de cargamentos y doble registro.

**Pausa:** registrar barrida de 50, final de 30 y única de 60; reconstruir eventos exactos.

### 4.7 Mercurio

**Prompt:** Registra en desktop los movimientos reales de mercurio por rastra, línea y cargamento: carga inicial, cada recarga adicional y recuperación asociada a la barrida cuando corresponda. Acepta gramos enteros o con hasta dos decimales, vacío pendiente y cero medido; rechaza negativos y no impongas un máximo no validado. Permite completar datos más tarde en Modo Jefe de Planta, conserva cada cambio auditado y no califica automáticamente la diferencia como pérdida o consumo. Prepara referencia a inventario posterior sin descontar dos veces.

**Pausa:** validar decimales, unidad, cero/negativo/extremo y reversión idempotente.

### 4.8 Oro parcial y definitivo

**Prompt:** Implementa en web el registro de oro parcial por barrida en gramos, aceptando enteros o hasta dos decimales, vacío pendiente y cero medido. `JEFE_EMPRESA` siempre puede consultar, crear y corregir; los administradores solo realizan las acciones concedidas mediante permisos separados y revocables. No sincronices cantidades a SQLite desktop. Deriva automáticamente totales por línea, jornada, día (medianoche Costa Rica), cargamento y proveedor sin tratar pendientes como cero. El definitivo del cargamento es la suma de sus barridas en la única línea asignada. Muestra palos solo como conversión visual `1 palo = 0,10 g` sin alterar el valor canónico.

**Pausa:** dataset manual coincide por todos los cortes y no cuenta dos veces un parcial.

### 4.9 Custodia y entrega

**Prompt:** Modela oro bajo custodia y su entrega exclusivamente en web. `JEFE_EMPRESA` siempre puede operar; un administrador requiere capacidades explícitas y separadas para consulta, registro/corrección y confirmación/rechazo. Una discrepancia conserva cantidad registrada, cantidad recibida y motivo. Desktop no consulta cantidades ni inicia solicitudes. No agregues venta, transporte ni contabilidad.

**Pausa:** producido − entregado confirmado = custodia; rechazo no descuenta silenciosamente.

### 4.10 Novedades operativas

**Prompt:** Implementa notas simples para paro, mantenimiento, emergencia, feriado u otro motivo: línea/planta, tipo opcional, descripción, responsable e inicio/fin si aplica. Puede atravesar jornada. No construyas CMMS ni categorías rígidas no existentes.

**Pausa:** explicar un periodo sin producción desde historial y conservarlo tras reinicio.

### 4.11 Sincronización, trazabilidad y cierre

**Prompt:** Extiende push/pull/idempotencia a alertas emitidas, barridas y mercurio. Mantén oro, custodia y entregas fuera del pull de desktop; expón su consulta trazable en web solo a `JEFE_EMPRESA` o administradores autorizados como oro→barrida→cajuelas→cargamento/línea/responsable. Prueba llegada fuera de orden, revocación de permisos y completa ciclo realista y ficha manual.

**Pausa:** totales local/central iguales, cadena completa y compuerta Sprint 4 aprobada.
