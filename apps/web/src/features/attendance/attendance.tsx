import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import { workerDisplayName } from "../workers/worker-display";
import { PlantManagerPage } from "../accounts/plant-manager-page";
import { formatMinutes } from "./attendance-data";
import {
  currentPayrollWeek,
  useAuthorizePayrollGross,
  useCreatePayrollAdjustment,
  useCreatePayrollRate,
  usePayrollReport,
  usePayrollWorkers,
  useSetPayrollWorkerState,
  useUpdatePayrollProfile,
  type PayrollAdjustment,
  type PayrollAdjustmentType,
  type PayrollWorkerResult,
  type PayrollWorkerProfile,
} from "./payroll-data";

const COMMENT_OPTIONS: Array<{
  value: PayrollAdjustmentType;
  es: string;
  en: string;
}> = [
  { value: "OVERTIME_HOURS", es: "Horas extra", en: "Overtime" },
  { value: "HOLIDAY_HOURS", es: "Feriado", en: "Holiday" },
  {
    value: "REST_DAY_HOURS",
    es: "Día libre trabajado",
    en: "Rest day worked",
  },
  { value: "PAID_LEAVE_HOURS", es: "Permiso", en: "Leave" },
  { value: "ABSENCE_HOURS", es: "Ausencia", en: "Absence" },
  {
    value: "EARLY_DEPARTURE_HOURS",
    es: "Salida anticipada",
    en: "Early departure",
  },
  { value: "OTHER_COMMENT", es: "Otro comentario", en: "Other comment" },
];

type PayrollTab = "summary" | "comments";
const WORKERS_PER_PAGE = 10;

