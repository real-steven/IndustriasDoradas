import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { requestErrorMessage } from "../../api/http";
import { useAuth } from "../../auth/auth-context";
import { useLanguage } from "../../i18n/language-context";
import {
  parseStatisticsFilters,
  statisticsDateRange,
  useManagementStatistics,
  type StatisticsFilters,
  type StatisticsPeriod,
} from "../statistics/statistics-data";
import {
  downloadProductionReport,
  useProductionReport,
  type ReportShipment,
} from "./reports-data";
import { ReportSettlements } from "./report-settlements";
import { PayrollReportFeature } from "./payroll-report";

export function ReportsFeature() {
  const { tr } = useLanguage();
  const [reportType, setReportType] = useState<"production" | "payroll">(
    "production",
  );
  return (
    <div className="reports-feature">
      <nav
        className="report-type-grid"
        aria-label={tr("Tipo de reporte", "Report type")}
      >
        <button
          type="button"
          className={reportType === "production" ? "active" : ""}
          aria-pressed={reportType === "production"}
          onClick={() => setReportType("production")}
        >
          <span>{tr("OPERACIÓN", "OPERATIONS")}</span>
          <strong>{tr("Producción y oro", "Production and gold")}</strong>
          <small>
            {tr(
              "Cargamentos, proveedores y liquidaciones",
              "Shipments, suppliers, and settlements",
            )}
          </small>
        </button>
        <button
          type="button"
          className={reportType === "payroll" ? "active" : ""}
          aria-pressed={reportType === "payroll"}
          onClick={() => setReportType("payroll")}
        >
          <span>{tr("PERSONAL", "PEOPLE")}</span>
          <strong>{tr("Pre-nómina", "Pre-payroll")}</strong>
          <small>
            {tr(
              "Horas, tarifas, notas y total bruto",
              "Hours, rates, notes, and gross total",
            )}
          </small>
        </button>
      </nav>
      {reportType === "production" ? (
        <ProductionReportsFeature />
      ) : (
        <PayrollReportFeature />
      )}
    </div>
  );
}

