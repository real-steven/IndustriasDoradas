import { useSearchParams } from "react-router-dom";

import type {
  AttendanceHours,
  AttendanceHoursIncident,
  AttendanceHoursShift,
  AttendanceWorkerHours,
  Worker,
} from "../../api/generated/api-client";
import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import {
  attendanceDateRange,
  formatAttendanceDateTime,
  formatMinutes,
  parseAttendanceFilters,
  useAttendanceHours,
  useAttendanceWorkers,
} from "./attendance-data";

export function AttendanceFeature() {
  const { language, locale, tr } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseAttendanceFilters(searchParams);
  const range = attendanceDateRange(filters);
  const hours = useAttendanceHours(filters);
  const workers = useAttendanceWorkers();
  const update = (key: "period" | "date" | "worker", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.length === 0) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="attendance-feature">
      <section className="portal-panel attendance-filters">
        <header>
          <div>
            <h2>{tr("Período y trabajador", "Period and worker")}</h2>
            <p>
              {tr(
                "Los filtros permanecen en la dirección para compartir o retomar la consulta.",
                "Filters remain in the address so the query can be shared or resumed.",
              )}
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={hours.isFetching || workers.isFetching}
            onClick={() =>
              void Promise.all([hours.refetch(), workers.refetch()])
            }
          >
            {hours.isFetching || workers.isFetching
              ? tr("Actualizando…", "Refreshing…")
              : tr("Actualizar datos", "Refresh data")}
          </button>
        </header>
        <div className="attendance-filter-grid">
          <label>
            {tr("Período", "Period")}
            <select
              value={filters.period}
              onChange={(event) => update("period", event.target.value)}
            >
              <option value="current">
                {tr("Semana actual", "Current week")}
              </option>
              <option value="previous">
                {tr("Semana anterior", "Previous week")}
              </option>
              <option value="date">
                {tr("Día específico", "Specific day")}
              </option>
            </select>
          </label>
          {filters.period === "date" && (
            <label>
              {tr("Fecha", "Date")}
              <input
                type="date"
                value={filters.date}
                onChange={(event) => update("date", event.target.value)}
              />
            </label>
          )}
          <label>
            {tr("Trabajador", "Worker")}
            <select
              value={filters.workerId ?? ""}
              onChange={(event) => update("worker", event.target.value)}
            >
              <option value="">{tr("Todos", "All workers")}</option>
              {(workers.data?.items ?? []).map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name} · {categoryLabel(worker, language)}
                </option>
              ))}
            </select>
          </label>
          <div
            className="attendance-range"
            aria-label={tr("Rango consultado", "Selected range")}
          >
            <span>{tr("Rango consultado", "Selected range")}</span>
            <strong>
              {range.fromDate === range.toDate
                ? range.fromDate
                : `${range.fromDate} — ${range.toDate}`}
            </strong>
          </div>
        </div>
      </section>

      <AttendanceQueryState
        data={hours.data}
        error={hours.error}
        pending={hours.isPending}
        stale={hours.isError && hours.data !== undefined}
        workers={workers.data?.items ?? []}
        selectedWorkerId={filters.workerId}
        language={language}
        locale={locale}
        tr={tr}
      />
    </div>
  );
}

