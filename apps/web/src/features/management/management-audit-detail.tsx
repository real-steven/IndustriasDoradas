import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";

import { useLanguage } from "../../i18n/language-context";
import {
  formatCostaRicaDateTime,
  shortShipmentId,
  type AuditEvent,
} from "./management-shipments-data";
import {
  managerAuditAction,
  managerAuditArea,
  managerAuditField,
  managerAuditOrigin,
  managerAuditReason,
  managerAuditResult,
  managerVisibleAuditChanges,
} from "./management-audit-labels";

export function ManagementAuditDetail({
  event,
  close,
}: {
  event: AuditEvent;
  close(this: void): void;
}) {
  const { language, locale, tr } = useLanguage();
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = `audit-detail-title-${event.id}`;
  const descriptionId = `audit-detail-description-${event.id}`;
  const changes = managerVisibleAuditChanges(event);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current
      ?.querySelector<HTMLElement>("button, [href], input, select, textarea")
      ?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleLayerClick = (mouseEvent: MouseEvent<HTMLDivElement>) => {
    if (mouseEvent.target === mouseEvent.currentTarget) close();
  };

  const handleKeyDown = (keyboardEvent: KeyboardEvent<HTMLElement>) => {
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      close();
      return;
    }
    if (keyboardEvent.key !== "Tab") return;
    const focusable = Array.from(
      keyboardEvent.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (keyboardEvent.shiftKey && document.activeElement === first) {
      keyboardEvent.preventDefault();
      last.focus();
    } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
      keyboardEvent.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="audit-detail-layer" onMouseDown={handleLayerClick}>
      <section
        ref={dialogRef}
        className="audit-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <header>
          <div>
            <p className="eyebrow">{tr("AUDITORÍA", "AUDIT")}</p>
            <h2 id={titleId}>
              {tr("Detalle de actividad", "Activity details")}
            </h2>
            <p id={descriptionId}>{managerAuditAction(event, language)}</p>
          </div>
          <button type="button" className="icon-button" onClick={close}>
            <span aria-hidden="true">×</span>
            <span className="visually-hidden">
              {tr("Cerrar detalle", "Close details")}
            </span>
          </button>
        </header>

        <div className="audit-detail-result">
          <span className={`audit-result ${event.result.toLowerCase()}`}>
            {managerAuditResult(event.result, language)}
          </span>
          <p>{auditResultDescription(event, tr)}</p>
        </div>

        <section className="audit-detail-section">
          <h3>{tr("Resumen", "Summary")}</h3>
          <dl className="audit-detail-summary">
            <AuditDetailItem
              label={tr("Realizado por", "Performed by")}
              value={event.actorDisplayName ?? tr("Sistema", "System")}
            />
            <AuditDetailItem
              label={tr("Fecha y hora", "Date and time")}
              value={formatCostaRicaDateTime(event.occurredAt, language)}
            />
            <AuditDetailItem
              label={tr("Área", "Area")}
              value={managerAuditArea(event.entityType, language)}
            />
            <AuditDetailItem
              label={tr("Registrado desde", "Recorded from")}
              value={managerAuditOrigin(event.origin, language)}
            />
            {event.entityId !== null && (
              <AuditDetailItem
                label={tr("Referencia", "Reference")}
                value={shortShipmentId(event.entityId)}
              />
            )}
          </dl>
        </section>

        {event.reasonCode !== null && (
          <section className="audit-detail-section audit-detail-reason">
            <h3>{tr("Motivo", "Reason")}</h3>
            <p>{managerAuditReason(event.reasonCode, language)}</p>
          </section>
        )}

        {changes.length > 0 && (
          <section className="audit-detail-section">
            <h3>{tr("Qué cambió", "What changed")}</h3>
            <ul className="audit-change-list">
              {changes.map(([field, change]) => (
                <li key={field}>
                  <strong>{managerAuditField(field, language)}</strong>
                  <div>
                    <span>
                      {tr("Antes", "Before")}:{" "}
                      {formatAuditValue(change.before, field, locale, tr)}
                    </span>
                    <span aria-hidden="true">→</span>
                    <span>
                      {tr("Después", "After")}:{" "}
                      {formatAuditValue(change.after, field, locale, tr)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer>
          <button type="button" className="secondary" onClick={close}>
            {tr("CERRAR", "CLOSE")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function auditResultDescription(
  event: AuditEvent,
  tr: (spanish: string, english: string) => string,
): string {
  if (event.result === "REJECTED")
    return tr(
      "El cambio no se aplicó porque no cumplió una regla o permiso.",
      "The change was not applied because it did not meet a rule or permission.",
    );
  if (event.result === "FAILED")
    return tr(
      "Ocurrió un problema y el cambio no se guardó.",
      "A problem occurred and the change was not saved.",
    );
  if (event.origin === "SYNC")
    return tr(
      "La información de la planta se recibió correctamente.",
      "The plant information was received successfully.",
    );
  return tr(
    "El cambio se guardó correctamente.",
    "The change was saved successfully.",
  );
}

function AuditDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatAuditValue(
  value: unknown,
  field: string,
  locale: string,
  tr: (spanish: string, english: string) => string,
): string {
  if (value === null || value === undefined) return tr("Sin dato", "No value");
  if (typeof value === "boolean")
    return value ? tr("Sí", "Yes") : tr("No", "No");
  if (typeof value === "number")
    return new Intl.NumberFormat(locale).format(value);
  if (typeof value !== "string")
    return tr("Dato no disponible", "Value unavailable");
  const text = value;
  if (field.endsWith("_id") && /^[0-9a-f-]{20,}$/iu.test(text))
    return shortShipmentId(text);
  const values: Record<string, readonly [string, string]> = {
    ACTIVE: ["Activo", "Active"],
    ACTIVO: ["Activo", "Active"],
    ADJUSTMENT: ["Ajuste", "Adjustment"],
    ADMINISTRADOR: ["Administrador", "Administrator"],
    INACTIVO: ["Inactivo", "Inactive"],
    CLOSURE: ["Cierre", "Closure"],
    CONSUMPTION: ["Consumo", "Consumption"],
    ENTRY: ["Entrada", "Entry"],
    EXIT: ["Salida", "Exit"],
    INSTALLATION: ["Instalación", "Installation"],
    JEFE_PLANTA: ["Jefatura de planta", "Plant manager"],
    OPENING: ["Apertura", "Opening"],
    PROVISIONAL: ["Provisional", "Provisional"],
    APPROVED: ["Aprobado", "Approved"],
    REJECTED: ["Rechazado", "Rejected"],
    REMOVAL: ["Retiro", "Removal"],
    REPLACEMENT: ["Reemplazo", "Replacement"],
    RETURN: ["Devolución", "Return"],
    REVERSAL: ["Anulación", "Reversal"],
    SUSPENDED: ["Suspendido", "Suspended"],
    MERGED: ["Unificado", "Merged"],
    PENDING: ["Pendiente", "Pending"],
    WITH_DIFFERENCES: ["Con diferencias", "With differences"],
    WITHOUT_DIFFERENCES: ["Sin diferencias", "Without differences"],
  };
  const translated = values[text];
  return translated === undefined ? text : tr(translated[0], translated[1]);
}
