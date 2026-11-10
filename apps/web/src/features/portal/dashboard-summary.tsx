import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { useAuth, type RoleCode } from "../../auth/auth-context";
import { useLanguage } from "../../i18n/language-context";
import { useGoldSummary } from "../gold/gold-data";
import {
  OperationFreshness,
  OperationLinesPanel,
  OperationRefreshButton,
} from "../management/management-operation";
import {
  operationHeadline,
  type ManagementFreshnessQuery,
  type ManagementOperationQuery,
} from "../management/management-operation-data";
import type { ShipmentFilters } from "../management/management-shipments-data";

const allShipmentFilters: ShipmentFilters = {
  period: "all",
  date: "",
  toDate: "",
  shipmentReference: "",
  page: 1,
};

export function DashboardSummary({
  operation,
  freshness,
}: {
  operation: ManagementOperationQuery;
  freshness: ManagementFreshnessQuery;
}) {
  const auth = useAuth();
  const { language, locale, tr } = useLanguage();
  const gold = useGoldSummary(allShipmentFilters);
  const [showPending, setShowPending] = useState(false);
  const lines = operation.data?.items ?? [];
  const activeShipments = new Set(lines.map((line) => line.shipmentId)).size;
  const activeCajuelas = lines.reduce(
    (total, line) => total + line.cajuelaTotal,
    0,
  );
  const pendingSweeps = lines.filter((line) => line.sweepPending).length;
  const pendingGold = gold.data?.pendingShipments ?? 0;
  const pendingTotal = pendingSweeps + pendingGold;
  const pendingValue =
    operation.data === undefined || gold.data === undefined
      ? null
      : pendingTotal;
  const displayName = managementDisplayName(
    auth.profile?.displayName,
    auth.profile?.role,
    language,
  );

  return (
    <div className="portal-view dashboard-summary">
      <section className="manager-hero dashboard-hero">
        <div>
          <p className="eyebrow light">
            {tr("CONTROL DE PLANTA", "PLANT CONTROL")}
          </p>
          <h1>
            {tr("Buenos días", "Good morning")}, {displayName}.
          </h1>
          <p>
            {tr(
              "Aquí puede ver cómo marcha la planta y qué necesita su atención hoy.",
              "See how the plant is doing and what needs your attention today.",
            )}
          </p>
        </div>
        <div className="hero-status">
          <strong>{operationHeadline(operation, language)}</strong>
          <OperationFreshness query={operation} freshness={freshness} />
        </div>
      </section>

      <section
        className="executive-metrics"
        aria-label={tr("Indicadores principales", "Key indicators")}
      >
        <ExecutiveMetric
          icon="◆"
          label={tr("Oro registrado", "Recorded gold")}
          value={
            gold.data === undefined
              ? "—"
              : `${gold.data.totalGoldGrams.toLocaleString(locale)} g`
          }
          tone="gold"
        />
        <ExecutiveMetric
          icon="▣"
          label={tr("Cargamentos en proceso", "Shipments in progress")}
          value={metricValue(
            operation.data === undefined ? null : activeShipments,
            locale,
          )}
          tone="gold"
        />
        <ExecutiveMetric
          icon="◆"
          label={tr("Cajuelas en proceso", "Cajuelas in progress")}
          value={metricValue(
            operation.data === undefined ? null : activeCajuelas,
            locale,
          )}
          tone="green"
        />
        <ExecutiveMetric
          icon="!"
          label={tr("Pendientes", "Pending")}
          value={metricValue(pendingValue, locale)}
          tone={pendingTotal > 0 ? "red" : "neutral"}
          actionLabel={tr("Ver pendientes", "View pending items")}
          onClick={() => setShowPending(true)}
        />
      </section>

      <div id="operacion-actual">
        <OperationLinesPanel
          query={operation}
          action={
            <OperationRefreshButton query={operation} freshness={freshness} />
          }
        />
      </div>

      {showPending && (
        <PendingDialog
          pendingSweeps={pendingSweeps}
          pendingGold={pendingGold}
          operationReady={operation.data !== undefined}
          goldReady={gold.data !== undefined}
          onClose={() => setShowPending(false)}
        />
      )}
    </div>
  );
}

