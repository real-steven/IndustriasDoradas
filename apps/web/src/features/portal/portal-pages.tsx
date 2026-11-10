import type { PropsWithChildren, ReactNode } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";

import { useLanguage } from "../../i18n/language-context";
import { GoldFeature } from "../gold/gold";
import { AttendanceFeature } from "../attendance/attendance";
import { PlantManagerPage } from "../accounts/plant-manager-page";
import {
  type ManagementFreshnessQuery,
  useManagementOperation,
} from "../management/management-operation-data";
import {
  ShipmentAuditFeature,
  ShipmentDetailFeature,
  ShipmentsFeature,
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
    <PortalPage
      title={tr("Oro por cargamento", "Gold by shipment")}
      eyebrow={tr(
        "REGISTRO OPCIONAL DE GERENCIA",
        "OPTIONAL MANAGEMENT RECORD",
      )}
      description={tr(
        "Registre o corrija el oro total de cada cargamento cerrado para comparar proveedores. Un vacío queda pendiente, no representa cero ni custodia de oro.",
        "Record or correct the total gold for each closed shipment to compare suppliers. An empty value remains pending and represents neither zero nor gold custody.",
      )}
    >
      <GoldFeature />
    </PortalPage>
  );
}

export function ShipmentsPage() {
  const { tr } = useLanguage();

  return (
    <PortalPage
      title={tr("Cargamentos", "Shipments")}
      eyebrow={tr("CONSULTA CONSOLIDADA", "CONSOLIDATED VIEW")}
      description={tr(
        "Una entrada por cargamento cerrado, con cajuelas, barridas, mercurio y resultado opcional de oro.",
        "One entry per closed shipment, including cajuelas, sweeps, mercury, and an optional gold result.",
      )}
    >
      <ShipmentsFeature />
    </PortalPage>
  );
}

export function PersonnelPage() {
  const { tr } = useLanguage();
  const [parameters, setParameters] = useSearchParams();
  const section =
    parameters.get("seccion") === "accesos" ? "access" : "records";

  const selectSection = (next: "records" | "access") => {
    const nextParameters = new URLSearchParams(parameters);
    nextParameters.delete("worker");
    if (next === "access") nextParameters.set("seccion", "accesos");
    else nextParameters.delete("seccion");
    setParameters(nextParameters, { replace: true });
  };

  return (
    <div className="portal-view portal-view-compact personnel-page">
      <header className="personnel-page-head">
        <div>
          <p className="eyebrow">
            {tr("GESTIÓN DE PERSONAL", "PEOPLE MANAGEMENT")}
          </p>
          <h1>{tr("Personal", "People")}</h1>
          <p>
            {tr(
              "Expedientes, pagos y accesos en un mismo lugar.",
              "Records, pay, and access in one place.",
            )}
          </p>
        </div>
        <nav
          className="personnel-section-switch"
          aria-label={tr("Secciones de personal", "People sections")}
        >
          <button
            type="button"
            className={section === "records" ? "active" : ""}
            aria-pressed={section === "records"}
            onClick={() => selectSection("records")}
          >
            {tr("Expedientes y pagos", "Records and pay")}
          </button>
          <button
            type="button"
            className={section === "access" ? "active" : ""}
            aria-pressed={section === "access"}
            onClick={() => selectSection("access")}
          >
            {tr("Cuentas y accesos", "Accounts and access")}
          </button>
        </nav>
      </header>

      {section === "records" ? <AttendanceFeature /> : <PlantManagerPage />}
    </div>
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
    <PortalPage
      title={tr("Auditoría", "Audit")}
      eyebrow={tr("CONTROL Y SEGUIMIENTO", "CONTROL AND FOLLOW-UP")}
      description={tr(
        "Consulte las acciones importantes del negocio, quién las realizó y si fueron completadas.",
        "Review important business actions, who performed them, and whether they were completed.",
      )}
    >
      <section className="portal-panel manager-audit-panel">
        <ShipmentAuditFeature />
      </section>
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
