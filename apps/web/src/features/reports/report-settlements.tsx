import { useMemo, useState } from "react";

import { requestErrorMessage } from "../../api/http";
import { useAuth } from "../../auth/auth-context";
import { useLanguage } from "../../i18n/language-context";
import type { ReportShipment, ReportSupplier } from "./reports-data";
import {
  useCreateReportSettlementCorrection,
  useReportSettlements,
  useSaveReportSettlement,
  useTransitionReportSettlement,
  type ReportExpenseCategory,
  type ReportSettlement,
  type ReportSettlementStatus,
  type SaveReportSettlementInput,
} from "./report-settlements-data";

interface SettlementDraft {
  supplierId: string;
  weekStart: string;
  buyerName: string;
  destination: string;
  participationPercentage: string;
  receivedAmountCrc: string;
  notes: string;
  rowVersion?: number;
  lines: Array<{
    shipmentId: string;
    assayLabel: string;
    karat: string;
    gramsLiquidated: string;
    pricePerKaratCrc: string;
    pricePerGramCrc: string;
  }>;
  expenses: Array<{
    category: ReportExpenseCategory;
    concept: string;
    amountCrc: string;
    occurredOn: string;
    responsibleName: string;
  }>;
}

const EXPENSE_CATEGORIES: ReportExpenseCategory[] = [
  "TRANSPORT",
  "BAGS",
  "PLANT",
  "SALARY",
  "FINCA",
  "OTHER",
];

