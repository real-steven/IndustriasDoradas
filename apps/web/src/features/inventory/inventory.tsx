import type { ReactNode } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";

import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import type { ManagementFreshnessQuery } from "../management/management-operation-data";
import { formatCostaRicaDateTime } from "../management/management-shipments-data";
import {
  parseInventoryFilters,
  reminderDue,
  useInventoryMovements,
  useInventoryPlants,
  useInventoryReviews,
  useInventoryStock,
  useRastraComponentHistory,
  type InventoryFilters,
  type InventoryMovement,
  type InventoryView,
  type Page,
} from "./inventory-data";
import { InventoryCatalog } from "./inventory-catalog";
import { InventoryActions } from "./inventory-actions";
import {
  InventoryComponentActions,
  InventoryNovelties,
} from "./inventory-maintenance";

export function InventoryFeature() {
  const { language, tr } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseInventoryFilters(searchParams);
  const plants = useInventoryPlants();
  const freshness = useOutletContext<{ freshness: ManagementFreshnessQuery }>()
    .freshness;
  const plantId = filters.plantId ?? plants.data?.items[0]?.id ?? "";

  const update = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === undefined || value.length === 0) next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  };
  const changeView = (view: InventoryView) => {
    const next = new URLSearchParams(searchParams);
    if (view === "stock") next.delete("view");
    else next.set("view", view);
    next.delete("page");
    if (view !== "kardex") next.delete("item");
    if (view !== "components") next.delete("rastra");
    setSearchParams(next);
  };

  const cutoff =
    freshness.data?.effectiveAtUtc ?? freshness.data?.serverTimeUtc;

  return (
    <div className="inventory-feature">
      <section className="portal-panel inventory-controls">
        <header>
          <div>
            <h2>{tr("Consulta central", "Central query")}</h2>
            <p>
              {tr(
                "Los saldos y estados se reconstruyen desde hechos inmutables.",
                "Balances and states are reconstructed from immutable facts.",
              )}
            </p>
          </div>
          <span className="read-only-badge">
            {filters.view === "catalog" ||
            filters.view === "actions" ||
            filters.view === "components" ||
            filters.view === "novelties"
              ? tr("ACCIÓN AUDITADA", "AUDITED ACTION")
              : tr("SOLO CONSULTA", "READ ONLY")}
          </span>
        </header>
        <div className="inventory-filter-grid">
          <label>
            {tr("Planta", "Plant")}
            <select
              value={plantId}
              disabled={plants.isPending || plants.isError}
              onChange={(event) => update("plant", event.target.value)}
            >
              {(plants.data?.items ?? []).map((plant) => (
                <option key={plant.id} value={plant.id}>
                  {plant.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Buscar", "Search")}
            <input
              type="search"
              value={filters.search}
              placeholder={tr(
                "Artículo, rastra o novedad",
                "Item, rastra, or novelty",
              )}
              onChange={(event) => update("search", event.target.value)}
            />
          </label>
          <label>
            {tr("Revisión cada", "Review every")}
            <span className="inventory-days-input">
              <input
                type="number"
                min="1"
                max="3650"
                value={filters.reviewReminderDays}
                onChange={(event) => update("reviewDays", event.target.value)}
              />
              {tr("días", "days")}
            </span>
          </label>
          <label>
            {tr("Reemplazo cada", "Replace every")}
            <span className="inventory-days-input">
              <input
                type="number"
                min="1"
                max="3650"
                value={filters.replacementReminderDays}
                onChange={(event) =>
                  update("replacementDays", event.target.value)
                }
              />
              {tr("días", "days")}
            </span>
          </label>
        </div>
        <p className="inventory-cutoff">
          <strong>{tr("Fecha de corte:", "Cutoff time:")}</strong>{" "}
          {cutoff === undefined || cutoff === null
            ? tr("Pendiente de sincronización", "Pending synchronization")
            : formatCostaRicaDateTime(cutoff, language)}
          {freshness.isError &&
            ` · ${tr("no se pudo actualizar la frescura", "freshness could not be updated")}`}
        </p>
      </section>

      <nav className="inventory-tabs" aria-label={tr("Vistas", "Views")}>
        <Tab
          active={filters.view === "stock"}
          onClick={() => changeView("stock")}
        >
          {tr("Existencias", "Stock")}
        </Tab>
        <Tab
          active={filters.view === "kardex"}
          onClick={() => changeView("kardex")}
        >
          {tr("Kardex", "Ledger")}
        </Tab>
        <Tab
          active={filters.view === "reviews"}
          onClick={() => changeView("reviews")}
        >
          {tr("Diferencias", "Differences")}
        </Tab>
        <Tab
          active={filters.view === "components"}
          onClick={() => changeView("components")}
        >
          {tr("Componentes", "Components")}
        </Tab>
        <Tab
          active={filters.view === "novelties"}
          onClick={() => changeView("novelties")}
        >
          {tr("Novedades", "Novelties")}
        </Tab>
        <Tab
          active={filters.view === "catalog"}
          onClick={() => changeView("catalog")}
        >
          {tr("Catálogo", "Catalog")}
        </Tab>
        <Tab
          active={filters.view === "actions"}
          onClick={() => changeView("actions")}
        >
          {tr("Registrar", "Record")}
        </Tab>
      </nav>

      {plants.isError ? (
        <State
          error
          title={tr(
            "No se pudieron consultar las plantas",
            "Plants could not be loaded",
          )}
        >
          {requestErrorMessage(plants.error, undefined, language)}
        </State>
      ) : plantId.length === 0 ? (
        <State
          title={tr("No hay una planta activa", "There is no active plant")}
        >
          {tr(
            "Active una planta antes de consultar inventario.",
            "Activate a plant before reviewing inventory.",
          )}
        </State>
      ) : (
        <InventoryViewPanel
          filters={filters}
          plantId={plantId}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
        />
      )}
    </div>
  );
}

function InventoryViewPanel({
  filters,
  plantId,
  searchParams,
  setSearchParams,
}: {
  filters: InventoryFilters;
  plantId: string;
  searchParams: URLSearchParams;
  setSearchParams(this: void, value: URLSearchParams): void;
}) {
  if (filters.view === "actions") return <InventoryActions plantId={plantId} />;
  if (filters.view === "catalog") return <InventoryCatalog plantId={plantId} />;
  if (filters.view === "kardex")
    return (
      <Kardex
        filters={filters}
        plantId={plantId}
        searchParams={searchParams}
        setSearchParams={setSearchParams}
      />
    );
  if (filters.view === "reviews")
    return (
      <Reviews
        filters={filters}
        plantId={plantId}
        searchParams={searchParams}
        setSearchParams={setSearchParams}
      />
    );
  if (filters.view === "components")
    return (
      <Components
        filters={filters}
        plantId={plantId}
        searchParams={searchParams}
        setSearchParams={setSearchParams}
      />
    );
  if (filters.view === "novelties")
    return <InventoryNovelties plantId={plantId} filters={filters} />;
  return (
    <Stock
      filters={filters}
      plantId={plantId}
      searchParams={searchParams}
      setSearchParams={setSearchParams}
    />
  );
}

function Stock(props: ViewProps) {
  const { language, tr } = useLanguage();
  const query = useInventoryStock(props.filters, props.plantId);
  return (
    <QueryPanel
      query={query}
      title={tr("Existencias por artículo", "Stock by item")}
      empty={tr(
        "No hay artículos para estos filtros.",
        "No items match these filters.",
      )}
    >
      {(data) => (
        <>
          <div className="inventory-card-grid">
            {data.items.map((item) => {
              const due = reminderDue(
                item.latestReviewedAtUtc,
                item.firstMovementAtUtc,
                props.filters.reviewReminderDays,
              );
              return (
                <article
                  className="inventory-stock-card"
                  key={item.inventoryItemId}
                >
                  <header>
                    <div>
                      <span>{item.itemTypeName}</span>
                      <h3>{item.inventoryItemName}</h3>
                    </div>
                    {due && (
                      <span className="inventory-reminder">
                        {tr("REVISIÓN SUGERIDA", "REVIEW SUGGESTED")}
                      </span>
                    )}
                  </header>
                  <strong className="inventory-balance">
                    {quantity(item.balance, item.decimalPlaces, language)}{" "}
                    <small>{item.unitCode}</small>
                  </strong>
                  <dl>
                    <div>
                      <dt>{tr("Movimientos", "Movements")}</dt>
                      <dd>{item.movementCount}</dd>
                    </div>
                    <div>
                      <dt>{tr("Última revisión", "Latest review")}</dt>
                      <dd>
                        {item.latestReviewedAtUtc === null
                          ? tr("Sin revisión", "Not reviewed")
                          : formatCostaRicaDateTime(
                              item.latestReviewedAtUtc,
                              language,
                            )}
                      </dd>
                    </div>
                    <div>
                      <dt>{tr("Última diferencia", "Latest difference")}</dt>
                      <dd>
                        {item.latestDifferenceQuantity === null
                          ? "—"
                          : quantity(
                              item.latestDifferenceQuantity,
                              item.decimalPlaces,
                              language,
                            )}
                      </dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="secondary-link"
                    onClick={() =>
                      openDetail(props, "kardex", "item", item.inventoryItemId)
                    }
                  >
                    {tr("RECONSTRUIR KARDEX →", "RECONSTRUCT LEDGER →")}
                  </button>
                </article>
              );
            })}
          </div>
          <Pagination {...props} data={data} />
        </>
      )}
    </QueryPanel>
  );
}

function Kardex(props: ViewProps) {
  const { language, tr } = useLanguage();
  const query = useInventoryMovements(props.filters, props.plantId);
  if (props.filters.inventoryItemId === undefined)
    return (
      <State title={tr("Seleccione un artículo", "Select an item")}>
        {tr(
          "Abra un artículo desde Existencias para reconstruirlo desde su primer evento.",
          "Open an item from Stock to reconstruct it from its first event.",
        )}
      </State>
    );
  return (
    <QueryPanel
      query={query}
      title={tr("Kardex desde el primer evento", "Ledger from the first event")}
      empty={tr(
        "Este artículo todavía no tiene movimientos.",
        "This item has no movements yet.",
      )}
    >
      {(data) => (
        <>
          <ol className="inventory-timeline">
            {data.items.map((movement) => (
              <li key={movement.id}>
                <div>
                  <strong>
                    {movementLabel(movement.movementType, language)}
                  </strong>
                  <span>
                    {formatCostaRicaDateTime(movement.occurredAtUtc, language)}
                  </span>
                </div>
                <b
                  className={
                    movement.quantityDelta < 0 ? "negative" : "positive"
                  }
                >
                  {signed(movement.quantityDelta, language)}
                </b>
                <p>
                  {movement.reason ??
                    movement.destination ??
                    movement.notes ??
                    tr("Sin detalle adicional", "No additional detail")}
                </p>
              </li>
            ))}
          </ol>
          <Pagination {...props} data={data} />
        </>
      )}
    </QueryPanel>
  );
}

function Reviews(props: ViewProps) {
  const { language, tr } = useLanguage();
  const query = useInventoryReviews(props.filters, props.plantId);
  return (
    <QueryPanel
      query={query}
      title={tr("Revisiones físicas", "Physical reviews")}
      empty={tr(
        "No hay revisiones para estos filtros.",
        "No reviews match these filters.",
      )}
      action={
        <label className="inventory-check">
          <input
            type="checkbox"
            checked={props.filters.differencesOnly}
            onChange={(event) =>
              updateParam(
                props,
                "differences",
                event.target.checked ? "true" : undefined,
              )
            }
          />
          {tr("Solo diferencias", "Differences only")}
        </label>
      }
    >
      {(data) => (
        <>
          <div className="inventory-review-list">
            {data.items.map((line) => (
              <article key={`${line.reviewId}:${line.inventoryItemId}`}>
                <header>
                  <div>
                    <strong>{line.inventoryItemName}</strong>
                    <span>
                      {formatCostaRicaDateTime(line.reviewedAtUtc, language)} ·{" "}
                      {line.reviewedByDisplayName}
                    </span>
                  </div>
                  <span
                    className={
                      line.differenceQuantity === 0
                        ? "inventory-ok"
                        : "inventory-difference"
                    }
                  >
                    {line.differenceQuantity === 0
                      ? tr("SIN DIFERENCIAS", "NO DIFFERENCES")
                      : tr("CON DIFERENCIA", "WITH DIFFERENCE")}
                  </span>
                </header>
                <dl>
                  <div>
                    <dt>{tr("Esperado", "Expected")}</dt>
                    <dd>
                      {line.expectedQuantity} {line.unitCode}
                    </dd>
                  </div>
                  <div>
                    <dt>{tr("Contado", "Counted")}</dt>
                    <dd>
                      {line.countedQuantity} {line.unitCode}
                    </dd>
                  </div>
                  <div>
                    <dt>{tr("Diferencia", "Difference")}</dt>
                    <dd>
                      {signed(line.differenceQuantity, language)}{" "}
                      {line.unitCode}
                    </dd>
                  </div>
                </dl>
                {line.notes !== null && <p>{line.notes}</p>}
              </article>
            ))}
          </div>
          <Pagination {...props} data={data} />
        </>
      )}
    </QueryPanel>
  );
}

function Components(props: ViewProps) {
  const { language, tr } = useLanguage();
  const query = useRastraComponentHistory(props.filters, props.plantId);
  return (
    <div className="inventory-maintenance-stack">
      <InventoryComponentActions plantId={props.plantId} />
      <QueryPanel
        query={query}
        title={tr("Historial de componentes", "Component history")}
        empty={tr(
          "No hay cambios de componentes para estos filtros.",
          "No component changes match these filters.",
        )}
      >
        {(data) => (
          <>
            <ol className="inventory-timeline component-timeline">
              {data.items.map((change) => {
                const due =
                  change.isActiveInstallation &&
                  reminderDue(
                    null,
                    change.occurredAtUtc,
                    props.filters.replacementReminderDays,
                  );
                return (
                  <li key={change.id}>
                    <div>
                      <strong>
                        {change.rastraName} ·{" "}
                        {componentLabel(change.changeType, language)}
                      </strong>
                      <span>
                        {change.productionLineName} ·{" "}
                        {formatCostaRicaDateTime(
                          change.occurredAtUtc,
                          language,
                        )}
                      </span>
                    </div>
                    {due && (
                      <span className="inventory-reminder">
                        {tr("REEMPLAZO SUGERIDO", "REPLACEMENT SUGGESTED")}
                      </span>
                    )}
                    <p>
                      {change.inventoryItemName ??
                        change.reason ??
                        tr("Retiro registrado", "Removal recorded")}
                      {change.quantity === null
                        ? ""
                        : ` · ${change.quantity} ${change.unitCode ?? ""}`}
                    </p>
                    {props.filters.rastraId === undefined && (
                      <button
                        type="button"
                        className="secondary-link"
                        onClick={() =>
                          openDetail(
                            props,
                            "components",
                            "rastra",
                            change.rastraId,
                          )
                        }
                      >
                        {tr(
                          "VER RASTRA DESDE EL INICIO →",
                          "VIEW RASTRA FROM START →",
                        )}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
            <Pagination {...props} data={data} />
          </>
        )}
      </QueryPanel>
    </div>
  );
}

interface ViewProps {
  filters: InventoryFilters;
  plantId: string;
  searchParams: URLSearchParams;
  setSearchParams(this: void, value: URLSearchParams): void;
}

function QueryPanel<T>({
  query,
  title,
  empty,
  action,
  children,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    data?: Page<T>;
  };
  title: string;
  empty: string;
  action?: ReactNode;
  children: (data: Page<T>) => ReactNode;
}) {
  const { language, tr } = useLanguage();
  return (
    <section className="portal-panel inventory-results">
      <header>
        <div>
          <h2>{title}</h2>
          <p>
            {tr(
              "Orden cronológico y paginación conservados en la URL",
              "Chronological order and pagination are preserved in the URL",
            )}
          </p>
        </div>
        {action}
      </header>
      {query.isPending ? (
        <State title={tr("Consultando inventario", "Loading inventory")}>
          {tr("Espere un momento.", "Please wait.")}
        </State>
      ) : query.isError || query.data === undefined ? (
        <State
          error
          title={tr(
            "No se pudo consultar el inventario",
            "Inventory could not be loaded",
          )}
        >
          {requestErrorMessage(query.error, undefined, language)}
        </State>
      ) : query.data.items.length === 0 ? (
        <State title={empty}>
          {tr(
            "Cambie los filtros o registre el primer evento.",
            "Change the filters or record the first event.",
          )}
        </State>
      ) : (
        children(query.data)
      )}
    </section>
  );
}

function Pagination<T>(props: ViewProps & { data: Page<T> }) {
  const { tr } = useLanguage();
  const go = (page: number) =>
    updateParam(props, "page", page === 1 ? undefined : String(page));
  return (
    <nav
      className="history-pagination"
      aria-label={tr("Páginas de inventario", "Inventory pages")}
    >
      <button
        type="button"
        disabled={props.data.page <= 1}
        onClick={() => go(props.data.page - 1)}
      >
        {tr("← Anterior", "← Previous")}
      </button>
      <span>
        {tr("Página", "Page")} {props.data.page} {tr("de", "of")}{" "}
        {Math.max(props.data.totalPages, 1)}
      </span>
      <button
        type="button"
        disabled={props.data.page >= props.data.totalPages}
        onClick={() => go(props.data.page + 1)}
      >
        {tr("Siguiente →", "Next →")}
      </button>
    </nav>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function State({
  title,
  error = false,
  children,
}: {
  title: string;
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`shipment-state${error ? " error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
function updateParam(props: ViewProps, key: string, value?: string) {
  const next = new URLSearchParams(props.searchParams);
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  if (key !== "page") next.delete("page");
  props.setSearchParams(next);
}
function openDetail(
  props: ViewProps,
  view: InventoryView,
  key: "item" | "rastra",
  value: string,
) {
  const next = new URLSearchParams(props.searchParams);
  next.set("view", view);
  next.set(key, value);
  next.delete("page");
  props.setSearchParams(next);
}
function quantity(value: number, decimals: number, language: "es" | "en") {
  return value.toLocaleString(language === "es" ? "es-CR" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
function signed(value: number, language: "es" | "en") {
  return `${value > 0 ? "+" : ""}${value.toLocaleString(language === "es" ? "es-CR" : "en-US", { maximumFractionDigits: 3 })}`;
}
function movementLabel(
  type: InventoryMovement["movementType"],
  language: "es" | "en",
) {
  const labels = {
    ENTRY: ["Entrada", "Entry"],
    EXIT: ["Salida", "Exit"],
    CONSUMPTION: ["Consumo", "Consumption"],
    RETURN: ["Reintegro", "Return"],
    ADJUSTMENT: ["Ajuste", "Adjustment"],
    REVERSAL: ["Reverso", "Reversal"],
  } as const;
  return labels[type][language === "es" ? 0 : 1];
}
function componentLabel(
  type: "INSTALLATION" | "REMOVAL" | "REPLACEMENT",
  language: "es" | "en",
) {
  const labels = {
    INSTALLATION: ["Instalación", "Installation"],
    REMOVAL: ["Retiro", "Removal"],
    REPLACEMENT: ["Reemplazo", "Replacement"],
  } as const;
  return labels[type][language === "es" ? 0 : 1];
}
