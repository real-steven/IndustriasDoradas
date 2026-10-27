import { useState, type FormEvent, type ReactNode } from "react";

import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import {
  useCreateInventoryItem,
  useCreateInventoryItemType,
  useCreateInventoryUnit,
  useInventoryItems,
  useInventoryItemTypes,
  useInventoryUnits,
} from "./inventory-data";

export function InventoryCatalog({ plantId }: { plantId: string }) {
  const { language, tr } = useLanguage();
  const itemTypes = useInventoryItemTypes(true);
  const units = useInventoryUnits(true);
  const items = useInventoryItems(plantId, true);
  const createType = useCreateInventoryItemType();
  const createUnit = useCreateInventoryUnit();
  const createItem = useCreateInventoryItem(plantId);
  const [typeForm, setTypeForm] = useState({ code: "", name: "" });
  const [unitForm, setUnitForm] = useState({
    code: "",
    name: "",
    decimalPlaces: "0",
  });
  const [itemForm, setItemForm] = useState({
    name: "",
    itemTypeId: "",
    unitId: "",
  });
  const [typeSaved, setTypeSaved] = useState<string | null>(null);
  const [unitSaved, setUnitSaved] = useState<string | null>(null);
  const [itemSaved, setItemSaved] = useState<string | null>(null);

  const types = itemTypes.data?.items ?? [];
  const availableUnits = units.data?.items ?? [];
  const catalogItems = items.data?.items ?? [];
  const selectedTypeId = itemForm.itemTypeId || types[0]?.id || "";
  const selectedUnitId = itemForm.unitId || availableUnits[0]?.id || "";

  const submitType = async (event: FormEvent) => {
    event.preventDefault();
    setTypeSaved(null);
    createType.reset();
    try {
      const created = await createType.mutateAsync({
        code: typeForm.code,
        name: typeForm.name,
        isCustom: true,
      });
      setTypeForm({ code: "", name: "" });
      setItemForm((current) => ({ ...current, itemTypeId: created.id }));
      setTypeSaved(
        tr(`Tipo “${created.name}” creado.`, `Type “${created.name}” created.`),
      );
    } catch {
      // React Query conserva el error y lo presenta junto al formulario.
    }
  };

  const submitUnit = async (event: FormEvent) => {
    event.preventDefault();
    setUnitSaved(null);
    createUnit.reset();
    try {
      const created = await createUnit.mutateAsync({
        code: unitForm.code,
        name: unitForm.name,
        decimalPlaces: Number(unitForm.decimalPlaces),
        isCustom: true,
      });
      setUnitForm({ code: "", name: "", decimalPlaces: "0" });
      setItemForm((current) => ({ ...current, unitId: created.id }));
      setUnitSaved(
        tr(
          `Unidad “${created.name}” creada.`,
          `Unit “${created.name}” created.`,
        ),
      );
    } catch {
      // React Query conserva el error y lo presenta junto al formulario.
    }
  };

  const submitItem = async (event: FormEvent) => {
    event.preventDefault();
    setItemSaved(null);
    createItem.reset();
    try {
      const created = await createItem.mutateAsync({
        name: itemForm.name,
        itemTypeId: selectedTypeId,
        unitId: selectedUnitId,
      });
      setItemForm((current) => ({ ...current, name: "" }));
      setItemSaved(
        tr(
          `Artículo “${created.name}” creado sin existencia inicial.`,
          `Item “${created.name}” created without initial stock.`,
        ),
      );
    } catch {
      // React Query conserva el error y lo presenta junto al formulario.
    }
  };

  const catalogError = itemTypes.error ?? units.error ?? items.error;
  if (itemTypes.isPending || units.isPending || items.isPending)
    return (
      <CatalogState title={tr("Cargando catálogo", "Loading catalog")}>
        {tr("Espere un momento.", "Please wait.")}
      </CatalogState>
    );
  if (
    itemTypes.isError ||
    units.isError ||
    items.isError ||
    itemTypes.data === undefined ||
    units.data === undefined ||
    items.data === undefined
  )
    return (
      <CatalogState
        error
        title={tr(
          "No se pudo cargar el catálogo",
          "Catalog could not be loaded",
        )}
      >
        {requestErrorMessage(catalogError, undefined, language)}
      </CatalogState>
    );

  return (
    <section className="portal-panel inventory-catalog">
      <header>
        <div>
          <h2>{tr("Carga manual del catálogo", "Manual catalog setup")}</h2>
          <p>
            {tr(
              "Defina primero tipos y unidades; luego registre cada artículo real de la planta.",
              "Define types and units first, then register each real item at the plant.",
            )}
          </p>
        </div>
        <span className="inventory-ok">{tr("AUDITADO", "AUDITED")}</span>
      </header>

      <div className="inventory-catalog-notice">
        <strong>{tr("Regla de carga inicial", "Initial-load rule")}</strong>
        <p>
          {tr(
            "Crear un artículo no modifica el saldo. Después del conteo físico, registre una Entrada inicial desde desktop con la cantidad, fecha y responsable comprobados.",
            "Creating an item does not change its balance. After the physical count, record an Initial entry from desktop with the verified quantity, date and responsible person.",
          )}
        </p>
      </div>

      <div className="inventory-catalog-grid">
        <CatalogForm
          title={tr("1. Tipo de artículo", "1. Item type")}
          description={tr(
            "Use un tipo existente o cree uno particular.",
            "Use an existing type or create a specific one.",
          )}
          onSubmit={(event) => void submitType(event)}
        >
          <label>
            {tr("Código del tipo", "Type code")}
            <input
              required
              maxLength={40}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
              placeholder={tr("Ej. HERRAMIENTA", "E.g. TOOL")}
              value={typeForm.code}
              onChange={(event) =>
                setTypeForm({ ...typeForm, code: event.target.value })
              }
            />
          </label>
          <label>
            {tr("Nombre del tipo", "Type name")}
            <input
              required
              maxLength={120}
              placeholder={tr("Ej. Herramienta", "E.g. Tool")}
              value={typeForm.name}
              onChange={(event) =>
                setTypeForm({ ...typeForm, name: event.target.value })
              }
            />
          </label>
          <MutationFeedback
            error={createType.error}
            success={typeSaved}
            language={language}
          />
          <button type="submit" disabled={createType.isPending}>
            {createType.isPending
              ? tr("CREANDO…", "CREATING…")
              : tr("CREAR TIPO", "CREATE TYPE")}
          </button>
        </CatalogForm>

        <CatalogForm
          title={tr("2. Unidad de medida", "2. Measurement unit")}
          description={tr(
            "La precisión define si acepta enteros o hasta tres decimales.",
            "Precision determines whether it accepts integers or up to three decimals.",
          )}
          onSubmit={(event) => void submitUnit(event)}
        >
          <label>
            {tr("Código de la unidad", "Unit code")}
            <input
              required
              maxLength={40}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
              placeholder={tr("Ej. KILOGRAMO", "E.g. KILOGRAM")}
              value={unitForm.code}
              onChange={(event) =>
                setUnitForm({ ...unitForm, code: event.target.value })
              }
            />
          </label>
          <label>
            {tr("Nombre de la unidad", "Unit name")}
            <input
              required
              maxLength={120}
              placeholder={tr("Ej. Kilogramo", "E.g. Kilogram")}
              value={unitForm.name}
              onChange={(event) =>
                setUnitForm({ ...unitForm, name: event.target.value })
              }
            />
          </label>
          <label>
            {tr("Decimales permitidos", "Allowed decimals")}
            <select
              value={unitForm.decimalPlaces}
              onChange={(event) =>
                setUnitForm({
                  ...unitForm,
                  decimalPlaces: event.target.value,
                })
              }
            >
              <option value="0">
                0 · {tr("solo enteros", "integers only")}
              </option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
          <MutationFeedback
            error={createUnit.error}
            success={unitSaved}
            language={language}
          />
          <button type="submit" disabled={createUnit.isPending}>
            {createUnit.isPending
              ? tr("CREANDO…", "CREATING…")
              : tr("CREAR UNIDAD", "CREATE UNIT")}
          </button>
        </CatalogForm>

        <CatalogForm
          title={tr("3. Artículo", "3. Item")}
          description={tr(
            "El nombre y la unidad son obligatorios. La existencia comienza en cero.",
            "Name and unit are required. Stock starts at zero.",
          )}
          onSubmit={(event) => void submitItem(event)}
        >
          <label>
            {tr("Nombre del artículo", "Item name")}
            <input
              required
              maxLength={160}
              placeholder={tr("Ej. Martillo", "E.g. Hammer")}
              value={itemForm.name}
              onChange={(event) =>
                setItemForm({ ...itemForm, name: event.target.value })
              }
            />
          </label>
          <label>
            {tr("Tipo de artículo", "Item type")}
            <select
              required
              value={selectedTypeId}
              onChange={(event) =>
                setItemForm({ ...itemForm, itemTypeId: event.target.value })
              }
            >
              {types.length === 0 && (
                <option value="">
                  {tr("Cree un tipo primero", "Create a type first")}
                </option>
              )}
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Unidad de medida", "Measurement unit")}
            <select
              required
              value={selectedUnitId}
              onChange={(event) =>
                setItemForm({ ...itemForm, unitId: event.target.value })
              }
            >
              {availableUnits.length === 0 && (
                <option value="">
                  {tr("Cree una unidad primero", "Create a unit first")}
                </option>
              )}
              {availableUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.code})
                </option>
              ))}
            </select>
          </label>
          <MutationFeedback
            error={createItem.error}
            success={itemSaved}
            language={language}
          />
          <button
            type="submit"
            disabled={
              createItem.isPending ||
              selectedTypeId.length === 0 ||
              selectedUnitId.length === 0
            }
          >
            {createItem.isPending
              ? tr("CREANDO…", "CREATING…")
              : tr("CREAR ARTÍCULO", "CREATE ITEM")}
          </button>
        </CatalogForm>
      </div>

      <div className="inventory-catalog-list">
        <h3>
          {tr("Artículos activos de esta planta", "Active items at this plant")}
        </h3>
        {catalogItems.length === 0 ? (
          <p>
            {tr(
              "Todavía no hay artículos registrados.",
              "No items have been registered yet.",
            )}
          </p>
        ) : (
          <ul>
            {catalogItems.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>
                  {types.find((type) => type.id === item.itemTypeId)?.name ??
                    "—"}
                  {" · "}
                  {availableUnits.find((unit) => unit.id === item.unitId)
                    ?.code ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CatalogForm({
  title,
  description,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <form className="inventory-catalog-form" onSubmit={onSubmit}>
      <header>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      {children}
    </form>
  );
}

function MutationFeedback({
  error,
  success,
  language,
}: {
  error: Error | null;
  success: string | null;
  language: "es" | "en";
}) {
  if (error !== null)
    return (
      <p className="form-error" role="alert">
        {requestErrorMessage(error, undefined, language)}
      </p>
    );
  if (success !== null)
    return (
      <p className="form-success" role="status">
        {success}
      </p>
    );
  return null;
}

function CatalogState({
  title,
  error = false,
  children,
}: {
  title: string;
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="portal-panel inventory-results">
      <div
        className={`shipment-state${error ? " error" : ""}`}
        role={error ? "alert" : "status"}
      >
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </section>
  );
}
