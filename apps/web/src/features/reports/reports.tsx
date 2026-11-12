import { useEffect, useMemo, useState } from "react";
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
  type ProductionReport,
  type ProductionReportField,
  type ReportShipment,
} from "./reports-data";
import { PayrollReportFeature } from "./payroll-report";

const REPORT_FIELDS_STORAGE_KEY =
  "industrias-doradas:reports:production-fields:v1";
const RECOMMENDED_REPORT_FIELDS: ProductionReportField[] = [
  "date",
  "shipment",
  "supplier",
  "gold",
  "karat",
];
const ALL_REPORT_FIELDS: ProductionReportField[] = [
  "date",
  "shipment",
  "supplier",
  "line",
  "gold",
  "karat",
  "cajuelas",
  "palos",
  "responsible",
  "sweeps",
];

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
  const [fields, setFields] = useState<ProductionReportField[]>(
    loadSavedReportFields,
  );
  const [selectionSaved, setSelectionSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const report = useProductionReport(filters, language, fields);
  const options = useManagementStatistics({
    ...filters,
    productionLineId: undefined,
    supplierId: undefined,
    comparePrevious: false,
  });
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const range = statisticsDateRange(filters);
  const sortedShipments = useMemo(
    () => sortShipments(report.data?.shipments ?? []),
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
        fields,
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

  const toggleField = (field: ProductionReportField) => {
    setSelectionSaved(false);
    setFields((current) => {
      if (current.includes(field)) {
        return current.length === 1
          ? current
          : current.filter((item) => item !== field);
      }
      return ALL_REPORT_FIELDS.filter(
        (candidate) => current.includes(candidate) || candidate === field,
      );
    });
  };

  const saveSelection = () => {
    localStorage.setItem(REPORT_FIELDS_STORAGE_KEY, JSON.stringify(fields));
    setSelectionSaved(true);
  };

  const restoreRecommended = () => {
    setFields(RECOMMENDED_REPORT_FIELDS);
    setSelectionSaved(false);
  };

  const fieldOptions = reportFieldOptions(tr);

  return (
    <div className="production-reports-feature">
      <section className="portal-panel reports-builder">
        <header>
          <div>
            <h2>{tr("Crear reporte operativo", "Create operations report")}</h2>
            <p>
              {tr(
                "Elija el período y la información antes de revisar el archivo.",
                "Choose the period and information before reviewing the file.",
              )}
            </p>
          </div>
          <div className="reports-export-actions">
            <button
              type="button"
              disabled={report.data === undefined || report.isPending}
              onClick={() => setPreviewOpen(true)}
            >
              {tr("REVISAR VISTA PREVIA", "REVIEW PREVIEW")}
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
        <fieldset className="report-section-picker report-field-picker">
          <legend>{tr("INCLUIR EN EL ARCHIVO", "INCLUDE IN FILE")}</legend>
          {fieldOptions.map((option) => (
            <label key={option.field}>
              <input
                type="checkbox"
                checked={fields.includes(option.field)}
                onChange={() => toggleField(option.field)}
              />
              <span>
                <strong>
                  {option.label}
                  {RECOMMENDED_REPORT_FIELDS.includes(option.field) && (
                    <small className="report-recommended-label">
                      {tr("RECOMENDADO", "RECOMMENDED")}
                    </small>
                  )}
                </strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="report-selection-actions">
          <button type="button" className="secondary" onClick={saveSelection}>
            {tr("GUARDAR SELECCIÓN", "SAVE SELECTION")}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={restoreRecommended}
          >
            {tr("RESTABLECER RECOMENDADOS", "RESTORE RECOMMENDED")}
          </button>
          {selectionSaved && (
            <span role="status">
              {tr(
                "Selección guardada en este equipo.",
                "Selection saved on this device.",
              )}
            </span>
          )}
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
          ) : null}

          <p className="reports-generated">
            {tr("Reporte calculado el", "Report calculated on")}{" "}
            {new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: report.data.timezone,
            }).format(new Date(report.data.generatedAtUtc))}
          </p>
          {previewOpen && (
            <ProductionReportPreview
              report={report.data}
              fields={fields}
              shipments={sortedShipments}
              exporting={exporting}
              onClose={() => setPreviewOpen(false)}
              onDownload={download}
            />
          )}
        </>
      )}
    </div>
  );
}

