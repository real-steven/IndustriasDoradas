import { NavLink } from "react-router-dom";

import { useAuth, type RoleCode } from "../../auth/auth-context";
import { useLanguage } from "../../i18n/language-context";
import { useGoldSummary } from "../gold/gold-data";
import { OperationFreshness } from "../management/management-operation";
import {
  formatCostaRicaDateTime,
  operationHeadline,
  type ManagementFreshnessQuery,
  type ManagementOperationQuery,
} from "../management/management-operation-data";
import {
  useShipmentAuditEvents,
  type AuditEvent,
  type ShipmentFilters,
} from "../management/management-shipments-data";
import { managerAuditAction } from "../management/management-audit-labels";

const allShipmentFilters: ShipmentFilters = {
  period: "all",
  date: "",
  toDate: "",
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
  const activity = useShipmentAuditEvents({
    search: "",
    page: 1,
    pageSize: 3,
  });
  const lines = operation.data?.items ?? [];
  const activeShipments = new Set(lines.map((line) => line.shipmentId)).size;
  const activeCajuelas = lines.reduce(
    (total, line) => total + line.cajuelaTotal,
    0,
  );
  const pendingSweeps = lines.filter((line) => line.sweepPending).length;
  const pendingGold = gold.data?.excludedShipments ?? 0;
  const pendingTotal = pendingSweeps + pendingGold;
  const pendingValue =
    operation.data === undefined || gold.data === undefined
      ? null
      : pendingTotal;
  const refreshing =
    operation.isFetching ||
    freshness.isFetching ||
    gold.isFetching ||
    activity.isFetching;
  const displayName = managementDisplayName(
    auth.profile?.displayName,
    auth.profile?.role,
    language,
  );

  return (
    <div className="portal-view dashboard-summary">
      <section className="manager-hero">
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
        />
      </section>

      <div className="dashboard-columns">
        <section className="portal-panel dashboard-attention">
          <header>
            <div>
              <h2>{tr("Necesita atención", "Needs attention")}</h2>
              <p>
                {tr(
                  "Asuntos que requieren seguimiento de gerencia",
                  "Items that need management follow-up",
                )}
              </p>
            </div>
            <button
              type="button"
              className="secondary"
              disabled={refreshing}
              onClick={() =>
                void Promise.all([
                  operation.refetch(),
                  freshness.refetch(),
                  gold.refetch(),
                  activity.refetch(),
                ])
              }
            >
              {refreshing
                ? tr("Actualizando…", "Refreshing…")
                : tr("Actualizar datos", "Refresh data")}
            </button>
          </header>
          <AttentionList
            pendingSweeps={pendingSweeps}
            pendingGold={pendingGold}
            operationReady={operation.data !== undefined}
            goldReady={gold.data !== undefined}
          />
        </section>

        <section className="portal-panel dashboard-activity">
          <header>
            <div>
              <h2>{tr("Actividad reciente", "Recent activity")}</h2>
              <p>
                {tr(
                  "Últimos movimientos importantes",
                  "Latest important activity",
                )}
              </p>
            </div>
            <NavLink className="inline-link" to="/gerencia/auditoria">
              {tr("Ver auditoría →", "View audit →")}
            </NavLink>
          </header>
          <RecentActivity
            events={activity.data?.items}
            pending={activity.isPending}
          />
        </section>
      </div>

      <nav
        className="portal-panel dashboard-shortcuts"
        aria-label={tr("Accesos rápidos", "Quick links")}
      >
        <h2>{tr("Accesos rápidos", "Quick links")}</h2>
        <div>
          <NavLink to="/gerencia/operacion">
            <span aria-hidden="true">↗</span>
            {tr("Ver operación", "View operations")}
            <strong aria-hidden="true">→</strong>
          </NavLink>
          <NavLink to="/gerencia/oro">
            <span aria-hidden="true">◆</span>
            {tr("Registrar oro", "Record gold")}
            <strong aria-hidden="true">→</strong>
          </NavLink>
          <NavLink to="/gerencia/cargamentos">
            <span aria-hidden="true">▣</span>
            {tr("Ver cargamentos", "View shipments")}
            <strong aria-hidden="true">→</strong>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}

function ExecutiveMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: "blue" | "gold" | "green" | "red" | "neutral";
}) {
  return (
    <article className="executive-metric">
      <span className={`executive-metric-icon ${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function AttentionList({
  pendingSweeps,
  pendingGold,
  operationReady,
  goldReady,
}: {
  pendingSweeps: number;
  pendingGold: number;
  operationReady: boolean;
  goldReady: boolean;
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
          <NavLink to="/gerencia/operacion">
            {tr("Ver operación →", "View operations →")}
          </NavLink>
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
          <NavLink to="/gerencia/oro">
            {tr("Registrar oro →", "Record gold →")}
          </NavLink>
        </article>
      )}
    </div>
  );
}

function RecentActivity({
  events,
  pending,
}: {
  events: AuditEvent[] | undefined;
  pending: boolean;
}) {
  const { language, tr } = useLanguage();

  if (pending)
    return (
      <p className="dashboard-loading" role="status">
        {tr("Consultando actividad…", "Loading activity…")}
      </p>
    );
  if (events === undefined)
    return (
      <p className="dashboard-loading">
        {tr(
          "No fue posible consultar la actividad reciente.",
          "Recent activity could not be loaded.",
        )}
      </p>
    );
  if (events.length === 0)
    return (
      <p className="dashboard-loading">
        {tr("Todavía no hay actividad registrada.", "No activity yet.")}
      </p>
    );

  return (
    <ol className="recent-activity-list">
      {events.map((event, index) => (
        <li key={event.id ?? `${event.entityId ?? "activity"}-${index}`}>
          <span
            className={event.result === "SUCCEEDED" ? "complete" : "issue"}
            aria-hidden="true"
          >
            {event.result === "SUCCEEDED" ? "✓" : "!"}
          </span>
          <div>
            <strong>{managerAuditAction(event, language)}</strong>
            <small>{activityTime(event.occurredAt, language, tr)}</small>
          </div>
        </li>
      ))}
    </ol>
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

function activityTime(
  value: string,
  language: "es" | "en",
  tr: (spanish: string, english: string) => string,
): string {
  if (Number.isNaN(Date.parse(value)))
    return tr("Fecha no disponible", "Date unavailable");
  return formatCostaRicaDateTime(value, language);
}
