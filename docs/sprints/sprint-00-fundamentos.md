# Sprint 0 — Fundamentos (semana 1)

**Objetivo:** lograr una base pequeña, repetible y común para todo el equipo.

**Entregable:** clon limpio → API `health`, shell WPF, shell React y CI en verde.

**Estado 0.1:** línea base funcional consolidada en `docs/requirements/linea-base-funcional-v0.1.md`. Confirma una planta con cuatro líneas (piloto en una), tres roles y autorización granular revisada el 2026-08-20, cajuelas y cargamentos, alertas 50–55, barridas reales, mercurio/oro, operación offline, web bilingüe, asistencia básica, inventario y decisiones diferidas por sprint.

## Orden de trabajo

1. Validar glosario: cajuela, palo (0,1 g), cargamento, jornada, asignación, ciclo de línea, molino, rastra y barrida con umbral configurable.
2. Documentar ADR de NestJS, WPF, React, PostgreSQL, SQLite, REST y local-first.
3. Crear soluciones/workspaces y comandos únicos para restaurar, ejecutar, probar y formatear.
4. Activar TypeScript estricto, nullable/análisis .NET, lint y formato.
5. Crear health API y shells con configuración por ambiente.
6. Añadir `.env.example`, secretos externos y seed solo ficticio.
7. CI: restaurar, compilar, analizar y probar los tres proyectos.
8. Diagramar contexto, contenedores y flujo offline/sync; README reproducible.

**Pruebas:** smoke de health, prueba mínima por proyecto, clon/ejecución limpia y configuración inválida con mensaje útil.

**Aceptación:** cualquier integrante levanta todo solo con README; arquitectura/DoD aprobadas; aún no existe lógica especulativa.

## Mini pasos, pausas y prompts

Ejecutar en orden. Todos heredan el [contrato base](guia-de-prompts.md).

### 0.1 Línea base funcional y glosario

**Prompt:** Revisa el diagnóstico original y toda la documentación existente. Crea una línea base versionada de requerimientos, actores, procesos, reglas confirmadas, preguntas abiertas, supuestos y glosario. Distingue hechos de ejemplos ficticios; registra 50 cajuelas como umbral inicial configurable y 10 palos = 1 gramo como conversión. Incluye paros/incidentes básicos y marca sensores/PLC fuera de alcance. No generes código.

**Pausa:** Gerencia o responsable lee glosario, corrige nombres y responde preguntas que bloqueen datos. **Cumplida el 2026-08-13 para continuar Sprint 0; pendientes específicos fueron enrutados a sus sprints.**

### 0.2 Higiene y estructura del monorepo

**Prompt:** Prepara la raíz del monorepo para `apps/api`, `apps/web`, `apps/desktop`, `supabase`, `docs` y `scripts`. Añade solo los archivos raíz necesarios: workspace pnpm, `.editorconfig`, `.gitattributes`, `.gitignore`, política de versiones y comandos documentados. Conserva el README y carpetas existentes. Verifica especialmente exclusión de `.env`, bin/obj, node_modules, bases SQLite, fotos y artefactos.

**Pausa:** `git status` muestra únicamente archivos fuente esperados; ningún secreto o artefacto local.

### 0.3 Esqueleto del backend

**Prompt:** Crea el proyecto NestJS/TypeScript en `apps/api` como monolito modular, con configuración validada, endpoint versionado `/health`, manejo uniforme de errores, logging estructurado y pruebas smoke. No crees todavía módulos de negocio ni conexión productiva a Supabase. Explica cada dependencia agregada.

**Pausa:** iniciar API, obtener health correcto y comprobar fallo claro al faltar configuración obligatoria.

### 0.4 Esqueleto web

**Prompt:** Crea React + TypeScript + Vite en `apps/web`, con TypeScript estricto, router mínimo, proveedor de consultas, estilos base accesibles y página de estado que consulte health. No construyas dashboard ni catálogos. Agrega pruebas smoke y estados cargando/error.

**Pausa:** abrir en navegador con API activa/inactiva y confirmar ambos estados.

### 0.5 Esqueleto desktop

**Prompt:** Crea solución WPF .NET 10 en `apps/desktop` con MVVM, inyección de dependencias, configuración por ambiente, navegación mínima y pantalla de diagnóstico/health. Separa presentación, aplicación, dominio e infraestructura sin proyectos vacíos innecesarios. Añade pruebas del ViewModel y habilita nullable/analyzers.

**Pausa:** ejecutar desde Visual Studio y CLI; probar API disponible/no disponible sin cierre inesperado.

### 0.6 Calidad y comandos unificados

**Prompt:** Configura formato, lint, análisis estático, pruebas y builds reproducibles para TypeScript y .NET. Añade comandos raíz claros para instalar, verificar y probar. Fija versiones y evita instalaciones globales salvo pnpm ya disponible. Documenta requisitos de Windows y Visual Studio.

**Pausa:** un comando documentado verifica todo y falla deliberadamente ante un error de formato de prueba.

### 0.7 Configuración y secretos

**Prompt:** Diseña configuración de desarrollo/pruebas/producción para API, web y desktop. Añade `.env.example` con nombres y descripciones, nunca valores reales; valida al inicio; define dónde vivirán URL/anon key de Supabase y dónde queda restringida `service_role`. Documenta rotación y datos que jamás se versionan.

**Pausa:** búsqueda de patrones de secretos limpia; arranque inválido produce mensaje accionable sin revelar valores.

### 0.8 Integración continua

**Prompt:** Crea GitHub Actions para restaurar caché, compilar, analizar y probar API/web en Linux y desktop WPF en Windows. Usa permisos mínimos, concurrencia cancelable y ninguna credencial productiva. El pipeline debe activarse en PR y ramas principales; documenta cómo reproducir fallos localmente.

**Pausa:** PR o ejecución de prueba en verde y luego fallo controlado confirmado.

### 0.9 ADR y diagramas de arquitectura

**Prompt:** Documenta decisiones ADR para monolito modular, Supabase Auth, PostgreSQL central, SQLite local-first, NestJS como puerta de negocio, REST/OpenAPI, Outbox/idempotencia y frontend web. Añade diagramas C4 simples y secuencia de registro offline/sincronización. Incluye alternativas descartadas y consecuencias, no solo la decisión.

**Pausa:** el equipo puede explicar dónde se valida cada regla, qué ocurre sin red y dónde vive cada secreto.

### 0.10 Reproducción limpia y cierre

**Prompt:** Audita Sprint 0 desde un clon/estado limpio. Ejecuta todas las instrucciones y pipelines, corrige documentación que dependa de conocimiento implícito, genera la ficha de prueba manual del sprint y una matriz requisito→sprint. No agregues funciones de negocio. Entrega evidencia y lista de riesgos abiertos para Sprint 1.

**Pausa:** otro participante levanta los tres componentes solo con documentación; compuerta Sprint 0 firmada.
