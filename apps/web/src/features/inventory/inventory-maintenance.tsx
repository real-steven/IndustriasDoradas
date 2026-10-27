import { useState, type FormEvent } from "react";

import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import { formatCostaRicaDateTime } from "../management/management-shipments-data";
import {
  useCloseOperationalNovelty,
  useInventoryComponentTypes,
  useInventoryItems,
  useInventoryLineComponents,
  useInventoryLines,
  useInventoryUnits,
  useOpenOperationalNovelty,
  useOperationalNovelties,
  useOperationalNoveltyCategories,
  useRastraComponentOptions,
  useRecordRastraComponentChange,
  type InventoryFilters,
} from "./inventory-data";

export function InventoryComponentActions({ plantId }: { plantId: string }) {
  const { language, tr } = useLanguage();
  const lines = useInventoryLines(plantId, true);
  const componentTypes = useInventoryComponentTypes(true);
  const items = useInventoryItems(plantId, true);
  const units = useInventoryUnits(true);
  const [lineId, setLineId] = useState("");
  const selectedLineId = lineId || lines.data?.items[0]?.id || "";
  const components = useInventoryLineComponents(selectedLineId, true);
  const rastraTypeId = componentTypes.data?.find(
    (type) => type.code === "RASTRA",
  )?.id;
  const rastras = (components.data?.items ?? []).filter(
    (component) =>
      rastraTypeId === undefined || component.componentTypeId === rastraTypeId,
  );
  const [rastraId, setRastraId] = useState("");
  const selectedRastraId = rastraId || rastras[0]?.id || "";
  const history = useRastraComponentOptions(plantId, selectedRastraId, true);
  const activeInstallations = (history.data?.items ?? []).filter(
    (change) => change.isActiveInstallation,
  );
  const [kind, setKind] = useState<"INSTALLATION" | "REMOVAL" | "REPLACEMENT">(
    "INSTALLATION",
  );
  const [installationId, setInstallationId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [identifier, setIdentifier] = useState("");
  const [installedCondition, setInstalledCondition] = useState("");
  const [removedCondition, setRemovedCondition] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTimeNow);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useRecordRastraComponentChange(plantId);
  const catalogItems = items.data?.items ?? [];
  const selectedItemId = itemId || catalogItems[0]?.id || "";
  const selectedItem = catalogItems.find((item) => item.id === selectedItemId);
  const selectedUnit = units.data?.items.find(
    (unit) => unit.id === selectedItem?.unitId,
  );
  const selectedInstallationId =
    installationId || activeInstallations[0]?.installationId || "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSuccess(null);
    setFormError(null);
    if (selectedRastraId.length === 0) return;
    if (kind !== "INSTALLATION" && selectedInstallationId.length === 0) {
      setFormError(
        tr(
          "Seleccione una instalación activa para cerrar.",
          "Select an active installation to close.",
        ),
      );
      return;
    }
    if (
      kind !== "REMOVAL" &&
      (selectedItem === undefined ||
        selectedUnit === undefined ||
        Number(quantity) <= 0 ||
        installedCondition.trim().length === 0)
    ) {
      setFormError(
        tr(
          "Artículo, cantidad y condición instalada son obligatorios.",
          "Item, quantity, and installed condition are required.",
        ),
      );
      return;
    }
    if (
      kind !== "INSTALLATION" &&
      (removedCondition.trim().length === 0 || reason.trim().length === 0)
    ) {
      setFormError(
        tr(
          "La condición retirada y el motivo son obligatorios.",
          "Removed condition and reason are required.",
        ),
      );
      return;
    }

    try {
      const installing = kind !== "REMOVAL";
      await mutation.mutateAsync({
        rastraId: selectedRastraId,
        changeType: kind,
        installationId:
          kind === "REMOVAL" ? selectedInstallationId : crypto.randomUUID(),
        occurredAtUtc: new Date(occurredAt).toISOString(),
        ...(kind === "REPLACEMENT"
          ? { replacedInstallationId: selectedInstallationId }
          : {}),
        ...(installing &&
        selectedItem !== undefined &&
        selectedUnit !== undefined
          ? {
              inventoryItemId: selectedItem.id,
              unitId: selectedUnit.id,
              quantity: Number(quantity),
              installedCondition: installedCondition.trim(),
            }
          : {}),
        ...optional("componentIdentifier", identifier),
        ...optional("removedCondition", removedCondition),
        ...optional("reason", reason),
        ...(kind === "REMOVAL"
          ? optional("removalNotes", notes)
          : optional("installationNotes", notes)),
      });
      setIdentifier("");
      setInstalledCondition("");
      setRemovedCondition("");
      setReason("");
      setNotes("");
      setInstallationId("");
      setSuccess(
        tr(
          "Cambio registrado sin borrar la historia anterior.",
          "Change recorded without deleting earlier history.",
        ),
      );
    } catch {
      // React Query conserva el error y el formulario permanece disponible.
    }
  };

  const pending =
    lines.isPending ||
    componentTypes.isPending ||
    items.isPending ||
    units.isPending ||
    components.isPending ||
    history.isPending;
  const error =
    lines.error ??
    componentTypes.error ??
    items.error ??
    units.error ??
    components.error ??
    history.error ??
    mutation.error;

  return (
    <section className="portal-panel inventory-maintenance-form">
      <header>
        <div>
          <h2>
            {tr("Registrar cambio de componente", "Record component change")}
          </h2>
          <p>
            {tr(
              "Instalar no descuenta inventario; retiro y reemplazo conservan la instalación anterior.",
              "Installation does not consume inventory; removal and replacement retain prior history.",
            )}
          </p>
        </div>
        <span className="inventory-difference">
          {tr("AUDITADO", "AUDITED")}
        </span>
      </header>
      {pending ? (
        <p>{tr("Cargando catálogos…", "Loading catalogs…")}</p>
      ) : rastras.length === 0 ? (
        <div className="shipment-state">
          <strong>
            {tr("No hay rastras configuradas", "No rastras configured")}
          </strong>
          <p>
            {tr(
              "Primero configure la línea y sus rastras en catálogos.",
              "Configure the line and its rastras in catalogs first.",
            )}
          </p>
        </div>
      ) : (
        <form
          className="inventory-action-form"
          onSubmit={(event) => void submit(event)}
        >
          <div className="inventory-action-grid">
            <label>
              {tr("Línea", "Line")}
              <select
                value={selectedLineId}
                onChange={(event) => {
                  setLineId(event.target.value);
                  setRastraId("");
                  setInstallationId("");
                }}
              >
                {(lines.data?.items ?? []).map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Rastra", "Rastra")}
              <select
                value={selectedRastraId}
                onChange={(event) => {
                  setRastraId(event.target.value);
                  setInstallationId("");
                }}
              >
                {rastras.map((rastra) => (
                  <option key={rastra.id} value={rastra.id}>
                    {rastra.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Acción", "Action")}
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as typeof kind);
                  setInstallationId("");
                }}
              >
                <option value="INSTALLATION">
                  {tr("Instalar", "Install")}
                </option>
                <option value="REMOVAL">{tr("Retirar", "Remove")}</option>
                <option value="REPLACEMENT">
                  {tr("Reemplazar", "Replace")}
                </option>
              </select>
            </label>
            <label>
              {tr("Fecha y hora real", "Actual date and time")}
              <input
                required
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </label>
          </div>
          {kind !== "INSTALLATION" && (
            <label>
              {tr("Instalación activa", "Active installation")}
              <select
                required
                value={selectedInstallationId}
                onChange={(event) => setInstallationId(event.target.value)}
              >
                <option value="">{tr("Seleccione", "Select")}</option>
                {activeInstallations.map((change) => (
                  <option
                    key={change.installationId}
                    value={change.installationId}
                  >
                    {change.componentIdentifier ??
                      change.inventoryItemName ??
                      change.installationId}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind !== "REMOVAL" && (
            <>
              <label>
                {tr("Artículo del componente", "Component item")}
                <select
                  value={selectedItemId}
                  onChange={(event) => setItemId(event.target.value)}
                >
                  {catalogItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("Cantidad", "Quantity")}
                <span className="inventory-quantity-field">
                  <input
                    required
                    type="number"
                    min={decimalStep(selectedUnit?.decimalPlaces)}
                    step={decimalStep(selectedUnit?.decimalPlaces)}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                  <b>{selectedUnit?.code ?? "—"}</b>
                </span>
              </label>
              <label>
                {tr("Condición al instalar", "Condition at installation")}
                <input
                  required
                  maxLength={200}
                  value={installedCondition}
                  onChange={(event) =>
                    setInstalledCondition(event.target.value)
                  }
                />
              </label>
              <label>
                {tr(
                  "Identificador físico (opcional)",
                  "Physical identifier (optional)",
                )}
                <input
                  maxLength={120}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
              </label>
            </>
          )}
          {kind !== "INSTALLATION" && (
            <>
              <label>
                {tr("Condición al retirar", "Condition at removal")}
                <input
                  required
                  maxLength={200}
                  value={removedCondition}
                  onChange={(event) => setRemovedCondition(event.target.value)}
                />
              </label>
              <label>
                {tr("Motivo", "Reason")}
                <textarea
                  required
                  maxLength={500}
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            </>
          )}
          <label>
            {tr("Observación (opcional)", "Notes (optional)")}
            <textarea
              maxLength={500}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {formError !== null && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          {error !== null && error !== undefined && (
            <p className="form-error" role="alert">
              {requestErrorMessage(error, undefined, language)}
            </p>
          )}
          {success !== null && (
            <p className="form-success" role="status">
              {success}
            </p>
          )}
          <button
            type="submit"
            disabled={
              mutation.isPending ||
              (kind !== "INSTALLATION" && activeInstallations.length === 0)
            }
          >
            {mutation.isPending
              ? tr("GUARDANDO…", "SAVING…")
              : tr("REGISTRAR CAMBIO", "RECORD CHANGE")}
          </button>
        </form>
      )}
    </section>
  );
}

export function InventoryNovelties({
  plantId,
  filters,
}: {
  plantId: string;
  filters: InventoryFilters;
}) {
  const { language, tr } = useLanguage();
  const lines = useInventoryLines(plantId, true);
  const categories = useOperationalNoveltyCategories(true);
  const novelties = useOperationalNovelties(filters, plantId);
  const openNovelty = useOpenOperationalNovelty(plantId);
  const closeNovelty = useCloseOperationalNovelty(plantId);
  const [lineId, setLineId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTimeNow);
  const [closeAt, setCloseAt] = useState(localDateTimeNow);
  const [success, setSuccess] = useState<string | null>(null);
  const selectedCategoryId = categoryId || categories.data?.[0]?.id || "";
  const error =
    lines.error ??
    categories.error ??
    novelties.error ??
    openNovelty.error ??
    closeNovelty.error;

  const open = async (event: FormEvent) => {
    event.preventDefault();
    setSuccess(null);
    try {
      await openNovelty.mutateAsync({
        description: description.trim(),
        occurredAtUtc: new Date(occurredAt).toISOString(),
        ...(lineId.length === 0 ? {} : { lineId }),
        ...(selectedCategoryId.length === 0
          ? {}
          : { categoryId: selectedCategoryId }),
      });
      setDescription("");
      setSuccess(
        tr("Novedad abierta y auditada.", "Novelty opened and audited."),
      );
    } catch {
      // El error se presenta debajo sin borrar los datos capturados.
    }
  };
  const close = async (noveltyId: string) => {
    setSuccess(null);
    try {
      await closeNovelty.mutateAsync({
        noveltyId,
        occurredAtUtc: new Date(closeAt).toISOString(),
      });
      setSuccess(
        tr(
          "Novedad cerrada; la apertura permanece visible.",
          "Novelty closed; its opening remains visible.",
        ),
      );
    } catch {
      // React Query conserva el error.
    }
  };

  return (
    <div className="inventory-maintenance-stack">
      <section className="portal-panel inventory-maintenance-form">
        <header>
          <div>
            <h2>{tr("Abrir novedad operativa", "Open operational novelty")}</h2>
            <p>
              {tr(
                "Explica un período de planta o línea; no crea una orden de trabajo.",
                "Explains a plant or line period; it does not create a work order.",
              )}
            </p>
          </div>
          <span className="inventory-difference">
            {tr("AUDITADO", "AUDITED")}
          </span>
        </header>
        <form
          className="inventory-action-form"
          onSubmit={(event) => void open(event)}
        >
          <div className="inventory-action-grid">
            <label>
              {tr("Tipo", "Type")}
              <select
                value={selectedCategoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {(categories.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Alcance", "Scope")}
              <select
                value={lineId}
                onChange={(event) => setLineId(event.target.value)}
              >
                <option value="">{tr("Toda la planta", "Entire plant")}</option>
                {(lines.data?.items ?? []).map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Inicio real", "Actual start")}
              <input
                required
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </label>
          </div>
          <label>
            {tr("Descripción", "Description")}
            <textarea
              required
              minLength={1}
              maxLength={500}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={openNovelty.isPending || description.trim().length === 0}
          >
            {openNovelty.isPending
              ? tr("GUARDANDO…", "SAVING…")
              : tr("ABRIR NOVEDAD", "OPEN NOVELTY")}
          </button>
        </form>
      </section>

      <section className="portal-panel inventory-results">
        <header>
          <div>
            <h2>{tr("Historial de novedades", "Novelty history")}</h2>
            <p>
              {tr(
                "Aperturas y cierres se conservan como hechos separados.",
                "Openings and closures remain separate facts.",
              )}
            </p>
          </div>
          <label className="inventory-inline-date">
            {tr("Hora de cierre", "Closure time")}
            <input
              type="datetime-local"
              value={closeAt}
              onChange={(event) => setCloseAt(event.target.value)}
            />
          </label>
        </header>
        {(lines.isPending || categories.isPending || novelties.isPending) && (
          <p>{tr("Cargando novedades…", "Loading novelties…")}</p>
        )}
        {error !== null && error !== undefined && (
          <p className="form-error" role="alert">
            {requestErrorMessage(error, undefined, language)}
          </p>
        )}
        {success !== null && (
          <p className="form-success" role="status">
            {success}
          </p>
        )}
        {novelties.data?.items.length === 0 && (
          <div className="shipment-state">
            <strong>
              {tr("No hay novedades registradas", "No novelties recorded")}
            </strong>
          </div>
        )}
        <ol className="inventory-timeline novelty-timeline">
          {(novelties.data?.items ?? []).map((novelty) => (
            <li key={novelty.noveltyId}>
              <div>
                <strong>
                  {novelty.categoryName ?? tr("Sin tipo", "No type")}
                </strong>
                <span>
                  {novelty.lineName ?? tr("Toda la planta", "Entire plant")}
                </span>
              </div>
              <p>{novelty.description}</p>
              <small>
                {formatCostaRicaDateTime(novelty.openedAtUtc, language)} ·{" "}
                {novelty.openedByDisplayName}
                {novelty.closedAtUtc === null
                  ? ` · ${tr("abierta", "open")}`
                  : ` → ${formatCostaRicaDateTime(novelty.closedAtUtc, language)} · ${novelty.durationMinutes ?? 0} min`}
              </small>
              {novelty.isOpen && (
                <button
                  type="button"
                  disabled={closeNovelty.isPending}
                  onClick={() => void close(novelty.noveltyId)}
                >
                  {tr("CERRAR NOVEDAD", "CLOSE NOVELTY")}
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function optional<Key extends string>(
  key: Key,
  value: string,
): Partial<Record<Key, string>> {
  const trimmed = value.trim();
  return trimmed.length === 0
    ? {}
    : ({ [key]: trimmed } as Record<Key, string>);
}

function decimalStep(decimalPlaces?: number): string {
  if (decimalPlaces === undefined || decimalPlaces === 0) return "1";
  return `0.${"0".repeat(decimalPlaces - 1)}1`;
}

function localDateTimeNow(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
