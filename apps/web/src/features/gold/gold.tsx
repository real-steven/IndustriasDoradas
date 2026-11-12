import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  GoldMercurySynthesis,
  GoldReviewEntry,
  GoldShipmentOverview,
  ManagementShipment,
  ManagementSweepMercury,
} from "../../api/generated/api-client";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../i18n/language-context";

import {
  useGoldHistory,
  useGoldOverview,
  useGoldSummary,
  useRecordShipmentGold,
  useRecordSweepMercury,
  useReviewShipmentGold,
} from "./gold-data";
import {
  ApiConnectionError,
  ApiRequestError,
  requestErrorMessage,
} from "../../api/http";
import {
  formatCostaRicaDateTime,
  parseShipmentFilters,
  shortShipmentId,
  useManagementShipmentFilterOptions,
  useManagementShipmentSweeps,
  useManagementShipments,
  type ShipmentFilters,
} from "../management/management-shipments-data";

const decimalPattern = /^\d+(?:[.,]\d{1,2})?$/u;

export function GoldFeature() {
  const { language, tr } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseShipmentFilters(searchParams);
  const shipments = useManagementShipments(filters);
  const options = useManagementShipmentFilterOptions(filters);
  const summary = useGoldSummary(filters);
  const overview = useGoldOverview(
    shipments.data?.items.map((shipment) => shipment.shipmentId) ?? [],
  );
  const overviewFor = (shipmentId: string): OverviewState =>
    overview.isError
      ? { status: "error" }
      : overview.data === undefined
        ? { status: "loading" }
        : {
            status: "ready",
            value: overview.data.find((item) => item.shipmentId === shipmentId),
          };
  const [selected, setSelected] = useState<ManagementShipment | null>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);
  const items = options.data?.items ?? shipments.data?.items ?? [];

  const openEditor = (
    shipment: ManagementShipment,
    trigger: HTMLButtonElement,
  ) => {
    editorTrigger.current = trigger;
    setSelected(shipment);
  };

  const closeEditor = () => {
    setSelected(null);
    editorTrigger.current?.focus();
  };

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.length === 0) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    if (key === "period" && value !== "date") {
      next.delete("date");
      next.delete("to");
    }
    if (key === "period" && value === "date") {
      if (!next.has("date")) next.set("date", filters.date);
      if (!next.has("to")) next.set("to", filters.toDate);
    }
    if (key === "date" && value > filters.toDate) next.set("to", value);
    if (key === "to" && value < filters.date) next.set("date", value);
    setSearchParams(next);
  };

  return (
    <div className="gold-feature">
      <GoldFiltersPanel filters={filters} items={items} update={update} />
      <GoldSummaryPanel query={summary} />
      <section className="portal-panel gold-shipments" aria-live="polite">
        <header>
          <div>
            <h2>{tr("Cargamentos cerrados", "Closed shipments")}</h2>
            <p>
              {tr(
                "Un único resultado vigente por cargamento",
                "One current result per shipment",
              )}
            </p>
          </div>
          {shipments.data !== undefined && (
            <span className="history-total">
              {shipments.data.total}{" "}
              {shipments.data.total === 1
                ? tr("cargamento", "shipment")
                : tr("cargamentos", "shipments")}
            </span>
          )}
        </header>
        {shipments.isPending ? (
          <GoldState title={tr("Consultando cargamentos", "Loading shipments")}>
            {tr(
              "Espere mientras se carga la proyección central.",
              "Please wait while the central projection loads.",
            )}
          </GoldState>
        ) : shipments.isError || shipments.data === undefined ? (
          <GoldState
            title={tr(
              "No se pudieron consultar los cargamentos",
              "Shipments could not be loaded",
            )}
            error
          >
            {requestErrorMessage(shipments.error, undefined, language)}
          </GoldState>
        ) : shipments.data.items.length === 0 ? (
          <GoldState
            title={tr(
              "No hay cargamentos para estos filtros",
              "No shipments match these filters",
            )}
          >
            {tr(
              "Vacío significa que no existe un cargamento cerrado en el período, no que el resultado sea cero.",
              "An empty result means there is no closed shipment in the period, not that the result is zero.",
            )}
          </GoldState>
        ) : (
          <>
            <div className="gold-shipment-list">
              {shipments.data.items.map((shipment) => (
                <GoldShipmentRow
                  key={shipment.shipmentId}
                  shipment={shipment}
                  disposition={reviewDisposition(
                    shipment.shipmentId,
                    summary.data?.acknowledgedShipmentIds ?? [],
                    summary.data?.omittedShipmentIds ?? [],
                  )}
                  overview={overviewFor(shipment.shipmentId)}
                  open={(trigger) => openEditor(shipment, trigger)}
                />
              ))}
            </div>
            <GoldPagination
              page={shipments.data.page}
              totalPages={shipments.data.totalPages}
              searchParams={searchParams}
              setSearchParams={setSearchParams}
            />
          </>
        )}
      </section>
      {selected !== null && (
        <div className="gold-dialog-layer">
          <GoldEditor
            shipment={selected}
            disposition={reviewDisposition(
              selected.shipmentId,
              summary.data?.acknowledgedShipmentIds ?? [],
              summary.data?.omittedShipmentIds ?? [],
            )}
            close={closeEditor}
          />
        </div>
      )}
    </div>
  );
}

