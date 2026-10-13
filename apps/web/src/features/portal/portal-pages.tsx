import type { PropsWithChildren, ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { GoldFeature } from "../gold/gold";
import {
  OperationFreshness,
  OperationLinesPanel,
  OperationRefreshButton,
} from "../management/management-operation";
import {
  operationHeadline,
  useManagementOperation,
} from "../management/management-operation-data";
import {
  ShipmentAuditFeature,
  ShipmentDetailFeature,
  ShipmentsFeature,
} from "../management/management-shipments";

const futureModules = [
  ["⌁", "Estadísticas", "Rendimiento por proveedor, línea y período."],
  ["♙", "Trabajadores", "Operarios, jefes de planta, asistencia y horas."],
  ["⇩", "Reportes", "Archivos Excel generados por período."],
  ["□", "Inventario", "Herramientas, componentes y mantenimiento."],
  ["⚙", "Configuración", "Líneas y catálogos administrables por Lucía."],
] as const;

export function DashboardPage() {
  const operation = useManagementOperation();

  return (
    <div className="portal-view">
      <section className="manager-hero">
        <div>
          <p className="eyebrow light">CONTROL DE PLANTA</p>
          <h1>Buenos días, Lucía.</h1>
          <p>
            Consulte la operación consolidada por las estaciones sin intervenir
            los controles físicos de producción.
          </p>
        </div>
        <div className="hero-status">
          <strong>{operationHeadline(operation)}</strong>
          <OperationFreshness query={operation} />
        </div>
      </section>

      <OperationLinesPanel
        query={operation}
        action={
          <div className="panel-actions">
            <OperationRefreshButton query={operation} />
            <NavLink className="secondary-link" to="/gerencia/operacion">
              VER OPERACIÓN →
            </NavLink>
          </div>
        }
      />

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
  const operation = useManagementOperation();

  return (
    <PortalPage
      title="Operación"
      eyebrow="SEGUIMIENTO REMOTO"
      description="Consulta la proyección central consolidada; los controles físicos permanecen exclusivamente en desktop."
      actions={<OperationRefreshButton query={operation} />}
    >
      <div
        className={`operation-freshness${operation.isError && operation.data !== undefined ? " stale" : ""}`}
      >
        <OperationFreshness query={operation} />
      </div>
      <OperationLinesPanel query={operation} />
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
      description="Registre un único total después de cerrar cada cargamento. Vacío significa no registrado y nunca se interpreta como cero."
    >
      <p className="scope-note">
        El dato se usa para comparar proveedores desde la puesta en marcha, sin
        custodia ni existencia acumulada de oro.
      </p>
      <GoldFeature />
    </PortalPage>
  );
}

export function ShipmentsPage() {
  return (
    <PortalPage
      title="Cargamentos"
      eyebrow="CONSULTA CONSOLIDADA"
      description="Una entrada por cargamento cerrado, con cajuelas, barridas, mercurio y resultado opcional de oro."
    >
      <ShipmentsFeature />
    </PortalPage>
  );
}

export function ShipmentDetailPage() {
  return (
    <PortalPage
      title="Detalle del cargamento"
      eyebrow="TRAZABILIDAD CENTRAL"
      description="Cajuelas, barridas, mercurio, responsable y confirmaciones centrales de un único cargamento."
    >
      <ShipmentDetailFeature />
    </PortalPage>
  );
}

export function AuditPage() {
  return (
    <PortalPage
      title="Auditoría"
      eyebrow="HISTORIAL INMUTABLE"
      description="Cambios operativos agrupados por cargamento, con ocurrencia y confirmación central diferenciadas."
    >
      <section className="portal-panel">
        <header>
          <div>
            <h2>Actividad por cargamento</h2>
            <p>Los códigos técnicos permanecen fuera de la lectura principal</p>
          </div>
        </header>
        <ShipmentAuditFeature />
      </section>
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

function UpcomingState({ children }: PropsWithChildren) {
  return (
    <div className="upcoming-state">
      <span>PRÓXIMAMENTE</span>
      <p>{children}</p>
    </div>
  );
}