function ProductionReportPreview({
  report,
  fields,
  shipments,
  exporting,
  onClose,
  onDownload,
}: {
  report: ProductionReport;
  fields: ProductionReportField[];
  shipments: ReportShipment[];
  exporting: "xlsx" | "pdf" | null;
  onClose: () => void;
  onDownload: (format: "xlsx" | "pdf") => Promise<void>;
}) {
  const { locale, tr } = useLanguage();
  const fieldOptions = reportFieldOptions(tr);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="payroll-modal-backdrop" onMouseDown={onClose}>
      <section
        className="report-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Vista previa del reporte", "Report preview")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>{tr("VISTA PREVIA", "PREVIEW")}</span>
            <h2>{tr("Reporte operativo", "Operations report")}</h2>
            <p>
              {report.period.fromUtc.slice(0, 10)} –{" "}
              {report.period.toUtc.slice(0, 10)}
            </p>
          </div>
          <button
            type="button"
            className="secondary payroll-modal-close"
            aria-label={tr("Cerrar", "Close")}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="report-preview-modal-content">
          <section>
            <div className="report-preview-heading">
              <div>
                <h3>{tr("Cargamentos incluidos", "Included shipments")}</h3>
                <p>
                  {tr(
                    "Una sola tabla, ordenada por proveedor y fecha.",
                    "One table, ordered by supplier and date.",
                  )}
                </p>
              </div>
              <strong>
                {tr("Oro total", "Total gold")}:{" "}
                {formatNumber(report.summary.totalGoldGrams, locale, 2)} g
              </strong>
            </div>
            <div className="reports-table-scroll report-preview-table">
              <table>
                <thead>
                  <tr>
                    {fields.map((field) => (
                      <th key={field}>
                        {fieldOptions.find((option) => option.field === field)
                          ?.label ?? field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr key={shipment.shipmentId}>
                      {fields.map((field, index) => {
                        const value = reportFieldValue(
                          shipment,
                          field,
                          locale,
                          tr,
                        );
                        return index === 0 ? (
                          <th key={field} scope="row">
                            {value}
                          </th>
                        ) : (
                          <td key={field}>{value}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer>
          <span>
            {tr(
              "El archivo incluirá únicamente los campos seleccionados.",
              "The file will include only the selected fields.",
            )}
          </span>
          <div className="reports-export-actions">
            <button
              type="button"
              className="secondary"
              disabled={exporting !== null}
              onClick={() => void onDownload("xlsx")}
            >
              {exporting === "xlsx"
                ? tr("GENERANDO…", "GENERATING…")
                : tr("GENERAR EXCEL", "GENERATE EXCEL")}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void onDownload("pdf")}
            >
              {exporting === "pdf"
                ? tr("GENERANDO…", "GENERATING…")
                : tr("GENERAR PDF", "GENERATE PDF")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function reportFieldOptions(
  tr: (spanish: string, english: string) => string,
): Array<{
  field: ProductionReportField;
  label: string;
  description: string;
}> {
  return [
    {
      field: "date",
      label: tr("Fecha de cierre", "Completion date"),
      description: tr(
        "Día en que terminó el cargamento.",
        "Day when the shipment was completed.",
      ),
    },
    {
      field: "shipment",
      label: tr("Cargamento", "Shipment"),
      description: tr(
        "Código que identifica el trabajo realizado.",
        "Code identifying the completed work.",
      ),
    },
    {
      field: "supplier",
      label: tr("Proveedor", "Supplier"),
      description: tr(
        "Persona o material propio que entregó el material.",
        "Person or own material that supplied the load.",
      ),
    },
    {
      field: "line",
      label: tr("Línea", "Line"),
      description: tr(
        "Línea de planta donde se procesó el cargamento.",
        "Plant line where the shipment was processed.",
      ),
    },
    {
      field: "gold",
      label: tr("Oro total", "Total gold"),
      description: tr(
        "Gramos de oro registrados para el cargamento.",
        "Gold grams recorded for the shipment.",
      ),
    },
    {
      field: "karat",
      label: tr("Quilataje", "Karat"),
      description: tr(
        "Quilataje anotado junto con el oro del cargamento.",
        "Karat recorded together with the shipment gold.",
      ),
    },
    {
      field: "cajuelas",
      label: tr("Cajuelas", "Cajuelas"),
      description: tr(
        "Cantidad total de cajuelas procesadas.",
        "Total cajuelas processed.",
      ),
    },
    {
      field: "palos",
      label: tr("Palos", "Palos"),
      description: tr(
        "Equivalencia del oro registrado: un palo corresponde a 0,10 g.",
        "Recorded gold equivalent: one palo equals 0.10 g.",
      ),
    },
    {
      field: "responsible",
      label: tr("Responsable", "Responsible worker"),
      description: tr(
        "Trabajador responsable del cargamento.",
        "Worker responsible for the shipment.",
      ),
    },
    {
      field: "sweeps",
      label: tr("Barridas", "Sweeps"),
      description: tr(
        "Número de barridas realizadas durante el cargamento.",
        "Number of sweeps completed during the shipment.",
      ),
    },
  ];
}

function loadSavedReportFields(): ProductionReportField[] {
  try {
    const stored = localStorage.getItem(REPORT_FIELDS_STORAGE_KEY);
    if (stored === null) return RECOMMENDED_REPORT_FIELDS;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return RECOMMENDED_REPORT_FIELDS;
    const valid = ALL_REPORT_FIELDS.filter((field) => parsed.includes(field));
    return valid.length === 0 ? RECOMMENDED_REPORT_FIELDS : valid;
  } catch {
    return RECOMMENDED_REPORT_FIELDS;
  }
}

function sortShipments(shipments: ReportShipment[]): ReportShipment[] {
  return [...shipments].sort((left, right) => {
    const supplier = left.supplierName.localeCompare(right.supplierName, "es");
    return supplier === 0
      ? left.completedAtUtc.localeCompare(right.completedAtUtc)
      : supplier;
  });
}

function reportFieldValue(
  shipment: ReportShipment,
  field: ProductionReportField,
  locale: string,
  tr: (spanish: string, english: string) => string,
): string {
  switch (field) {
    case "date":
      return formatDate(shipment.completedAtUtc, locale);
    case "shipment":
      return shipment.shipmentCode;
    case "supplier":
      return shipment.supplierName;
    case "line":
      return shipment.productionLineName;
    case "gold":
      return shipment.goldAmountGrams === null
        ? tr("Sin registrar", "Not recorded")
        : `${formatNumber(shipment.goldAmountGrams, locale, 2)} g`;
    case "karat":
      return shipment.goldKarat === null
        ? tr("Sin registrar", "Not recorded")
        : `${formatKarat(shipment.goldKarat, locale)} k`;
    case "cajuelas":
      return shipment.cajuelaTotal.toLocaleString(locale);
    case "palos":
      return shipment.goldAmountGrams === null
        ? tr("Sin registrar", "Not recorded")
        : formatNumber(shipment.goldAmountGrams * 10, locale, 2);
    case "responsible":
      return shipment.responsibleWorkerName ?? tr("Sin responsable", "None");
    case "sweeps":
      return shipment.sweepCount.toLocaleString(locale);
  }
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "America/Costa_Rica",
  }).format(new Date(value));
}

// Quilataje con hasta tres decimales, sin ceros de relleno (18,5 k, no 18,500 k).
function formatKarat(value: number, locale: string): string {
  return value.toLocaleString(locale, {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  });
}

function formatNumber(value: number, locale: string, digits: number): string {
  return value.toLocaleString(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}