function GoldSummaryPanel({
  query,
}: {
  query: ReturnType<typeof useGoldSummary>;
}) {
  const { language, locale, tr } = useLanguage();

  if (query.isPending)
    return (
      <section
        className="gold-summary-grid"
        aria-label={tr("Resumen de oro", "Gold summary")}
      >
        <GoldMetric label={tr("Cobertura", "Coverage")} value="…" />
        <GoldMetric
          label={tr("Total registrado", "Recorded total")}
          value="…"
        />
        <GoldMetric
          label={tr("Oro por cajuela", "Gold per cajuela")}
          value="…"
        />
        <GoldMetric label={tr("Leídos", "Read")} value="…" />
      </section>
    );
  if (query.isError || query.data === undefined)
    return (
      <GoldState
        title={tr(
          "No se pudo calcular el resumen",
          "Summary could not be calculated",
        )}
        error
      >
        {requestErrorMessage(
          query.error,
          tr(
            "Los cargamentos permanecen disponibles; reintente la consulta central.",
            "Shipments remain available; retry the central query.",
          ),
          language,
        )}
      </GoldState>
    );

  return (
    <section
      className="gold-summary-grid"
      aria-label={tr("Resumen de oro", "Gold summary")}
    >
      <GoldMetric
        label={tr("Total registrado", "Recorded total")}
        value={`${formatGrams(query.data.totalGoldGrams, locale)} g`}
        detail={`${query.data.registeredShipments} ${tr("cargamentos con dato", "shipments with data")}`}
      />
      <GoldMetric
        label={tr("Pendientes", "Pending")}
        value={String(query.data.pendingShipments)}
        detail={tr(
          "Requieren registrar oro o confirmar que no habrá dato",
          "Require gold data or confirmation that no data will be recorded",
        )}
      />
      <GoldMetric
        label={tr("Leídos sin registrar", "Read without result")}
        value={String(query.data.acknowledgedShipments)}
        detail={tr(
          "Ya no generan aviso, pero aún admiten registrar oro",
          "No longer trigger a reminder, but gold can still be recorded",
        )}
      />
      <GoldMetric
        label={tr("Revisados sin dato", "Reviewed without data")}
        value={String(query.data.omittedShipments)}
        detail={tr(
          "No se contabilizan como oro cero",
          "They are not counted as zero gold",
        )}
      />
    </section>
  );
}

