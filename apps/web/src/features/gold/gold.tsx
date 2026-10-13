import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { ManagementShipment } from "../../api/generated/api-client";
import { useSearchParams } from "react-router-dom";

import {
  useGoldHistory,
  useGoldSummary,
  useRecordShipmentGold,
} from "./gold-data";
import { ApiRequestError } from "../../api/http";
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
            <h2>Cargamentos cerrados</h2>
            <p>Un único resultado vigente por cargamento</p>
          </div>
          {shipments.data !== undefined && (
            <span className="history-total">
              {shipments.data.total} cargamento
              {shipments.data.total === 1 ? "" : "s"}
            </span>
          )}
        </header>
        {shipments.isPending ? (
          <GoldState title="Consultando cargamentos">
            Espere mientras se carga la proyección central.
          </GoldState>
        ) : shipments.isError || shipments.data === undefined ? (
          <GoldState title="No se pudieron consultar los cargamentos" error>
            Revise la conexión e intente nuevamente.
          </GoldState>
        ) : shipments.data.items.length === 0 ? (
          <GoldState title="No hay cargamentos para estos filtros">
            Vacío significa que no existe un cargamento cerrado en el período,
            no que el resultado sea cero.
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
  if (query.isPending)
    return (
      <section className="gold-summary-grid" aria-label="Resumen de oro">
        <GoldMetric label="Resultados" value="…" />
        <GoldMetric label="Cobertura" value="…" />
        <GoldMetric label="Total registrado" value="…" />
        <GoldMetric label="Oro por cajuela" value="…" />
      </section>
    );
  if (query.isError || query.data === undefined)
    return (
      <GoldState title="No se pudo calcular el resumen" error>
        Los cargamentos permanecen disponibles; reintente la consulta central.
      </GoldState>
    );

  return (
    <>
      <section className="gold-summary-grid" aria-label="Resumen de oro">
        <GoldMetric
          label="Resultados"
          value={String(query.data.registeredShipments)}
          detail={`${query.data.excludedShipments} excluidos sin registro`}
        />
        <GoldMetric
          label="Cobertura"
          value={`${formatNumber(query.data.coveragePercentage)} %`}
          detail={`${query.data.registeredShipments} / ${query.data.totalShipments} cargamentos`}
        />
        <GoldMetric
          label="Total registrado"
          value={`${formatGrams(query.data.totalGoldGrams)} g`}
          detail={`${formatPalos(query.data.totalGoldGrams)} palos equivalentes`}
        />
        <GoldMetric
          label="Oro por cajuela"
          value={
            query.data.gramsPerCajuela === null
              ? "Sin datos"
              : `${formatNumber(query.data.gramsPerCajuela, 4)} g`
          }
          detail={`${query.data.includedCajuelas} cajuelas incluidas`}
        />
      </section>
      <section className="portal-panel supplier-coverage">
        <header>
          <div>
            <h2>Comparación por proveedor</h2>
            <p>Solo los cargamentos registrados aportan oro y cajuelas</p>
          </div>
        </header>
        {query.data.suppliers.length === 0 ? (
          <GoldState title="Sin proveedores para comparar">
            Cambie el período para ampliar la consulta.
          </GoldState>
        ) : (
          <div
            className="table-scroll"
            role="region"
            aria-label="Comparación de oro por proveedor"
            tabIndex={0}
          >
            <table>
              <caption className="visually-hidden">
                Cobertura y resultados de oro agrupados por proveedor
              </caption>
              <thead>
                <tr>
                  <th scope="col">Proveedor</th>
                  <th scope="col">Cobertura</th>
                  <th scope="col">Excluidos</th>
                  <th scope="col">Oro</th>
                  <th scope="col">g / cajuela</th>
                </tr>
              </thead>
              <tbody>
                {query.data.suppliers.map((supplier) => (
                  <tr key={supplier.supplierId}>
                    <th scope="row">{supplier.supplierName}</th>
                    <td data-label="Cobertura">
                      {supplier.registeredShipments}/{supplier.totalShipments} (
                      {formatNumber(supplier.coveragePercentage)} %)
                    </td>
                    <td data-label="Excluidos">{supplier.excludedShipments}</td>
                    <td data-label="Oro">
                      {formatGrams(supplier.totalGoldGrams)} g
                    </td>
                    <td data-label="g / cajuela">
                      {supplier.gramsPerCajuela === null
                        ? "Sin datos"
                        : formatNumber(supplier.gramsPerCajuela, 4)}
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
  return (
    <section className="portal-panel gold-filters">
      <div className="gold-filter-grid">
        <label>
          <span>Período</span>
          <select
            value={filters.period}
            onChange={(event) => update("period", event.target.value)}
          >
            <option value="current">Esta semana</option>
            <option value="previous">Semana anterior</option>
            <option value="date">Fecha específica</option>
          </select>
        </label>
        {filters.period === "date" && (
          <label>
            <span>Fecha</span>
            <input
              type="date"
              value={filters.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </label>
        )}
        <FilterSelect
          label="Línea"
          value={filters.productionLineId ?? ""}
          values={uniqueOptions(
            items,
            (item) => item.productionLineId,
            (item) => item.productionLineName,
          )}
          onChange={(value) => update("line", value)}
        />
        <FilterSelect
          label="Proveedor"
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
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos</option>
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
  return (
    <article className="gold-shipment-row">
      <div>
        <span>CARGAMENTO {shortShipmentId(shipment.shipmentId)}</span>
        <h3>{shipment.productionLineName}</h3>
        <p>
          {shipment.supplierName} · Cerrado{" "}
          {formatCostaRicaDateTime(shipment.completedAtUtc)}
        </p>
      </div>
      <div className="gold-current-value">
        {shipment.hasGoldResult && shipment.goldAmountGrams !== null ? (
          <>
            <strong>{formatGrams(shipment.goldAmountGrams)} g</strong>
            <small>{formatPalos(shipment.goldAmountGrams)} palos</small>
          </>
        ) : (
          <>
            <strong>Pendiente</strong>
            <small>No registrado</small>
          </>
        )}
      </div>
      <dl>
        <div>
          <dt>Cajuelas</dt>
          <dd>{shipment.cajuelaTotal}</dd>
        </div>
        <div>
          <dt>Revisiones</dt>
          <dd>{shipment.goldRevisionCount ?? 0}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="primary-button"
        onClick={(event) => open(event.currentTarget)}
      >
        {shipment.hasGoldResult ? "CORREGIR RESULTADO" : "REGISTRAR ORO"}
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
    validation ?? (mutation.isError ? mutationMessage(mutation.error) : null);

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
        "Vacío conserva el cargamento como no registrado; ingrese un valor para guardar.",
      );
      return;
    }
    if (parsed === null) {
      setValidation("Use un entero o un número con máximo dos decimales.");
      return;
    }
    if (correction && reason.trim().length === 0) {
      setValidation("Indique el motivo de la corrección.");
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
          ? "Corrección registrada como una nueva entrada."
          : "Resultado registrado correctamente.",
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
          <p className="eyebrow">RESULTADO TOTAL</p>
          <h2 id="gold-editor-title">
            Cargamento {shortShipmentId(shipment.shipmentId)}
          </h2>
          <p id="gold-editor-description">
            {shipment.productionLineName} · {shipment.supplierName}
          </p>
        </div>
        <button type="button" className="icon-button" onClick={close}>
          <span aria-hidden="true">×</span>
          <span className="visually-hidden">Cerrar registro de oro</span>
        </button>
      </header>

      <form onSubmit={(event) => void submit(event)}>
        <label>
          <span>Oro total en gramos</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder="Ej. 12,50"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-describedby={`gold-equivalence${formError !== null ? " gold-form-error" : ""}`}
            aria-invalid={formError !== null}
          />
        </label>
        <p id="gold-equivalence" className="gold-equivalence">
          {parsed === null
            ? "1 palo = 0,10 g · equivalencia únicamente visual"
            : `${formatPalos(parsed)} palos equivalentes · 1 palo = 0,10 g`}
        </p>
        {correction && (
          <label>
            <span>Motivo de la corrección</span>
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
            CANCELAR
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? "GUARDANDO…"
              : correction
                ? "GUARDAR CORRECCIÓN"
                : "REGISTRAR RESULTADO"}
          </button>
        </div>
      </form>

      <div className="gold-history">
        <h3>Historial append-only</h3>
        {history.isPending ? (
          <p>Cargando historial…</p>
        ) : history.isError || history.data === undefined ? (
          <p className="form-error">No se pudo consultar el historial.</p>
        ) : history.data.length === 0 ? (
          <p>Aún no existe una entrada para este cargamento.</p>
        ) : (
          <ol>
            {history.data.map((entry, index) => (
              <li key={entry.id}>
                <div>
                  <strong>{formatGrams(entry.amountGrams)} g</strong>
                  {index === 0 && <span>VIGENTE</span>}
                </div>
                <p>
                  {entry.recordedByDisplayName} ·{" "}
                  {formatCostaRicaDateTime(entry.recordedAtUtc)}
                </p>
                {entry.correctionReason !== null && (
                  <p>Motivo: {entry.correctionReason}</p>
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
  const go = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage === 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  };
  return (
    <nav className="history-pagination" aria-label="Páginas de oro">
      <button
        type="button"
        className="secondary"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
      >
        ← ANTERIOR
      </button>
      <span>
        Página {page} de {Math.max(totalPages, 1)}
      </span>
      <button
        type="button"
        className="secondary"
        disabled={totalPages === 0 || page >= totalPages}
        onClick={() => go(page + 1)}
      >
        SIGUIENTE →
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

function formatGrams(value: number): string {
  return formatNumber(value, 2);
}

function formatPalos(grams: number): string {
  return formatNumber(grams * 10, 2);
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("es-CR", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function mutationMessage(error: Error): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "GOLD_RESULT_CONFLICT")
      return "El resultado cambió en otra sesión. Recargue antes de intentar nuevamente.";
    if (error.code === "GOLD_AMOUNT_UNCHANGED")
      return "El valor corregido debe ser diferente del resultado vigente.";
    if (error.code === "GOLD_CORRECTION_REASON_REQUIRED")
      return "La corrección necesita un motivo.";
  }
  return "No se pudo guardar el resultado. Revise la conexión e intente nuevamente.";
}
