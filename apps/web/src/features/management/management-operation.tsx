import { useEffect, useState, type ReactNode } from "react";

import type { ManagementOperationLine } from "../../api/generated/api-client";
import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import {
  effectiveManagementTime,
  formatCostaRicaDateTime,
  type ManagementFreshnessQuery,
  type ManagementOperationQuery,
} from "./management-operation-data";
import { lineAccent } from "./line-accent";

export function OperationLinesPanel({
  query,
  action,
  status,
}: {
  query: ManagementOperationQuery;
  action?: ReactNode;
  status?: ReactNode;
}) {
  const { tr } = useLanguage();

  return (
    <section className="portal-panel">
      <header>
        <div>
          <h2>{tr("Líneas en operación", "Operating lines")}</h2>
          {status === undefined ? (
            <p>
              {tr(
                "Producción abierta en este momento",
                "Production currently in progress",
              )}
            </p>
          ) : (
            <p className="operation-panel-status">{status}</p>
          )}
        </div>
        {action}
      </header>
      <OperationQueryState query={query} />
    </section>
  );
}

export function OperationRefreshButton({
  query,
  freshness,
}: {
  query: ManagementOperationQuery;
  freshness: ManagementFreshnessQuery;
}) {
  const { tr } = useLanguage();
  const refreshing = query.isFetching || freshness.isFetching;
  return (
    <button
      type="button"
      className="secondary"
      disabled={refreshing}
      onClick={() => void Promise.all([query.refetch(), freshness.refetch()])}
    >
      {refreshing
        ? tr("Actualizando…", "Refreshing…")
        : tr("Actualizar datos", "Refresh data")}
    </button>
  );
}

export function OperationFreshness({
  query,
  freshness,
}: {
  query: ManagementOperationQuery;
  freshness: ManagementFreshnessQuery;
}) {
  const { language, tr } = useLanguage();

  if (query.isPending)
    return (
      <span>{tr("Actualizando la operación…", "Refreshing operations…")}</span>
    );
  if (query.data === undefined)
    return (
      <span>
        {tr(
          "No fue posible confirmar la operación",
          "Operations could not be confirmed",
        )}
      </span>
    );
  const effectiveAtUtc = effectiveManagementTime(query, freshness);
  if (query.isError)
    return (
      <span>
        {tr("Datos desactualizados", "Outdated data")}
        {effectiveAtUtc === null
          ? ""
          : ` · ${tr("última actualización", "last updated")} ${formatCostaRicaDateTime(effectiveAtUtc, language)}`}
      </span>
    );
  if (effectiveAtUtc === null)
    return (
      <span>
        {tr(
          "Información actualizada · sin actividad registrada todavía",
          "Information is up to date · no activity recorded yet",
        )}
      </span>
    );
  return (
    <span>
      {tr("Información actualizada", "Information updated")}{" "}
      {formatCostaRicaDateTime(effectiveAtUtc, language)}
      {freshness.isError
        ? tr(
            " · actualización automática no disponible",
            " · automatic updates unavailable",
          )
        : ""}
    </span>
  );
}

