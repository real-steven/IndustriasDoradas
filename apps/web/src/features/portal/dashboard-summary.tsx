import { NavLink } from "react-router-dom";

import { useAuth } from "../../auth/auth-context";
import { useLanguage } from "../../i18n/language-context";
import { useGoldSummary } from "../gold/gold-data";
import {
  OperationFreshness,
  OperationLinesPanel,
} from "../management/management-operation";
import {
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
  const { tr } = useLanguage();
  const gold = useGoldSummary(allShipmentFilters);
  const pendingGold = gold.data?.excludedShipments ?? 0;
  const refreshing =
    operation.isFetching || freshness.isFetching || gold.isFetching;
  const displayName =
    auth.profile?.displayName?.trim() || tr("Gerencia", "Management");

  return (
    <div className="portal-view portal-view-compact dashboard-summary">
      <section className="manager-hero dashboard-greeting">
        <div>
          <p className="eyebrow light">
            {tr("CONTROL DE PLANTA", "PLANT CONTROL")}
          </p>
          <h1>
            {tr("Buenos días", "Good morning")}, {displayName}.
          </h1>
        </div>
      </section>

      <OperationLinesPanel
        query={operation}
        status={<OperationFreshness query={operation} freshness={freshness} />}
        action={
          <button
            type="button"
            className="secondary"
            disabled={refreshing}
            onClick={() =>
              void Promise.all([
                operation.refetch(),
                freshness.refetch(),
                gold.refetch(),
              ])
            }
          >
            {refreshing
              ? tr("Actualizando…", "Refreshing…")
              : tr("Actualizar datos", "Refresh data")}
          </button>
        }
      />

      {(gold.data === undefined || pendingGold > 0) && (
        <section className="portal-panel dashboard-attention">
          <header>
            <h2>{tr("Pendientes", "Pending")}</h2>
          </header>
          <AttentionList
            pendingGold={pendingGold}
            goldReady={gold.data !== undefined}
          />
        </section>
      )}
    </div>
  );
}

function AttentionList({
  pendingGold,
  goldReady,
}: {
  pendingGold: number;
  goldReady: boolean;
}) {
  const { tr } = useLanguage();

  if (!goldReady)
    return (
      <p className="dashboard-loading" role="status">
        {tr("Consultando pendientes…", "Loading pending items…")}
      </p>
    );

  return (
    <div className="attention-list">
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
