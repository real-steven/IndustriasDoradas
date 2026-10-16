import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { ManagementShipment } from "../../api/generated/api-client";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../i18n/language-context";

import {
  useGoldHistory,
  useGoldSummary,
  useRecordShipmentGold,
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
    if (key === "period" && value !== "date") next.delete("date");
    if (key === "period" && value === "date" && !next.has("date"))
      next.set("date", filters.date);
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
          <GoldEditor shipment={selected} close={closeEditor} />
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
        <GoldMetric label={tr("Resultados", "Results")} value="…" />
        <GoldMetric label={tr("Cobertura", "Coverage")} value="…" />
        <GoldMetric
          label={tr("Total registrado", "Recorded total")}
          value="…"
        />
        <GoldMetric
          label={tr("Oro por cajuela", "Gold per cajuela")}
          value="…"
        />
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
    <>
      <section
        className="gold-summary-grid"
        aria-label={tr("Resumen de oro", "Gold summary")}
      >
        <GoldMetric
          label={tr("Resultados", "Results")}
          value={String(query.data.registeredShipments)}
          detail={`${query.data.excludedShipments} ${tr("excluidos sin registro", "excluded without a record")}`}
        />
        <GoldMetric
          label={tr("Cobertura", "Coverage")}
          value={`${formatNumber(query.data.coveragePercentage, locale)} %`}
          detail={`${query.data.registeredShipments} / ${query.data.totalShipments} ${tr("cargamentos", "shipments")}`}
        />
        <GoldMetric
          label={tr("Total registrado", "Recorded total")}
          value={`${formatGrams(query.data.totalGoldGrams, locale)} g`}
          detail={`${formatPalos(query.data.totalGoldGrams, locale)} ${tr("palos equivalentes", "equivalent palos")}`}
        />
        <GoldMetric
          label={tr("Oro por cajuela", "Gold per cajuela")}
          value={
            query.data.gramsPerCajuela === null
              ? tr("Sin datos", "No data")
              : `${formatNumber(query.data.gramsPerCajuela, locale, 4)} g`
          }
          detail={`${query.data.includedCajuelas} ${tr("cajuelas incluidas", "included cajuelas")}`}
        />
      </section>
      <section className="portal-panel supplier-coverage">
        <header>
          <div>
            <h2>{tr("Comparación por proveedor", "Supplier comparison")}</h2>
            <p>
              {tr(
                "Solo los cargamentos registrados aportan oro y cajuelas",
                "Only recorded shipments contribute gold and cajuelas",
              )}
            </p>
          </div>
        </header>
        {query.data.suppliers.length === 0 ? (
          <GoldState
            title={tr(
              "Sin proveedores para comparar",
              "No suppliers to compare",
            )}
          >
            {tr(
              "Cambie el período para ampliar la consulta.",
              "Change the period to broaden the query.",
            )}
          </GoldState>
        ) : (
          <div
            className="table-scroll"
            role="region"
            aria-label={tr(
              "Comparación de oro por proveedor",
              "Gold comparison by supplier",
            )}
            tabIndex={0}
          >
            <table>
              <caption className="visually-hidden">
                {tr(
                  "Cobertura y resultados de oro agrupados por proveedor",
                  "Gold coverage and results grouped by supplier",
                )}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{tr("Proveedor", "Supplier")}</th>
                  <th scope="col">{tr("Cobertura", "Coverage")}</th>
                  <th scope="col">{tr("Excluidos", "Excluded")}</th>
                  <th scope="col">{tr("Oro", "Gold")}</th>
                  <th scope="col">g / cajuela</th>
                </tr>
              </thead>
              <tbody>
                {query.data.suppliers.map((supplier) => (
                  <tr key={supplier.supplierId}>
                    <th scope="row">{supplier.supplierName}</th>
                    <td data-label={tr("Cobertura", "Coverage")}>
                      {supplier.registeredShipments}/{supplier.totalShipments} (
                      {formatNumber(supplier.coveragePercentage, locale)} %)
                    </td>
                    <td data-label={tr("Excluidos", "Excluded")}>
                      {supplier.excludedShipments}
                    </td>
                    <td data-label={tr("Oro", "Gold")}>
                      {formatGrams(supplier.totalGoldGrams, locale)} g
                    </td>
                    <td data-label="g / cajuela">
                      {supplier.gramsPerCajuela === null
                        ? tr("Sin datos", "No data")
                        : formatNumber(supplier.gramsPerCajuela, locale, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
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
            <option value="date">
              {tr("Fecha específica", "Specific date")}
            </option>
          </select>
        </label>
        {filters.period === "date" && (
          <label>
            <span>{tr("Fecha", "Date")}</span>
            <input
              type="date"
              value={filters.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </label>
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

function GoldShipmentRow({
  shipment,
  open,
}: {
  shipment: ManagementShipment;
  open(this: void, trigger: HTMLButtonElement): void;
}) {
  const { language, locale, tr } = useLanguage();

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
      </div>
      <div className="gold-current-value">
        {shipment.hasGoldResult && shipment.goldAmountGrams !== null ? (
          <>
            <strong>{formatGrams(shipment.goldAmountGrams, locale)} g</strong>
            <small>
              {formatPalos(shipment.goldAmountGrams, locale)}{" "}
              {tr("palos", "palos")}
            </small>
          </>
        ) : (
          <>
            <strong>{tr("Pendiente", "Pending")}</strong>
            <small>{tr("No registrado", "Not recorded")}</small>
          </>
        )}
      </div>
      <dl>
        <div>
          <dt>{tr("Cajuelas", "Cajuelas")}</dt>
          <dd>{shipment.cajuelaTotal}</dd>
        </div>
        <div>
          <dt>{tr("Revisiones", "Revisions")}</dt>
          <dd>{shipment.goldRevisionCount ?? 0}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="primary-button"
        onClick={(event) => open(event.currentTarget)}
      >
        {shipment.hasGoldResult
          ? tr("CORREGIR RESULTADO", "CORRECT RESULT")
          : tr("REGISTRAR ORO", "RECORD GOLD")}
      </button>
    </article>
  );
}

function GoldEditor({
  shipment,
  close,
}: {
  shipment: ManagementShipment;
  close(this: void): void;
}) {
  const { language, locale, tr } = useLanguage();
  const history = useGoldHistory(shipment.shipmentId);
  const mutation = useRecordShipmentGold(shipment.shipmentId);
  const [amount, setAmount] = useState(
    shipment.goldAmountGrams === null ? "" : String(shipment.goldAmountGrams),
  );
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const parsed = parseAmount(amount);
  const correction = shipment.hasGoldResult || mutation.data !== undefined;
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
      await mutation.mutateAsync({
        amountGrams: parsed,
        ...(correction ? { correctionReason: reason.trim() } : {}),
      });
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
          <p className="eyebrow">{tr("RESULTADO TOTAL", "TOTAL RESULT")}</p>
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
            {tr("Cerrar registro de oro", "Close gold record")}
          </span>
        </button>
      </header>

      <form onSubmit={(event) => void submit(event)}>
        <label>
          <span>{tr("Oro total en gramos", "Total gold in grams")}</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder={tr("Ej. 12,50", "E.g. 12.50")}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
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
        {correction && (
          <label>
            <span>
              {tr("Motivo de la corrección", "Reason for correction")}
            </span>
            <textarea
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
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

      <div className="gold-history">
        <h3>{tr("Historial append-only", "Append-only history")}</h3>
        {history.isPending ? (
          <p>{tr("Cargando historial…", "Loading history…")}</p>
        ) : history.isError || history.data === undefined ? (
          <p className="form-error">
            {tr(
              "No se pudo consultar el historial.",
              "History could not be loaded.",
            )}
          </p>
        ) : history.data.length === 0 ? (
          <p>
            {tr(
              "Aún no existe una entrada para este cargamento.",
              "There is no entry for this shipment yet.",
            )}
          </p>
        ) : (
          <ol>
            {history.data.map((entry, index) => (
              <li key={entry.id}>
                <div>
                  <strong>{formatGrams(entry.amountGrams, locale)} g</strong>
                  {index === 0 && <span>{tr("VIGENTE", "CURRENT")}</span>}
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
        )}
      </div>
    </section>
  );
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

function parseAmount(value: string): number | null {
  const normalized = value.trim();
  if (!decimalPattern.test(normalized)) return null;
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
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
        ? "El valor corregido debe ser diferente del resultado vigente."
        : "The corrected value must differ from the current result.";
    if (error.code === "GOLD_CORRECTION_REASON_REQUIRED")
      return language === "es"
        ? "La corrección necesita un motivo."
        : "The correction requires a reason.";
  }
  return language === "es"
    ? "No se pudo guardar el resultado. Revise la conexión e intente nuevamente."
    : "The result could not be saved. Check the connection and try again.";
}
