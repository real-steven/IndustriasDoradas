import { useMemo, useState, type FormEvent } from "react";

import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import { formatCostaRicaDateTime } from "../management/management-shipments-data";
import {
  useInventoryActionMovements,
  useInventoryActionStock,
  useInventoryItems,
  useInventoryUnits,
  useRecordInventoryAdjustment,
  useRecordInventoryMovement,
  useRecordInventoryReview,
  useReverseInventoryMovement,
  type InventoryMovement,
} from "./inventory-data";

type ActionKind =
  | "ENTRY"
  | "EXIT"
  | "CONSUMPTION"
  | "RETURN"
  | "ADJUSTMENT"
  | "REVERSAL"
  | "REVIEW";

export function InventoryActions({ plantId }: { plantId: string }) {
  const { language, tr } = useLanguage();
  const items = useInventoryItems(plantId, true);
  const units = useInventoryUnits(true);
  const stock = useInventoryActionStock(plantId, true);
  const [itemId, setItemId] = useState("");
  const [kind, setKind] = useState<ActionKind>("ENTRY");
  const [quantity, setQuantity] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTimeNow);
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [relatedMovementId, setRelatedMovementId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const catalogItems = items.data?.items ?? [];
  const selectedItemId = itemId || catalogItems[0]?.id || "";
  const selectedItem = catalogItems.find((item) => item.id === selectedItemId);
  const selectedStock = stock.data?.items.find(
    (entry) => entry.inventoryItemId === selectedItemId,
  );
  const selectedUnit = units.data?.items.find(
    (unit) => unit.id === selectedItem?.unitId,
  );
  const movements = useInventoryActionMovements(
    plantId,
    selectedItemId,
    selectedItemId.length > 0,
  );
  const reversedIds = useMemo(
    () =>
      new Set(
        (movements.data?.items ?? [])
          .filter((movement) => movement.movementType === "REVERSAL")
          .map((movement) => movement.relatedMovementId)
          .filter((id): id is string => id !== null),
      ),
    [movements.data?.items],
  );
  const returnable = (movements.data?.items ?? []).filter(
    (movement) => movement.movementType === "EXIT",
  );
  const reversible = (movements.data?.items ?? []).filter(
    (movement) =>
      movement.movementType !== "REVERSAL" && !reversedIds.has(movement.id),
  );

  const recordMovement = useRecordInventoryMovement(plantId);
  const recordAdjustment = useRecordInventoryAdjustment(plantId);
  const reverseMovement = useReverseInventoryMovement(plantId);
  const recordReview = useRecordInventoryReview(plantId);
  const pending =
    recordMovement.isPending ||
    recordAdjustment.isPending ||
    reverseMovement.isPending ||
    recordReview.isPending;
  const requestError =
    recordMovement.error ??
    recordAdjustment.error ??
    reverseMovement.error ??
    recordReview.error;

  const resetFeedback = () => {
    setFormError(null);
    setSuccess(null);
    recordMovement.reset();
    recordAdjustment.reset();
    reverseMovement.reset();
    recordReview.reset();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    resetFeedback();
    if (selectedItem === undefined || selectedUnit === undefined) {
      setFormError(
        tr(
          "Seleccione un artículo con unidad válida.",
          "Select an item with a valid unit.",
        ),
      );
      return;
    }
    const amount = Number(quantity.replace(",", "."));
    if (!Number.isFinite(amount)) {
      setFormError(
        tr("Ingrese una cantidad válida.", "Enter a valid quantity."),
      );
      return;
    }
    const occurredAtUtc = new Date(occurredAt).toISOString();
    try {
      if (kind === "REVERSAL") {
        if (relatedMovementId.length === 0 || reason.trim().length === 0) {
          setFormError(
            tr(
              "Seleccione el movimiento y escriba el motivo de la anulación.",
              "Select the movement and enter the reversal reason.",
            ),
          );
          return;
        }
        await reverseMovement.mutateAsync({
          movementId: relatedMovementId,
          reason: reason.trim(),
          occurredAtUtc,
        });
      } else if (kind === "ADJUSTMENT") {
        if (amount === 0 || reason.trim().length === 0) {
          setFormError(
            tr(
              "El ajuste debe ser distinto de cero y tener un motivo.",
              "The adjustment must be non-zero and include a reason.",
            ),
          );
          return;
        }
        await recordAdjustment.mutateAsync({
          inventoryItemId: selectedItem.id,
          unitId: selectedUnit.id,
          quantityDelta: amount,
          reason: reason.trim(),
          occurredAtUtc,
          ...optionalText("notes", notes),
        });
      } else if (kind === "REVIEW") {
        if (amount < 0) {
          setFormError(
            tr(
              "El conteo físico no puede ser negativo.",
              "The physical count cannot be negative.",
            ),
          );
          return;
        }
        await recordReview.mutateAsync({
          reviewedAtUtc: occurredAtUtc,
          lines: [
            {
              inventoryItemId: selectedItem.id,
              unitId: selectedUnit.id,
              expectedQuantity: selectedStock?.balance ?? 0,
              countedQuantity: amount,
            },
          ],
          ...optionalText("notes", notes),
        });
      } else {
        if (amount <= 0) {
          setFormError(
            tr(
              "La cantidad debe ser mayor que cero.",
              "Quantity must be greater than zero.",
            ),
          );
          return;
        }
        await recordMovement.mutateAsync({
          inventoryItemId: selectedItem.id,
          unitId: selectedUnit.id,
          movementType: kind,
          quantity: amount,
          occurredAtUtc,
          ...optionalText("destination", destination),
          ...optionalText("notes", notes),
          ...(kind === "RETURN" && relatedMovementId.length > 0
            ? { relatedMovementId }
            : {}),
        });
      }
      setQuantity("");
      setDestination("");
      setNotes("");
      setReason("");
      setRelatedMovementId("");
      setSuccess(
        tr(
          "Hecho registrado; el kardex conserva el original y la auditoría.",
          "Event recorded; the ledger preserves the original and the audit trail.",
        ),
      );
    } catch {
      // React Query conserva el error para presentarlo sin perder el formulario.
    }
  };

  if (items.isPending || units.isPending || stock.isPending)
    return (
      <ActionState title={tr("Cargando inventario", "Loading inventory")} />
    );
  if (
    items.isError ||
    units.isError ||
    stock.isError ||
    items.data === undefined ||
    units.data === undefined ||
    stock.data === undefined
  )
    return (
      <ActionState
        error
        title={tr(
          "No se pudo preparar el registro",
          "Could not prepare the form",
        )}
        detail={requestErrorMessage(
          items.error ?? units.error ?? stock.error,
          undefined,
          language,
        )}
      />
    );
  if (catalogItems.length === 0)
    return (
      <ActionState
        title={tr("Primero cree un artículo", "Create an item first")}
        detail={tr(
          "Use la pestaña Catálogo; crear el artículo no inventará un saldo.",
          "Use the Catalog tab; creating the item will not invent a balance.",
        )}
      />
    );

  return (
    <section className="portal-panel inventory-actions">
      <header>
        <div>
          <h2>
            {tr("Registrar hecho de inventario", "Record inventory event")}
          </h2>
          <p>
            {tr(
              "Uso excepcional de gerencia · cada acción queda auditada y nunca edita el historial.",
              "Exceptional manager use · every action is audited and never edits history.",
            )}
          </p>
        </div>
        <span className="inventory-difference">{tr("ESCRITURA", "WRITE")}</span>
      </header>

      <form
        className="inventory-action-form"
        onSubmit={(event) => void submit(event)}
      >
        <div className="inventory-action-grid">
          <label>
            {tr("Artículo", "Item")}
            <select
              value={selectedItemId}
              onChange={(event) => {
                setItemId(event.target.value);
                setRelatedMovementId("");
                resetFeedback();
              }}
            >
              {catalogItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Acción", "Action")}
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as ActionKind);
                setRelatedMovementId("");
                setQuantity("");
                resetFeedback();
              }}
            >
              <option value="ENTRY">{tr("Entrada", "Entry")}</option>
              <option value="EXIT">{tr("Salida", "Exit")}</option>
              <option value="CONSUMPTION">
                {tr("Consumo", "Consumption")}
              </option>
              <option value="RETURN">
                {tr("Reintegro / devolución", "Return")}
              </option>
              <option value="REVIEW">
                {tr("Revisión física", "Physical review")}
              </option>
              <option value="ADJUSTMENT">{tr("Ajuste", "Adjustment")}</option>
              <option value="REVERSAL">
                {tr("Anular movimiento", "Reverse movement")}
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

        <div className="inventory-selected-summary">
          <span>{tr("Saldo central", "Central balance")}</span>
          <strong>
            {selectedStock?.balance ?? 0} {selectedUnit?.code ?? "—"}
          </strong>
        </div>

        {kind === "REVERSAL" ? (
          <label>
            {tr(
              "Movimiento que se registró por error",
              "Movement recorded in error",
            )}
            <select
              required
              value={relatedMovementId}
              onChange={(event) => setRelatedMovementId(event.target.value)}
            >
              <option value="">{tr("Seleccione", "Select")}</option>
              {reversible.map((movement) => (
                <option key={movement.id} value={movement.id}>
                  {movementLabel(movement, language)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            {kind === "REVIEW"
              ? tr("Cantidad contada", "Counted quantity")
              : kind === "ADJUSTMENT"
                ? tr("Cambio de cantidad (+ o -)", "Quantity change (+ or -)")
                : tr("Cantidad", "Quantity")}
            <span className="inventory-quantity-field">
              <input
                required
                type="number"
                step={decimalStep(selectedUnit?.decimalPlaces)}
                min={
                  kind === "REVIEW"
                    ? "0"
                    : kind === "ADJUSTMENT"
                      ? undefined
                      : decimalStep(selectedUnit?.decimalPlaces)
                }
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
              <b>{selectedUnit?.code ?? "—"}</b>
            </span>
          </label>
        )}

        {kind === "RETURN" && (
          <label>
            {tr("Salida original (opcional)", "Original exit (optional)")}
            <select
              value={relatedMovementId}
              onChange={(event) => setRelatedMovementId(event.target.value)}
            >
              <option value="">{tr("No se conoce", "Unknown")}</option>
              {returnable.map((movement) => (
                <option key={movement.id} value={movement.id}>
                  {movementLabel(movement, language)}
                </option>
              ))}
            </select>
          </label>
        )}

        {(kind === "ADJUSTMENT" || kind === "REVERSAL") && (
          <label>
            {tr("Motivo obligatorio", "Required reason")}
            <textarea
              required
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        )}
        {kind !== "ADJUSTMENT" && kind !== "REVERSAL" && kind !== "REVIEW" && (
          <label>
            {tr("Destino (opcional)", "Destination (optional)")}
            <input
              maxLength={200}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
          </label>
        )}
        {kind !== "REVERSAL" && (
          <label>
            {tr("Observación (opcional)", "Notes (optional)")}
            <textarea
              maxLength={500}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        )}

        {formError !== null && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        {requestError !== null && (
          <p className="form-error" role="alert">
            {requestErrorMessage(requestError, undefined, language)}
          </p>
        )}
        {success !== null && (
          <p className="form-success" role="status">
            {success}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || (kind === "REVERSAL" && reversible.length === 0)}
        >
          {pending
            ? tr("GUARDANDO…", "SAVING…")
            : tr("REGISTRAR HECHO", "RECORD EVENT")}
        </button>
      </form>
    </section>
  );
}

function optionalText<Key extends "destination" | "notes">(
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

function movementLabel(movement: InventoryMovement, language: "es" | "en") {
  const names = {
    ENTRY: ["Entrada", "Entry"],
    EXIT: ["Salida", "Exit"],
    CONSUMPTION: ["Consumo", "Consumption"],
    RETURN: ["Reintegro", "Return"],
    ADJUSTMENT: ["Ajuste", "Adjustment"],
    REVERSAL: ["Reverso", "Reversal"],
  } as const;
  const name = names[movement.movementType][language === "es" ? 0 : 1];
  return `${name} ${movement.quantityDelta > 0 ? "+" : ""}${movement.quantityDelta} · ${formatCostaRicaDateTime(movement.occurredAtUtc, language)}`;
}

function ActionState({
  title,
  detail,
  error = false,
}: {
  title: string;
  detail?: string;
  error?: boolean;
}) {
  const { tr } = useLanguage();
  return (
    <section className="portal-panel inventory-results">
      <div
        className={`shipment-state${error ? " error" : ""}`}
        role={error ? "alert" : "status"}
      >
        <strong>{title}</strong>
        <p>{detail ?? tr("Espere un momento.", "Please wait.")}</p>
      </div>
    </section>
  );
}
