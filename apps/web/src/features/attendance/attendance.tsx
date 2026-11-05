import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import { formatMinutes } from "./attendance-data";
import {
  currentPayrollWeek,
  useCreatePayrollAdjustment,
  useCreatePayrollRate,
  usePayrollReport,
  usePayrollWorkers,
  useUpdatePayrollIdentity,
  type PayrollAdjustment,
  type PayrollAdjustmentType,
  type PayrollWorkerProfile,
} from "./payroll-data";
import { workerDisplayName } from "../workers/worker-display";

const ADJUSTMENT_OPTIONS: Array<{
  value: PayrollAdjustmentType;
  es: string;
  en: string;
  mode: "hours" | "money";
}> = [
  {
    value: "OVERTIME_HOURS",
    es: "Horas extra (recargo)",
    en: "Overtime (premium)",
    mode: "hours",
  },
  {
    value: "PAID_LEAVE_HOURS",
    es: "Permiso pagado",
    en: "Paid leave",
    mode: "hours",
  },
  {
    value: "HOLIDAY_HOURS",
    es: "Feriado trabajado (recargo)",
    en: "Holiday worked (premium)",
    mode: "hours",
  },
  {
    value: "REST_DAY_HOURS",
    es: "Día libre trabajado (recargo)",
    en: "Rest day worked (premium)",
    mode: "hours",
  },
  {
    value: "OTHER_EARNING",
    es: "Otro ingreso",
    en: "Other earning",
    mode: "money",
  },
  {
    value: "OTHER_DEDUCTION",
    es: "Otro rebajo",
    en: "Other deduction",
    mode: "money",
  },
];

