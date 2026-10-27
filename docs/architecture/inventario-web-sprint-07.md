# Inventario web gerencial — Sprint 7.8

## Objetivo

La cuenta `JEFE_EMPRESA` consulta el inventario central sin crear un segundo
saldo editable. Existencias, última revisión y estado de instalaciones se
proyectan desde movimientos, conteos y cambios de componente append-only.

## Proyecciones privadas

La migración `20261027103000_sprint_7_8_inventory_management_read_models.sql`
crea tres vistas `security_invoker` dentro del esquema privado `app`:

- `management_inventory_stock`: saldo, primer/último movimiento y última
  revisión por artículo;
- `management_inventory_review_lines`: esperado, contado y diferencia de cada
  línea de revisión física;
- `management_rastra_component_history`: secuencia de instalaciones, retiros y
  reemplazos, incluido cuál instalación permanece activa.

Solo `service_role` recibe `SELECT`. El navegador continúa consumiendo NestJS
con la sesión y permisos existentes; no accede directamente a Supabase.

## Contrato HTTP

Los tres recursos respetan organización, planta y paginación:

- `GET /inventory/plants/:plantId/stock`;
- `GET /inventory/plants/:plantId/reviews`;
- `GET /inventory/plants/:plantId/component-changes`.

El kardex usa el recurso ya existente `GET .../movements` y añade
`direction=asc|desc`. La web solicita `asc` para que la primera página empiece
con el primer hecho y la reconstrucción avance cronológicamente.

## Estado en URL y frescura

La URL conserva vista, planta, búsqueda, artículo, rastra, página, filtro de
diferencias y ambos intervalos de recordatorio. Abrir o recargar el enlace
reproduce la misma consulta.

La fecha de corte mostrada proviene del mecanismo de frescura central del
Sprint 5. Cuando ese cursor informa cambios, React Query invalida también
existencias, kardex, revisiones y componentes.

## Recordatorios

Los intervalos iniciales son 30 días y pueden cambiarse desde la pantalla. Se
guardan en la URL para que la consulta sea compartible y repetible. Un aviso de
revisión se calcula desde la última revisión o, si no existe, desde el primer
movimiento. Un aviso de reemplazo solo se muestra para una instalación activa.

Ambos avisos son informativos: no escriben datos, no crean movimientos, no
predicen fallas y no bloquean ninguna operación.

## Compuerta 7.8

La prueba SQL reconstruye un artículo con cinco movimientos, dos revisiones y
saldo ocho. También reconstruye una rastra con instalación A, reemplazos B y C,
manteniendo tres hechos y solo C activa. Las pruebas web abren el artículo desde
existencias y verifican que el kardex se solicite en orden ascendente desde el
primer evento.
