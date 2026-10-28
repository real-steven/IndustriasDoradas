import type { PropsWithChildren, ReactNode } from "react";
import { useOutletContext } from "react-router-dom";

import { useLanguage } from "../../i18n/language-context";
import { GoldFeature } from "../gold/gold";
import { AttendanceFeature } from "../attendance/attendance";
import {
  OperationFreshness,
  OperationLinesPanel,
  OperationRefreshButton,
} from "../management/management-operation";
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

function usePortalFreshness(): ManagementFreshnessQuery {
  return useOutletContext<{ freshness: ManagementFreshnessQuery }>().freshness;
}

export function DashboardPage() {
  const operation = useManagementOperation();
  const freshness = usePortalFreshness();

  return <DashboardSummary operation={operation} freshness={freshness} />;
}

export function OperationPage() {
  const { tr } = useLanguage();
  const operation = useManagementOperation();
  const freshness = usePortalFreshness();

  return (
    <PortalPage
      title={tr("Operación", "Operations")}
      eyebrow={tr("SEGUIMIENTO REMOTO", "REMOTE MONITORING")}
      description={tr(
        "Consulta la proyección central consolidada; los controles físicos permanecen exclusivamente en desktop.",
        "Review the consolidated central projection; physical controls remain exclusively in the desktop application.",
      )}
      actions={
        <OperationRefreshButton query={operation} freshness={freshness} />
      }
    >
      <div
        className={`operation-freshness${operation.isError && operation.data !== undefined ? " stale" : ""}`}
      >
        <OperationFreshness query={operation} freshness={freshness} />
      </div>
      <OperationLinesPanel query={operation} />
      <Panel
        title={tr("Operarios y horas", "Operators and hours")}
        subtitle={tr("Control de trabajadores", "Workforce control")}
      >
        <UpcomingState>
          {tr(
            "La creación de operarios, asistencia y horas se implementará en una etapa posterior.",
            "The creation of operators, attendance, and hours will be implemented at a later stage.",
          )}
        </UpcomingState>
      </Panel>
    </PortalPage>
  );
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
        "Registre un único total después de cerrar cada cargamento. Vacío significa no registrado y nunca se interpreta como cero.",
        "Record one total after closing each shipment. An empty value means not recorded and is never interpreted as zero.",
      )}
    >
      <p className="scope-note">
        {tr(
          "El dato se usa para comparar proveedores desde la puesta en marcha, sin custodia ni existencia acumulada de oro.",
          "This data is used to compare suppliers from commissioning onward, without tracking custody or accumulated gold inventory.",
        )}
      </p>
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

export function WorkersPage() {
  const { tr } = useLanguage();

  return (
    <PortalPage
      title={tr("Trabajadores y horas", "Workers and hours")}
      eyebrow={tr("ASISTENCIA CONFIRMADA", "CONFIRMED ATTENDANCE")}
      description={tr(
        "Consulte jornadas, horas confirmadas, pendientes y correcciones por trabajador. Esta pantalla no modifica marcas ni calcula pagos.",
        "Review shifts, confirmed hours, open items, and corrections by worker. This screen does not modify marks or calculate payroll.",
      )}
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
    <PortalPage
      title={tr("Auditoría", "Audit")}
      eyebrow={tr("CONTROL Y SEGUIMIENTO", "CONTROL AND FOLLOW-UP")}
      description={tr(
        "Consulte las acciones importantes del negocio, quién las realizó y si fueron completadas.",
        "Review important business actions, who performed them, and whether they were completed.",
      )}
    >
      <section className="portal-panel manager-audit-panel">
        <header>
          <div>
            <h2>{tr("Actividad del sistema", "System activity")}</h2>
            <p>
              {tr(
                "Los detalles técnicos permanecen ocultos para facilitar la lectura",
                "Technical details remain hidden to make the history easier to read",
              )}
            </p>
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
  const { tr } = useLanguage();

  return (
    <div className="upcoming-state">
      <span>{tr("PRÓXIMAMENTE", "COMING SOON")}</span>
      <p>{children}</p>
    </div>
  );
}
