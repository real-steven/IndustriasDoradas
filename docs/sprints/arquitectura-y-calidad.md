# Arquitectura y calidad

## Base técnica

- `apps/api`: NestJS + TypeScript; única puerta remota a datos y reglas.
- `apps/desktop`: WPF .NET 10; interfaz operativa local-first y control USB HID.
- `apps/web`: React + TypeScript; portal adaptable para Safari/Chrome/iPhone/Android.
- Supabase PostgreSQL central y SQLite por estación.
- Supabase Auth para identidad y Supabase Storage privado para fotografías/documentos.
- REST/JSON + OpenAPI. Sincronización Outbox con UUID e idempotencia.

Los frontends no consultan tablas de negocio de Supabase directamente. Supabase Auth emite la identidad; NestJS valida sus JWT y concentra permisos, validaciones, auditoría y reglas. La clave `service_role` existe solo en el backend, nunca en desktop/web. Desktop confirma primero en SQLite y sincroniza después; registrar una cajuela nunca espera Internet.

Con varias estaciones, cada mutación se guarda primero en SQLite + Outbox y se intenta enviar inmediatamente. PostgreSQL mantiene la vista central consolidada y NestJS propaga cambios casi en tiempo real cuando hay red. Sin conexión no se promete simultaneidad: se garantiza operación por uno o dos días y convergencia idempotente posterior. No se introduce servidor local/Docker en planta hasta que una necesidad medida lo justifique.

## Invariantes funcionales confirmadas

- Planta actual: cuatro líneas configurables; cada una posee actualmente un molino y tres rastras. Piloto: una línea y un punto de control.
- Una línea activa requiere cargamento y operario principal. Un operario puede responsabilizarse por varias líneas; no se trazan ayudantes.
- Jornada diurna/nocturna clasifica horas y no abre/cierra la línea.
- Un cargamento pertenece a un proveedor y puede repartirse entre líneas; nunca se mezclan resultados de cargamentos distintos.
- La alerta de barrida es configurable, inicialmente cada 50 cajuelas, visible/sonora en los intervalos 50–55, 100–105, etc.; no bloquea producción.
- Una barrida real puede incluir menos, exactamente o más de 50 cajuelas y siempre existe una barrida final al terminar el cargamento.
- Mercurio y oro se registran por barrida; el oro definitivo del cargamento es la suma de resultados certificados.
- Interfaz y reportes web soportan español/inglés con preferencia por cuenta.
- Jefe de empresa consulta y exporta; administrador modifica; jefe de planta opera; operario registra cajuelas.
- Una misma persona usa cuentas separadas para consulta gerencial y administración privilegiada.

## Reglas contra código espagueti

1. Organizar por negocio (`production`, `sweeps`, `attendance`, `inventory`), no por carpetas globales gigantes.
2. Presentación → caso de uso → dominio → infraestructura. Un controlador o ViewModel no contiene SQL ni fórmulas.
3. Reglas como intervalos de alerta, barridas reales, consolidación de oro y conversiones viven en servicios de dominio probados.
4. No crear abstracciones “por si acaso”, excepto puertos necesarios de almacenamiento, reloj, cámara, entrada y sincronización.
5. No duplicar reglas entre clientes; la API es autoridad central.
6. Producción, barridas, oro, asistencia, inventario y entregas son eventos/movimientos trazables; errores se compensan y auditan, no se borran.
7. UTC al almacenar; `America/Costa_Rica` al mostrar. Oro/mercurio/dinero usan `decimal`, no `float`.
8. Incluir `organization_id` desde el inicio para crecimiento futuro, sin construir ahora administración multiempresa.
9. Migraciones compartidas no se reescriben. Secretos nunca entran al repositorio.
10. Empezar como monolito modular desplegable; no microservicios, bus de eventos externo ni CQRS completo sin una necesidad medida.
11. Fijar versiones y centralizar paquetes; toda dependencia nueva requiere propósito, mantenimiento activo y licencia compatible.

## Pruebas

- Unitarias: dominio, permisos, estados, conteos, horas, inventario e indicadores.
- Integración: API + PostgreSQL real de pruebas, SQLite, restricciones e idempotencia.
- Contrato: OpenAPI y clientes compatibles.
- UI: ViewModels/componentes críticos.
- E2E: recorridos esenciales de desktop y web.
- Manual: al terminar cada sprint, con datos parecidos a planta.

## Definition of Ready

Historia con usuario, necesidad, aceptación, datos, errores esperados, diseño simple y dependencias resueltas.

## Definition of Done

- Criterios cumplidos; revisión de código y análisis estático sin hallazgos graves.
- Pruebas nuevas y regresión en verde; migración validada desde base vacía.
- Permisos, auditoría y escenarios vacío/carga/error/offline cubiertos.
- Logs útiles sin tokens, claves, fotografías o biometría.
- Documentación y OpenAPI actualizados.
- Prueba manual aceptada; cero defectos críticos/altos.
- Instalación limpia demostrable.

## Objetivos no funcionales

- Registro local de cajuela <300 ms; pantalla operativa lista <3 s en equipo objetivo.
- Uso completo por teclado/controlador, botones grandes, icono + texto, contraste y señal visual/sonora.
- Reiniciar offline no pierde confirmados.
- Cerrar la aplicación o perder energía no pierde confirmados; al recuperar red la sincronización se reanuda automáticamente.
- JWT de Supabase validado por NestJS, renovación segura, roles propios, HTTPS y rate limiting.
- Logs estructurados con ID de correlación; diagnóstico de sincronización exportable.
- Respaldo y restauración realmente ensayados antes de producción.
- MFA y enrolamiento/revocación de dispositivos administrativos antes de producción.
