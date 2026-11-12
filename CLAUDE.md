# Industrias Doradas — reglas para agentes

Sistema local-first para controlar la producción de una planta minera en
Abangares, Guanacaste, Costa Rica. Monorepo con desktop WPF, API NestJS y web
React sobre Supabase.

## Lectura obligatoria antes de modificar código

- `README.md`
- `apps/desktop/README.md`, `apps/web/README.md`, `apps/api/README.md`
- `docs/development/guia-desarrollo.md`
- `docs/architecture/arquitectura-y-decisiones.md`
- `docs/product/gerencia-web-mvp.md`
- `docs/sprints/sprint-05-web.md`, `docs/sprints/sprint-06-asistencia.md`
- `docs/security/prototipo-biometria-local.md`

Algunos README están desactualizados respecto al código (por ejemplo, el de
desktop dice que aún no hay sincronización, asistencia ni biometría, y el de web
marca como `Próximamente` módulos que ya existen). Ante una contradicción, manda
el código y el documento más reciente; señálala en el resumen de entrega.

## Git

- Rama de trabajo: `DevSteven`.
- Al iniciar:

  ```powershell
  git fetch origin --prune
  git switch DevSteven
  git pull --ff-only origin DevSteven
  git status --short --branch
  git log -5 --oneline --decorate
  ```

- Prohibido sin autorización expresa: `git reset --hard`, checkout destructivo,
  eliminar cambios de otros desarrolladores, `push`, merge hacia `main` o
  reescribir historial.

## Arquitectura

- **Desktop:** WPF, C#, .NET 10, MVVM (CommunityToolkit.Mvvm) y SQLite.
  Carpetas `Domain`, `Application`, `Infrastructure`, `Presentation`.
- **API:** NestJS 11, TypeScript, Node.js 24. Monolito modular; única puerta
  remota a datos de negocio.
- **Web:** React 19, TypeScript, Vite, TanStack Query y Recharts.
- **Base central:** Supabase PostgreSQL. **Autenticación:** Supabase Auth.
- **Sincronización:** eventos append-only, Outbox local, UUID, secuencias por
  estación, idempotencia y pull incremental.
- **Paquetes:** pnpm 11.21.0 (usar `pnpm.cmd` en PowerShell).

Desktop debe seguir operando sin Internet: todo se guarda primero en SQLite
(mutación + Outbox en una transacción) y luego se sincroniza con la API. Desktop
nunca usa Supabase directamente para operaciones privilegiadas, salvo el flujo
de autenticación existente. Web no consulta tablas de Supabase: tras Auth, envía
el access token a NestJS. React presenta read models centrales; no recalcula
totales.

## Actores

1. **OPERARIO**
   - Usa Inicio, Operación y Asistencia; registra cajuelas, barridas y asistencia.
   - No accede a Estación, Auditoría, Estado o Configuración sin elevación.
2. **JEFE_PLANTA**
   - Abre la estación con su cuenta y eleva temporalmente el acceso con PIN o
     biometría local.
   - Con elevación: prepara/finaliza cargamentos, corrige operaciones, revisa
     auditoría, diagnóstico y configuración local.
   - Registra su propia asistencia.
3. **JEFE_EMPRESA**
   - Lucía, responsable principal de la web. Puede existir una segunda cuenta
     gerencial en el futuro.
   - Consulta operación, trabajadores, oro, mercurio, estadísticas, auditoría y
     reportes.
   - Corrige información gerencial sin reescribir el historial; toda corrección
     relevante queda auditada.

`ADMINISTRADOR` es compatibilidad histórica: no crear pantallas ni casos de uso
nuevos para ese rol.

## Reglas de negocio

- La planta opera continuamente: no cerrar jornadas automáticamente a
  medianoche. Una jornada abierta sigue abierta hasta registrar o corregir la
  salida; nunca vale cero.
- Las correcciones son append-only: no borrar ni sobrescribir hechos históricos.
- **Oro:** opcional, solo lo registra gerencia desde la web, como resultado
  total del cargamento (no por barrida). Vacío = no registrado; `0,00` = medido
  en cero. No hay módulo de custodia física. Desktop nunca muestra, almacena ni
  sincroniza oro.