export function AttendanceFeature() {
  const { language, locale, tr } = useLanguage();
  const [parameters, setParameters] = useSearchParams();
  const [search, setSearch] = useState("");
  const workers = usePayrollWorkers(search);
  const selectedWorkerId = parameters.get("worker") ?? undefined;
  const selectedWorker = workers.data?.find(
    (worker) => worker.id === selectedWorkerId,
  );

  if (selectedWorkerId !== undefined) {
    return (
      <WorkerPayrollDetail
        workerId={selectedWorkerId}
        initialWorker={selectedWorker}
        onBack={() => {
          const next = new URLSearchParams(parameters);
          next.delete("worker");
          setParameters(next, { replace: true });
        }}
      />
    );
  }

  return (
    <div className="attendance-feature payroll-directory">
      <section className="portal-panel payroll-directory-panel">
        <header>
          <div>
            <h2>{tr("Directorio de trabajadores", "Worker directory")}</h2>
            <p>
              {tr(
                "Busque por nombre o número de cédula y abra únicamente el empleado que necesita revisar.",
                "Search by name or identity number and open only the worker you need to review.",
              )}
            </p>
          </div>
          <span className="read-only-badge">
            {tr("CÁLCULO BRUTO", "GROSS ESTIMATE")}
          </span>
        </header>
        <label className="payroll-search">
          <span>{tr("BUSCAR EMPLEADO", "SEARCH WORKER")}</span>
          <input
            type="search"
            value={search}
            placeholder={tr("Nombre o cédula", "Name or identity number")}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      {workers.isPending && (
        <p className="query-message" role="status">
          {tr("Cargando trabajadores…", "Loading workers…")}
        </p>
      )}
      {workers.data === undefined && workers.isError && (
        <p className="query-message error" role="alert">
          {requestErrorMessage(workers.error, undefined, language)}
        </p>
      )}
      {workers.data !== undefined && (
        <section className="portal-panel payroll-worker-list-panel">
          <header>
            <div>
              <h2>{tr("Empleados", "Employees")}</h2>
              <p>
                {workers.data.length.toLocaleString(locale)}{" "}
                {tr("resultados", "results")}
              </p>
            </div>
          </header>
          <div className="payroll-worker-list">
            {workers.data.map((worker) => (
              <WorkerDirectoryRow
                key={worker.id}
                worker={worker}
                onOpen={() => {
                  const next = new URLSearchParams(parameters);
                  next.set("worker", worker.id);
                  setParameters(next, { replace: true });
                }}
              />
            ))}
            {workers.data.length === 0 && (
              <p className="attendance-empty">
                {tr(
                  "No se encontraron trabajadores con ese nombre o cédula.",
                  "No workers matched that name or identity number.",
                )}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function WorkerDirectoryRow({
  worker,
  onOpen,
}: {
  worker: PayrollWorkerProfile;
  onOpen: () => void;
}) {
  const { locale, tr } = useLanguage();
  return (
    <article className="payroll-worker-row">
      <div>
        <strong>{workerDisplayName(worker.name)}</strong>
        <span>
          {worker.identityNumber === null
            ? tr("Cédula pendiente", "Identity number pending")
            : `${tr("Cédula", "Identity")}: ${worker.identityNumber}`}
        </span>
      </div>
      <div className="payroll-worker-rate">
        <span>{tr("Tarifa vigente", "Current rate")}</span>
        <strong>
          {worker.currentHourlyRateCrc === null
            ? tr("Pendiente", "Pending")
            : `${formatCrc(worker.currentHourlyRateCrc, locale)} / h`}
        </strong>
      </div>
      <button type="button" className="secondary" onClick={onOpen}>
        {tr("VER EMPLEADO", "VIEW WORKER")}
      </button>
    </article>
  );
}

function WorkerPayrollDetail({
  workerId,
  initialWorker,
  onBack,
}: {
  workerId: string;
  initialWorker: PayrollWorkerProfile | undefined;
  onBack: () => void;
}) {
  const { language, locale, tr } = useLanguage();
  const initialRange = useMemo(() => currentPayrollWeek(), []);
  const [fromDate, setFromDate] = useState(initialRange.fromDate);
  const [toDate, setToDate] = useState(initialRange.toDate);
  const report = usePayrollReport({ fromDate, toDate, workerId });
  const result = report.data?.workers[0];
  const worker = result?.worker ?? initialWorker;

  return (
    <div className="attendance-feature payroll-detail">
      <button type="button" className="secondary payroll-back" onClick={onBack}>
        ← {tr("VOLVER A EMPLEADOS", "BACK TO EMPLOYEES")}
      </button>
      <section className="portal-panel payroll-detail-header">
        <div>
          <span>{tr("EXPEDIENTE INDIVIDUAL", "INDIVIDUAL RECORD")}</span>
          <h2>
            {worker === undefined
              ? tr("Trabajador", "Worker")
              : workerDisplayName(worker.name)}
          </h2>
          <p>
            {worker?.identityNumber === null ||
            worker?.identityNumber === undefined
              ? tr("Cédula pendiente de registrar", "Identity number pending")
              : `${tr("Cédula", "Identity")}: ${worker.identityNumber}`}
          </p>
        </div>
        <div className="payroll-date-range">
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
        </div>
      </section>
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
      {result !== undefined && (
        <>
          {(result.openShiftCount > 0 || result.incidentCount > 0) && (
            <div className="stale-notice" role="status">
              {tr(
                `${result.openShiftCount} jornadas abiertas y ${result.incidentCount} incidencias no se incluyen automáticamente en el pago.`,
                `${result.openShiftCount} open shifts and ${result.incidentCount} incidents are not automatically included in pay.`,
              )}
            </div>
          )}
          {result.missingRateMinutes > 0 && (
            <div className="stale-notice" role="status">
              {tr(
                `${formatMinutes(result.missingRateMinutes, language)} ocurrieron antes de la vigencia de la tarifa actual. Registre una tarifa con una fecha de vigencia anterior o igual a esas jornadas.`,
                `${formatMinutes(result.missingRateMinutes, language)} occurred before the current rate became effective. Record a rate effective on or before those shifts.`,
              )}
            </div>
          )}
          <section
            className="payroll-summary"
            aria-label={tr("Resumen", "Summary")}
          >
            <article>
              <span>{tr("HORAS CONFIRMADAS", "CONFIRMED HOURS")}</span>
              <strong>
                {formatMinutes(result.confirmedMinutes, language)}
              </strong>
              <small>
                {result.completedShiftCount} {tr("jornadas", "shifts")}
              </small>
            </article>
            <article>
              <span>{tr("TARIFA ACTUAL", "CURRENT RATE")}</span>
              <strong>
                {result.worker.currentHourlyRateCrc === null
                  ? tr("Pendiente", "Pending")
                  : `${formatCrc(result.worker.currentHourlyRateCrc, locale)} / h`}
              </strong>
              <small>{tr("Historial conservado", "History preserved")}</small>
            </article>
            <article className="total">
              <span>{tr("TOTAL BRUTO ESTIMADO", "ESTIMATED GROSS TOTAL")}</span>
              <strong>
                {result.estimatedGrossAmountCrc === null
                  ? tr("Falta configurar tarifa", "Rate setup required")
                  : formatCrc(result.estimatedGrossAmountCrc, locale)}
              </strong>
              <small>
                {result.missingRateMinutes > 0
                  ? tr(
                      `${formatMinutes(result.missingRateMinutes, language)} sin tarifa aplicable`,
                      `${formatMinutes(result.missingRateMinutes, language)} without an applicable rate`,
                    )
                  : tr("Sin deducciones legales", "Before legal deductions")}
              </small>
            </article>
          </section>
          <section className="portal-panel payroll-adjustment-summary">
            <header>
              <div>
                <h2>{tr("Ajustes incluidos", "Included adjustments")}</h2>
                <p>
                  {tr(
                    "Explicaciones legibles como las usadas actualmente por la empresa.",
                    "Readable explanations matching the company’s current practice.",
                  )}
                </p>
              </div>
              <strong>
                {formatSignedCrc(result.adjustmentAmountCrc, locale)}
              </strong>
            </header>
            {result.adjustments.length === 0 ? (
              <p className="attendance-empty">
                {tr(
                  "No hay ajustes en este período.",
                  "No adjustments in this period.",
                )}
              </p>
            ) : (
              <ul className="payroll-adjustment-list">
                {result.adjustments.map((adjustment) => (
                  <li key={adjustment.id}>
                    <span>
                      {adjustment.adjustmentDate} ·{" "}
                      {adjustmentLabel(adjustment, tr)}
                    </span>
                    <p>{adjustment.note}</p>
                    <strong>
                      {formatSignedCrc(adjustment.calculatedAmountCrc, locale)}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="payroll-actions-grid">
            <IdentityEditor worker={result.worker} />
            <RateEditor
              worker={result.worker}
              defaultEffectiveDate={
                result.missingRateMinutes > 0 ? fromDate : todayInCostaRica()
              }
            />
            <AdjustmentEditor worker={result.worker} defaultDate={toDate} />
          </section>
          <details className="portal-panel payroll-history">
            <summary>
              {tr(
                "Ver historial salarial y jornadas",
                "View pay and shift history",
              )}
            </summary>
            <div className="payroll-history-columns">
              <div>
                <h3>{tr("Tarifas anteriores", "Rate history")}</h3>
                {result.rates.length === 0 ? (
                  <p>{tr("Sin tarifas registradas.", "No rates recorded.")}</p>
                ) : (
                  <ul>
                    {result.rates.map((rate) => (
                      <li key={rate.id}>
                        <strong>
                          {formatCrc(rate.regularHourlyRateCrc, locale)} / h
                        </strong>
                        <span>
                          {formatDateTime(rate.effectiveFromUtc, locale)} ·{" "}
                          {rate.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3>{tr("Jornadas del período", "Period shifts")}</h3>
                <ul>
                  {result.shifts.map((shift, index) => (
                    <li key={`${shift.checkInAtUtc}-${index}`}>
                      <strong>{shift.startedOn}</strong>
                      <span>
                        {formatDateTime(shift.checkInAtUtc, locale)} –{" "}
                        {shift.checkOutAtUtc === null
                          ? tr("abierta", "open")
                          : formatDateTime(shift.checkOutAtUtc, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
          <p className="payroll-legal-note">
            {tr(
              "Pre-nómina informativa: el monto no incluye CCSS, renta, embargos ni otras deducciones legales. Las horas extraordinarias y feriados se registran explícitamente para conservar la decisión de gerencia.",
              "Informational pre-payroll: the amount excludes social security, income tax, garnishments, and other legal deductions. Overtime and holidays are entered explicitly to preserve management’s decision.",
            )}
          </p>
        </>
      )}
    </div>
  );
}

function IdentityEditor({ worker }: { worker: PayrollWorkerProfile }) {
  const { language, tr } = useLanguage();
  const mutation = useUpdatePayrollIdentity();
  const [identityNumber, setIdentityNumber] = useState(
    worker.identityNumber ?? "",
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      workerId: worker.id,
      identityNumber: identityNumber.trim() || null,
    });
  };
  return (
    <details className="portal-panel payroll-action-card">
      <summary>{tr("Editar cédula", "Edit identity number")}</summary>
      <form onSubmit={submit}>
        <label>
          {tr("NÚMERO DE CÉDULA", "IDENTITY NUMBER")}
          <input
            value={identityNumber}
            maxLength={30}
            onChange={(event) => setIdentityNumber(event.target.value)}
          />
        </label>
        {mutation.isError && (
          <p role="alert">
            {requestErrorMessage(mutation.error, undefined, language)}
          </p>
        )}
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? tr("GUARDANDO…", "SAVING…")
            : tr("GUARDAR", "SAVE")}
        </button>
      </form>
    </details>
  );
}

function RateEditor({
  worker,
  defaultEffectiveDate,
}: {
  worker: PayrollWorkerProfile;
  defaultEffectiveDate: string;
}) {
  const { language, tr } = useLanguage();
  const mutation = useCreatePayrollRate();
  const [rate, setRate] = useState(
    worker.currentHourlyRateCrc?.toString() ?? "",
  );
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(defaultEffectiveDate);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(
      {
        workerId: worker.id,
        regularHourlyRateCrc: Number(rate),
        effectiveFromUtc: `${effectiveDate}T06:00:00.000Z`,
        reason,
      },
      { onSuccess: () => setReason("") },
    );
  };
  return (
    <details className="portal-panel payroll-action-card">
      <summary>
        {tr("Actualizar tarifa por hora", "Update hourly rate")}
      </summary>
      <form onSubmit={submit}>
        <label>
          {tr("MONTO POR HORA (₡)", "HOURLY RATE (₡)")}
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={rate}
            onChange={(event) => setRate(event.target.value)}
          />
        </label>
        <label>
          {tr("VIGENTE DESDE", "EFFECTIVE FROM")}
          <input
            type="date"
            required
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
        </label>
        <label>
          {tr("MOTIVO DEL CAMBIO", "CHANGE REASON")}
          <input
            required
            minLength={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {mutation.isError && (
          <p role="alert">
            {requestErrorMessage(mutation.error, undefined, language)}
          </p>
        )}
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? tr("GUARDANDO…", "SAVING…")
            : tr("REGISTRAR NUEVA TARIFA", "RECORD NEW RATE")}
        </button>
      </form>
    </details>
  );
}

function AdjustmentEditor({
  worker,
  defaultDate,
}: {
  worker: PayrollWorkerProfile;
  defaultDate: string;
}) {
  const { language, tr } = useLanguage();
  const mutation = useCreatePayrollAdjustment();
  const [type, setType] = useState<PayrollAdjustmentType>("OVERTIME_HOURS");
  const [date, setDate] = useState(defaultDate);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const option = ADJUSTMENT_OPTIONS.find((item) => item.value === type)!;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(
      {
        workerId: worker.id,
        adjustmentDate: date,
        adjustmentType: type,
        ...(option.mode === "hours"
          ? { minutes: Math.round(Number(value) * 60) }
          : { amountCrc: Number(value) }),
        note,
      },
      {
        onSuccess: () => {
          setValue("");
          setNote("");
        },
      },
    );
  };
  return (
    <details className="portal-panel payroll-action-card">
      <summary>{tr("Agregar ajuste", "Add adjustment")}</summary>
      <form onSubmit={submit}>
        <label>
          {tr("TIPO", "TYPE")}
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as PayrollAdjustmentType)
            }
          >
            {ADJUSTMENT_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {tr(item.es, item.en)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("FECHA", "DATE")}
          <input
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          {option.mode === "hours"
            ? tr("HORAS", "HOURS")
            : tr("MONTO (₡)", "AMOUNT (₡)")}
          <input
            type="number"
            min={option.mode === "hours" ? "0.25" : "0.01"}
            step={option.mode === "hours" ? "0.25" : "0.01"}
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <label>
          {tr("EXPLICACIÓN", "EXPLANATION")}
          <textarea
            required
            minLength={3}
            maxLength={300}
            value={note}
            placeholder={tr(
              "Ej.: presentó comprobante del hospital.",
              "Example: hospital note was provided.",
            )}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {mutation.isError && (
          <p role="alert">
            {requestErrorMessage(mutation.error, undefined, language)}
          </p>
        )}
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? tr("GUARDANDO…", "SAVING…")
            : tr("AGREGAR AJUSTE", "ADD ADJUSTMENT")}
        </button>
      </form>
    </details>
  );
}

function adjustmentLabel(
  adjustment: PayrollAdjustment,
  tr: (es: string, en: string) => string,
): string {
  const option = ADJUSTMENT_OPTIONS.find(
    (item) => item.value === adjustment.adjustmentType,
  );
  const label =
    option === undefined ? adjustment.adjustmentType : tr(option.es, option.en);
  return adjustment.minutes === null
    ? label
    : `${label} · ${(adjustment.minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;
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

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(new Date(value));
}

function todayInCostaRica(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Costa_Rica",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
