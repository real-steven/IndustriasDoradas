# Plan de sprints — Industrias Doradas

Guía de ejecución del Sistema de Gestión de Producción Minera. Cubre 17 semanas: Sprint 0 de una semana y ocho sprints de dos semanas. Cada sprint termina con software integrado, pruebas automáticas y validación manual.

| Orden | Sprint | Semanas | Incremento demostrable | Depende de |
|---:|---|---:|---|---|
| 0 | [Fundamentos](sprint-00-fundamentos.md) | 1 | API, desktop, web y CI ejecutables | — |
| 1 | [Identidad y catálogos](sprint-01-identidad-catalogos.md) | 2 | Identidad, estación/modos, solicitudes y cuatro líneas configurables; estructuras administrativas legadas quedan fuera del MVP vigente | 0 |
| 2 | [Operación local](sprint-02-operacion-local.md) | 2 | Cargamento/responsable y cajuelas con una pulsación offline | 1 |
| 3 | [Sincronización](sprint-03-sincronizacion.md) | 2 | Varias estaciones sin pérdida/duplicación | 2 |
| 4 | [Barridas y mercurio](sprint-04-barridas.md) | 2 | Alertas, barridas reales, mercurio por rastra y sincronización operacional completa | 3 |
| 5 | [Web gerencial](sprint-05-web.md) | 2 | Portal de `JEFE_EMPRESA`, cargamentos, auditoría y oro total opcional por cargamento | 4.11 |
| 6 | [Trabajadores y asistencia](sprint-06-asistencia.md) | 2 | Check-in/out local-first, incidencias y horas; fotografía condicionada | 1, 3, 5 |
| 7 | [Inventario y mantenimiento básico](sprint-07-inventario.md) | 2 | Kardex, revisiones y vida útil de componentes sin inferir consumo de mercurio | 1, 3–5 |
| 8 | [Indicadores, reportes y entrega](sprint-08-entrega.md) | 2 | Comparación de proveedores, Excel, despliegue y recuperación | 5; 6–7 solo si cerraron |

El cierre aprobado del Sprint 2 y la guía de contexto para comenzar Sprint 3
están en
[`sprint-02-cierre-y-traspaso-sprint-03.md`](sprint-02-cierre-y-traspaso-sprint-03.md).

Documentos transversales:

- [Arquitectura y calidad](arquitectura-y-calidad.md)
- [Dependencias y alcance](dependencias-y-alcance.md)
- [Plantilla de prueba manual](plantilla-pruebas-manuales.md)
- [Cómo ejecutar los prompts y las pausas](guia-de-prompts.md)

Un sprint no se cierra por “terminar el código”: debe compilar, migrar desde cero, pasar pruebas, conservar la regresión anterior y ser aceptado manualmente sin defectos críticos o altos. Si el responsable acepta una validación diferida, debe quedar identificada como deuda y nunca como prueba ejecutada.

Decisiones vigentes que sustituyen el alcance original: la web usa una única
cuenta funcional `JEFE_EMPRESA`; desktop concentra la operación de planta con
`JEFE_PLANTA`; el oro es un total opcional por cargamento cerrado y nunca llega
a desktop; custodia/entregas de oro y administradores delegados no forman parte
del MVP. Los documentos de Sprint 5–8 aplican estas reglas aunque las
migraciones históricas conserven estructuras anteriores por compatibilidad.

Los prompts de cada sprint son unidades de trabajo secuenciales. Se ejecuta uno, se revisa su evidencia y se continúa solo si su pausa queda aprobada. El orden puede ajustarse cuando aparezcan hechos nuevos, pero cualquier cambio debe conservar las dependencias de esta tabla.