function ProductionReportsFeature() {
  const auth = useAuth();
  const { language, locale, tr } = useLanguage();
  const [parameters, setParameters] = useSearchParams();
  const filters = parseStatisticsFilters(parameters);
  const report = useProductionReport(filters, language);
  const options = useManagementStatistics({
    ...filters,
    productionLineId: undefined,
    supplierId: undefined,
    comparePrevious: false,
  });
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const range = statisticsDateRange(filters);
  const groupedShipments = useMemo(
    () => groupShipments(report.data?.shipments ?? []),
    [report.data?.shipments],
  );

  const update = (changes: Partial<StatisticsFilters>) => {
    const next = { ...filters, ...changes };
    const query = new URLSearchParams({ period: next.period });
    if (next.period === "custom") {
      query.set("from", next.fromDate);
      query.set("to", next.toDate);
    }
    if (next.productionLineId !== undefined)
      query.set("line", next.productionLineId);
    if (next.supplierId !== undefined) query.set("supplier", next.supplierId);
    query.set("compare", "false");
    setParameters(query, { replace: true });
  };

  const download = async (format: "xlsx" | "pdf") => {
    const organizationId = auth.profile?.organizationId;
    const token = auth.session?.access_token;
    if (organizationId === undefined || token === undefined) return;
    setExporting(format);
    setDownloadError(null);
    try {
      await downloadProductionReport(
        organizationId,
        token,
        filters,
        language,
        format,
      );
    } catch (error) {
      setDownloadError(
        requestErrorMessage(
          error,
          tr(
            "No se pudo generar el archivo. Intente nuevamente.",
            "The file could not be generated. Please try again.",
          ),
          language,
        ),
      );
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="production-reports-feature">
      <section className="portal-panel reports-builder">
        <header>
          <div>
            <h2>{tr("Producción y oro", "Production and gold")}</h2>
            <p>
              {tr(
                "Prepare el mismo corte gerencial en pantalla, Excel o PDF.",
                "Prepare the same management cut on screen, Excel, or PDF.",
              )}
            </p>
          </div>
          <div className="reports-export-actions">
            <button
              type="button"
              className="secondary"
              disabled={exporting !== null || report.data === undefined}
              aria-busy={exporting === "xlsx" || undefined}
              onClick={() => void download("xlsx")}
            >
              {exporting === "xlsx"
                ? tr("GENERANDO EXCEL…", "GENERATING EXCEL…")
                : tr("EXPORTAR EXCEL", "EXPORT EXCEL")}
            </button>
            <button
              type="button"
              disabled={exporting !== null || report.data === undefined}
              aria-busy={exporting === "pdf" || undefined}
              onClick={() => void download("pdf")}
            >
              {exporting === "pdf"
                ? tr("GENERANDO PDF…", "GENERATING PDF…")
                : tr("EXPORTAR PDF", "EXPORT PDF")}
            </button>
          </div>
        </header>

        <div className="reports-filter-grid">
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
                update({ productionLineId: event.target.value || undefined })
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
        </div>
        <p className="reports-period">
          {tr("Período incluido", "Included period")}: {range.fromDate} –{" "}
          {range.toDate}
        </p>
      </section>

      {downloadError !== null && (
        <div className="stale-notice" role="alert">
          {downloadError}
        </div>
      )}
      {report.isPending && (
        <div className="portal-panel query-message" role="status">
          {tr("Preparando el reporte…", "Preparing the report…")}
        </div>
      )}
      {report.data === undefined && report.isError && (
        <div className="portal-panel query-message error" role="alert">
          {requestErrorMessage(
            report.error,
            tr(
              "No fue posible consultar los datos del reporte.",
              "Report data could not be loaded.",
            ),
            language,
          )}
        </div>
      )}

      {report.data !== undefined && (
        <>
          {report.isError && (
            <div className="stale-notice" role="alert">
              {tr(
                "Se muestran los últimos datos disponibles mientras se recupera la conexión.",
                "The latest available data is shown while the connection recovers.",
              )}
            </div>
          )}
          {report.data.summary.completedShipments === 0 ? (
            <section className="portal-panel empty-state">
              <span aria-hidden="true">⇩</span>
              <h2>{tr("Sin datos para exportar", "No data to export")}</h2>
              <p>
                {tr(
                  "Cambie el período o retire algún filtro para consultar cargamentos finalizados.",
                  "Change the period or remove a filter to view completed shipments.",
                )}
              </p>
            </section>
          ) : (
            <section className="portal-panel reports-preview">
              <header>
                <div>
                  <h2>
                    {tr("Vista previa por proveedor", "Supplier preview")}
                  </h2>
                  <p>
                    {tr(
                      "Abra cada proveedor para consultar los cargamentos que formarán parte del archivo.",
                      "Open each supplier to review the shipments included in the file.",
                    )}
                  </p>
                </div>
              </header>
              <div className="reports-supplier-groups">
                {groupedShipments.map(([supplier, shipments]) => (
                  <SupplierGroup
                    key={supplier}
                    supplier={supplier}
                    shipments={shipments}
                  />
                ))}
              </div>
            </section>
          )}

          <ReportSettlements
            fromDate={range.fromDate}
            toDate={range.toDate}
            suppliers={report.data.suppliers}
            shipments={report.data.shipments}
          />

          <section className="portal-panel reports-scope financial">
            <div>
              <span>
                {tr("CÁLCULO TRANSPARENTE", "TRANSPARENT CALCULATION")}
              </span>
              <h2>
                {tr(
                  "De los gramos al total recibido",
                  "From grams to total received",
                )}
              </h2>
            </div>
            <p>
              {tr(
                "Las liquidaciones se editan únicamente como borrador. Al aprobarlas quedan protegidas, conservan el responsable y pasan a formar parte del Excel y PDF gerencial; los borradores no alteran los totales oficiales.",
                "Settlements are editable only as drafts. Once approved they are locked, retain their responsible person, and become part of the management Excel and PDF; drafts do not alter official totals.",
              )}
            </p>
          </section>

          <p className="reports-generated">
            {tr("Reporte calculado el", "Report calculated on")}{" "}
            {new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: report.data.timezone,
            }).format(new Date(report.data.generatedAtUtc))}
          </p>
        </>
      )}
    </div>
  );
}

