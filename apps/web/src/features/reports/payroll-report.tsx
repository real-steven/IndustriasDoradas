import { useMemo, useState } from "react";

import { requestErrorMessage } from "../../api/http";
import { useAuth } from "../../auth/auth-context";
import { useLanguage } from "../../i18n/language-context";
import {
  currentPayrollWeek,
  downloadPayrollReport,
  usePayrollReport,
  usePayrollWorkers,
} from "../attendance/payroll-data";
import { formatMinutes } from "../attendance/attendance-data";

export function PayrollReportFeature() {
  const auth = useAuth();
  const { language, locale, tr } = useLanguage();
  const initialRange = useMemo(() => currentPayrollWeek(), []);
  const [fromDate, setFromDate] = useState(initialRange.fromDate);
  const [toDate, setToDate] = useState(initialRange.toDate);
  const [workerId, setWorkerId] = useState<string | undefined>();
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const filters = { fromDate, toDate, workerId };
  const workers = usePayrollWorkers();
  const report = usePayrollReport(filters);

  const download = async (format: "xlsx" | "pdf") => {
    const organizationId = auth.profile?.organizationId;
    const token = auth.session?.access_token;
    if (organizationId === undefined || token === undefined) return;
    setExporting(format);
    setDownloadError(null);
    try {
      await downloadPayrollReport(organizationId, token, filters, format);
    } catch (error) {
      setDownloadError(
        requestErrorMessage(
          error,
          tr(
            "No se pudo generar la pre-nómina.",
            "The pre-payroll file could not be generated.",
          ),
          language,
        ),
      );
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="payroll-report-feature">
      <section className="portal-panel payroll-report-builder">
        <header>
          <div>
            <h2>{tr("Pre-nómina", "Pre-payroll")}</h2>
            <p>
              {tr(
                "Horas confirmadas, tarifa vigente y ajustes explicados por empleado.",
                "Confirmed hours, current rate, and explained adjustments by employee.",
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
                ? tr("GENERANDO…", "GENERATING…")
                : tr("EXPORTAR EXCEL", "EXPORT EXCEL")}
            </button>
            <button
              type="button"
              disabled={exporting !== null || report.data === undefined}
              aria-busy={exporting === "pdf" || undefined}
              onClick={() => void download("pdf")}
            >
              {exporting === "pdf"
                ? tr("GENERANDO…", "GENERATING…")
                : tr("EXPORTAR PDF", "EXPORT PDF")}
            </button>
          </div>
        </header>
        <div className="payroll-report-filters">
          <label>
            {tr("DESDE", "FROM")}
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label>
            {tr("HASTA", "TO")}
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <label>
            {tr("EMPLEADO", "EMPLOYEE")}
            <select
              value={workerId ?? ""}
              onChange={(event) => setWorkerId(event.target.value || undefined)}
            >
              <option value="">{tr("Todos", "All employees")}</option>
              {(workers.data ?? []).map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {downloadError !== null && (
        <div className="stale-notice" role="alert">
          {downloadError}
        </div>
      )}
      {report.isPending && (
        <p className="query-message" role="status">
          {tr("Calculando la pre-nómina…", "Calculating pre-payroll…")}
        </p>
      )}
      {report.data === undefined && report.isError && (
        <p className="query-message error" role="alert">
          {requestErrorMessage(report.error, undefined, language)}
        </p>
      )}
      {report.data !== undefined && (
        <>
          <section className="portal-panel payroll-report-preview">
            <header>
              <div>
                <h2>{tr("Resumen por empleado", "Summary by employee")}</h2>
                <p>
                  {tr(
                    "Abra un empleado para ver los ajustes que explican su monto.",
                    "Open an employee to review the adjustments behind the amount.",
                  )}
                </p>
              </div>
              <strong>
                {report.data.summary.estimatedGrossAmountCrc === null
                  ? tr("TOTAL INCOMPLETO", "INCOMPLETE TOTAL")
                  : formatCrc(
                      report.data.summary.estimatedGrossAmountCrc,
                      locale,
                    )}
              </strong>
            </header>
            <div className="payroll-report-list">
              {report.data.workers.map((item) => (
                <details key={item.worker.id} className="payroll-report-worker">
                  <summary>
                    <span>
                      <strong>{item.worker.name}</strong>
                      <small>
                        {item.worker.identityNumber === null
                          ? tr("Cédula pendiente", "Identity pending")
                          : item.worker.identityNumber}
                      </small>
                    </span>
                    <span>
                      <small>{tr("Horas", "Hours")}</small>
                      <strong>
                        {formatMinutes(item.confirmedMinutes, language)}
                      </strong>
                    </span>
                    <span>
                      <small>{tr("Ajustes", "Adjustments")}</small>
                      <strong>
                        {formatSignedCrc(item.adjustmentAmountCrc, locale)}
                      </strong>
                    </span>
                    <span>
                      <small>{tr("Total bruto", "Gross total")}</small>
                      <strong>
                        {item.estimatedGrossAmountCrc === null
                          ? tr("Falta tarifa", "Rate required")
                          : formatCrc(item.estimatedGrossAmountCrc, locale)}
                      </strong>
                    </span>
                  </summary>
                  <div className="payroll-report-adjustments">
                    {item.adjustments.length === 0 ? (
                      <p>{tr("Sin ajustes.", "No adjustments.")}</p>
                    ) : (
                      <ul>
                        {item.adjustments.map((adjustment) => (
                          <li key={adjustment.id}>
                            <span>{adjustment.note}</span>
                            <strong>
                              {formatSignedCrc(
                                adjustment.calculatedAmountCrc,
                                locale,
                              )}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>
          <section className="portal-panel payroll-report-note">
            <strong>{tr("ALCANCE", "SCOPE")}</strong>
            <p>
              {tr(
                "Este reporte es una pre-nómina bruta. No incluye CCSS, renta, embargos ni otras deducciones legales. Las horas extra y feriados aparecen únicamente cuando gerencia los registra como ajuste.",
                "This is a gross pre-payroll report. It excludes social security, income tax, garnishments, and other legal deductions. Overtime and holidays appear only when management records them as an adjustment.",
              )}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function formatCrc(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedCrc(value: number | null, locale: string): string {
  if (value === null) return "—";
  const formatted = formatCrc(Math.abs(value), locale);
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}