- **Quilataje:** se anota junto con el oro en `shipment_gold_result_entries.karat`
  (opcional, 0 a 24, hasta tres decimales), con la misma lógica append-only y
  motivo obligatorio al corregir. El vigente se proyecta como `gold_karat` en
  `management_shipment_facts` y es la única fuente para "Oro y mercurio",
  reportes y exportaciones. Las liquidaciones (`report_settlement_lines`) ya no
  se usan para el quilataje; solo alimentan la sección financiera de reportes,
  y su componente web `ReportSettlements` no está montado.
- **Mercurio en web:** la lista muestra la última barrida completa (suma de sus
  tres rastras) y cuántas barridas están completas (`GET management/gold-overview`);
  nunca suma entre barridas.
- **Mercurio:** normalmente viene de desktop, por barrida y por las tres rastras
  (Rastra 1, 2 y 3), con cantidad inicial y final. Si no se registró en planta,
  gerencia puede completarlo o corregirlo desde la web.
- "Material propio" es el proveedor predeterminado al preparar una línea.
- No mezclar cargamentos.
- La planta tiene cuatro líneas, pero la estructura admite más. Las líneas
  tienen nombre, color, orden y estado activo/inactivo.
- No eliminar físicamente líneas, proveedores, trabajadores ni datos con
  historial: se desactivan.
- **Biometría:** prototipo local solo para elevar acceso, no para asistencia.
  La plantilla se cifra con DPAPI y no se sincroniza. No se guardan fotografías
  ni fotogramas. El PIN siempre sigue disponible como alternativa.
- Los sensores automáticos de cajuelas quedan fuera de alcance.
- No implementar un "modo teclado" independiente: solo configuración de atajos.
- La estación se llama "Estación Abangares", con B.

## Seguridad

- Nunca mostrar, imprimir ni confirmar secretos.
- No versionar `.env.local`, `appsettings.Local.json`, SQLite, diagnósticos ni
  credenciales.
- Nunca exponer `service_role` / `SUPABASE_SECRET_KEY` en web o desktop. Todo
  valor `VITE_*` es público.
- Antes de cambiar Supabase, revisar migraciones y contratos existentes. No
  modificar la base remota sin autorización.
- Toda tabla expuesta respeta RLS y aislamiento por organización.
- No usar `user_metadata` para decisiones de autorización.
- No agregar nuevas funciones `SECURITY DEFINER` para resolver permisos sin
  revisión explícita (ya existen algunas en migraciones de sync, asistencia e
  inventario; no tocarlas sin motivo).
- Si cambia una respuesta de API, actualizar el contrato OpenAPI y los clientes
  generados (`pnpm.cmd run contract:generate`). Los archivos
  `<auto-generated />` no se editan a mano.

## Forma de trabajo

Antes de cada cambio:

1. Reproducir o inspeccionar el comportamiento actual.
2. Identificar View, ViewModel, servicio, repositorio y pruebas relacionadas.
3. Explicar brevemente la causa o el diseño propuesto.
4. Implementar el cambio mínimo necesario.
5. Conservar el estilo visual existente.
6. Agregar pruebas automatizadas proporcionales al riesgo.
7. Ejecutar las verificaciones relevantes.
8. Entregar un resumen de archivos cambiados, pruebas y riesgos.
9. Detenerse y esperar la revisión manual. No avanzar al siguiente punto.

## Comandos de verificación

Instalación:

```powershell
pnpm.cmd install --frozen-lockfile
dotnet restore apps/desktop/IndustriasDoradas.Desktop.slnx
```

Desktop:

```powershell
dotnet build apps/desktop/IndustriasDoradas.Desktop.slnx --no-restore --configuration Release
dotnet test apps/desktop/IndustriasDoradas.Desktop.slnx --no-restore --configuration Release
```

API:

```powershell
pnpm.cmd --filter @industrias-doradas/api lint
pnpm.cmd --filter @industrias-doradas/api build
pnpm.cmd --filter @industrias-doradas/api test
pnpm.cmd --filter @industrias-doradas/api test:e2e
```

Web:

```powershell
pnpm.cmd --filter @industrias-doradas/web lint
pnpm.cmd --filter @industrias-doradas/web build
pnpm.cmd --filter @industrias-doradas/web test
```

Contratos y secretos:

```powershell
pnpm.cmd run contract:check
pnpm.cmd run secrets:check
```

No ejecutar toda la suite tras cada cambio pequeño. Antes de entregar el
conjunto final, ejecutar la verificación completa (`pnpm.cmd run verify`) o
explicar qué prueba no se pudo ejecutar y por qué.