function ExecutiveMetric({
  icon,
  label,
  value,
  tone,
  actionLabel,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  tone: "blue" | "gold" | "green" | "red" | "neutral";
  actionLabel?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={`executive-metric-icon ${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {onClick !== undefined && (
        <span className="executive-metric-action" aria-hidden="true">
          →
        </span>
      )}
    </>
  );

  if (onClick !== undefined)
    return (
      <button
        type="button"
        className="executive-metric executive-metric-button"
        aria-label={actionLabel}
        onClick={onClick}
      >
        {content}
      </button>
    );

  return <article className="executive-metric">{content}</article>;
}

function PendingDialog({
  pendingSweeps,
  pendingGold,
  operationReady,
  goldReady,
  onClose,
}: {
  pendingSweeps: number;
  pendingGold: number;
  operationReady: boolean;
  goldReady: boolean;
  onClose: () => void;
}) {
  const { tr } = useLanguage();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="dashboard-dialog-backdrop" onMouseDown={onClose}>
      <section
        className="dashboard-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-pending-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">{tr("SEGUIMIENTO", "FOLLOW-UP")}</p>
            <h2 id="dashboard-pending-title">
              {tr("Pendientes de gerencia", "Management pending items")}
            </h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="icon-button"
            aria-label={tr("Cerrar pendientes", "Close pending items")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <AttentionList
          pendingSweeps={pendingSweeps}
          pendingGold={pendingGold}
          operationReady={operationReady}
          goldReady={goldReady}
          onClose={onClose}
        />
      </section>
    </div>
  );
}

function AttentionList({
  pendingSweeps,
  pendingGold,
  operationReady,
  goldReady,
  onClose,
}: {
  pendingSweeps: number;
  pendingGold: number;
  operationReady: boolean;
  goldReady: boolean;
  onClose: () => void;
}) {
  const { tr } = useLanguage();

  if (!operationReady || !goldReady)
    return (
      <p className="dashboard-loading" role="status">
        {tr("Consultando pendientes…", "Loading pending items…")}
      </p>
    );

  if (pendingSweeps === 0 && pendingGold === 0)
    return (
      <div className="attention-empty">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>{tr("Todo está al día", "Everything is up to date")}</strong>
          <p>
            {tr(
              "No hay asuntos pendientes que requieran su atención.",
              "There are no pending items that need your attention.",
            )}
          </p>
        </div>
      </div>
    );

  return (
    <div className="attention-list">
      {pendingSweeps > 0 && (
        <article className="attention-item critical">
          <span aria-hidden="true">!</span>
          <div>
            <h3>
              {pendingSweeps === 1
                ? tr("1 línea necesita una barrida.", "1 line needs a sweep.")
                : tr(
                    `${pendingSweeps} líneas necesitan una barrida.`,
                    `${pendingSweeps} lines need a sweep.`,
                  )}
            </h3>
            <p>
              {tr(
                "Revise la operación para mantener la planta al día.",
                "Review operations to keep the plant up to date.",
              )}
            </p>
          </div>
          <a href="#operacion-actual" onClick={onClose}>
            {tr("Ver operación →", "View operations →")}
          </a>
        </article>
      )}
      {pendingGold > 0 && (
        <article className="attention-item warning">
          <span aria-hidden="true">◇</span>
          <div>
            <h3>
              {pendingGold === 1
                ? tr(
                    "1 cargamento está pendiente de registrar oro.",
                    "1 shipment is waiting for a gold result.",
                  )
                : tr(
                    `${pendingGold} cargamentos están pendientes de registrar oro.`,
                    `${pendingGold} shipments are waiting for gold results.`,
                  )}
            </h3>
            <p>
              {tr(
                "Complete el resultado para mantener los reportes actualizados.",
                "Complete the result to keep reports up to date.",
              )}
            </p>
          </div>
          <NavLink to="/gerencia/oro" onClick={onClose}>
            {tr("Registrar oro →", "Record gold →")}
          </NavLink>
        </article>
      )}
    </div>
  );
}

function managementDisplayName(
  displayName: string | undefined,
  role: RoleCode | undefined,
  language: "es" | "en",
): string {
  const value = displayName?.trim();
  if (value !== undefined && value.length > 0) return value;
  if (role === "JEFE_PLANTA") return language === "es" ? "Jefatura" : "Manager";
  return language === "es" ? "Gerencia" : "Management";
}

function metricValue(value: number | null, locale: string): string {
  return value === null ? "—" : value.toLocaleString(locale);
}
