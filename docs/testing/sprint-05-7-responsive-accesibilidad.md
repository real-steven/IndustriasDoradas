# Sprint 5.7 — Responsive, accesibilidad y navegadores

## Objetivo

Confirmar que el recorrido gerencial funciona en iPhone Safari, Android Chrome
y escritorio sin desplazamiento horizontal accidental, pérdida de contenido ni
controles inaccesibles. Este punto no cambia reglas de negocio ni contratos.

## Cobertura automatizada preparada

- El panel de registro/corrección de oro se identifica como diálogo modal.
- Al abrir el diálogo, el foco llega al campo de gramos.
- `Escape` cierra el diálogo y devuelve el foco al botón que lo abrió.
- La tabulación permanece dentro del diálogo mientras está abierto.
- Los errores del formulario se anuncian y se relacionan con el campo inválido.
- La comparación por proveedor tiene nombre accesible, caption y encabezados de
  columna explícitos; su contenedor puede recibir foco cuando requiere reflujo.
- El contenido principal recibe foco al cambiar de ruta para anunciar la nueva
  vista a tecnologías de asistencia.

Henry ejecuta las pruebas automatizadas mediante `pnpm run verify`.

## Preparación manual

1. Use la misma cuenta `JEFE_EMPRESA` y organización del recorrido 5.6.
2. Disponga de al menos un cargamento cerrado con oro y otro sin registrar.
3. Cuando no haya un dispositivo real, use la emulación responsive del
   navegador, pero cierre la compuerta con al menos un iPhone/Safari o un
   Android/Chrome real si están disponibles.
4. Para textos largos, puede usar temporalmente nombres largos ya existentes en
   el dataset. No cambie contratos ni agregue datos irreales solo para esta
   prueba.

## Recorrido manual

### WEB-57-01 — iPhone Safari vertical y áreas seguras

1. Abra `/gerencia` en orientación vertical, con ancho equivalente a 320–390 px.
2. Recorra Resumen, Operación, Oro, Cargamentos y Auditoría.
3. Desplácese hasta el inicio y el final de cada vista.

**Esperado:** no aparece scroll horizontal en la página; encabezado, contenido
y navegación inferior no quedan debajo de isla/notch ni del indicador de
inicio; las cinco rutas permanecen alcanzables y sus objetivos tienen al menos
44 px.

### WEB-57-02 — Android Chrome vertical

1. Repita las cinco rutas en un ancho equivalente a 360–412 px.
2. Abra filtros, paginación y detalle de cargamento.
3. Abra y cierre el teclado virtual en filtros y en Oro.

**Esperado:** el teclado no oculta definitivamente la acción primaria, los
campos no fuerzan zoom automático y el contenido vuelve a su posición normal al
cerrarlo.

### WEB-57-03 — Orientación horizontal

1. Cambie iPhone/Android a horizontal desde Operación, Cargamentos y Oro.
2. Abra el diálogo de oro y desplácese dentro de él.
3. Regrese a vertical sin recargar.

**Esperado:** no se pierde el valor escrito, todos los controles siguen
visibles, el diálogo se desplaza internamente y la navegación no cubre el botón
de guardar.

### WEB-57-04 — Zoom y reflujo

1. En PC, configure el navegador al 200 %.
2. Compruebe las cinco rutas en una ventana de 1280 px de ancho.
3. Repita a 400 % en Resumen, Cargamentos y Oro.

**Esperado:** el contenido se reorganiza en una columna, se puede leer sin
desplazamiento horizontal de la página y ninguna acción se corta. La tabla por
proveedor se presenta como tarjetas en el ancho móvil.

### WEB-57-05 — Textos largos

1. Localice línea, proveedor o responsable con nombre largo.
2. Revise sus tarjetas en Operación, Cargamentos, detalle, Oro y Auditoría.

**Esperado:** los nombres parten línea dentro de su tarjeta; no se superponen a
estado, métricas o botones y no ensanchan la página.

### WEB-57-06 — Solo teclado

1. Recargue `/gerencia` y use `Tab`/`Shift+Tab`, `Enter` y barra espaciadora.
2. Active el enlace para saltar al contenido.
3. Recorra navegación, filtros, paginación y acciones.
4. Abra Oro, recorra el diálogo, pulse `Escape` y continúe tabulando.

**Esperado:** siempre se ve el foco, el orden es lógico, no existe una trampa de
teclado y al cerrar Oro el foco vuelve a `REGISTRAR ORO` o
`CORREGIR RESULTADO`.

### WEB-57-07 — Lector de pantalla

1. Use VoiceOver en Safari o TalkBack en Chrome; en PC puede usar NVDA.
2. Navegue por encabezados, regiones, enlaces, botones, formularios y tabla.
3. Provoque un valor inválido en Oro y después guárdelo correctamente.

**Esperado:** se anuncian una sola vez el título de página, el diálogo, sus
campos y errores; `Vacío` y `0 g` permanecen distinguibles; los símbolos
decorativos no generan ruido y la comparación anuncia proveedor y columnas.

### WEB-57-08 — Contraste y preferencias visuales

1. Revise foco, texto secundario, estados vigentes/desactualizados y errores con
   brillo alto y bajo.
2. En Windows active temporalmente un tema de contraste forzado.

**Esperado:** ningún estado depende solo del color, foco y bordes siguen
visibles y el texto permanece legible.

### WEB-57-09 — Escritorio y navegadores

1. Ejecute el recorrido en Chrome/Edge de escritorio y Safari si está
   disponible.
2. Redimensione lentamente desde escritorio hasta 320 px.

**Esperado:** no hay saltos que oculten controles, las tarjetas aprovechan el
ancho disponible y el cambio a navegación inferior ocurre sin superposición.

## Registro de cierre

- `pnpm run verify`: aprobado por Henry el 2026-10-12 después de corregir el
  formato de `apps/web/src/styles.css`.
- Emulación iPhone y Android en Edge: aprobada por Henry el 2026-10-12.
- Dispositivos físicos: no ejecutable mientras la web solo esté disponible en
  la máquina local; no bloquea esta revisión basada en emulación.
- Escritorio Chrome/Edge: aprobado por Henry el 2026-10-12.
- Teclado: aprobado por Henry el 2026-10-12.
- Lector de pantalla: prueba menor pendiente, no bloqueante; existe cobertura
  automatizada de nombres, roles, estados, foco y encabezados.
- Resultado final: aprobado por Henry el 2026-10-12.

**Decisión:** Sprint 5.7 cerrado. La pausa se considera cumplida con recorrido
sin desplazamiento horizontal accidental ni controles inaccesibles en
escritorio y emulación móvil. El lector de pantalla y los dispositivos físicos
se conservan como comprobaciones posteriores no bloqueantes cuando la web esté
disponible fuera de la máquina local.