function AttendanceQueryState({
  data,
  error,
  pending,
  stale,
  workers,
  selectedWorkerId,
  language,
  locale,
  tr,
}: {
  data: AttendanceHours | undefined;
  error: Error | null;
  pending: boolean;
  stale: boolean;
  workers: Worker[];
  selectedWorkerId: string | undefined;
  language: "es" | "en";
  locale: string;
  tr: (es: string, en: string) => string;
}) {
  if (pending)
    return (
      <p role="status" className="query-message">
        {tr("Calculando horas confirmadas…", "Calculating confirmed hours…")}
      </p>
    );
  if (data === undefined)
    return (
      <div role="alert" className="query-message error">
        {requestErrorMessage(error, undefined, language)}
      </div>
    );

  const visibleWorkers = workers.filter(
    (worker) =>
      selectedWorkerId === undefined || worker.id === selectedWorkerId,
  );
  const summaries = new Map(
    data.workers.map((worker) => [worker.workerId, worker]),
  );
  const workerRows = visibleWorkers.map((worker) => ({
    worker,
    summary: summaries.get(worker.id) ?? emptySummary(worker),
  }));
  const openShifts = data.shifts.filter((shift) => shift.status === "OPEN");

  return (
    <>
      {stale && (
        <div role="alert" className="stale-notice">
          <strong>{tr("Datos desactualizados.", "Outdated data.")}</strong>{" "}
          {requestErrorMessage(error, undefined, language)}
        </div>
      )}
      <section
        className="attendance-summary"
        aria-label={tr("Resumen de asistencia", "Attendance summary")}
      >
        <AttendanceMetric
          label={tr("Horas confirmadas", "Confirmed hours")}
          value={formatMinutes(data.summary.totalConfirmedMinutes, language)}
          note={tr(
            `${data.summary.confirmedShiftCount.toLocaleString(locale)} jornadas cerradas`,
            `${data.summary.confirmedShiftCount.toLocaleString(locale)} completed shifts`,
          )}
          tone="navy"
        />
        <AttendanceMetric
          label={tr("Jornadas abiertas", "Open shifts")}
          value={data.summary.openShiftCount.toLocaleString(locale)}
          note={tr(
            "Sin convertir en cero horas",
            "Never converted to zero hours",
          )}
          tone={data.summary.openShiftCount > 0 ? "gold" : "green"}
        />
        <AttendanceMetric
          label={tr("Incidencias", "Incidents")}
          value={data.summary.incidentCount.toLocaleString(locale)}
          note={tr(
            "Requieren lectura en planta",
            "Require review at the plant",
          )}
          tone={data.summary.incidentCount > 0 ? "red" : "green"}
        />
        <AttendanceMetric
          label={tr("Marcas excluidas", "Excluded marks")}
          value={data.coverage.excludedEvents.toLocaleString(locale)}
          note={tr(
            "No suman horas confirmadas",
            "Not counted as confirmed hours",
          )}
          tone={data.coverage.excludedEvents > 0 ? "gold" : "green"}
        />
      </section>

      <p className="attendance-freshness">
        {data.freshness.lastConfirmedAtUtc === null
          ? tr(
              "Aún no hay marcas confirmadas para mostrar.",
              "There are no confirmed marks yet.",
            )
          : `${tr("Última confirmación central", "Latest central confirmation")}: ${formatAttendanceDateTime(data.freshness.lastConfirmedAtUtc, language)}`}
        {` · ${data.coverage.confirmedEventsUsed.toLocaleString(locale)} ${tr("marcas válidas", "valid marks")}`}
      </p>

      <section className="portal-panel attendance-workers">
        <header>
          <div>
            <h2>{tr("Trabajadores y horas", "Workers and hours")}</h2>
            <p>
              {tr(
                "Operarios y jefes de planta aparecen en una sola lista",
                "Operators and plant managers appear in one list",
              )}
            </p>
          </div>
          <span className="read-only-badge">
            {tr("SOLO LECTURA", "READ ONLY")}
          </span>
        </header>
        {workerRows.length === 0 ? (
          <EmptyAttendance
            text={tr(
              "No hay trabajadores que coincidan con el filtro.",
              "No workers match the filter.",
            )}
          />
        ) : (
          <div className="attendance-worker-list">
            {workerRows.map(({ worker, summary }) => (
              <article className="attendance-worker-row" key={worker.id}>
                <div>
                  <strong>{worker.name}</strong>
                  <span>
                    {categoryLabel(worker, language)} ·{" "}
                    {statusLabel(worker, language)}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>{tr("Confirmado", "Confirmed")}</dt>
                    <dd>{formatMinutes(summary.confirmedMinutes, language)}</dd>
                  </div>
                  <div>
                    <dt>{tr("Jornadas", "Shifts")}</dt>
                    <dd>
                      {summary.completedShiftCount.toLocaleString(locale)}
                    </dd>
                  </div>
                  <div>
                    <dt>{tr("Abiertas", "Open")}</dt>
                    <dd>{summary.openShiftCount.toLocaleString(locale)}</dd>
                  </div>
                  <div>
                    <dt>{tr("Incidencias", "Incidents")}</dt>
                    <dd>{summary.incidentCount.toLocaleString(locale)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="attendance-two-column">
        <AttendancePending
          shifts={openShifts}
          incidents={data.incidents}
          language={language}
          tr={tr}
        />
        <AttendanceAdjustments data={data} language={language} tr={tr} />
      </section>

      <AttendanceShiftHistory
        shifts={data.shifts}
        language={language}
        tr={tr}
      />
    </>
  );
}

function AttendanceMetric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "navy" | "gold" | "red" | "green";
}) {
  return (
    <article className={`attendance-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function AttendancePending({
  shifts,
  incidents,
  language,
  tr,
}: {
  shifts: AttendanceHoursShift[];
  incidents: AttendanceHoursIncident[];
  language: "es" | "en";
  tr: (es: string, en: string) => string;
}) {
  return (
    <section className="portal-panel attendance-pending">
      <header>
        <div>
          <h2>{tr("Pendientes e incidencias", "Open items and incidents")}</h2>
          <p>
            {tr(
              "Las jornadas abiertas no se estiman ni se cierran automáticamente",
              "Open shifts are neither estimated nor closed automatically",
            )}
          </p>
        </div>
      </header>
      {shifts.length === 0 && incidents.length === 0 ? (
        <EmptyAttendance
          text={tr(
            "No hay pendientes en este período.",
            "There are no open items in this period.",
          )}
        />
      ) : (
        <div className="attendance-alert-list">
          {shifts.map((shift) => (
            <article
              className="attendance-alert gold"
              key={shift.checkInEventId}
            >
              <strong>{shift.workerName}</strong>
              <span>
                {tr("Jornada abierta desde", "Shift open since")}{" "}
                {formatAttendanceDateTime(shift.checkInAtUtc, language)}
              </span>
            </article>
          ))}
          {incidents.map((incident) => (
            <article
              className="attendance-alert red"
              key={`${incident.type}:${incident.eventId}`}
            >
              <strong>
                {incident.workerName} · {incidentLabel(incident.type, language)}
              </strong>
              <span>
                {incident.description} ·{" "}
                {formatAttendanceDateTime(incident.detectedAtUtc, language)}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AttendanceAdjustments({
  data,
  language,
  tr,
}: {
  data: AttendanceHours;
  language: "es" | "en";
  tr: (es: string, en: string) => string;
}) {
  return (
    <section className="portal-panel attendance-adjustments">
      <header>
        <div>
          <h2>{tr("Historial de ajustes", "Adjustment history")}</h2>
          <p>
            {tr(
              "Cada corrección conserva autor, motivo y marca relacionada",
              "Every correction preserves its author, reason, and related mark",
            )}
          </p>
        </div>
      </header>
      {data.adjustments.length === 0 ? (
        <EmptyAttendance
          text={tr(
            "No hubo correcciones en este período.",
            "There were no corrections in this period.",
          )}
        />
      ) : (
        <ol className="attendance-adjustment-list">
          {data.adjustments.map((item) => (
            <li key={item.eventId}>
              <div>
                <strong>{item.workerName}</strong>
                <span>
                  {item.eventType === "ADJUSTED_CHECK_IN"
                    ? tr("Entrada corregida", "Corrected check-in")
                    : tr("Salida corregida", "Corrected check-out")}
                </span>
              </div>
              <p>{item.correctionReason}</p>
              <small>
                {tr("Realizado por", "Recorded by")}{" "}
                {item.correctedByDisplayName} ·{" "}
                {formatAttendanceDateTime(item.recordedAtUtc, language)}
              </small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AttendanceShiftHistory({
  shifts,
  language,
  tr,
}: {
  shifts: AttendanceHoursShift[];
  language: "es" | "en";
  tr: (es: string, en: string) => string;
}) {
  return (
    <section className="portal-panel attendance-history">
      <header>
        <div>
          <h2>{tr("Detalle de jornadas", "Shift details")}</h2>
          <p>
            {tr(
              "La fecha de referencia siempre corresponde a la entrada en Costa Rica",
              "The reference date always follows the Costa Rica check-in date",
            )}
          </p>
        </div>
      </header>
      {shifts.length === 0 ? (
        <EmptyAttendance
          text={tr(
            "No hay jornadas dentro del período.",
            "There are no shifts in this period.",
          )}
        />
      ) : (
        <div className="table-wrap">
          <table aria-label={tr("Jornadas de trabajadores", "Worker shifts")}>
            <thead>
              <tr>
                <th>{tr("Trabajador", "Worker")}</th>
                <th>{tr("Fecha", "Date")}</th>
                <th>{tr("Entrada", "Check-in")}</th>
                <th>{tr("Salida", "Check-out")}</th>
                <th>{tr("Tiempo confirmado", "Confirmed time")}</th>
                <th>{tr("Estado", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.checkInEventId}>
                  <th scope="row">{shift.workerName}</th>
                  <td>{shift.startedOn}</td>
                  <td>
                    {formatAttendanceDateTime(shift.checkInAtUtc, language)}
                  </td>
                  <td>
                    {shift.checkOutAtUtc === null
                      ? "—"
                      : formatAttendanceDateTime(shift.checkOutAtUtc, language)}
                  </td>
                  <td>
                    {shift.minutesInPeriod === null
                      ? "—"
                      : formatMinutes(shift.minutesInPeriod, language)}
                  </td>
                  <td>
                    <span
                      className={`attendance-shift-status ${shift.status.toLowerCase()}`}
                    >
                      {shift.status === "OPEN"
                        ? tr("ABIERTA", "OPEN")
                        : tr("CONFIRMADA", "CONFIRMED")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyAttendance({ text }: { text: string }) {
  return <p className="attendance-empty">{text}</p>;
}

function emptySummary(worker: Worker): AttendanceWorkerHours {
  return {
    workerId: worker.id,
    workerName: worker.name,
    confirmedMinutes: 0,
    completedShiftCount: 0,
    openShiftCount: 0,
    incidentCount: 0,
  };
}

function categoryLabel(worker: Worker, language: "es" | "en"): string {
  if (worker.category === "JEFE_PLANTA")
    return language === "es" ? "Jefe de planta" : "Plant manager";
  return language === "es" ? "Operario" : "Operator";
}

function statusLabel(worker: Worker, language: "es" | "en"): string {
  if (!worker.isActive) return language === "es" ? "Inactivo" : "Inactive";
  if (worker.status === "PROVISIONAL")
    return language === "es" ? "Pendiente de aprobación" : "Pending approval";
  if (worker.status === "RECHAZADO")
    return language === "es" ? "Rechazado" : "Rejected";
  return language === "es" ? "Activo" : "Active";
}

function incidentLabel(
  type: AttendanceHoursIncident["type"],
  language: "es" | "en",
): string {
  const labels = {
    DUPLICATE_CHECK_IN: ["Entrada duplicada", "Duplicate check-in"],
    CHECK_OUT_WITHOUT_CHECK_IN: [
      "Salida sin entrada",
      "Check-out without check-in",
    ],
    OPEN_SHIFT_EXCEEDED: [
      "Jornada superior a ocho horas",
      "Shift exceeds eight hours",
    ],
  } as const;
  return labels[type][language === "es" ? 0 : 1];
}
