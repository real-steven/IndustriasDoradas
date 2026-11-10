import type { PropsWithChildren, ReactNode } from "react";
import { useOutletContext } from "react-router-dom";

import { useLanguage } from "../../i18n/language-context";
import { GoldFeature } from "../gold/gold";
import { AttendanceFeature } from "../attendance/attendance";
import {
  type ManagementFreshnessQuery,
  useManagementOperation,
} from "../management/management-operation-data";
import {
  ShipmentAuditFeature,
  ShipmentDetailFeature,
} from "../management/management-shipments";
import { DashboardSummary } from "./dashboard-summary";
import { StatisticsFeature } from "../statistics/statistics";
import { ReportsFeature } from "../reports/reports";

function usePortalFreshness(): ManagementFreshnessQuery {
  return useOutletContext<{ freshness: ManagementFreshnessQuery }>().freshness;
}

export function DashboardPage() {
  const operation = useManagementOperation();
  const freshness = usePortalFreshness();

  return <DashboardSummary operation={operation} freshness={freshness} />;
}

export function GoldPage() {
  const { tr } = useLanguage();

  return (
    <PortalPage title="" eyebrow="" description="" compact>
      <h1 className="visually-hidden">
        {tr("Oro y mercurio", "Gold and mercury")}
      </h1>
      <GoldFeature />
    </PortalPage>
  );
}

export function WorkersPage() {
  const { tr } = useLanguage();

  return (
    <PortalPage
      title={tr("Trabajadores", "Workers")}
      eyebrow={tr("EXPEDIENTES Y TARIFAS", "RECORDS AND RATES")}
      description={tr(
        "Busque un empleado por nombre o cédula para revisar sus horas, tarifa, bruto y notas.",
        "Find an employee by name or identity number to review hours, rate, gross amount, and notes.",
      )}
      compact
    >
      <AttendanceFeature />
    </PortalPage>
  );
}

export function ShipmentDetailPage() {
  const { tr } = useLanguage();

  return (
    <PortalPage
      title={tr("Detalle del cargamento", "Shipment detail")}
      eyebrow={tr("TRAZABILIDAD CENTRAL", "CENTRAL TRACEABILITY")}
      description={tr(
        "Cajuelas, barridas, mercurio, responsable y confirmaciones centrales de un único cargamento.",
        "Cajuelas, sweeps, mercury, responsible worker, and central confirmations for one shipment.",
      )}
    >
      <ShipmentDetailFeature />
    </PortalPage>
  );
}

export function AuditPage() {
  const { tr } = useLanguage();

  return (
    <PortalPage title="" eyebrow="" description="" compact>
      <h1 className="visually-hidden">{tr("Auditoría", "Audit")}</h1>
      <ShipmentAuditFeature />
    </PortalPage>
  );
}

export function StatisticsPage() {
  const { tr } = useLanguage();

  return (
    <PortalPage
      title={tr("Estadísticas", "Statistics")}
      eyebrow={tr("ANÁLISIS GERENCIAL", "MANAGEMENT ANALYTICS")}
      description={tr(
        "Compare producción, líneas y proveedores con cobertura visible de los resultados de oro.",
        "Compare production, lines, and suppliers with visible gold-result coverage.",
      )}
    >
      <StatisticsFeature />
    </PortalPage>
  );
}

export function ReportsPage() {
  const { tr } = useLanguage();

  return (
    <PortalPage
      title={tr("Reportes", "Reports")}
      eyebrow={tr("INFORMACIÓN PARA GERENCIA", "MANAGEMENT INFORMATION")}
      description={tr(
        "Elija entre reportes de producción y oro o una pre-nómina separada por empleado.",
        "Choose between production and gold reports or a separate employee pre-payroll report.",
      )}
    >
      <ReportsFeature />
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
  const { tr } = useLanguage();

  return (
    <PortalPage
      title={title}
      eyebrow={tr("PRÓXIMAMENTE", "COMING SOON")}
      description={description}
    >
      <Panel
        title={tr("Módulo reservado", "Reserved module")}
        subtitle={tr(
          "No forma parte del primer entregable web",
          "Not included in the first web release",
        )}
      >
        <UpcomingState>
          {tr(
            "La navegación ya contempla este espacio, pero todavía no crea, modifica ni inventa datos.",
            "Navigation already includes this space, but it does not create, modify, or fabricate data yet.",
          )}
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
  compact = false,
  children,
}: PropsWithChildren<{
  title: string;
  eyebrow: string;
  description: string;
  actions?: ReactNode;
  compact?: boolean;
}>) {
  return (
    <div className={`portal-view${compact ? " portal-view-compact" : ""}`}>
      {!compact && (
        <header className="portal-page-head">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {actions && <div className="page-actions">{actions}</div>}
        </header>
      )}
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
  const { tr } = useLanguage();

  return (
    <div className="upcoming-state">
      <span>{tr("PRÓXIMAMENTE", "COMING SOON")}</span>
      <p>{children}</p>
    </div>
  );
}