function GoldFiltersPanel({
  filters,
  items,
  update,
}: {
  filters: ShipmentFilters;
  items: readonly ManagementShipment[];
  update(this: void, key: string, value: string): void;
}) {
  const { tr } = useLanguage();

  return (
    <section className="portal-panel gold-filters">
      <div className="gold-filter-grid">
        <label>
          <span>{tr("Período", "Period")}</span>
          <select
            value={filters.period}
            onChange={(event) => update("period", event.target.value)}
          >
            <option value="current">{tr("Esta semana", "This week")}</option>
            <option value="previous">
              {tr("Semana anterior", "Previous week")}
            </option>
            <option value="date">{tr("Rango de fechas", "Date range")}</option>
            <option value="all">{tr("Mostrar todo", "All")}</option>
          </select>
        </label>
        {filters.period === "date" && (
          <>
            <label>
              <span>{tr("Desde", "From")}</span>
              <input
                type="date"
                max={filters.toDate}
                value={filters.date}
                onChange={(event) => update("date", event.target.value)}
              />
            </label>
            <label>
              <span>{tr("Hasta", "To")}</span>
              <input
                type="date"
                min={filters.date}
                value={filters.toDate}
                onChange={(event) => update("to", event.target.value)}
              />
            </label>
          </>
        )}
        <FilterSelect
          label={tr("Línea", "Line")}
          value={filters.productionLineId ?? ""}
          values={uniqueOptions(
            items,
            (item) => item.productionLineId,
            (item) => item.productionLineName,
          )}
          onChange={(value) => update("line", value)}
        />
        <FilterSelect
          label={tr("Proveedor", "Supplier")}
          value={filters.supplierId ?? ""}
          values={uniqueOptions(
            items,
            (item) => item.supplierId,
            (item) => item.supplierName,
          )}
          onChange={(value) => update("supplier", value)}
        />
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly { value: string; label: string }[];
  onChange(this: void, value: string): void;
}) {
  const { tr } = useLanguage();

  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{tr("Todos", "All")}</option>
        {values.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type OverviewState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; value: GoldShipmentOverview | undefined };

type GoldRowStatus = "REGISTERED" | "OMITTED" | "PENDING";

function goldRowStatus(
  shipment: ManagementShipment,
  disposition: GoldReviewEntry["disposition"],
): GoldRowStatus {
  if (shipment.hasGoldResult) return "REGISTERED";
  return disposition === "OMITTED" ? "OMITTED" : "PENDING";
}

function GoldShipmentRow({
  shipment,
  disposition,
  overview,
  open,
}: {
  shipment: ManagementShipment;
  disposition: GoldReviewEntry["disposition"];
  overview: OverviewState;
  open(this: void, trigger: HTMLButtonElement): void;
}) {
  const { language, locale, tr } = useLanguage();
  const reviewMutation = useReviewShipmentGold(shipment.shipmentId);
  const [confirmWithoutData, setConfirmWithoutData] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const changeDisposition = async (
    next: GoldReviewEntry["disposition"],
    reason?: string,
  ) => {
    setFeedback(null);
    try {
      await reviewMutation.mutateAsync({
        disposition: next,
        ...(reason === undefined ? {} : { reason }),
      });
      setConfirmWithoutData(false);
      setReviewReason("");
      setFeedback(
        next === "ACKNOWLEDGED"
          ? tr("Cargamento marcado como leído.", "Shipment marked as read.")
          : next === "OMITTED"
            ? tr(
                "Cargamento revisado sin dato.",
                "Shipment reviewed without data.",
              )
            : tr(
                "Cargamento devuelto a pendientes.",
                "Shipment returned to pending.",
              ),
      );
    } catch {
      setFeedback(null);
    }
  };

  const reviewError = reviewMutation.isError
    ? mutationMessage(reviewMutation.error, language)
    : null;
  const status = goldRowStatus(shipment, disposition);

  return (
    <article className="gold-shipment-row">
      <div>
        <span>
          {tr("CARGAMENTO", "SHIPMENT")} {shortShipmentId(shipment.shipmentId)}
        </span>
        <h3>{shipment.productionLineName}</h3>
        <p>
          {shipment.supplierName} · {tr("Cerrado", "Closed")}{" "}
          {formatCostaRicaDateTime(shipment.completedAtUtc, language)}
        </p>
        <GoldStatusBadge status={status} disposition={disposition} />
      </div>
      <dl className="gold-row-facts">
        <div>
          <dt>{tr("Oro registrado", "Recorded gold")}</dt>
          <dd>
            {shipment.hasGoldResult && shipment.goldAmountGrams !== null ? (
              <>
                {formatGrams(shipment.goldAmountGrams, locale)} g
                <small>
                  {formatPalos(shipment.goldAmountGrams, locale)}{" "}
                  {tr("palos", "palos")}
                </small>
              </>
            ) : (
              tr("Sin registrar", "Not recorded")
            )}
          </dd>
        </div>
        <div>
          <dt>{tr("Quilataje", "Karat")}</dt>
          <dd>
            {karatText(
              shipment.hasGoldResult ? shipment.goldKarat : null,
              locale,
              tr,
            )}
          </dd>
        </div>
        <div>
          <dt>{tr("Mercurio", "Mercury")}</dt>
          <dd>
            <MercurySummary overview={overview} />
          </dd>
        </div>
        <div>
          <dt>{tr("Cajuelas", "Cajuelas")}</dt>
          <dd>{shipment.cajuelaTotal}</dd>
        </div>
        <div>
          <dt>{tr("Revisiones", "Revisions")}</dt>
          <dd>{shipment.goldRevisionCount ?? 0}</dd>
        </div>
      </dl>
      <div className="gold-row-actions">
        <button
          type="button"
          className="primary-button"
          onClick={(event) => open(event.currentTarget)}
        >
          {shipment.hasGoldResult
            ? tr("CORREGIR RESULTADO", "CORRECT RESULT")
            : tr("REGISTRAR DATOS", "RECORD DATA")}
        </button>
        {!shipment.hasGoldResult && disposition === "PENDING" && (
          <button
            type="button"
            className="secondary"
            disabled={reviewMutation.isPending}
            onClick={() => void changeDisposition("ACKNOWLEDGED")}
          >
            {tr("MARCAR LEÍDO", "MARK READ")}
          </button>
        )}
        {!shipment.hasGoldResult && disposition !== "OMITTED" && (
          <button
            type="button"
            className="secondary"
            disabled={reviewMutation.isPending}
            onClick={() => {
              setConfirmWithoutData(true);
              setFeedback(null);
            }}
          >
            {tr("REVISADO SIN DATO", "REVIEWED WITHOUT DATA")}
          </button>
        )}
        {!shipment.hasGoldResult && disposition !== "PENDING" && (
          <button
            type="button"
            className="secondary"
            disabled={reviewMutation.isPending}
            onClick={() => void changeDisposition("PENDING")}
          >
            {tr("VOLVER A PENDIENTE", "RETURN TO PENDING")}
          </button>
        )}
      </div>
      {confirmWithoutData && (
        <div className="gold-row-review-form">
          <label>
            <span>{tr("Motivo breve", "Brief reason")}</span>
            <input
              autoFocus
              maxLength={500}
              value={reviewReason}
              onChange={(event) => {
                setReviewReason(event.target.value);
                if (reviewMutation.isError) reviewMutation.reset();
              }}
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setConfirmWithoutData(false);
              setReviewReason("");
            }}
          >
            {tr("CANCELAR", "CANCEL")}
          </button>
          <button
            type="button"
            disabled={
              reviewReason.trim().length === 0 || reviewMutation.isPending
            }
            onClick={() =>
              void changeDisposition("OMITTED", reviewReason.trim())
            }
          >
            {tr("CONFIRMAR SIN DATO", "CONFIRM WITHOUT DATA")}
          </button>
        </div>
      )}
      {(reviewError !== null || feedback !== null) && (
        <p
          className={reviewError === null ? "form-success" : "form-error"}
          role={reviewError === null ? "status" : "alert"}
        >
          {reviewError ?? feedback}
        </p>
      )}
    </article>
  );
}