export function ReportSettlements({
  fromDate,
  toDate,
  suppliers,
  shipments,
}: {
  fromDate: string;
  toDate: string;
  suppliers: ReportSupplier[];
  shipments: ReportShipment[];
}) {
  const auth = useAuth();
  const { language, locale, tr } = useLanguage();
  const query = useReportSettlements(fromDate, toDate);
  const transition = useTransitionReportSettlement();
  const correction = useCreateReportSettlementCorrection();
  const canManage =
    auth.profile?.permissions.includes("reports.manage") ?? false;
  const [editing, setEditing] = useState<ReportSettlement | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const weekly = useMemo(
    () => weeklyTotals(officialSettlements(query.data ?? [])),
    [query.data],
  );

  const changeStatus = async (
    settlement: ReportSettlement,
    status: ReportSettlementStatus,
  ) => {
    setActionError(null);
    try {
      await transition.mutateAsync({
        settlementId: settlement.id,
        rowVersion: settlement.rowVersion,
        status,
      });
    } catch (error) {
      setActionError(
        requestErrorMessage(
          error,
          tr(
            "No se pudo cambiar el estado de la liquidación.",
            "The settlement status could not be changed.",
          ),
          language,
        ),
      );
    }
  };

  const createCorrection = async (settlement: ReportSettlement) => {
    setActionError(null);
    try {
      const draft = await correction.mutateAsync(settlement.id);
      setEditing(draft);
    } catch (error) {
      setActionError(
        requestErrorMessage(
          error,
          tr(
            "No se pudo crear el borrador de corrección.",
            "The correction draft could not be created.",
          ),
          language,
        ),
      );
    }
  };

  return (
    <section className="portal-panel report-settlements">
      <header>
        <div>
          <span className="reports-eyebrow">
            {tr("LIQUIDACIÓN FINANCIERA", "FINANCIAL SETTLEMENT")}
          </span>
          <h2>{tr("Ingresos y gastos de oro", "Gold income and expenses")}</h2>
          <p>
            {tr(
              "Registre quilataje, gramos, precios y deducciones. Cada total conserva su fórmula visible.",
              "Record karat, grams, prices, and deductions. Every total keeps its formula visible.",
            )}
          </p>
        </div>
        {canManage && editing === null && (
          <button type="button" onClick={() => setEditing("new")}>
            {tr("NUEVA LIQUIDACIÓN", "NEW SETTLEMENT")}
          </button>
        )}
      </header>

      {actionError !== null && (
        <div className="stale-notice" role="alert">
          {actionError}
        </div>
      )}
      {query.isPending && (
        <p className="query-message" role="status">
          {tr("Consultando liquidaciones…", "Loading settlements…")}
        </p>
      )}
      {query.isError && query.data === undefined && (
        <p className="query-message error" role="alert">
          {requestErrorMessage(
            query.error,
            tr(
              "No se pudieron consultar las liquidaciones.",
              "Settlements could not be loaded.",
            ),
            language,
          )}
        </p>
      )}

      {weekly.length > 0 && (
        <details className="report-weekly-summary" open>
          <summary>
            {tr("Resumen semanal aprobado", "Approved weekly summary")}
          </summary>
          <div className="reports-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{tr("Semana", "Week")}</th>
                  <th>{tr("Liquidaciones", "Settlements")}</th>
                  <th>{tr("Gramos", "Grams")}</th>
                  <th>{tr("Bruto", "Gross")}</th>
                  <th>{tr("Gastos", "Expenses")}</th>
                  <th>{tr("Neto", "Net")}</th>
                  <th>{tr("Recibido", "Received")}</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((week) => (
                  <tr key={week.weekStart}>
                    <th scope="row">{week.weekStart}</th>
                    <td>{week.settlements.toLocaleString(locale)}</td>
                    <td>{number(week.grams, locale, 3)} g</td>
                    <td>{currency(week.gross, locale)}</td>
                    <td>{currency(week.expenses, locale)}</td>
                    <td>{currency(week.net, locale)}</td>
                    <td>{currency(week.received, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {editing !== null && (
        <SettlementEditor
          settlement={editing === "new" ? null : editing}
          fromDate={fromDate}
          suppliers={suppliers}
          shipments={shipments}
          onClose={() => setEditing(null)}
        />
      )}

      {query.data !== undefined &&
        query.data.length === 0 &&
        editing === null && (
          <div className="report-settlements-empty">
            <strong>
              {tr("Aún no hay liquidaciones", "No settlements yet")}
            </strong>
            <p>
              {tr(
                "Cree un borrador para sustituir la liquidación manual del Excel de este período.",
                "Create a draft to replace the manual spreadsheet settlement for this period.",
              )}
            </p>
          </div>
        )}

      <div className="report-settlement-list">
        {(query.data ?? []).map((settlement) => (
          <details className="report-settlement-card" key={settlement.id}>
            <summary>
              <span>
                <StatusBadge status={settlement.status} />
                <strong>{settlement.supplierName}</strong>
                <small>
                  {tr("Semana", "Week")} {settlement.weekStart}
                  {settlement.revision > 1
                    ? ` · ${tr("Corrección", "Correction")} R${settlement.revision}`
                    : ""}
                </small>
              </span>
              <span>
                <strong>
                  {currency(settlement.effectiveReceivedAmountCrc, locale)}
                </strong>
                <small>{tr("Total recibido", "Total received")}</small>
              </span>
            </summary>
            <div className="report-settlement-detail">
              <div className="report-financial-totals">
                <FinancialTotal
                  label={tr("Gramos", "Grams")}
                  value={`${number(settlement.totalGrams, locale, 3)} g`}
                />
                <FinancialTotal
                  label={tr("Total bruto", "Gross total")}
                  value={currency(settlement.grossAmountCrc, locale)}
                />
                <FinancialTotal
                  label={tr("Gastos", "Expenses")}
                  value={currency(settlement.expensesCrc, locale)}
                />
                <FinancialTotal
                  label={tr("Total neto", "Net total")}
                  value={currency(settlement.netAmountCrc, locale)}
                />
                <FinancialTotal
                  label={`${tr("Participación", "Participation")} ${number(settlement.participationPercentage, locale, 2)} %`}
                  value={currency(settlement.participationAmountCrc, locale)}
                />
              </div>
              <p className="report-formula-note">
                {tr(
                  "Bruto = gramos × precio por gramo · Neto = bruto − gastos · Recibido = neto × participación, salvo ajuste manual.",
                  "Gross = grams × price per gram · Net = gross − expenses · Received = net × participation, unless manually adjusted.",
                )}
              </p>
              <div className="report-settlement-actions">
                {canManage && settlement.status === "DRAFT" && (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setEditing(settlement)}
                    >
                      {tr("EDITAR BORRADOR", "EDIT DRAFT")}
                    </button>
                    <button
                      type="button"
                      disabled={transition.isPending}
                      onClick={() => void changeStatus(settlement, "REVIEWED")}
                    >
                      {tr("ENVIAR A REVISIÓN", "SEND TO REVIEW")}
                    </button>
                  </>
                )}
                {canManage && settlement.status === "REVIEWED" && (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      disabled={transition.isPending}
                      onClick={() => void changeStatus(settlement, "DRAFT")}
                    >
                      {tr("DEVOLVER A BORRADOR", "RETURN TO DRAFT")}
                    </button>
                    <button
                      type="button"
                      disabled={transition.isPending}
                      onClick={() => void changeStatus(settlement, "APPROVED")}
                    >
                      {tr("APROBAR Y PROTEGER", "APPROVE AND LOCK")}
                    </button>
                  </>
                )}
                {canManage && settlement.status === "APPROVED" && (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      disabled={correction.isPending}
                      onClick={() => void createCorrection(settlement)}
                    >
                      {tr("CREAR CORRECCIÓN", "CREATE CORRECTION")}
                    </button>
                    <button
                      type="button"
                      disabled={transition.isPending}
                      onClick={() => void changeStatus(settlement, "CLOSED")}
                    >
                      {tr("CERRAR LIQUIDACIÓN", "CLOSE SETTLEMENT")}
                    </button>
                  </>
                )}
                {canManage && settlement.status === "CLOSED" && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={correction.isPending}
                    onClick={() => void createCorrection(settlement)}
                  >
                    {tr("CREAR CORRECCIÓN", "CREATE CORRECTION")}
                  </button>
                )}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function SettlementEditor({
  settlement,
  fromDate,
  suppliers,
  shipments,
  onClose,
}: {
  settlement: ReportSettlement | null;
  fromDate: string;
  suppliers: ReportSupplier[];
  shipments: ReportShipment[];
  onClose(this: void): void;
}) {
  const { language, locale, tr } = useLanguage();
  const save = useSaveReportSettlement(settlement?.id ?? null);
  const [draft, setDraft] = useState<SettlementDraft>(() =>
    settlement === null
      ? quickDraft(fromDate, suppliers[0]?.supplierId ?? "", shipments)
      : draftFromSettlement(settlement),
  );
  const [error, setError] = useState<string | null>(null);
  const availableShipments = useMemo(
    () => shipments.filter((item) => item.supplierId === draft.supplierId),
    [draft.supplierId, shipments],
  );
  const totals = calculateDraft(draft);
  const valid =
    draft.supplierId !== "" &&
    draft.buyerName.trim() !== "" &&
    draft.weekStart !== "" &&
    draft.lines.length > 0 &&
    draft.lines.every(
      (line) =>
        line.shipmentId !== "" &&
        positive(line.gramsLiquidated) &&
        nonNegative(line.karat) &&
        nonNegative(line.pricePerGramCrc),
    );

  const submit = async () => {
    if (!valid) return;
    setError(null);
    try {
      await save.mutateAsync(toInput(draft));
      onClose();
    } catch (reason) {
      setError(
        requestErrorMessage(
          reason,
          tr(
            "No se pudo guardar la liquidación.",
            "The settlement could not be saved.",
          ),
          language,
        ),
      );
    }
  };

  return (
    <div className="report-settlement-editor">
      <header>
        <div>
          <h3>
            {settlement === null
              ? tr("Nueva liquidación", "New settlement")
              : tr("Editar liquidación", "Edit settlement")}
          </h3>
          <p>
            {tr(
              "Complete proveedor, comprador y los cuatro datos del resultado. Los gastos y opciones poco frecuentes están plegados.",
              "Complete the supplier, buyer, and four result values. Expenses and infrequent options are collapsed.",
            )}
          </p>
        </div>
        <button type="button" className="secondary" onClick={onClose}>
          {tr("CANCELAR", "CANCEL")}
        </button>
      </header>

      <div className="report-settlement-fields">
        <label>
          {tr("PROVEEDOR", "SUPPLIER")}
          <select
            value={draft.supplierId}
            onChange={(event) => {
              const supplierId = event.target.value;
              const first = shipments.find(
                (shipment) => shipment.supplierId === supplierId,
              );
              setDraft({
                ...draft,
                supplierId,
                lines: first === undefined ? [] : [emptyLine(first.shipmentId)],
              });
            }}
          >
            <option value="">{tr("Seleccione", "Select")}</option>
            {suppliers.map((supplier) => (
              <option key={supplier.supplierId} value={supplier.supplierId}>
                {supplier.supplierName}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("INICIO DE SEMANA", "WEEK START")}
          <input
            type="date"
            value={draft.weekStart}
            onChange={(event) =>
              setDraft({ ...draft, weekStart: event.target.value })
            }
          />
        </label>
        <label>
          {tr("COMPRADOR", "BUYER")}
          <input
            value={draft.buyerName}
            onChange={(event) =>
              setDraft({ ...draft, buyerName: event.target.value })
            }
          />
        </label>
      </div>

      <details className="report-editor-advanced">
        <summary>
          {tr(
            "Opciones avanzadas: destino, participación y recibido manual",
            "Advanced options: destination, participation, and manual received amount",
          )}
        </summary>
        <div className="report-settlement-fields">
          <label>
            {tr("DESTINO", "DESTINATION")}
            <input
              value={draft.destination}
              onChange={(event) =>
                setDraft({ ...draft, destination: event.target.value })
              }
            />
          </label>
          <label>
            {tr("PARTICIPACIÓN %", "PARTICIPATION %")}
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={draft.participationPercentage}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  participationPercentage: event.target.value,
                })
              }
            />
          </label>
          <label>
            {tr("RECIBIDO MANUAL (OPCIONAL)", "MANUAL RECEIVED (OPTIONAL)")}
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.receivedAmountCrc}
              onChange={(event) =>
                setDraft({ ...draft, receivedAmountCrc: event.target.value })
              }
            />
          </label>
        </div>
      </details>

      <div className="report-editor-section">
        <header>
          <div>
            <h4>{tr("Resultados y precios", "Results and prices")}</h4>
            <p>
              {tr(
                "Puede registrar varios resultados de quilataje para un mismo cargamento.",
                "You can record multiple karat results for the same shipment.",
              )}
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={draft.supplierId === ""}
            onClick={() => {
              const used = new Set(draft.lines.map((line) => line.shipmentId));
              const next = availableShipments.find(
                (shipment) => !used.has(shipment.shipmentId),
              );
              setDraft({
                ...draft,
                lines: [...draft.lines, emptyLine(next?.shipmentId ?? "")],
              });
            }}
          >
            {tr("AGREGAR RESULTADO", "ADD RESULT")}
          </button>
        </header>
        {draft.lines.map((line, index) => (
          <div className="report-line-grid" key={index}>
            <label>
              {tr("CARGAMENTO", "SHIPMENT")}
              <select
                value={line.shipmentId}
                onChange={(event) =>
                  setDraft(
                    updateLine(draft, index, "shipmentId", event.target.value),
                  )
                }
              >
                <option value="">{tr("Seleccione", "Select")}</option>
                {availableShipments.map((shipment) => (
                  <option key={shipment.shipmentId} value={shipment.shipmentId}>
                    {shipment.shipmentCode} · {shipment.productionLineName}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label={tr("QUILATAJE", "KARAT")}
              value={line.karat}
              step="0.001"
              onChange={(value) =>
                setDraft(updateLine(draft, index, "karat", value))
              }
            />
            <NumberField
              label={tr("GRAMOS", "GRAMS")}
              value={line.gramsLiquidated}
              step="0.001"
              onChange={(value) =>
                setDraft(updateLine(draft, index, "gramsLiquidated", value))
              }
            />
            <NumberField
              label={tr("₡ POR GRAMO", "₡ PER GRAM")}
              value={line.pricePerGramCrc}
              onChange={(value) =>
                setDraft(updateLine(draft, index, "pricePerGramCrc", value))
              }
            />
            <output>
              <span>{tr("TOTAL BRUTO", "GROSS TOTAL")}</span>
              <strong>{currency(lineTotal(line), locale)}</strong>
            </output>
            <details className="report-line-advanced">
              <summary>{tr("Más datos", "More details")}</summary>
              <label>
                {tr("REFERENCIA", "REFERENCE")}
                <input
                  value={line.assayLabel}
                  onChange={(event) =>
                    setDraft(
                      updateLine(
                        draft,
                        index,
                        "assayLabel",
                        event.target.value,
                      ),
                    )
                  }
                />
              </label>
              <NumberField
                label={tr("₡ POR QUILATE", "₡ PER KARAT")}
                value={line.pricePerKaratCrc}
                onChange={(value) =>
                  setDraft(updateLine(draft, index, "pricePerKaratCrc", value))
                }
              />
            </details>
            <button
              type="button"
              className="secondary compact"
              onClick={() =>
                setDraft({
                  ...draft,
                  lines: draft.lines.filter((_, item) => item !== index),
                })
              }
            >
              {tr("QUITAR", "REMOVE")}
            </button>
          </div>
        ))}
      </div>

      <details
        className="report-editor-section report-optional-section"
        open={draft.expenses.length > 0}
      >
        <summary>
          {tr("Gastos descontados (opcional)", "Deducted expenses (optional)")}
          {draft.expenses.length > 0 ? ` · ${draft.expenses.length}` : ""}
        </summary>
        <header>
          <div>
            <p>
              {tr(
                "Transporte, sacos, planta, salarios, finca u otros gastos asociados.",
                "Transportation, bags, plant, salary, farm, or other related expenses.",
              )}
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setDraft({
                ...draft,
                expenses: [...draft.expenses, emptyExpense(draft.weekStart)],
              })
            }
          >
            {tr("AGREGAR GASTO", "ADD EXPENSE")}
          </button>
        </header>
        {draft.expenses.map((expense, index) => (
          <div className="report-expense-grid" key={index}>
            <label>
              {tr("CATEGORÍA", "CATEGORY")}
              <select
                value={expense.category}
                onChange={(event) =>
                  setDraft(
                    updateExpense(
                      draft,
                      index,
                      "category",
                      event.target.value as ReportExpenseCategory,
                    ),
                  )
                }
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option value={category} key={category}>
                    {expenseLabel(category, tr)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("CONCEPTO", "CONCEPT")}
              <input
                value={expense.concept}
                onChange={(event) =>
                  setDraft(
                    updateExpense(draft, index, "concept", event.target.value),
                  )
                }
              />
            </label>
            <NumberField
              label={tr("MONTO", "AMOUNT")}
              value={expense.amountCrc}
              onChange={(value) =>
                setDraft(updateExpense(draft, index, "amountCrc", value))
              }
            />
            <label>
              {tr("FECHA", "DATE")}
              <input
                type="date"
                value={expense.occurredOn}
                onChange={(event) =>
                  setDraft(
                    updateExpense(
                      draft,
                      index,
                      "occurredOn",
                      event.target.value,
                    ),
                  )
                }
              />
            </label>
            <label>
              {tr("RESPONSABLE", "RESPONSIBLE")}
              <input
                value={expense.responsibleName}
                onChange={(event) =>
                  setDraft(
                    updateExpense(
                      draft,
                      index,
                      "responsibleName",
                      event.target.value,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="secondary compact"
              onClick={() =>
                setDraft({
                  ...draft,
                  expenses: draft.expenses.filter((_, item) => item !== index),
                })
              }
            >
              {tr("QUITAR", "REMOVE")}
            </button>
          </div>
        ))}
      </details>

      <details className="report-editor-advanced">
        <summary>
          {tr("Notas internas (opcional)", "Internal notes (optional)")}
        </summary>
        <label className="report-notes-field">
          {tr("NOTAS INTERNAS", "INTERNAL NOTES")}
          <textarea
            rows={3}
            value={draft.notes}
            onChange={(event) =>
              setDraft({ ...draft, notes: event.target.value })
            }
          />
        </label>
      </details>

      <div className="report-financial-summary">
        <FinancialTotal
          label={tr("Total bruto", "Gross total")}
          value={currency(totals.gross, locale)}
        />
        <span aria-hidden="true">−</span>
        <FinancialTotal
          label={tr("Gastos", "Expenses")}
          value={currency(totals.expenses, locale)}
        />
        <span aria-hidden="true">=</span>
        <FinancialTotal
          label={tr("Total neto", "Net total")}
          value={currency(totals.net, locale)}
        />
        <span aria-hidden="true">→</span>
        <FinancialTotal
          label={tr("Total recibido", "Total received")}
          value={currency(totals.received, locale)}
        />
      </div>
      {error !== null && (
        <div className="stale-notice" role="alert">
          {error}
        </div>
      )}
      <div className="report-editor-actions">
        <button type="button" className="secondary" onClick={onClose}>
          {tr("CANCELAR", "CANCEL")}
        </button>
        <button
          type="button"
          disabled={!valid || save.isPending}
          aria-busy={save.isPending || undefined}
          onClick={() => void submit()}
        >
          {save.isPending
            ? tr("GUARDANDO…", "SAVING…")
            : tr("GUARDAR BORRADOR", "SAVE DRAFT")}
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  step = "0.01",
  onChange,
}: {
  label: string;
  value: string;
  step?: string;
  onChange(this: void, value: string): void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function FinancialTotal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: ReportSettlementStatus }) {
  const { tr } = useLanguage();
  const labels: Record<ReportSettlementStatus, string> = {
    DRAFT: tr("BORRADOR", "DRAFT"),
    REVIEWED: tr("EN REVISIÓN", "IN REVIEW"),
    APPROVED: tr("APROBADA", "APPROVED"),
    CLOSED: tr("CERRADA", "CLOSED"),
  };
  return (
    <span className={`report-status ${status.toLowerCase()}`}>
      {labels[status]}
    </span>
  );
}

function emptyDraft(fromDate: string, supplierId: string): SettlementDraft {
  return {
    supplierId,
    weekStart: fromDate,
    buyerName: "",
    destination: "",
    participationPercentage: "50",
    receivedAmountCrc: "",
    notes: "",
    lines: [],
    expenses: [],
  };
}

function quickDraft(
  fromDate: string,
  supplierId: string,
  shipments: ReportShipment[],
): SettlementDraft {
  const draft = emptyDraft(fromDate, supplierId);
  const first = shipments.find(
    (shipment) => shipment.supplierId === supplierId,
  );
  return {
    ...draft,
    lines: first === undefined ? [] : [emptyLine(first.shipmentId)],
  };
}

function emptyLine(shipmentId = ""): SettlementDraft["lines"][number] {
  return {
    shipmentId,
    assayLabel: "",
    karat: "",
    gramsLiquidated: "",
    pricePerKaratCrc: "",
    pricePerGramCrc: "",
  };
}

function emptyExpense(date: string): SettlementDraft["expenses"][number] {
  return {
    category: "OTHER",
    concept: "",
    amountCrc: "",
    occurredOn: date,
    responsibleName: "",
  };
}

function draftFromSettlement(settlement: ReportSettlement): SettlementDraft {
  return {
    supplierId: settlement.supplierId,
    weekStart: settlement.weekStart,
    buyerName: settlement.buyerName,
    destination: settlement.destination ?? "",
    participationPercentage: String(settlement.participationPercentage),
    receivedAmountCrc:
      settlement.receivedAmountCrc === null
        ? ""
        : String(settlement.receivedAmountCrc),
    notes: settlement.notes ?? "",
    rowVersion: settlement.rowVersion,
    lines: settlement.lines.map((line) => ({
      shipmentId: line.shipmentId,
      assayLabel: line.assayLabel ?? "",
      karat: String(line.karat),
      gramsLiquidated: String(line.gramsLiquidated),
      pricePerKaratCrc:
        line.pricePerKaratCrc === null ? "" : String(line.pricePerKaratCrc),
      pricePerGramCrc: String(line.pricePerGramCrc),
    })),
    expenses: settlement.expenses.map((expense) => ({
      category: expense.category,
      concept: expense.concept,
      amountCrc: String(expense.amountCrc),
      occurredOn: expense.occurredOn,
      responsibleName: expense.responsibleName ?? "",
    })),
  };
}

function toInput(draft: SettlementDraft): SaveReportSettlementInput {
  return {
    supplierId: draft.supplierId,
    weekStart: draft.weekStart,
    buyerName: draft.buyerName.trim(),
    ...(draft.destination.trim() === ""
      ? {}
      : { destination: draft.destination.trim() }),
    participationPercentage: Number(draft.participationPercentage),
    ...(draft.receivedAmountCrc === ""
      ? {}
      : { receivedAmountCrc: Number(draft.receivedAmountCrc) }),
    ...(draft.notes.trim() === "" ? {} : { notes: draft.notes.trim() }),
    ...(draft.rowVersion === undefined ? {} : { rowVersion: draft.rowVersion }),
    lines: draft.lines.map((line) => ({
      shipmentId: line.shipmentId,
      ...(line.assayLabel.trim() === ""
        ? {}
        : { assayLabel: line.assayLabel.trim() }),
      karat: Number(line.karat),
      gramsLiquidated: Number(line.gramsLiquidated),
      ...(line.pricePerKaratCrc === ""
        ? {}
        : { pricePerKaratCrc: Number(line.pricePerKaratCrc) }),
      pricePerGramCrc: Number(line.pricePerGramCrc),
    })),
    expenses: draft.expenses.map((expense) => ({
      category: expense.category,
      concept: expense.concept.trim(),
      amountCrc: Number(expense.amountCrc),
      occurredOn: expense.occurredOn,
      ...(expense.responsibleName.trim() === ""
        ? {}
        : { responsibleName: expense.responsibleName.trim() }),
    })),
  };
}

function updateLine<K extends keyof SettlementDraft["lines"][number]>(
  draft: SettlementDraft,
  index: number,
  field: K,
  value: SettlementDraft["lines"][number][K],
): SettlementDraft {
  return {
    ...draft,
    lines: draft.lines.map((line, item) =>
      item === index ? { ...line, [field]: value } : line,
    ),
  };
}

function updateExpense<K extends keyof SettlementDraft["expenses"][number]>(
  draft: SettlementDraft,
  index: number,
  field: K,
  value: SettlementDraft["expenses"][number][K],
): SettlementDraft {
  return {
    ...draft,
    expenses: draft.expenses.map((expense, item) =>
      item === index ? { ...expense, [field]: value } : expense,
    ),
  };
}

function calculateDraft(draft: SettlementDraft) {
  const gross = draft.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const expenses = draft.expenses.reduce(
    (sum, expense) => sum + numeric(expense.amountCrc),
    0,
  );
  const net = gross - expenses;
  const calculated = net * (numeric(draft.participationPercentage) / 100);
  return {
    gross,
    expenses,
    net,
    received:
      draft.receivedAmountCrc === ""
        ? calculated
        : numeric(draft.receivedAmountCrc),
  };
}

function lineTotal(line: SettlementDraft["lines"][number]): number {
  return numeric(line.gramsLiquidated) * numeric(line.pricePerGramCrc);
}

function numeric(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positive(value: string): boolean {
  return value !== "" && numeric(value) > 0;
}

function nonNegative(value: string): boolean {
  return value !== "" && numeric(value) >= 0;
}

function currency(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 2,
  }).format(value);
}

function number(value: number, locale: string, digits: number): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function expenseLabel(
  category: ReportExpenseCategory,
  tr: (spanish: string, english: string) => string,
): string {
  const labels: Record<ReportExpenseCategory, [string, string]> = {
    TRANSPORT: ["Transporte", "Transportation"],
    BAGS: ["Sacos y materiales", "Bags and materials"],
    PLANT: ["Gasto de planta", "Plant expense"],
    SALARY: ["Salario", "Salary"],
    FINCA: ["Finca", "Farm"],
    OTHER: ["Otro", "Other"],
  };
  return tr(...labels[category]);
}

function weeklyTotals(settlements: ReportSettlement[]) {
  const weeks = new Map<
    string,
    {
      weekStart: string;
      settlements: number;
      grams: number;
      gross: number;
      expenses: number;
      net: number;
      received: number;
    }
  >();
  for (const settlement of settlements) {
    const week = weeks.get(settlement.weekStart) ?? {
      weekStart: settlement.weekStart,
      settlements: 0,
      grams: 0,
      gross: 0,
      expenses: 0,
      net: 0,
      received: 0,
    };
    week.settlements += 1;
    week.grams += settlement.totalGrams;
    week.gross += settlement.grossAmountCrc;
    week.expenses += settlement.expensesCrc;
    week.net += settlement.netAmountCrc;
    week.received += settlement.effectiveReceivedAmountCrc;
    weeks.set(settlement.weekStart, week);
  }
  return [...weeks.values()].sort((left, right) =>
    right.weekStart.localeCompare(left.weekStart),
  );
}

function officialSettlements(settlements: ReportSettlement[]) {
  const approved = settlements.filter(
    (settlement) =>
      settlement.status === "APPROVED" || settlement.status === "CLOSED",
  );
  const superseded = new Set(
    approved.flatMap((settlement) =>
      settlement.supersedesSettlementId === null
        ? []
        : [settlement.supersedesSettlementId],
    ),
  );
  return approved.filter((settlement) => !superseded.has(settlement.id));
}
