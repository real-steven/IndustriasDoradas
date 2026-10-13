import type { ReactNode } from "react";

import type { ManagementOperationLine } from "../../api/generated/api-client";
import {
  formatCostaRicaDateTime,
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
  return (
    <section className="portal-panel">
      <header>
        <div>
          <h2>Operación en vivo</h2>
          <p>
            Líneas activas confirmadas por la proyección central de la planta
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
}: {
  query: ManagementOperationQuery;
}) {
  return (
    <button
      type="button"
      className="secondary"
      disabled={query.isFetching}
      onClick={() => void query.refetch()}
    >
      {query.isFetching ? "Actualizando…" : "Actualizar datos"}
    </button>
  );
}

export function OperationFreshness({
  query,
}: {
  query: ManagementOperationQuery;
}) {
  if (query.isPending) return <span>Consultando datos centrales…</span>;
  if (query.data === undefined)
    return <span>No fue posible confirmar la operación</span>;
  if (query.isError)
    return (
      <span>
        Datos desactualizados · última consulta válida{" "}
        {formatCostaRicaDateTime(query.dataUpdatedAt)}
      </span>
    );
  return (
    <span>
      Consulta actualizada {formatCostaRicaDateTime(query.dataUpdatedAt)}
    </span>
  );
}

function OperationQueryState({ query }: { query: ManagementOperationQuery }) {
  if (query.isPending)
    return (
      <p role="status" className="query-message">
        Cargando líneas activas…
      </p>
    );

  if (query.data === undefined)
    return (
      <div role="alert" className="query-message error">
        No se pudo consultar la operación. Revise la conexión e inténtelo de
        nuevo con Actualizar datos.
      </div>
    );

  const stale = query.isError;
  return (
    <>
      {stale && (
        <div role="alert" className="stale-notice">
          <strong>Datos desactualizados.</strong> Se conserva la última
          respuesta válida mientras se recupera la conexión.
        </div>
      )}
      {query.data.items.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden="true">◫</span>
          <h3>No hay líneas activas</h3>
          <p>
            La consulta central respondió correctamente, pero no existe una
            operación abierta en este momento.
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
  const accent =
    lineAccents[Math.abs(line.productionLineOrder - 1) % lineAccents.length] ??
    lineAccents[0];

  return (
    <article className={`line-card ${accent}${stale ? " stale" : ""}`}>
      <div>
        <h3>{line.productionLineName}</h3>
        <span className={`line-status ${stale ? "stale" : "current"}`}>
          {stale ? "DATO DESACTUALIZADO" : "ACTIVA"}
        </span>
      </div>
      <p className="line-station">
        {line.stationName} · Última actividad{" "}
        <time dateTime={line.lastActivityAtUtc}>
          {formatCostaRicaDateTime(line.lastActivityAtUtc)}
        </time>
      </p>

      <div className="line-total">
        <strong>{line.cajuelaTotal.toLocaleString("es-CR")}</strong>
        <span>cajuelas</span>
      </div>

      <dl className="line-details">
        <div>
          <dt>Proveedor</dt>
          <dd>{line.supplierName}</dd>
        </div>
        <div>
          <dt>Responsable</dt>
          <dd>{line.responsibleWorkerName ?? "Sin responsable informado"}</dd>
        </div>
        <div>
          <dt>Barridas</dt>
          <dd>{line.sweepCount.toLocaleString("es-CR")}</dd>
        </div>
        <div>
          <dt>Cargamento</dt>
          <dd>
            Activo desde{" "}
            <time dateTime={line.startedAtUtc}>
              {formatCostaRicaDateTime(line.startedAtUtc)}
            </time>
          </dd>
        </div>
      </dl>

      <div className={`sweep-reference${line.sweepPending ? " pending" : ""}`}>
        <span>
          {line.sweepPending ? "Barrida pendiente desde" : "Próxima barrida"}
        </span>
        <strong>{line.nextSweepAt.toLocaleString("es-CR")} cajuelas</strong>
        <small>
          {line.cajuelasSinceLastSweep.toLocaleString("es-CR")} desde la última
          barrida
        </small>
      </div>
    </article>
  );
}
