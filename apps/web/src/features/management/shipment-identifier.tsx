import { useEffect, useRef, useState, type MouseEvent } from "react";

import { useLanguage } from "../../i18n/language-context";
import { shortShipmentId } from "./management-shipments-data";

type CopyState = "idle" | "copied" | "failed";

/**
 * Identificador legible del cargamento («Material propio · Cargamento
 * 5510B16A») con un botón para copiar solo el código. El código se deriva del
 * UUID; el UUID sigue siendo el que se usa para navegar y consultar.
 */
export function ShipmentIdentifier({
  shipmentId,
  supplierName,
  className,
}: {
  shipmentId: string;
  supplierName?: string;
  className?: string;
}) {
  const { tr } = useLanguage();
  const code = shortShipmentId(shipmentId);
  const [state, setState] = useState<CopyState>("idle");
  const codeRef = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const settle = (next: CopyState) => {
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 4000);
  };

  const copy = async (event: MouseEvent<HTMLButtonElement>) => {
    // El botón vive dentro de filas que pueden abrir el cargamento.
    event.preventDefault();
    event.stopPropagation();
    try {
      if (typeof navigator.clipboard?.writeText !== "function")
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      settle("copied");
    } catch {
      selectCode(codeRef.current);
      settle("failed");
    }
  };

  return (
    <span className={`shipment-identifier${className ? ` ${className}` : ""}`}>
      <span className="shipment-identifier-text">
        {supplierName === undefined ? null : <>{supplierName} · </>}
        {tr("Cargamento", "Shipment")}{" "}
        <code ref={codeRef} className="shipment-code">
          {code}
        </code>
      </span>
      <button
        type="button"
        className="shipment-copy-button"
        title={tr("Copiar identificador", "Copy identifier")}
        aria-label={tr(
          `Copiar identificador del cargamento ${code}`,
          `Copy shipment identifier ${code}`,
        )}
        onClick={(event) => void copy(event)}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
          <rect
            x="5"
            y="5"
            width="9"
            height="9"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M3.5 10.5h-1A1.5 1.5 0 0 1 1 9V2.5A1.5 1.5 0 0 1 2.5 1H9a1.5 1.5 0 0 1 1.5 1.5v1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      <span className="shipment-copy-feedback" role="status" aria-live="polite">
        {state === "copied"
          ? tr("Código copiado", "Code copied")
          : state === "failed"
            ? tr(
                "No se pudo copiar. Seleccione el código y cópielo a mano.",
                "Could not copy. Select the code and copy it manually.",
              )
            : ""}
      </span>
    </span>
  );
}

function selectCode(element: HTMLElement | null) {
  if (element === null) return;
  const selection = window.getSelection();
  if (selection === null) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}