function GoldStatusBadge({
  status,
  disposition,
}: {
  status: GoldRowStatus;
  disposition: GoldReviewEntry["disposition"];
}) {
  const { tr } = useLanguage();
  const label =
    status === "REGISTERED"
      ? tr("Registrado", "Recorded")
      : status === "OMITTED"
        ? tr("Revisado sin datos", "Reviewed without data")
        : disposition === "ACKNOWLEDGED"
          ? tr("Pendiente · leído", "Pending · read")
          : tr("Pendiente", "Pending");
  return (
    <span className={`gold-review-status ${status.toLowerCase()}`}>
      {label}
    </span>
  );
}

function karatText(
  karat: number | null,
  locale: string,
  tr: (spanish: string, english: string) => string,
): string {
  return karat === null
    ? tr("Sin registrar", "Not recorded")
    : `${formatKarat(karat, locale)} k`;
}

function MercurySummary({ overview }: { overview: OverviewState }) {
  const { locale, tr } = useLanguage();
  if (overview.status === "loading") return <>…</>;
  if (overview.status === "error")
    return <>{tr("No disponible", "Unavailable")}</>;
  const mercury: GoldMercurySynthesis = overview.value?.mercury ?? {
    sweepCount: 0,
    completeSweepCount: 0,
    latestCompleteSweep: null,
  };
  if (mercury.sweepCount === 0) return <>{tr("Sin barridas", "No sweeps")}</>;
  const completeness = `${mercury.completeSweepCount} ${tr("de", "of")} ${mercury.sweepCount} ${tr("barridas completas", "complete sweeps")}`;
  if (mercury.latestCompleteSweep === null)
    return (
      <>
        {tr("Sin registrar", "Not recorded")}
        <small>{completeness}</small>
      </>
    );
  return (
    <>
      {tr("Entrada", "Input")}{" "}
      {formatGrams(mercury.latestCompleteSweep.inputGrams, locale)} g ·{" "}
      {tr("Final", "Final")}{" "}
      {formatGrams(mercury.latestCompleteSweep.remainderGrams, locale)} g
      <small>
        {tr("Última barrida completa", "Latest complete sweep")} ·{" "}
        {completeness}
      </small>
    </>
  );
}

