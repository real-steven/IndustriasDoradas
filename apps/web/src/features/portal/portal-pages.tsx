import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { PropsWithChildren, ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { apiRequest } from "../../api/http";
import { useAuth } from "../../auth/auth-context";

interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface AuditEvent {
  id: string;
  actorDisplayName: string | null;
  action: string;
  entityType: string;
  result: string;
  occurredAt: string;
}

const lines = [
  { name: "Línea 1 · Morada", color: "purple" },
  { name: "Línea 2 · Celeste", color: "cyan" },
  { name: "Línea 3 · Rosada", color: "pink" },
  { name: "Línea 4 · Naranja", color: "orange" },
] as const;

const futureModules = [
  ["⌁", "Estadísticas", "Rendimiento por proveedor, línea y período."],
  ["♙", "Trabajadores", "Operarios, jefes de planta, asistencia y horas."],
  ["⇩", "Reportes", "Archivos Excel generados por período."],
  ["□", "Inventario", "Herramientas, componentes y mantenimiento."],
  ["⚙", "Configuración", "Líneas y catálogos administrables por Lucía."],
] as const;

export function DashboardPage() {
  return (
    <div className="portal-view">
      <section className="manager-hero">
        <div>
          <p className="eyebrow light">PORTAL GERENCIAL EN PREPARACIÓN</p>
          <h1>Buenos días, Lucía.</h1>
          <p>
            La nueva estructura está lista. Los datos aparecerán aquí cuando
            finalice la proyección central de la operación.
          </p>
        </div>
        <div className="hero-status">
          <strong>Sin datos en vivo</strong>
          <span>No se muestran cifras ficticias</span>
        </div>
      </section>

      <div className="metric-grid" aria-label="Resumen pendiente de conectar">
        <Metric
          label="Líneas activas"
          value="—"
          detail="Pendiente de sincronización"
          icon="◫"
        />
        <Metric
          label="Cajuelas del período"
          value="—"
          detail="Pendiente de sincronización"
          icon="＋"
        />
        <Metric
          label="Cargamentos cerrados"
          value="—"
          detail="Pendiente de sincronización"
          icon="✓"
        />
        <Metric
          label="Oro registrado"
          value="—"
          detail="Dato opcional de gerencia"
          icon="◆"
        />
      </div>

      <Panel
        title="Operación en vivo"
        subtitle="Estructura preparada para las líneas de esta planta"
        action={
          <NavLink className="secondary-link" to="/gerencia/operacion">
            VER OPERACIÓN →
          </NavLink>
        }
      >
        <div className="line-grid">
          {lines.map((line) => (
            <DisconnectedLine key={line.name} {...line} />
          ))}
        </div>
      </Panel>

      <Panel
        title="Módulos futuros"
        subtitle="Se implementarán después del primer entregable"
      >
        <div className="future-grid">
          {futureModules.map(([icon, title, description]) => (
            <article className="future-card" key={title}>
              <span className="future-badge">PRÓXIMAMENTE</span>
              <span className="module-icon" aria-hidden="true">
                {icon}
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function OperationPage() {
  return (
    <PortalPage
      title="Operación"
      eyebrow="SEGUIMIENTO REMOTO"
      description="Las tarjetas se conectarán con la proyección central completa; los controles físicos permanecen en desktop."
    >
      <Panel
        title="Líneas de producción"
        subtitle="Estado, cargamento, responsable y próximas referencias"
      >
        <div className="line-grid">
          {lines.map((line) => (
            <DisconnectedLine key={line.name} {...line} />
          ))}
        </div>
      </Panel>
      <Panel title="Operarios y horas" subtitle="Control de trabajadores">
        <UpcomingState>
          La creación de operarios y jefes de planta, asistencia y horas se
          implementará en una etapa posterior.
        </UpcomingState>
      </Panel>
    </PortalPage>
  );
}

export function GoldPage() {
  return (
    <PortalPage
      title="Oro por cargamento"
      eyebrow="REGISTRO OPCIONAL DE GERENCIA"
      description="Lucía podrá registrar un único total después de cerrar cada cargamento. Vacío significa no registrado y nunca se interpreta como cero."
    >
      <div className="gold-summary">
        <div>
          <h2>Uso del dato</h2>
          <p>
            Comparar el rendimiento de proveedores desde la puesta en marcha,
            sin custodia ni existencia acumulada de oro.
          </p>
        </div>
        <div>
          <span>RESULTADOS</span>
          <strong>—</strong>
        </div>
        <div>
          <span>COBERTURA</span>
          <strong>— / —</strong>
        </div>
        <div>
          <span>INICIO</span>
          <strong>Próximo</strong>
        </div>
      </div>
      <Panel
        title="Cargamentos cerrados"
        subtitle="Solo aparecerán cargamentos posteriores a la puesta en marcha"
      >
        <EmptyState icon="◆" title="Aún no hay resultados de oro">
          El registro y la comparación por proveedor se incorporarán sobre esta
          estructura.
        </EmptyState>
      </Panel>
    </PortalPage>
  );
}

export function ShipmentsPage() {
  return (
    <PortalPage
      title="Cargamentos"
      eyebrow="CONSULTA CONSOLIDADA"
      description="Una entrada por cargamento cerrado, con cajuelas, barridas, mercurio y resultado opcional de oro."
      actions={
        <>
          <label className="visually-hidden" htmlFor="shipment-period">
            Período
          </label>
          <select id="shipment-period" defaultValue="current">
            <option value="current">Esta semana</option>
            <option value="previous">Semana anterior</option>
            <option value="date">Fecha específica</option>
          </select>
        </>
      }
    >
      <Panel
        title="Historial"
        subtitle="Los filtros quedarán conectados a la API gerencial"
      >
        <EmptyState icon="▤" title="Aún no hay cargamentos proyectados">
          Primero se completará la sincronización entre estaciones para evitar
          historiales parciales.
        </EmptyState>
      </Panel>
    </PortalPage>
  );
}

export function AuditPage() {
  const context = usePortalContext();
  const audit = useQuery({
    queryKey: ["audit", context.organizationId],
    queryFn: () =>
      apiRequest<Page<AuditEvent>>(
        `/organizations/${context.organizationId}/audit-events`,
        context.token,
      ),
  });
  return (
    <PortalPage
      title="Auditoría"
      eyebrow="HISTORIAL INMUTABLE"
      description="Movimientos gerenciales y operativos con actor, momento, entidad y resultado."
    >
      <Panel
        title="Actividad registrada"
        subtitle="Los detalles técnicos permanecen fuera de la lectura principal"
      >
        <QueryState query={audit}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState icon="◷" title="Aún no hay movimientos disponibles">
                Los eventos aparecerán aquí cuando la API entregue el historial
                gerencial.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Momento</th>
                      <th>Actor</th>
                      <th>Acción</th>
                      <th>Entidad</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {new Date(item.occurredAt).toLocaleString("es-CR")}
                        </td>
                        <td>{item.actorDisplayName ?? "Sistema"}</td>
                        <td>{item.action}</td>
                        <td>{item.entityType}</td>
                        <td>{item.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </QueryState>
      </Panel>
    </PortalPage>
  );
}

export function UpcomingPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <PortalPage title={title} eyebrow="PRÓXIMAMENTE" description={description}>
      <Panel
        title="Módulo reservado"
        subtitle="No forma parte del primer entregable web"
      >
        <UpcomingState>
          La navegación ya contempla este espacio, pero todavía no crea,
          modifica ni inventa datos.
        </UpcomingState>
      </Panel>
    </PortalPage>
  );
}

function PortalPage({
  title,
  eyebrow,
  description,
  actions,
  children,
}: PropsWithChildren<{
  title: string;
  eyebrow: string;
  description: string;
  actions?: ReactNode;
}>) {
  return (
    <div className="portal-view">
      <header className="portal-page-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
}) {
  return (
    <article className="metric-card">
      <div>
        <span>{label}</span>
        <i aria-hidden="true">{icon}</i>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: PropsWithChildren<{ title: string; subtitle: string; action?: ReactNode }>) {
  return (
    <section className="portal-panel">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function DisconnectedLine({ name, color }: { name: string; color: string }) {
  return (
    <article className={`line-card ${color}`}>
      <div>
        <h3>{name}</h3>
        <span className="line-status neutral">SIN DATOS</span>
      </div>
      <p>Esperando proyección central de la operación</p>
      <strong>—</strong>
      <small>cajuelas</small>
      <div className="progress-track" aria-hidden="true">
        <i />
      </div>
    </article>
  );
}

function EmptyState({
  icon,
  title,
  children,
}: PropsWithChildren<{ icon: string; title: string }>) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function UpcomingState({ children }: PropsWithChildren) {
  return (
    <div className="upcoming-state">
      <span>PRÓXIMAMENTE</span>
      <p>{children}</p>
    </div>
  );
}

function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T, Error>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending)
    return (
      <p role="status" className="query-message">
        Cargando información…
      </p>
    );
  if (query.isError)
    return (
      <p role="alert" className="query-message error">
        No se pudo cargar la información. Puede intentarlo nuevamente más tarde.
      </p>
    );
  return children(query.data);
}

function usePortalContext() {
  const auth = useAuth();
  if (auth.session === null || auth.profile === null)
    throw new Error("Authenticated portal context required");
  return {
    token: auth.session.access_token,
    organizationId: auth.profile.organizationId,
  };
}