function SupplierGroup({
  supplier,
  shipments,
}: {
  supplier: string;
  shipments: ReportShipment[];
}) {
  const { locale, tr } = useLanguage();
  const totals = shipmentTotals(shipments);
  return (
    <details className="reports-supplier-group" open={shipments.length <= 4}>
      <summary>
        <span>
          <strong>{supplier}</strong>
          <small>
            {shipments.length.toLocaleString(locale)}{" "}
            {tr("cargamentos", "shipments")}
          </small>
        </span>
        <span>
          <strong>{formatNumber(totals.goldGrams, locale, 2)} g</strong>
          <small>
            {totals.palosPerCajuela === null
              ? tr("Rendimiento pendiente", "Yield pending")
              : `${formatNumber(totals.palosPerCajuela, locale, 4)} ${tr("palos/cajuela", "palos/cajuela")}`}
          </small>
        </span>
      </summary>
      <div className="reports-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tr("Cargamento", "Shipment")}</th>
              <th>{tr("Cierre", "Completed")}</th>
              <th>{tr("Línea", "Line")}</th>
              <th>{tr("Cajuelas", "Cajuelas")}</th>
              <th>{tr("Barridas", "Sweeps")}</th>
              <th>{tr("Oro", "Gold")}</th>
              <th>{tr("Palos/cajuela", "Palos/cajuela")}</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((shipment) => (
              <tr key={shipment.shipmentId}>
                <th scope="row">{shipment.shipmentCode}</th>
                <td>{formatDate(shipment.completedAtUtc, locale)}</td>
                <td>{shipment.productionLineName}</td>
                <td>{shipment.cajuelaTotal.toLocaleString(locale)}</td>
                <td>{shipment.sweepCount.toLocaleString(locale)}</td>
                <td>
                  {shipment.goldAmountGrams === null
                    ? tr("Pendiente", "Pending")
                    : `${formatNumber(shipment.goldAmountGrams, locale, 2)} g`}
                </td>
                <td>{formatNullable(shipment.palosPerCajuela, locale, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function groupShipments(
  shipments: ReportShipment[],
): Array<[string, ReportShipment[]]> {
  const groups = new Map<string, ReportShipment[]>();
  for (const shipment of shipments) {
    groups.set(shipment.supplierName, [
      ...(groups.get(shipment.supplierName) ?? []),
      shipment,
    ]);
  }
  return [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "es"),
  );
}

function shipmentTotals(shipments: ReportShipment[]) {
  const totals = shipments.reduce(
    (result, shipment) => ({
      goldCajuelas:
        result.goldCajuelas +
        (shipment.goldAmountGrams === null ? 0 : shipment.cajuelaTotal),
      goldGrams: result.goldGrams + (shipment.goldAmountGrams ?? 0),
    }),
    { goldCajuelas: 0, goldGrams: 0 },
  );
  return {
    ...totals,
    palosPerCajuela:
      totals.goldCajuelas === 0
        ? null
        : (totals.goldGrams * 10) / totals.goldCajuelas,
  };
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "America/Costa_Rica",
  }).format(new Date(value));
}

function formatNumber(value: number, locale: string, digits: number): string {
  return value.toLocaleString(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatNullable(
  value: number | null,
  locale: string,
  digits: number,
): string {
  return value === null ? "—" : formatNumber(value, locale, digits);
}
