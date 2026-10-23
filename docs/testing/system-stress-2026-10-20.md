# Prueba de estrés local — 20 de octubre de 2026

## Resultado

La batería local terminó correctamente, sin pérdida ni duplicación detectada. Se ejecutó con bases temporales SQLite y PGlite; no usó credenciales, la base remota de Supabase ni datos reales.

Comando reproducible:

```powershell
pnpm run test:stress:local
```

## Escenarios y resultados

| Escenario | Carga | Validación | Resultado |
| --- | ---: | --- | --- |
| Sesiones desktop sin red y reconexión | 50 sesiones, 1.000 marcas de asistencia | Secuencias únicas, reclamo concurrente, reinicio, proyección por trabajador, cola drenada e integridad SQLite | PASS, 3,79 s incluyendo preparación |
| Ingestión central concurrente | 50 clientes, 200 marcas completas | Evento, recibo, auditoría y cambio incremental uno a uno | PASS, 338,24 ms; 591,29 eventos/s |
| Reintentos por respuesta perdida | 50 repeticiones del mismo mensaje | `ALREADY_APPLIED` y ningún evento adicional | PASS, 23,97 ms |
| Cola offline | 10.000 mensajes por ronda, lotes de 500 y dos reclamadores iniciales | Sin doble reclamo, pérdida ni recibos duplicados; `PRAGMA integrity_check = ok` | PASS en 3 rondas consecutivas |
| Historial de gerencia | 365 días, 1.460 cargamentos y 36.500 eventos productivos | 39.449 cambios incrementales y consultas de primera/última página | PASS |

Métricas de la ingestión central temporal:

- Latencia p50: 78,34 ms.
- Latencia p95: 86,76 ms.
- Latencia máxima: 100,44 ms.
- Lectura ordenada de 200 marcas: mediana 2,73 ms y máximo 2,95 ms.
- Conteos finales: 200 eventos, 200 secuencias distintas, 200 recibos, 200 auditorías y 200 cambios incrementales.

Métricas del volumen histórico:

- Creación de datos: 8.977,12 ms.
- Último cambio: mediana 0,47 ms.
- Primera página de cargamentos: mediana 36,89 ms.
- Última página de cargamentos: mediana 35,65 ms.

La suite de caos ejecutó 32 pruebas por ronda y las 96 ejecuciones pasaron. También cubre recuperación de leases vencidos, respuestas parciales, reintentos, autorización offline y conflictos de sincronización.

## Qué demuestra

- Una estación puede acumular trabajo sin red y drenar la cola sin perder ni duplicar mensajes.
- Dos consumidores no reclaman el mismo mensaje de la cola local.
- Reenviar el mismo mensaje después de perder una respuesta no duplica el dato central.
- La marca central genera conjuntamente su recibo, auditoría y publicación incremental.
- El volumen histórico equivalente a un año mantiene consultas de páginas por debajo de 50 ms en el simulador local usado.

## Límites de esta prueba

Esta ejecución no representa 50 computadoras físicas ni mide Internet, TLS, Supavisor, límites del plan de Supabase, Auth, ancho de banda o latencia regional. PGlite usa un proceso local y sus cifras no deben publicarse como capacidad de producción.

Antes de afirmar capacidad real se debe repetir contra un proyecto de **staging aislado**, nunca contra producción, con 10, 25 y 50 usuarios virtuales. Allí se deben observar conexiones, CPU, memoria, I/O, p95/p99, errores HTTP, recuperación después de desconectar y crecimiento real de tablas e índices.

## Archivos del arnés

- `apps/desktop/tests/IndustriasDoradas.Desktop.Tests/Infrastructure/SystemStressTests.cs`
- `scripts/stress-central-sync.mjs`
- `scripts/test-system-stress.mjs`
- `scripts/test-sync-chaos.mjs`
- `scripts/benchmark-management.mjs`
