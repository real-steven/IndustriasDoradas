import { useMemo, type PropsWithChildren } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Area,pas
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import { lineChartColor } from "../management/line-accent";
import {
  parseStatisticsFilters,
  statisticsDateRange,
  useManagementStatistics,
  type StatisticsFilters,
  type StatisticsMetrics,
  type StatisticsPeriod,
} from "./statistics-data";

export function StatisticsFeature() {
  const { language, locale, tr } = useLanguage();
  const [parameters, setParameters] = useSearchParams();
  const filters = parseStatisticsFilters(parameters);
  const statistics = useManagementStatistics(filters);
  const options = useManagementStatistics({
    ...filters,
    productionLineId: undefined,
    supplierId: undefined,
    comparePrevious: false,
  });
  const range = statisticsDateRange(filters);

  const update = (changes: Partial<StatisticsFilters>) => {
    const next = { ...filters, ...changes };
    const query = new URLSearchParams();
    query.set("period", next.period);
    if (next.period === "custom") {
      query.set("from", next.fromDate);
      query.set("to", next.toDate);
    }
    if (next.productionLineId !== undefined)
      query.set("line", next.productionLineId);
    if (next.supplierId !== undefined) query.set("supplier", next.supplierId);
    query.set("compare", String(next.comparePrevious));
    setParameters(query, { replace: true });
  };

  const trendData = useMemo(
    () =>
      (statistics.data?.timeline ?? []).map((point, index) => ({
        ...point,
        previousCajuelas:
          statistics.data?.previousTimeline[index]?.totalCajuelas,
      })),
    [statistics.data],
  );

  return (
    <div className="statistics-feature">
      <section className="portal-panel statistics-filters">
        <header>
          <div>
            <h2>{tr("Período y alcance", "Period and scope")}</h2>
            <p>
              {tr(
                "Todos los resultados corresponden a cargamentos finalizados.",
                "All results correspond to completed shipments.",
              )}
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={statistics.isFetching}
            onClick={() =>
              void Promise.all([statistics.refetch(), options.refetch()])
            }
          >
            {statistics.isFetching
              ? tr("Actualizando…", "Refreshing…")
              : tr("Actualizar datos", "Refresh data")}
          </button>
        </header>
        <div className="statistics-filter-grid">
          <label>
            {tr("PERÍODO", "PERIOD")}
            <select
              value={filters.period}
              onChange={(event) =>
                update({ period: event.target.value as StatisticsPeriod })
              }
            >
              <option value="current-month">
                {tr("Este mes", "This month")}
              </option>
              <option value="previous-month">
                {tr("Mes anterior", "Previous month")}
              </option>
              <option value="last-90-days">
                {tr("Últimos 90 días", "Last 90 days")}
              </option>
              <option value="custom">{tr("Personalizado", "Custom")}</option>
            </select>
          </label>
          {filters.period === "custom" && (
            <>
              <label>
                {tr("DESDE", "FROM")}
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(event) => update({ fromDate: event.target.value })}
                />
              </label>
              <label>
                {tr("HASTA", "TO")}
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(event) => update({ toDate: event.target.value })}
                />
              </label>
            </>
          )}
          <label>
            {tr("LÍNEA", "LINE")}
            <select
              value={filters.productionLineId ?? ""}
              onChange={(event) =>
                update({
                  productionLineId: event.target.value || undefined,
                })
              }
            >
              <option value="">{tr("Todas las líneas", "All lines")}</option>
              {(options.data?.productionLines ?? []).map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("PROVEEDOR", "SUPPLIER")}
            <select
              value={filters.supplierId ?? ""}
              onChange={(event) =>
                update({ supplierId: event.target.value || undefined })
              }
            >
              <option value="">
                {tr("Todos los proveedores", "All suppliers")}
              </option>
              {(options.data?.suppliers ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label className="statistics-compare">
            <input
              type="checkbox"
              checked={filters.comparePrevious}
              onChange={(event) =>
                update({ comparePrevious: event.target.checked })
              }
            />
            <span>
              {tr(
                "Comparar con el período anterior",
                "Compare with the previous period",
              )}
            </span>
          </label>
        </div>
        <p className="statistics-range">
          {tr("Mostrando", "Showing")} {formatDate(range.fromDate, language)} –{" "}
          {formatDate(range.toDate, language)}
        </p>
      </section>

      {statistics.isPending && (
        <div className="portal-panel query-message" role="status">
          {tr("Preparando estadísticas…", "Preparing statistics…")}
        </div>
      )}
      {statistics.data === undefined && statistics.isError && (
        <div className="portal-panel query-message error" role="alert">
          {requestErrorMessage(
            statistics.error,
            tr(
              "No fue posible consultar las estadísticas.",
              "Statistics could not be loaded.",
            ),
            language,
          )}
        </div>
      )}
      {statistics.data !== undefined && (
        <>
          {statistics.isError && (
            <div className="stale-notice" role="alert">
              {tr(
                "Se muestran los últimos datos disponibles mientras se recupera la conexión.",
                "The latest available data is shown while the connection recovers.",
              )}
            </div>
          )}
          <SummaryCards
            current={statistics.data.summary}
            previous={statistics.data.previousSummary}
          />
          {statistics.data.summary.completedShipments === 0 ? (
            <section className="portal-panel empty-state">
              <span aria-hidden="true">⌁</span>
              <h2>
                {tr("Sin datos para este período", "No data for this period")}
              </h2>
              <p>
                {tr(
                  "Cambie el período o retire algún filtro para consultar cargamentos finalizados.",
                  "Change the period or remove a filter to view completed shipments.",
                )}
              </p>
            </section>
          ) : (
            <>
              <section className="statistics-chart-grid">
                <ChartPanel
                  title={tr(
                    "Producción a través del tiempo",
                    "Production over time",
                  )}
                  description={tr(
                    "Cajuelas de cargamentos finalizados por período.",
                    "Cajuelas from completed shipments by period.",
                  )}
                >
                  <ResponsiveContainer width="100%" height={290}>
                    <AreaChart data={trendData} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="bucketStart"
                        tickFormatter={(value) =>
                          formatShortDate(chartLabel(value), language)
                        }
                      />
                      <YAxis width={52} />
                      <Tooltip
                        labelFormatter={(value) =>
                          formatDate(chartLabel(value), language)
                        }
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="totalCajuelas"
                        name={tr("Período actual", "Current period")}
                        stroke="#0d5f79"
                        fill="#d9eef4"
                        strokeWidth={3}
                      />
                      {filters.comparePrevious && (
                        <Area
                          type="monotone"
                          dataKey="previousCajuelas"
                          name={tr("Período anterior", "Previous period")}
                          stroke="#7a8790"
                          fill="transparent"
                          strokeDasharray="6 5"
                          strokeWidth={2}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartPanel>

                <ChartPanel
                  title={tr("Producción por línea", "Production by line")}
                  description={tr(
                    "Comparación de cajuelas con los colores usados en Operación.",
                    "Cajuelas comparison using the colors from Operations.",
                  )}
                >
                  <ResponsiveContainer width="100%" height={290}>
                    <BarChart
                      data={statistics.data.productionLines}
                      accessibilityLayer
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis width={52} />
                      <Tooltip />
                      <Bar
                        dataKey="totalCajuelas"
                        name={tr("Cajuelas", "Cajuelas")}
                        radius={[6, 6, 0, 0]}
                      >
                        {statistics.data.productionLines.map((line) => (
                          <Cell
                            key={line.id}
                            fill={lineChartColor(line.displayOrder ?? 1)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartPanel>
              </section>

              <section className="statistics-chart-grid suppliers">
                <ChartPanel
                  title={tr(
                    "Proveedores por rendimiento",
                    "Suppliers by yield",
                  )}
                  description={tr(
                    "Gramos por cajuela únicamente donde existe resultado de oro.",
                    "Grams per cajuela only where a gold result exists.",
                  )}
                >
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={statistics.data.suppliers.slice(0, 8)}
                      layout="vertical"
                      accessibilityLayer
                      margin={{ left: 24 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={115} />
                      <Tooltip />
                      <Bar
                        dataKey="gramsPerCajuela"
                        name={tr("g por cajuela", "g per cajuela")}
                        fill="#c78a08"
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartPanel>
                <CoveragePanel metrics={statistics.data.summary} />
              </section>

              <StatisticsTable suppliers={statistics.data.suppliers} />
            </>
          )}
          <p className="statistics-updated">
            {tr("Calculado el", "Calculated on")}{" "}
            {new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "America/Costa_Rica",
            }).format(new Date(statistics.data.generatedAtUtc))}
          </p>
        </>
      )}
    </div>
  );
}

function SummaryCards({
  current,
  previous,
}: {
  current: StatisticsMetrics;
  previous: StatisticsMetrics | null;
}) {
  const { locale, tr } = useLanguage();
  const cards = [
    {
      label: tr("Cargamentos finalizados", "Completed shipments"),
      value: current.completedShipments.toLocaleString(locale),
      delta: metricDelta(
        current.completedShipments,
        previous?.completedShipments,
      ),
    },
    {
      label: tr("Cajuelas producidas", "Cajuelas produced"),
      value: current.totalCajuelas.toLocaleString(locale),
      delta: metricDelta(current.totalCajuelas, previous?.totalCajuelas),
    },
    {
      label: tr("Oro registrado", "Recorded gold"),
      value: `${current.totalGoldGrams.toLocaleString(locale)} g`,
      delta: metricDelta(current.totalGoldGrams, previous?.totalGoldGrams),
    },
    {
      label: tr("Rendimiento", "Yield"),
      value:
        current.gramsPerCajuela === null
          ? "—"
          : `${current.gramsPerCajuela.toLocaleString(locale, { maximumFractionDigits: 4 })} g/cajuela`,
      delta: metricDelta(current.gramsPerCajuela, previous?.gramsPerCajuela),
    },
    {
      label: tr("Duración promedio", "Average duration"),
      value:
        current.averageShipmentHours === null
          ? "—"
          : `${current.averageShipmentHours.toLocaleString(locale)} h`,
      delta: metricDelta(
        current.averageShipmentHours,
        previous?.averageShipmentHours,
      ),
    },
  ];
  return (
    <section
      className="statistics-kpis"
      aria-label={tr("Indicadores", "Indicators")}
    >
      {cards.map((card) => (
        <article key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small className={card.delta?.tone ?? "neutral"}>
            {card.delta === null
              ? tr("Sin base comparable", "No comparable baseline")
              : `${card.delta.text} ${tr("vs. período anterior", "vs. previous period")}`}
          </small>
        </article>
      ))}
    </section>
  );
}

function ChartPanel({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description: string }>) {
  return (
    <section className="portal-panel statistics-chart">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function CoveragePanel({ metrics }: { metrics: StatisticsMetrics }) {
  const { locale, tr } = useLanguage();
  return (
    <section className="portal-panel statistics-coverage">
      <header>
        <div>
          <h2>{tr("Cobertura del dato de oro", "Gold data coverage")}</h2>
          <p>
            {tr(
              "El rendimiento excluye cargamentos sin resultado para evitar falsos ceros.",
              "Yield excludes shipments without a result to avoid false zeroes.",
            )}
          </p>
        </div>
      </header>
      <strong>{metrics.goldCoveragePercentage.toLocaleString(locale)}%</strong>
      <div
        className="statistics-coverage-bar"
        role="progressbar"
        aria-label={tr("Cobertura de oro", "Gold coverage")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={metrics.goldCoveragePercentage}
      >
        <span style={{ width: `${metrics.goldCoveragePercentage}%` }} />
      </div>
      <p>
        {metrics.goldShipments.toLocaleString(locale)} {tr("de", "of")}{" "}
        {metrics.completedShipments.toLocaleString(locale)}{" "}
        {tr("cargamentos con oro registrado", "shipments with recorded gold")}
      </p>
      <dl>
        <div>
          <dt>{tr("Cajuelas incluidas", "Included cajuelas")}</dt>
          <dd>{metrics.includedCajuelas.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt>{tr("Barridas", "Sweeps")}</dt>
          <dd>{metrics.sweepCount.toLocaleString(locale)}</dd>
        </div>
      </dl>
    </section>
  );
}

function StatisticsTable({
  suppliers,
}: {
  suppliers: Array<StatisticsMetrics & { id: string; name: string }>;
}) {
  const { locale, tr } = useLanguage();
  return (
    <section className="portal-panel statistics-table">
      <header>
        <div>
          <h2>{tr("Detalle por proveedor", "Supplier detail")}</h2>
          <p>
            {tr(
              "Valores exactos usados en la comparación.",
              "Exact values used in the comparison.",
            )}
          </p>
        </div>
      </header>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tr("Proveedor", "Supplier")}</th>
              <th>{tr("Cargamentos", "Shipments")}</th>
              <th>{tr("Cajuelas", "Cajuelas")}</th>
              <th>{tr("Oro", "Gold")}</th>
              <th>{tr("Rendimiento", "Yield")}</th>
              <th>{tr("Cobertura", "Coverage")}</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <th scope="row">{supplier.name}</th>
                <td>{supplier.completedShipments.toLocaleString(locale)}</td>
                <td>{supplier.totalCajuelas.toLocaleString(locale)}</td>
                <td>{supplier.totalGoldGrams.toLocaleString(locale)} g</td>
                <td>
                  {supplier.gramsPerCajuela === null
                    ? "—"
                    : `${supplier.gramsPerCajuela.toLocaleString(locale, { maximumFractionDigits: 4 })} g/cajuela`}
                </td>
                <td>
                  {supplier.goldCoveragePercentage.toLocaleString(locale)}%
                  {supplier.completedShipments < 3 && (
                    <small>{tr("Muestra pequeña", "Small sample")}</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function metricDelta(
  current: number | null,
  previous: number | null | undefined,
): { text: string; tone: "positive" | "negative" | "neutral" } | null {
  if (
    current === null ||
    previous === null ||
    previous === undefined ||
    previous === 0
  )
    return null;
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  return {
    text: `${delta > 0 ? "+" : ""}${delta.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`,
    tone: delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral",
  };
}

function formatDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(language === "es" ? "es-CR" : "en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function chartLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function formatShortDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(language === "es" ? "es-CR" : "en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