function GoldEditor({
  shipment,
  disposition,
  close,
}: {
  shipment: ManagementShipment;
  disposition: GoldReviewEntry["disposition"];
  close(this: void): void;
}) {
  const { language, locale, tr } = useLanguage();
  const history = useGoldHistory(shipment.shipmentId);
  const sweeps = useManagementShipmentSweeps(shipment.shipmentId);
  const mutation = useRecordShipmentGold(shipment.shipmentId);
  const [amount, setAmount] = useState(
    shipment.goldAmountGrams === null ? "" : String(shipment.goldAmountGrams),
  );
  const [karat, setKarat] = useState(
    shipment.goldKarat === null ? "" : String(shipment.goldKarat),
  );
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [hasCurrentResult, setHasCurrentResult] = useState(
    shipment.hasGoldResult,
  );
  const parsed = parseAmount(amount);
  const parsedKarat = parseKarat(karat);
  const correction = hasCurrentResult;
  // El historial llega ordenado del más reciente al más antiguo: el primero es el
  // valor vigente. Solo las entradas anteriores aportan información adicional.
  const currentEntry = history.data?.[0];
  const currentGold =
    currentEntry?.amountGrams ??
    (shipment.hasGoldResult ? shipment.goldAmountGrams : null);
  const currentKarat =
    currentEntry === undefined ? shipment.goldKarat : currentEntry.karat;
  const previousEntries = history.data?.slice(1) ?? [];
  const formError =
    validation ??
    (mutation.isError ? mutationMessage(mutation.error, language) : null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(null);
    if (amount.trim().length === 0) {
      setValidation(
        tr(
          "Vacío conserva el cargamento como no registrado; ingrese un valor para guardar.",
          "An empty value keeps the shipment unrecorded; enter a value to save.",
        ),
      );
      return;
    }
    if (parsed === null) {
      setValidation(
        tr(
          "Use un entero o un número con máximo dos decimales.",
          "Use an integer or a number with up to two decimal places.",
        ),
      );
      return;
    }
    if (parsedKarat === undefined) {
      setValidation(
        tr(
          "El quilataje debe estar entre 0 y 24, con máximo tres decimales, o quedar vacío.",
          "Karat must be between 0 and 24 with up to three decimals, or be left empty.",
        ),
      );
      return;
    }
    if (correction && reason.trim().length === 0) {
      setValidation(
        tr(
          "Indique el motivo de la corrección.",
          "Enter the reason for the correction.",
        ),
      );
      return;
    }
    setValidation(null);
    try {
      // Cada entrada guarda el resultado completo: oro y quilataje (null = sin registrar).
      await mutation.mutateAsync({
        amountGrams: parsed,
        karat: parsedKarat,
        ...(correction ? { correctionReason: reason.trim() } : {}),
      });
      setHasCurrentResult(true);
      setSaved(
        correction
          ? tr(
              "Corrección registrada como una nueva entrada.",
              "Correction recorded as a new entry.",
            )
          : tr(
              "Resultado registrado correctamente.",
              "Result recorded successfully.",
            ),
      );
      setReason("");
    } catch {
      setSaved(null);
    }
  };

  return (
    <section
      className="gold-editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gold-editor-title"
      aria-describedby="gold-editor-description"
      onKeyDown={handleDialogKeyDown}
    >
      <header>
        <div>
          <p className="eyebrow">{tr("ORO Y MERCURIO", "GOLD AND MERCURY")}</p>
          <h2 id="gold-editor-title">
            {tr("Cargamento", "Shipment")}{" "}
            {shortShipmentId(shipment.shipmentId)}
          </h2>
          <p id="gold-editor-description">
            {shipment.productionLineName} · {shipment.supplierName}
          </p>
        </div>
        <button type="button" className="icon-button" onClick={close}>
          <span aria-hidden="true">×</span>
          <span className="visually-hidden">
            {tr("Cerrar registro del cargamento", "Close shipment record")}
          </span>
        </button>
      </header>

      <div className="gold-editor-section-heading">
        <div>
          <h3>{tr("Oro y quilataje", "Gold and karat")}</h3>
          <p>
            {tr(
              "Datos opcionales del cargamento completo.",
              "Optional values for the complete shipment.",
            )}
          </p>
        </div>
        <GoldStatusBadge
          status={
            hasCurrentResult
              ? "REGISTERED"
              : disposition === "OMITTED"
                ? "OMITTED"
                : "PENDING"
          }
          disposition={disposition}
        />
      </div>
      <div className="gold-current-values">
        <div className="gold-current-karat">
          <span>{tr("Oro vigente", "Current gold")}</span>
          <strong>
            {currentGold === null
              ? tr("Sin registrar", "Not recorded")
              : `${formatGrams(currentGold, locale)} g`}
          </strong>
          {currentGold !== null && (
            <small>
              {formatPalos(currentGold, locale)} {tr("palos", "palos")}
            </small>
          )}
        </div>
        <div className="gold-current-karat">
          <span>{tr("Quilataje vigente", "Current karat")}</span>
          <strong>{karatText(currentKarat, locale, tr)}</strong>
        </div>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          <span>{tr("Oro total en gramos", "Total gold in grams")}</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder={tr("Ej. 12,50", "E.g. 12.50")}
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setValidation(null);
              setSaved(null);
              if (mutation.isError) mutation.reset();
            }}
            aria-describedby={`gold-equivalence${formError !== null ? " gold-form-error" : ""}`}
            aria-invalid={formError !== null}
          />
        </label>
        <p id="gold-equivalence" className="gold-equivalence">
          {parsed === null
            ? tr(
                "1 palo = 0,10 g · equivalencia únicamente visual",
                "1 palo = 0.10 g · visual equivalence only",
              )
            : `${formatPalos(parsed, locale)} ${tr("palos equivalentes", "equivalent palos")} · ${tr("1 palo = 0,10 g", "1 palo = 0.10 g")}`}
        </p>
        <label>
          <span>{tr("Quilataje (opcional)", "Karat (optional)")}</span>
          <input
            inputMode="decimal"
            placeholder={tr(
              "Ej. 18,5 · vacío = sin registrar",
              "E.g. 18.5 · empty = not recorded",
            )}
            value={karat}
            onChange={(event) => {
              setKarat(event.target.value);
              setValidation(null);
              setSaved(null);
              if (mutation.isError) mutation.reset();
            }}
            aria-invalid={formError !== null}
          />
        </label>
        {correction && (
          <label>
            <span>
              {tr("Motivo de la corrección", "Reason for correction")}
            </span>
            <textarea
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setValidation(null);
                setSaved(null);
                if (mutation.isError) mutation.reset();
              }}
            />
          </label>
        )}
        {formError !== null && (
          <p id="gold-form-error" className="form-error" role="alert">
            {formError}
          </p>
        )}
        {saved !== null && (
          <p className="form-success" role="status">
            {saved}
          </p>
        )}
        <div className="gold-editor-actions">
          <button type="button" className="secondary" onClick={close}>
            {tr("CANCELAR", "CANCEL")}
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? tr("GUARDANDO…", "SAVING…")
              : correction
                ? tr("GUARDAR CORRECCIÓN", "SAVE CORRECTION")
                : tr("REGISTRAR RESULTADO", "RECORD RESULT")}
          </button>
        </div>
      </form>

      {/* El historial completo sigue en base de datos y auditoría; aquí solo se
          muestran las correcciones anteriores, sin repetir el valor vigente. */}
      {history.isError && (
        <p className="form-error">
          {tr(
            "No se pudo consultar el historial.",
            "History could not be loaded.",
          )}
        </p>
      )}
      {previousEntries.length > 0 && (
        <div className="gold-history">
          <h3>{tr("Correcciones anteriores", "Previous corrections")}</h3>
          {history.data?.[0]?.correctionReason != null && (
            <p>
              {tr("Motivo del valor vigente", "Reason for current value")}:{" "}
              {history.data[0].correctionReason}
            </p>
          )}
          <ol>
            {previousEntries.map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>
                    {formatGrams(entry.amountGrams, locale)} g ·{" "}
                    {karatText(entry.karat, locale, tr)}
                  </strong>
                </div>
                <p>
                  {entry.recordedByDisplayName} ·{" "}
                  {formatCostaRicaDateTime(entry.recordedAtUtc, language)}
                </p>
                {entry.correctionReason !== null && (
                  <p>
                    {tr("Motivo", "Reason")}: {entry.correctionReason}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      <MercuryEditor shipmentId={shipment.shipmentId} sweeps={sweeps} />
    </section>
  );
}

function MercuryEditor({
  shipmentId,
  sweeps,
}: {
  shipmentId: string;
  sweeps: ReturnType<typeof useManagementShipmentSweeps>;
}) {
  const { language, tr } = useLanguage();
  const groups = groupMercurySweeps(sweeps.data?.items ?? []);
  const [selectedSweepId, setSelectedSweepId] = useState("");
  const effectiveSweepId = groups.some(
    (group) => group.sweepId === selectedSweepId,
  )
    ? selectedSweepId
    : (groups[0]?.sweepId ?? "");

  return (
    <section className="mercury-management">
      <div className="gold-editor-section-heading">
        <div>
          <h3>{tr("Mercurio por barrida", "Mercury by sweep")}</h3>
          <p>
            {tr(
              "Revise los datos enviados por planta o complete los que hayan quedado pendientes.",
              "Review plant data or complete measurements that remain pending.",
            )}
          </p>
        </div>
      </div>
      {sweeps.isPending ? (
        <p role="status">{tr("Cargando barridas…", "Loading sweeps…")}</p>
      ) : sweeps.isError || sweeps.data === undefined ? (
        <p className="form-error">
          {tr(
            "No se pudo consultar el mercurio del cargamento.",
            "Shipment mercury data could not be loaded.",
          )}
        </p>
      ) : groups.length === 0 ? (
        <p className="gold-empty-note">
          {tr(
            "Este cargamento no tiene barridas registradas.",
            "This shipment has no recorded sweeps.",
          )}
        </p>
      ) : (
        <>
          <label className="mercury-sweep-select">
            <span>{tr("Barrida", "Sweep")}</span>
            <select
              value={effectiveSweepId}
              onChange={(event) => setSelectedSweepId(event.target.value)}
            >
              {groups.map((group, index) => (
                <option key={group.sweepId} value={group.sweepId}>
                  {tr("Barrida", "Sweep")} {index + 1} · {group.cajuelaCount}{" "}
                  {tr("cajuelas", "cajuelas")} ·{" "}
                  {formatCostaRicaDateTime(group.sweptAtUtc, language)}
                </option>
              ))}
            </select>
          </label>
          {groups.map((group) =>
            group.sweepId === effectiveSweepId ? (
              <MercurySweepForm
                key={group.sweepId}
                shipmentId={shipmentId}
                group={group}
              />
            ) : null,
          )}
        </>
      )}
    </section>
  );
}

interface MercurySweepGroup {
  sweepId: string;
  sweptAtUtc: string;
  cajuelaCount: number;
  components: ManagementSweepMercury[];
}

function MercurySweepForm({
  shipmentId,
  group,
}: {
  shipmentId: string;
  group: MercurySweepGroup;
}) {
  const { language, tr } = useLanguage();
  const mutation = useRecordSweepMercury(shipmentId, group.sweepId);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      group.components.flatMap((component) => [
        [
          `${component.lineComponentId}:input`,
          amountText(component.inputGrams),
        ],
        [
          `${component.lineComponentId}:remainder`,
          amountText(component.remainderGrams),
        ],
      ]),
    ),
  );
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const measurements = group.components.map((component) => ({
      lineComponentId: component.lineComponentId,
      inputGrams: parseOptionalAmount(
        values[`${component.lineComponentId}:input`] ?? "",
      ),
      remainderGrams: parseOptionalAmount(
        values[`${component.lineComponentId}:remainder`] ?? "",
      ),
    }));
    if (
      measurements.some(
        (measurement) =>
          measurement.inputGrams === null ||
          measurement.remainderGrams === null,
      )
    ) {
      setValidation(
        tr(
          "Use números positivos con máximo dos decimales o deje el campo vacío.",
          "Use positive numbers with up to two decimals or leave the field empty.",
        ),
      );
      return;
    }
    const validMeasurements = measurements.map((measurement) => ({
      lineComponentId: measurement.lineComponentId,
      ...(measurement.inputGrams === undefined
        ? {}
        : { inputGrams: measurement.inputGrams as number }),
      ...(measurement.remainderGrams === undefined
        ? {}
        : { remainderGrams: measurement.remainderGrams as number }),
    }));
    const changedExisting = group.components.some((component, index) => {
      const measurement = validMeasurements[index];
      return (
        (component.inputMovementId !== null &&
          measurement?.inputGrams !== undefined &&
          measurement.inputGrams !== component.inputGrams) ||
        (component.remainderMovementId !== null &&
          measurement?.remainderGrams !== undefined &&
          measurement.remainderGrams !== component.remainderGrams)
      );
    });
    if (changedExisting && reason.trim().length === 0) {
      setValidation(
        tr(
          "Indique el motivo para corregir un dato de mercurio existente.",
          "Enter a reason to correct existing mercury data.",
        ),
      );
      return;
    }
    setValidation(null);
    setSaved(false);
    try {
      await mutation.mutateAsync({
        measurements: validMeasurements,
        ...(reason.trim().length === 0
          ? {}
          : { correctionReason: reason.trim() }),
      });
      setReason("");
      setSaved(true);
    } catch {
      setSaved(false);
    }
  };

  return (
    <form
      className="mercury-sweep-form"
      onSubmit={(event) => void submit(event)}
    >
      <div className="mercury-component-grid">
        {group.components.map((component) => (
          <fieldset key={component.lineComponentId}>
            <legend>{component.lineComponentName}</legend>
            <label>
              <span>{tr("Mercurio de entrada (g)", "Input mercury (g)")}</span>
              <input
                inputMode="decimal"
                value={values[`${component.lineComponentId}:input`] ?? ""}
                placeholder={tr("Pendiente", "Pending")}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    [`${component.lineComponentId}:input`]: event.target.value,
                  }));
                  setValidation(null);
                  setSaved(false);
                }}
              />
            </label>
            <label>
              <span>{tr("Remanente final (g)", "Final remainder (g)")}</span>
              <input
                inputMode="decimal"
                value={values[`${component.lineComponentId}:remainder`] ?? ""}
                placeholder={tr("Pendiente", "Pending")}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    [`${component.lineComponentId}:remainder`]:
                      event.target.value,
                  }));
                  setValidation(null);
                  setSaved(false);
                }}
              />
            </label>
          </fieldset>
        ))}
      </div>
      <label>
        <span>{tr("Motivo de corrección", "Correction reason")}</span>
        <input
          value={reason}
          maxLength={500}
          placeholder={tr(
            "Solo es obligatorio al cambiar un dato existente",
            "Required only when changing existing data",
          )}
          onChange={(event) => {
            setReason(event.target.value);
            setValidation(null);
            setSaved(false);
          }}
        />
      </label>
      {validation !== null && <p className="form-error">{validation}</p>}
      {mutation.isError && (
        <p className="form-error">
          {mutationMessage(mutation.error, language)}
        </p>
      )}
      {saved && (
        <p className="form-success" role="status">
          {tr(
            "Mercurio guardado correctamente.",
            "Mercury saved successfully.",
          )}
        </p>
      )}
      <div className="gold-editor-actions">
        <button
          type="submit"
          className="primary-button"
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? tr("GUARDANDO…", "SAVING…")
            : tr("GUARDAR MERCURIO", "SAVE MERCURY")}
        </button>
      </div>
    </form>
  );
}