export function AttendanceFeature() {
  const { language, locale, tr } = useLanguage();
  const [parameters, setParameters] = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const workers = usePayrollWorkers(search);
  const orderedWorkers = useMemo(
    () =>
      [...(Array.isArray(workers.data) ? workers.data : [])].sort(
        (left, right) =>
          roleOrder(left.category) - roleOrder(right.category) ||
          left.name.localeCompare(right.name, "es"),
      ),
    [workers.data],
  );
  const totalWorkers = orderedWorkers.length;
  const totalPages = Math.max(1, Math.ceil(totalWorkers / WORKERS_PER_PAGE));
  const visibleWorkers = orderedWorkers.slice(
    (page - 1) * WORKERS_PER_PAGE,
    page * WORKERS_PER_PAGE,
  );
  const selectedWorkerId = parameters.get("worker") ?? undefined;
  const selectedWorker = orderedWorkers.find(
    (worker) => worker.id === selectedWorkerId,
  );
  const createWorkerOpen = parameters.get("action") === "create";
  const closeWorker = () => {
    const next = new URLSearchParams(parameters);
    next.delete("worker");
    setParameters(next, { replace: true });
  };
  const openCreateWorker = () => {
    const next = new URLSearchParams(parameters);
    next.set("action", "create");
    setParameters(next, { replace: true });
  };
  const closeCreateWorker = () => {
    const next = new URLSearchParams(parameters);
    next.delete("action");
    setParameters(next, { replace: true });
  };

  return (
    <div className="attendance-feature payroll-directory">
      <section className="portal-panel payroll-worker-list-panel payroll-directory-surface">
        <header>
          <div>
            <h1>{tr("Trabajadores", "Workers")}</h1>
            <p>
              {totalWorkers.toLocaleString(locale)}{" "}
              {tr("empleados", "employees")}
            </p>
          </div>
          <div className="payroll-directory-actions">
            <label className="payroll-search payroll-search-inline">
              <span className="sr-only">{tr("BUSCAR", "SEARCH")}</span>
              <input
                type="search"
                value={search}
                placeholder={tr(
                  "Buscar por nombre o cédula",
                  "Search by name or identity",
                )}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <button type="button" onClick={openCreateWorker}>
              + {tr("AGREGAR NUEVO", "ADD NEW")}
            </button>
          </div>
        </header>

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
        {Array.isArray(workers.data) && (
          <>
            <div className="payroll-worker-list">
              {visibleWorkers.map((worker) => (
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
              {totalWorkers === 0 && (
                <p className="attendance-empty">
                  {tr(
                    "No se encontraron trabajadores con ese nombre o cédula.",
                    "No workers matched that name or identity number.",
                  )}
                </p>
              )}
            </div>
            {totalPages > 1 && (
              <nav
                className="payroll-pagination"
                aria-label={tr("Paginación", "Pagination")}
              >
                <button
                  type="button"
                  className="secondary"
                  aria-label={tr("Página anterior", "Previous page")}
                  disabled={page === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  ‹
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="secondary"
                  aria-label={tr("Página siguiente", "Next page")}
                  disabled={page === totalPages}
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                >
                  ›
                </button>
              </nav>
            )}
          </>
        )}
      </section>

      {selectedWorkerId !== undefined && (
        <WorkerPayrollDialog
          workerId={selectedWorkerId}
          initialWorker={selectedWorker}
          onClose={closeWorker}
        />
      )}
      {createWorkerOpen && (
        <PlantUserCreateDialog onClose={closeCreateWorker} />
      )}
    </div>
  );
}

function PlantUserCreateDialog({ onClose }: { onClose: () => void }) {
  const { tr } = useLanguage();
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
        className="payroll-modal worker-create-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Crear usuario de planta", "Create plant user")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="secondary payroll-modal-close worker-create-close"
          onClick={onClose}
          aria-label={tr("Cerrar", "Close")}
        >
          ×
        </button>
        <PlantManagerPage embedded createOnly onCreated={onClose} />
      </section>
    </div>
  );
}

function roleOrder(category: string): number {
  return category === "JEFE_PLANTA" ? 0 : 1;
}

function roleLabel(
  category: string,
  tr: (spanish: string, english: string) => string,
): string {
  return category === "JEFE_PLANTA"
    ? tr("Jefe de planta", "Plant manager")
    : tr("Operario", "Operator");
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
    <button type="button" className="payroll-worker-row" onClick={onOpen}>
      <span className="payroll-worker-identity">
        <strong>
          <span className="worker-role-prefix">
            {worker.category === "JEFE_PLANTA" ? "JF" : "OP"}
          </span>{" "}
          {workerDisplayName(worker.name)}
        </strong>
        <small>
          {roleLabel(worker.category, tr)} ·{" "}
          {worker.identityNumber === null
            ? tr("Cédula pendiente", "Identity number pending")
            : `${tr("Cédula", "Identity")}: ${worker.identityNumber}`}
        </small>
      </span>
      <span className="payroll-worker-rate">
        <small>{tr("Tarifa", "Rate")}</small>
        <strong>
          {worker.currentHourlyRateCrc === null
            ? tr("Pendiente", "Pending")
            : `${formatCrc(worker.currentHourlyRateCrc, locale)} / h`}
        </strong>
      </span>
      <span className="payroll-open-label">{tr("ABRIR", "OPEN")} →</span>
    </button>
  );
}

function WorkerPayrollDialog({
  workerId,
  initialWorker,
  onClose,
}: {
  workerId: string;
  initialWorker: PayrollWorkerProfile | undefined;
  onClose: () => void;
}) {
  const { language, tr } = useLanguage();
  const initialRange = useMemo(() => currentPayrollWeek(), []);
  const [fromDate, setFromDate] = useState(initialRange.fromDate);
  const [toDate, setToDate] = useState(initialRange.toDate);
  const [tab, setTab] = useState<PayrollTab>("summary");
  const report = usePayrollReport({ fromDate, toDate, workerId });
  const result = report.data?.workers[0];
  const worker = result?.worker ?? initialWorker;

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
        className="payroll-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Expediente del trabajador", "Worker record")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="payroll-modal-header">
          <div className="payroll-modal-person">
            <span>{tr("EXPEDIENTE", "WORKER RECORD")}</span>
            <h2>
              {worker === undefined
                ? tr("Trabajador", "Worker")
                : workerDisplayName(worker.name)}
            </h2>
            {worker !== undefined && (
              <div className="payroll-worker-heading-meta">
                <span className="worker-role-prefix">
                  {worker.category === "JEFE_PLANTA" ? "JF" : "OP"}
                </span>
                <span>{roleLabel(worker.category, tr)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {worker.isActive
                    ? tr("Activo", "Active")
                    : tr("Suspendido", "Suspended")}
                </span>
              </div>
            )}
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
            <button
              type="button"
              className="secondary payroll-modal-close"
              onClick={onClose}
              aria-label={tr("Cerrar", "Close")}
            >
              ×
            </button>
          </div>
        </header>

        <nav
          className="payroll-modal-tabs"
          aria-label={tr("Secciones", "Sections")}
        >
          {(
            [
              ["summary", tr("Resumen y pago", "Summary and pay")],
              ["comments", tr("Notas", "Notes")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={tab === value ? "active" : ""}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="payroll-modal-content">
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
          {result !== undefined && tab === "summary" && (
            <SummaryTab result={result} fromDate={fromDate} toDate={toDate} />
          )}
          {result !== undefined && tab === "comments" && (
            <CommentsTab result={result} defaultDate={toDate} />
          )}
        </div>
        <footer className="payroll-modal-footer">
          {tr(
            "Pre-nómina informativa: no incluye deducciones legales. Los comentarios no alteran el monto.",
            "Informational pre-payroll: legal deductions are excluded. Comments do not alter the amount.",
          )}
        </footer>
      </section>
    </div>
  );
}

function SummaryTab({
  result,
  fromDate,
  toDate,
}: {
  result: PayrollWorkerResult;
  fromDate: string;
  toDate: string;
}) {
  const { language, tr } = useLanguage();
  return (
    <div className="payroll-tab-panel">
      {(result.openShiftCount > 0 || result.incidentCount > 0) && (
        <div className="stale-notice" role="status">
          {tr(
            `${result.openShiftCount} jornadas abiertas y ${result.incidentCount} incidencias no se incluyen en el pago.`,
            `${result.openShiftCount} open shifts and ${result.incidentCount} incidents are excluded from pay.`,
          )}
        </div>
      )}
      <section
        className="payroll-summary"
        aria-label={tr("Resumen", "Summary")}
      >
        <article>
          <span>{tr("HORAS", "HOURS")}</span>
          <strong>{formatMinutes(result.confirmedMinutes, language)}</strong>
          <small>
            {result.completedShiftCount} {tr("jornadas", "shifts")}
          </small>
        </article>
        <EditableRateCard worker={result.worker} />
        <EditableGrossCard
          key={`${fromDate}-${toDate}-${result.estimatedGrossAmountCrc ?? "empty"}`}
          result={result}
          fromDate={fromDate}
          toDate={toDate}
        />
      </section>
      <WorkerProfilePanel
        key={[
          result.worker.id,
          result.worker.name,
          result.worker.identityNumber,
          result.worker.email,
          result.worker.phone,
          result.worker.isActive,
        ].join("|")}
        worker={result.worker}
      />
    </div>
  );
}

function CommentsTab({
  result,
  defaultDate,
}: {
  result: PayrollWorkerResult;
  defaultDate: string;
}) {
  const { tr } = useLanguage();
  const [adding, setAdding] = useState(false);
  return (
    <div className="payroll-tab-panel">
      <section className="portal-panel payroll-notes-panel">
        <header>
          <div>
            <h2>{tr("Notas de jornada", "Shift notes")}</h2>
            <p>
              {result.adjustments.length} {tr("registradas", "recorded")} ·{" "}
              {tr("No modifican el pago", "Do not change pay")}
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => setAdding((value) => !value)}
          >
            {adding
              ? tr("CANCELAR", "CANCEL")
              : tr("+ AGREGAR NOTA", "+ ADD NOTE")}
          </button>
        </header>
        {adding && (
          <CommentEditor
            worker={result.worker}
            defaultDate={defaultDate}
            onSaved={() => setAdding(false)}
          />
        )}
        {result.adjustments.length === 0 ? (
          <p className="attendance-empty">
            {tr("No hay notas en este período.", "No notes in this period.")}
          </p>
        ) : (
          <ul className="payroll-notes-list">
            {result.adjustments.map((adjustment) => (
              <li key={adjustment.id}>
                <div>
                  <strong>{commentLabel(adjustment, tr)}</strong>
                  <span>{adjustment.adjustmentDate}</span>
                </div>
                <p>{adjustment.note}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WorkerProfilePanel({ worker }: { worker: PayrollWorkerProfile }) {
  const { language, tr } = useLanguage();
  const profileMutation = useUpdatePayrollProfile();
  const stateMutation = useSetPayrollWorkerState();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(worker.name);
  const [identityNumber, setIdentityNumber] = useState(
    worker.identityNumber ?? "",
  );
  const [email, setEmail] = useState(worker.email ?? "");
  const [phone, setPhone] = useState(worker.phone ?? "");
  const [suspending, setSuspending] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState("");

  if (!editing) {
    return (
      <section className="worker-profile-panel">
        <header>
          <div>
            <span>{tr("DATOS DEL EXPEDIENTE", "RECORD DETAILS")}</span>
            <h3>
              {tr(
                "Información personal y estado",
                "Personal information and status",
              )}
            </h3>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => setEditing(true)}
          >
            ✎ {tr("EDITAR DATOS", "EDIT DETAILS")}
          </button>
        </header>
        <dl className="worker-profile-grid">
          <div>
            <dt>{tr("Cédula", "Identity")}</dt>
            <dd>{worker.identityNumber ?? tr("Pendiente", "Pending")}</dd>
          </div>
          <div>
            <dt>{tr("Correo de contacto", "Contact email")}</dt>
            <dd>{worker.email ?? tr("Sin registrar", "Not recorded")}</dd>
          </div>
          <div>
            <dt>{tr("Teléfono", "Phone")}</dt>
            <dd>{worker.phone ?? tr("Sin registrar", "Not recorded")}</dd>
          </div>
          <div>
            <dt>{tr("Estado", "Status")}</dt>
            <dd>
              {worker.isActive
                ? tr("Activo", "Active")
                : tr("Suspendido", "Suspended")}
            </dd>
          </div>
        </dl>
        <div className="worker-profile-state-actions">
          {worker.isActive ? (
            suspending ? (
              <div className="worker-suspension-box">
                <label>
                  {tr("Motivo de suspensión", "Suspension reason")}
                  <textarea
                    required
                    minLength={3}
                    maxLength={300}
                    rows={2}
                    value={suspensionReason}
                    onChange={(event) =>
                      setSuspensionReason(event.target.value)
                    }
                  />
                </label>
                <MutationError mutation={stateMutation} language={language} />
                <div>
                  <button
                    type="button"
                    className="danger"
                    disabled={
                      stateMutation.isPending ||
                      suspensionReason.trim().length < 3
                    }
                    onClick={() =>
                      stateMutation.mutate(
                        {
                          workerId: worker.id,
                          active: false,
                          reason: suspensionReason.trim(),
                        },
                        {
                          onSuccess: () => {
                            setSuspending(false);
                            setSuspensionReason("");
                          },
                        },
                      )
                    }
                  >
                    {tr("CONFIRMAR SUSPENSIÓN", "CONFIRM SUSPENSION")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setSuspending(false)}
                  >
                    {tr("CANCELAR", "CANCEL")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="danger secondary"
                onClick={() => setSuspending(true)}
              >
                {tr("SUSPENDER TRABAJADOR", "SUSPEND WORKER")}
              </button>
            )
          ) : (
            <>
              <button
                type="button"
                disabled={stateMutation.isPending}
                onClick={() =>
                  stateMutation.mutate({ workerId: worker.id, active: true })
                }
              >
                {tr("REACTIVAR TRABAJADOR", "REACTIVATE WORKER")}
              </button>
              <MutationError mutation={stateMutation} language={language} />
            </>
          )}
        </div>
      </section>
    );
  }
  return (
    <form
      className="worker-profile-panel worker-profile-editor"
      onSubmit={(event) => {
        event.preventDefault();
        profileMutation.mutate(
          {
            workerId: worker.id,
            name: name.trim(),
            identityNumber: identityNumber.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
          },
          { onSuccess: () => setEditing(false) },
        );
      }}
    >
      <header>
        <div>
          <span>{tr("EDITAR EXPEDIENTE", "EDIT RECORD")}</span>
          <h3>{tr("Datos del trabajador", "Worker details")}</h3>
        </div>
      </header>
      <div className="worker-profile-form-grid">
        <label>
          {tr("Nombre completo", "Full name")}
          <input
            autoFocus
            required
            maxLength={160}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          {tr("Cédula", "Identity")}
          <input
            minLength={4}
            maxLength={30}
            value={identityNumber}
            onChange={(event) => setIdentityNumber(event.target.value)}
          />
        </label>
        <label>
          {tr("Correo de contacto", "Contact email")}
          <input
            type="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          {tr("Teléfono", "Phone")}
          <input
            type="tel"
            maxLength={40}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
      </div>
      {worker.category === "JEFE_PLANTA" && (
        <p className="field-help">
          {tr(
            "Este correo es informativo; no cambia el correo usado para iniciar sesión.",
            "This is a contact email; it does not change the sign-in email.",
          )}
        </p>
      )}
      <MutationError mutation={profileMutation} language={language} />
      <div className="payroll-editor-actions">
        <button type="submit" disabled={profileMutation.isPending}>
          {tr("GUARDAR CAMBIOS", "SAVE CHANGES")}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setEditing(false)}
        >
          {tr("CANCELAR", "CANCEL")}
        </button>
      </div>
    </form>
  );
}

function EditableRateCard({ worker }: { worker: PayrollWorkerProfile }) {
  const { language, locale, tr } = useLanguage();
  const mutation = useCreatePayrollRate();
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState(
    worker.currentHourlyRateCrc?.toString() ?? "",
  );
  const [reason, setReason] = useState("");
  if (!editing) {
    return (
      <article className="payroll-editable-card">
        <header>
          <span>{tr("TARIFA", "RATE")}</span>
          <button
            type="button"
            className="payroll-pencil"
            aria-label={tr("Editar tarifa", "Edit rate")}
            onClick={() => setEditing(true)}
          >
            ✎
          </button>
        </header>
        <strong>
          {worker.currentHourlyRateCrc === null
            ? tr("Pendiente", "Pending")
            : `${formatCrc(worker.currentHourlyRateCrc, locale)} / h`}
        </strong>
        <small>{tr("Tarifa vigente", "Current rate")}</small>
      </article>
    );
  }
  return (
    <form
      className="payroll-summary-editor"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(
          { workerId: worker.id, regularHourlyRateCrc: Number(rate), reason },
          {
            onSuccess: () => {
              setReason("");
              setEditing(false);
            },
          },
        );
      }}
    >
      <span>{tr("EDITAR TARIFA", "EDIT RATE")}</span>
      <label>
        <span className="sr-only">{tr("₡ por hora", "₡ per hour")}</span>
        <input
          autoFocus
          type="number"
          min="0.01"
          step="0.01"
          required
          value={rate}
          onChange={(event) => setRate(event.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">{tr("Motivo", "Reason")}</span>
        <input
          required
          minLength={3}
          placeholder={tr("Motivo del cambio", "Change reason")}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <MutationError mutation={mutation} language={language} />
      <div className="payroll-editor-actions">
        <button type="submit" disabled={mutation.isPending}>
          {tr("GUARDAR", "SAVE")}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setEditing(false)}
        >
          {tr("CANCELAR", "CANCEL")}
        </button>
      </div>
    </form>
  );
}

function EditableGrossCard({
  result,
  fromDate,
  toDate,
}: {
  result: PayrollWorkerResult;
  fromDate: string;
  toDate: string;
}) {
  const { language, locale, tr } = useLanguage();
  const mutation = useAuthorizePayrollGross();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(
    result.estimatedGrossAmountCrc?.toString() ?? "",
  );
  const [reason, setReason] = useState("");
  if (!editing) {
    return (
      <article className="payroll-editable-card total">
        <header>
          <span>{tr("BRUTO CALCULADO", "CALCULATED GROSS")}</span>
          <button
            type="button"
            className="payroll-pencil"
            aria-label={tr("Editar bruto calculado", "Edit calculated gross")}
            disabled={result.estimatedGrossAmountCrc === null}
            onClick={() => setEditing(true)}
          >
            ✎
          </button>
        </header>
        <strong>
          {result.estimatedGrossAmountCrc === null
            ? tr("Sin tarifa", "No rate")
            : formatCrc(result.estimatedGrossAmountCrc, locale)}
        </strong>
        <small>
          {result.grossAuthorization === null
            ? tr("Horas × tarifa", "Hours × rate")
            : tr("Editado manualmente", "Manually edited")}
        </small>
      </article>
    );
  }
  return (
    <form
      className="payroll-summary-editor"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(
          {
            workerId: result.worker.id,
            fromDate,
            toDate,
            authorizedAmountCrc: Number(amount),
            reason,
          },
          {
            onSuccess: () => {
              setReason("");
              setEditing(false);
            },
          },
        );
      }}
    >
      <span>{tr("EDITAR BRUTO", "EDIT GROSS")}</span>
      <label>
        <span className="sr-only">{tr("Monto (₡)", "Amount (₡)")}</span>
        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">
          {tr("Motivo del cambio", "Change reason")}
        </span>
        <input
          required
          minLength={3}
          placeholder={tr("Motivo del cambio", "Change reason")}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <MutationError mutation={mutation} language={language} />
      <div className="payroll-editor-actions">
        <button type="submit" disabled={mutation.isPending}>
          {tr("GUARDAR", "SAVE")}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setEditing(false)}
        >
          {tr("CANCELAR", "CANCEL")}
        </button>
      </div>
    </form>
  );
}

function CommentEditor({
  worker,
  defaultDate,
  onSaved,
}: {
  worker: PayrollWorkerProfile;
  defaultDate: string;
  onSaved: () => void;
}) {
  const { language, tr } = useLanguage();
  const mutation = useCreatePayrollAdjustment();
  const [type, setType] = useState<PayrollAdjustmentType>("OVERTIME_HOURS");
  const [date, setDate] = useState(defaultDate);
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      className="payroll-note-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        mutation.mutate(
          {
            workerId: worker.id,
            adjustmentDate: date,
            adjustmentType: type,
            ...(hours === ""
              ? {}
              : { minutes: Math.round(Number(hours) * 60) }),
            note,
          },
          {
            onSuccess: () => {
              setHours("");
              setNote("");
              onSaved();
            },
          },
        );
      }}
    >
      <div className="payroll-note-fields">
        <label>
          {tr("TIPO", "TYPE")}
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as PayrollAdjustmentType)
            }
          >
            {COMMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {tr(option.es, option.en)}
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
          {tr("HORAS (OPCIONAL)", "HOURS (OPTIONAL)")}
          <input
            type="number"
            min="0.25"
            step="0.25"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
        </label>
        <label>
          {tr("MOTIVO", "REASON")}
          <input
            required
            minLength={3}
            maxLength={300}
            placeholder={tr("Descripción breve", "Short description")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      <MutationError mutation={mutation} language={language} />
      <button type="submit" disabled={mutation.isPending}>
        {tr("GUARDAR NOTA", "SAVE NOTE")}
      </button>
    </form>
  );
}

function MutationError({
  mutation,
  language,
}: {
  mutation: { isError: boolean; error: Error | null };
  language: "es" | "en";
}) {
  return mutation.isError ? (
    <p role="alert">
      {requestErrorMessage(mutation.error, undefined, language)}
    </p>
  ) : null;
}

function commentLabel(
  adjustment: PayrollAdjustment,
  tr: (es: string, en: string) => string,
): string {
  const option = COMMENT_OPTIONS.find(
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
