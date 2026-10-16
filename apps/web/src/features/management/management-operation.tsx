import type { ReactNode } from "react";

import type { ManagementOperationLine } from "../../api/generated/api-client";
import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import {
  effectiveManagementTime,
  formatCostaRicaDateTime,
  type ManagementFreshnessQuery,
  type ManagementOperationQuery,
} from "./management-operation-data";

const lineAccents = ["purple", "cyan", "pink", "orange"] as const;

export function OperationLinesPanel({
  query,
  action,
}: {
  query: ManagementOperationQuery;
  action?: ReactNode;
}) {
  const { tr } = useLanguage();

  return (
    <section className="portal-panel">
      <header>
        <div>
          <h2>{tr("Operación en vivo", "Live operations")}</h2>
          <p>
            {tr(
              "Líneas activas confirmadas por la proyección central de la planta",
              "Active lines confirmed by the plant's central projection",
            )}
          </p>
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
      <span>{tr("Consultando datos centrales…", "Loading central data…")}</span>
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
          : ` · ${tr("última actividad central", "latest central activity")} ${formatCostaRicaDateTime(effectiveAtUtc, language)}`}
      </span>
    );
  if (effectiveAtUtc === null)
    return (
      <span>
        {tr(
          "Fuente central confirmada · sin cambios registrados",
          "Central source confirmed · no recorded changes",
        )}
      </span>
    );
  return (
    <span>
      {tr("Datos centrales al", "Central data as of")}{" "}
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
              "La consulta central respondió correctamente, pero no existe una operación abierta en este momento.",
              "The central query responded successfully, but there are no open operations at this time.",
            )}
          </p>
        </div>
      ) : (
        <div className="line-grid">
          {query.data.items.map((line) => (
            <OperationLineCard
              key={line.productionLineId}
              line={line}
              stale={stale}
            />
          ))}
        </div>
      )}
    </>
  );
}

function OperationLineCard({
  line,
  stale,
}: {
  line: ManagementOperationLine;
  stale: boolean;
}) {
  const { language, locale, tr } = useLanguage();
  const accent =
    lineAccents[Math.abs(line.productionLineOrder - 1) % lineAccents.length] ??
    lineAccents[0];

  return (
    <article className={`line-card ${accent}${stale ? " stale" : ""}`}>
      <div>
        <h3>{line.productionLineName}</h3>
        <span className={`line-status ${stale ? "stale" : "current"}`}>
          {stale
            ? tr("DATO DESACTUALIZADO", "OUTDATED DATA")
            : tr("ACTIVA", "ACTIVE")}
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
          <dt>{tr("Cargamento", "Shipment")}</dt>
          <dd>
            {tr("Activo desde", "Active since")}{" "}
            <time dateTime={line.startedAtUtc}>
              {formatCostaRicaDateTime(line.startedAtUtc, language)}
            </time>
          </dd>
        </div>
      </dl>

      <div className={`sweep-reference${line.sweepPending ? " pending" : ""}`}>
        <span>
          {line.sweepPending
            ? tr("Barrida pendiente desde", "Sweep overdue since")
            : tr("Próxima barrida", "Next sweep")}
        </span>
        <strong>
          {line.nextSweepAt.toLocaleString(locale)} {tr("cajuelas", "cajuelas")}
        </strong>
        <small>
          {line.cajuelasSinceLastSweep.toLocaleString(locale)}{" "}
          {tr("desde la última barrida", "since the last sweep")}
        </small>
      </div>
    </article>
  );
}
