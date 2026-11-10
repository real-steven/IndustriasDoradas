import { useMemo, type PropsWithChildren } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Area,
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
  previousStatisticsDateRange,
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
  const previousRange = previousStatisticsDateRange(filters);
  const currentRangeLabel = formatDateRange(range, language);
  const previousRangeLabel = formatDateRange(previousRange, language);

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
      <section
        className="portal-panel statistics-filters"
        aria-label={tr("Filtros de estadísticas", "Statistics filters")}
      >
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
          <button
            type="button"
            className="secondary statistics-refresh"
            disabled={statistics.isFetching}
            aria-label={tr("Actualizar estadísticas", "Refresh statistics")}
            onClick={() =>
              void Promise.all([statistics.refetch(), options.refetch()])
            }
          >
            {statistics.isFetching
              ? tr("Actualizando…", "Refreshing…")
              : tr("Actualizar", "Refresh")}
          </button>
        </div>
        <div
          className="statistics-ranges"
          aria-label={tr("Períodos consultados", "Queried periods")}
        >
          <div>
            <span>{tr("Período analizado", "Analyzed period")}</span>
            <strong>{currentRangeLabel}</strong>
          </div>
          {filters.comparePrevious && (
            <div>
              <span>{tr("Comparado con", "Compared with")}</span>
              <strong>{previousRangeLabel}</strong>
            </div>
          )}
        </div>
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
                  <ResponsiveContainer width="100%" height={250}>
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
                  <ResponsiveContainer width="100%" height={250}>
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

              <section className="statistics-insight-grid">
                <SupplierRanking suppliers={statistics.data.suppliers} />
                <CoveragePanel metrics={statistics.data.summary} />
              </section>
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
      label: tr("Oro del período", "Period gold"),
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
          <h2>{tr("Cobertura del período", "Period coverage")}</h2>
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

function SupplierRanking({
  suppliers,
}: {
  suppliers: Array<StatisticsMetrics & { id: string; name: string }>;
}) {
  const { locale, tr } = useLanguage();
  const orderedSuppliers = [...suppliers].sort(
    (left, right) =>
      (right.gramsPerCajuela ?? -1) - (left.gramsPerCajuela ?? -1),
  );
  const maximumYield = Math.max(
    ...orderedSuppliers.map((supplier) => supplier.gramsPerCajuela ?? 0),
    0,
  );
  return (
    <section className="portal-panel statistics-suppliers">
      <header>
        <div>
          <h2>{tr("Rendimiento por proveedor", "Supplier yield")}</h2>
          <p>
            {tr(
              "Lectura compacta del rendimiento y la cobertura dentro del período.",
              "Compact view of yield and coverage within the period.",
            )}
          </p>
        </div>
        <span className="statistics-supplier-count">
          {suppliers.length.toLocaleString(locale)}{" "}
          {tr("proveedores", "suppliers")}
        </span>
      </header>
      <ol className="statistics-supplier-ranking">
        {orderedSuppliers.map((supplier, index) => (
          <li key={supplier.id}>
            <span className="statistics-supplier-rank" aria-hidden="true">
              {index + 1}
            </span>
            <div className="statistics-supplier-copy">
              <div>
                <h3>{supplier.name}</h3>
                {supplier.completedShipments < 3 && (
                  <small>{tr("Muestra pequeña", "Small sample")}</small>
                )}
              </div>
              <div
                className="statistics-supplier-yield-bar"
                role="img"
                aria-label={`${supplier.name}: ${
                  supplier.gramsPerCajuela === null
                    ? tr("sin rendimiento", "no yield")
                    : `${supplier.gramsPerCajuela.toLocaleString(locale, { maximumFractionDigits: 4 })} g/cajuela`
                }`}
              >
                <span
                  style={{
                    width: `${
                      maximumYield === 0
                        ? 0
                        : ((supplier.gramsPerCajuela ?? 0) / maximumYield) * 100
                    }%`,
                  }}
                />
              </div>
              <p>
                {supplier.completedShipments.toLocaleString(locale)}{" "}
                {tr("cargamentos", "shipments")} ·{" "}
                {supplier.totalCajuelas.toLocaleString(locale)}{" "}
                {tr("cajuelas", "cajuelas")} ·{" "}
                {supplier.totalGoldGrams.toLocaleString(locale)} g{" "}
                {tr("de oro", "gold")}
              </p>
            </div>
            <div className="statistics-supplier-result">
              <strong>
                {supplier.gramsPerCajuela === null
                  ? "—"
                  : supplier.gramsPerCajuela.toLocaleString(locale, {
                      maximumFractionDigits: 4,
                    })}
              </strong>
              <span>
                {supplier.gramsPerCajuela === null
                  ? tr("Sin rendimiento", "No yield")
                  : "g/cajuela"}
              </span>
              <small>
                {supplier.goldCoveragePercentage.toLocaleString(locale)}%{" "}
                {tr("con oro", "with gold")}
              </small>
            </div>
          </li>
        ))}
      </ol>
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

function formatDateRange(
  range: { fromDate: string; toDate: string },
  language: string,
): string {
  return `${formatDate(range.fromDate, language)} – ${formatDate(range.toDate, language)}`;
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