function OperationQueryState({ query }: { query: ManagementOperationQuery }) {
  const { language, tr } = useLanguage();

  if (query.isPending)
    return (
      <p role="status" className="query-message">
        {tr("Cargando líneas activas…", "Loading active lines…")}
      </p>
    );

  if (query.data === undefined)
    return (
      <div role="alert" className="query-message error">
        {requestErrorMessage(
          query.error,
          tr(
            "No se pudo consultar la operación. Inténtelo de nuevo con Actualizar datos.",
            "Operations could not be loaded. Try again with Refresh data.",
          ),
          language,
        )}
      </div>
    );

  const stale = query.isError;
  return (
    <>
      {stale && (
        <div role="alert" className="stale-notice">
          <strong>{tr("Datos desactualizados.", "Outdated data.")}</strong>{" "}
          {requestErrorMessage(
            query.error,
            tr(
              "Se conserva la última respuesta válida mientras se recupera el servicio.",
              "The latest valid response is preserved while the service recovers.",
            ),
            language,
          )}
        </div>
      )}
      {query.data.items.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true">◫</span>
          <h3>{tr("No hay líneas activas", "No active lines")}</h3>
          <p>
            {tr(
              "No existe ningún cargamento abierto en las líneas de producción.",
              "There are no open shipments on the production lines.",
            )}
          </p>
        </div>
      ) : (
        <>
          <SweepMilestoneAlert lines={query.data.items} />
          <div className="line-grid">
            {query.data.items.map((line) => (
              <OperationLineCard
                key={line.productionLineId}
                line={line}
                stale={stale}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function SweepMilestoneAlert({
  lines,
}: {
  lines: readonly ManagementOperationLine[];
}) {
  const { locale, tr } = useLanguage();
  const pending = lines.filter((line) => line.sweepPending);
  const nearing = lines
    .filter((line) => !line.sweepPending && sweepRatio(line) >= 0.8)
    .sort((left, right) => sweepRatio(right) - sweepRatio(left));
  const line = pending[0] ?? nearing[0];
  const severity = pending.length > 0 ? "critical" : "warning";
  const affectedLines = lines
    .filter((item) =>
      severity === "critical"
        ? item.sweepPending
        : !item.sweepPending && sweepRatio(item) >= 0.8,
    )
    .map((item) => item.productionLineId)
    .sort()
    .join(",");
  const alertKey =
    line === undefined ? null : [severity, affectedLines].join(":");
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    if (alertKey === null || severity === "critical") return;
    const timer = window.setTimeout(() => setDismissedKey(alertKey), 8_000);
    return () => window.clearTimeout(timer);
  }, [alertKey, severity]);

  if (line === undefined || alertKey === dismissedKey) return null;

  const goal = sweepGoal(line);
  const remaining = Math.max(0, goal - line.cajuelasSinceLastSweep);
  const additionalPending = Math.max(0, pending.length - 1);

  return (
    <aside
      className={["operation-sweep-alert", severity].join(" ")}
      role={severity === "critical" ? "alert" : "status"}
    >
      <span className="operation-sweep-alert-icon" aria-hidden="true">
        🧹
      </span>
      <div>
        <strong>
          {severity === "critical"
            ? tr("Barrida pendiente", "Sweep pending")
            : tr("Próxima a barrida", "Approaching sweep")}
        </strong>
        <p>
          {severity === "critical" ? (
            <>
              {line.productionLineName}{" "}
              {tr(
                "alcanzó la referencia de barrida.",
                "reached the sweep threshold.",
              )}
              {additionalPending > 0 && (
                <>
                  {" "}
                  {tr("Otras líneas pendientes:", "Other pending lines:")}{" "}
                  {additionalPending.toLocaleString(locale)}.
                </>
              )}
            </>
          ) : (
            <>
              {line.productionLineName}: {tr("faltan", "remaining")}{" "}
              {remaining.toLocaleString(locale)} {tr("cajuelas", "cajuelas")}.
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        aria-label={tr("Cerrar alerta", "Dismiss alert")}
        onClick={() => setDismissedKey(alertKey)}
      >
        ×
      </button>
    </aside>
  );
}

function sweepGoal(line: ManagementOperationLine): number {
  return Math.max(1, line.nextSweepAt - line.sweptCajuelas);
}

function sweepRatio(line: ManagementOperationLine): number {
  return line.cajuelasSinceLastSweep / sweepGoal(line);
}

function OperationLineCard({
  line,
  stale,
}: {
  line: ManagementOperationLine;
  stale: boolean;
}) {
  const { language, locale, tr } = useLanguage();
  const accent = lineAccent(line.productionLineOrder);
  const goal = sweepGoal(line);
  const ratio = sweepRatio(line);
  const sweepProgress = Math.min(100, Math.round(ratio * 100));
  const remainingCajuelas = Math.max(0, goal - line.cajuelasSinceLastSweep);
  const sweepTone =
    line.sweepPending || ratio >= 0.8
      ? "critical"
      : ratio >= 0.5
        ? "warning"
        : "normal";

  return (
    <article className={`line-card ${accent}${stale ? " stale" : ""}`}>
      <div>
        <h3>{line.productionLineName}</h3>
        <span className={`line-status ${stale ? "stale" : "current"}`}>
          {stale
            ? tr("DATO DESACTUALIZADO", "OUTDATED DATA")
            : tr("EN OPERACIÓN", "OPERATING")}
        </span>
      </div>
      <p className="line-station">
        {line.stationName} · {tr("Última actividad", "Latest activity")}{" "}
        <time dateTime={line.lastActivityAtUtc}>
          {formatCostaRicaDateTime(line.lastActivityAtUtc, language)}
        </time>
      </p>

      <div className="line-total">
        <strong>{line.cajuelaTotal.toLocaleString(locale)}</strong>
        <span>{tr("cajuelas", "cajuelas")}</span>
      </div>

      <dl className="line-details">
        <div>
          <dt>{tr("Proveedor", "Supplier")}</dt>
          <dd>{line.supplierName}</dd>
        </div>
        <div>
          <dt>{tr("Responsable", "Responsible worker")}</dt>
          <dd>
            {line.responsibleWorkerName ??
              tr("Sin responsable informado", "No responsible worker listed")}
          </dd>
        </div>
        <div>
          <dt>{tr("Barridas", "Sweeps")}</dt>
          <dd>{line.sweepCount.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt>{tr("Inicio del cargamento", "Shipment started")}</dt>
          <dd>
            <time dateTime={line.startedAtUtc}>
              {formatCostaRicaDateTime(line.startedAtUtc, language)}
            </time>
          </dd>
        </div>
      </dl>

      <div className={`sweep-reference ${sweepTone}`}>
        <div>
          <span>
            {line.sweepPending
              ? tr("Barrida requerida", "Sweep required")
              : tr("Avance a la próxima barrida", "Next sweep progress")}
          </span>
          <strong>
            {line.cajuelasSinceLastSweep.toLocaleString(locale)}{" "}
            {tr("de", "of")} {goal.toLocaleString(locale)}{" "}
            {tr("cajuelas", "cajuelas")}
          </strong>
        </div>
        <div
          className="sweep-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuenow={Math.min(line.cajuelasSinceLastSweep, goal)}
        >
          <i style={{ width: String(sweepProgress).concat("%") }} />
        </div>
        <small>
          {line.sweepPending ? (
            tr("El umbral ya fue alcanzado", "The threshold has been reached")
          ) : (
            <>
              {tr("Faltan", "Remaining")}{" "}
              {remainingCajuelas.toLocaleString(locale)}{" "}
              {tr("cajuelas", "cajuelas")}
            </>
          )}
        </small>
      </div>
    </article>
  );
}
