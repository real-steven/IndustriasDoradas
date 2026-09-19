# Correcciones de ingesta antes de 3.4

Fecha: 2026-09-19. Cambios locales sobre `DevHenry`, base `e4cd888`.

## Hallazgos y cambios

1. **Producción v2 rechazada por la normalización.** Se exigían campos del
   payload operativo v1 antes de validar producción v2, aunque v2 lleva actor y
   versión de permisos en el envelope. Se separó esa ruta conservando las
   validaciones de alcance, autorización, claves exactas y reversión.
2. **Antecedentes que aún no llegaron tratados como rechazos definitivos.** La
   RPC ahora devuelve `RETRY_LATER/DEPENDENCY_NOT_READY` sin recibo ni auditoría
   de rechazo cuando falta el inicio, la cajuela original o la asignación previa.
   Un inicio o evento original con recibo de rechazo identificado conserva
   `FAILED_REVIEW/DEPENDENCY_REJECTED`. Un relevo fallido no permite inferir por
   sí solo qué trabajador quedó pendiente: esa ambigüedad sigue reintentable.
3. **Conflictos permanentes enviados a reintento indefinido.** La RPC revierte
   los efectos parciales de errores de integridad/datos y registra un rechazo
   estable. La API clasifica SQLSTATE 22/23 como permanentes si escapan de la RPC;
   fallos de red, serialización y deadlock continúan reintentables. Ninguna
   respuesta expone detalles SQL.

La migración `20260919205346_sync_ingestion_error_recovery.sql` sustituye el
wrapper de ingesta, conserva la implementación interna y añade bloqueo por
secuencia además del bloqueo por UUID. No modifica las migraciones anteriores.
Una secuencia ocupada por otro mensaje devuelve `STATION_SEQUENCE_CONFLICT`
sin usar su recibo como confirmación. El mensaje debe conservarse para revisión.

## Verificación local

- Regresión inicial: 8 pruebas fallaron antes de corregir los dos archivos de API.
- API: 76 pruebas unitarias/integración y 21 pruebas HTTP.
- La integración usa el servicio y normalizador reales contra la RPC SQL real
  en PostgreSQL efímero (PGlite); sustituye únicamente el transporte a Supabase.
- Diez escenarios de integración: recorrido completo y replay, inicio pendiente,
  reversión pendiente, relevo pendiente, fallo transitorio del inicio en lote,
  inicio rechazado, original rechazado, colisión de secuencia de estación,
  colisión de secuencia de producción y rollback de un cargamento parcial.
- Nueve archivos de pruebas SQL, con todas las migraciones y seed aplicado dos veces.
- Compilación y lint de API, contrato generado, formato de archivos TypeScript
  modificados, revisión de secretos y `git diff --check`.

Comandos habituales: `pnpm test:api`, `pnpm test:db`,
`pnpm --filter @industrias-doradas/api lint` y
`pnpm --filter @industrias-doradas/api build`.
Los scripts Jest de pruebas unitarias habilitan `--experimental-vm-modules`
porque PGlite carga su runtime WASM mediante importación dinámica. Se utiliza la
dependencia PGlite existente en la raíz; no se añade otra dependencia.

## Pendientes y entrada a 3.4

- Aplicar la migración nueva y desplegar la API corregida en el entorno destino.
  Las pruebas aquí son locales: no se ejecutaron migraciones remotas.
- Mantener la pausa manual de 3.2/3.3 y la prueba de concurrencia entre conexiones
  PostgreSQL reales. PGlite no demuestra carreras entre varios equipos.
- Los recibos históricos `FAILED_REVIEW` mantienen su resultado; esta corrección
  no los reabre. Si existen rechazos causados por estos errores, requieren
  revisión explícita antes de decidir su recuperación.
- La falta de una asignación puede permanecer pendiente si nunca llega el relevo;
  el diagnóstico del worker debe permitir detectar esa situación, sin confirmar
  ni descartar el evento.
- En 3.4 implementar el worker SQLite con lotes ordenados, backoff y jitter,
  recuperación de `SYNCING` tras reinicio y tratamiento por elemento. Confirmar
  solo `APPLIED/ALREADY_APPLIED`; conservar `FAILED_REVIEW`, incluso sin recibo.
  Probar pérdida de respuesta, corte de red y reinicio sin duplicar producción.

No se implementó el worker 3.4 ni el pull 3.5 en esta corrección. No se realizaron
commits, merges, pushes ni cambios de rama.
