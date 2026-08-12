# Plan de sprints — Industrias Doradas

Guía de ejecución del Sistema de Gestión de Producción Minera. Cubre 17 semanas: Sprint 0 de una semana y ocho sprints de dos semanas. Cada sprint termina con software integrado, pruebas automáticas y validación manual.

| Orden | Sprint | Semanas | Incremento demostrable | Depende de |
|---:|---|---:|---|---|
| 0 | [Fundamentos](sprint-00-fundamentos.md) | 1 | API, desktop, web y CI ejecutables | — |
| 1 | [Identidad y catálogos](sprint-01-identidad-catalogos.md) | 2 | Acceso seguro y configuración de planta | 0 |
| 2 | [Operación local](sprint-02-operacion-local.md) | 2 | Cajuelas con una pulsación y sin Internet | 1 |
| 3 | [Sincronización](sprint-03-sincronizacion.md) | 2 | Varias estaciones sin pérdida/duplicación | 2 |
| 4 | [Barridas y mercurio](sprint-04-barridas.md) | 2 | Ciclo productivo hasta resultado de oro | 3 |
| 5 | [Web gerencial](sprint-05-web.md) | 2 | Seguimiento remoto en móvil/PC | 3–4 |
| 6 | [Asistencia](sprint-06-asistencia.md) | 2 | Check-in, fotografía y horas | 1, 3 |
| 7 | [Inventario](sprint-07-inventario.md) | 2 | Existencias y movimientos trazables | 1, 3 |
| 8 | [Reportes y entrega](sprint-08-entrega.md) | 2 | Indicadores, Excel, despliegue y recuperación | 4–7 |

Documentos transversales:

- [Arquitectura y calidad](arquitectura-y-calidad.md)
- [Dependencias y alcance](dependencias-y-alcance.md)
- [Plantilla de prueba manual](plantilla-pruebas-manuales.md)
- [Cómo ejecutar los prompts y las pausas](guia-de-prompts.md)

Un sprint no se cierra por “terminar el código”: debe compilar, migrar desde cero, pasar pruebas, conservar la regresión anterior y ser aceptado manualmente sin defectos críticos o altos.

Los prompts de cada sprint son unidades de trabajo secuenciales. Se ejecuta uno, se revisa su evidencia y se continúa solo si su pausa queda aprobada. El orden puede ajustarse cuando aparezcan hechos nuevos, pero cualquier cambio debe conservar las dependencias de esta tabla.