function groupMercurySweeps(
  items: readonly ManagementSweepMercury[],
): MercurySweepGroup[] {
  const groups = new Map<string, MercurySweepGroup>();
  for (const item of items) {
    const group = groups.get(item.sweepId);
    if (group === undefined)
      groups.set(item.sweepId, {
        sweepId: item.sweepId,
        sweptAtUtc: item.sweptAtUtc,
        cajuelaCount: item.cajuelaCount,
        components: [item],
      });
    else group.components.push(item);
  }
  return [...groups.values()]
    .sort((left, right) => left.sweptAtUtc.localeCompare(right.sweptAtUtc))
    .map((group) => ({
      ...group,
      components: [...group.components].sort(
        (left, right) => left.lineComponentOrder - right.lineComponentOrder,
      ),
    }));
}

function amountText(value: number | null): string {
  return value === null ? "" : String(value);
}

function parseOptionalAmount(value: string): number | null | undefined {
  if (value.trim().length === 0) return undefined;
  return parseAmount(value);
}

function GoldMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail !== undefined && <small>{detail}</small>}
    </article>
  );
}

function GoldState({
  title,
  children,
  error = false,
}: {
  title: string;
  children: string;
  error?: boolean;
}) {
  return (
    <div
      className={`gold-state${error ? " error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function GoldPagination({
  page,
  totalPages,
  searchParams,
  setSearchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: URLSearchParams;
  setSearchParams(this: void, params: URLSearchParams): void;
}) {
  const { tr } = useLanguage();
  const go = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage === 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  };
  return (
    <nav
      className="history-pagination"
      aria-label={tr("Páginas de oro", "Gold pages")}
    >
      <button
        type="button"
        className="secondary"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
      >
        {tr("← ANTERIOR", "← PREVIOUS")}
      </button>
      <span>
        {tr("Página", "Page")} {page} {tr("de", "of")} {Math.max(totalPages, 1)}
      </span>
      <button
        type="button"
        className="secondary"
        disabled={totalPages === 0 || page >= totalPages}
        onClick={() => go(page + 1)}
      >
        {tr("SIGUIENTE →", "NEXT →")}
      </button>
    </nav>
  );
}

function uniqueOptions(
  items: readonly ManagementShipment[],
  value: (item: ManagementShipment) => string,
  label: (item: ManagementShipment) => string,
): readonly { value: string; label: string }[] {
  return [...new Map(items.map((item) => [value(item), label(item)])).entries()]
    .map(([optionValue, optionLabel]) => ({
      value: optionValue,
      label: optionLabel,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "es"));
}

function reviewDisposition(
  shipmentId: string,
  acknowledgedShipmentIds: readonly string[],
  omittedShipmentIds: readonly string[],
): GoldReviewEntry["disposition"] {
  if (omittedShipmentIds.includes(shipmentId)) return "OMITTED";
  if (acknowledgedShipmentIds.includes(shipmentId)) return "ACKNOWLEDGED";
  return "PENDING";
}

const karatPattern = /^\d{1,2}(?:[.,]\d{1,3})?$/u;

// Vacío = sin registrar (null); undefined = valor inválido. Mismo contrato que el
// quilataje existente: 0 a 24 con hasta tres decimales.
function parseKarat(value: string): number | null | undefined {
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (!karatPattern.test(normalized)) return undefined;
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 24
    ? parsed
    : undefined;
}

function parseAmount(value: string): number | null {
  const normalized = value.trim();
  if (!decimalPattern.test(normalized)) return null;
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

// El contrato admite hasta tres decimales de quilataje.
function formatKarat(value: number, locale: string): string {
  return formatNumber(value, locale, 3);
}

function formatGrams(value: number, locale: string): string {
  return formatNumber(value, locale, 2);
}

function formatPalos(grams: number, locale: string): string {
  return formatNumber(grams * 10, locale, 2);
}

function formatNumber(
  value: number,
  locale: string,
  maximumFractionDigits = 2,
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function mutationMessage(error: Error, language: "es" | "en"): string {
  if (error instanceof ApiConnectionError)
    return requestErrorMessage(error, undefined, language);
  if (error instanceof ApiRequestError) {
    if (error.code === "GOLD_RESULT_CONFLICT")
      return language === "es"
        ? "El resultado cambió en otra sesión. Recargue antes de intentar nuevamente."
        : "The result changed in another session. Refresh before trying again.";
    if (error.code === "GOLD_AMOUNT_UNCHANGED")
      return language === "es"
        ? "La corrección debe cambiar el oro o el quilataje vigente."
        : "The correction must change the current gold or karat.";
    if (error.code === "GOLD_KARAT_INVALID")
      return language === "es"
        ? "El quilataje debe estar entre 0 y 24, con máximo tres decimales."
        : "Karat must be between 0 and 24 with up to three decimals.";
    if (error.code === "GOLD_CORRECTION_REASON_REQUIRED")
      return language === "es"
        ? "La corrección necesita un motivo."
        : "The correction requires a reason.";
  }
  return language === "es"
    ? "No se pudo guardar el resultado. Revise la conexión e intente nuevamente."
    : "The result could not be saved. Check the connection and try again.";
}
