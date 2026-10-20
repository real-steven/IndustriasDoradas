import type { ReactNode } from "react";
import type {
  ManagementShipment,
  ManagementSweepMercury,
} from "../../api/generated/api-client";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";

import {
  formatCostaRicaDateTime,
  parseShipmentFilters,
  shortShipmentId,
  useManagementShipment,
  useManagementShipmentFilterOptions,
  useManagementShipments,
  useManagementShipmentSweeps,
  useRecentManagementShipments,
  useShipmentAuditEvents,
  type AuditEvent,
  type ShipmentFilters,
} from "./management-shipments-data";
import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";

export function ShipmentsFeature() {
  const { language, tr } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseShipmentFilters(searchParams);
  const shipments = useManagementShipments(filters);
  const filterOptions = useManagementShipmentFilterOptions(filters);

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
    <>
      <ShipmentFiltersPanel
        filters={filters}
        items={filterOptions.data?.items ?? shipments.data?.items ?? []}
        update={update}
      />
      <section className="portal-panel shipment-history" aria-live="polite">
        <header>
          <div>
            <h2>{tr("Historial", "History")}</h2>
            <p>
              {tr(
                "Cargamentos cerrados, ordenados por cierre más reciente",
                "Closed shipments, ordered by most recent closing time",
              )}
            </p>
          </div>
          {shipments.data !== undefined && (
            <span className="history-total">
              {shipments.data.total}{" "}
              {shipments.data.total === 1
                ? tr("resultado", "result")
                : tr("resultados", "results")}
            </span>
          )}
        </header>
        {shipments.isPending ? (
          <ShipmentState
            title={tr("Consultando cargamentos", "Loading shipments")}
          >
            {tr(
              "Espere mientras se carga la proyección central.",
              "Please wait while the central projection loads.",
            )}
          </ShipmentState>
        ) : shipments.isError || shipments.data === undefined ? (
          <ShipmentState
            title={tr(
              "No se pudo consultar el historial",
              "History could not be loaded",
            )}
            error
          >
            {requestErrorMessage(shipments.error, undefined, language)}
          </ShipmentState>
        ) : shipments.data.items.length === 0 ? (
          <ShipmentState
            title={tr(
              "No hay cargamentos para estos filtros",
              "No shipments match these filters",
            )}
          >
            {tr(
              "La consulta central respondió correctamente. Cambie el período o quite algún filtro para ampliar la búsqueda.",
              "The central query responded successfully. Change the period or remove a filter to broaden the search.",
            )}
          </ShipmentState>
        ) : (
          <>
            <div className="shipment-list">
              {shipments.data.items.map((shipment) => (
                <article className="shipment-row" key={shipment.shipmentId}>
                  <div className="shipment-primary">
                    <span>
                      {tr("CARGAMENTO", "SHIPMENT")}{" "}
                      {shortShipmentId(shipment.shipmentId)}
                    </span>
                    <strong>{shipment.productionLineName}</strong>
                    <small>
                      {tr("Cerrado", "Closed")}{" "}
                      {formatCostaRicaDateTime(
                        shipment.completedAtUtc,
                        language,
                      )}
                    </small>
                  </div>
                  <dl>
                    <div>
                      <dt>{tr("Proveedor", "Supplier")}</dt>
                      <dd>{shipment.supplierName}</dd>
                    </div>
                    <div>
                      <dt>
                        {tr("Responsable al cierre", "Responsible at closing")}
                      </dt>
                      <dd>
                        {shipment.responsibleWorkerName ??
                          tr("Sin asignación", "Unassigned")}
                      </dd>
                    </div>
                    <div>
                      <dt>{tr("Cajuelas", "Cajuelas")}</dt>
                      <dd>{shipment.cajuelaTotal}</dd>
                    </div>
                    <div>
                      <dt>{tr("Barridas", "Sweeps")}</dt>
                      <dd>{shipment.sweepCount}</dd>
                    </div>
                  </dl>
                  <Link
                    className="secondary-link"
                    to={{
                      pathname: `/gerencia/cargamentos/${shipment.shipmentId}`,
                      search: searchParams.toString(),
                    }}
                  >
                    {tr("ABRIR DETALLE →", "OPEN DETAILS →")}
                  </Link>
                </article>
              ))}
            </div>
            <Pagination
              page={shipments.data.page}
              totalPages={shipments.data.totalPages}
              searchParams={searchParams}
              setSearchParams={setSearchParams}
            />
          </>
        )}
      </section>
    </>
  );
}

export function ShipmentDetailFeature() {
  const { language, tr } = useLanguage();
  const { shipmentId = "" } = useParams();
  const location = useLocation();
  const shipment = useManagementShipment(shipmentId);
  const sweeps = useManagementShipmentSweeps(shipmentId);
  const audit = useShipmentAuditEvents();

  if (shipment.isPending)
    return (
      <ShipmentState title={tr("Consultando detalle", "Loading details")}>
        {tr(
          "Espere mientras se reconstruye el cargamento.",
          "Please wait while the shipment is reconstructed.",
        )}
      </ShipmentState>
    );
  if (shipment.isError || shipment.data === undefined)
    return (
      <ShipmentState
        title={tr(
          "No se pudo abrir el cargamento",
          "Shipment could not be opened",
        )}
        error
      >
        {requestErrorMessage(
          shipment.error,
          tr(
            "El cargamento no existe o la consulta central no está disponible.",
            "The shipment does not exist or the central query is unavailable.",
          ),
          language,
        )}
      </ShipmentState>
    );

  const events = (audit.data?.items ?? []).filter(
    (event) => event.entityType === "shipment" && event.entityId === shipmentId,
  );
  const sweepGroups = groupSweeps(sweeps.data?.items ?? []);

  return (
    <div className="shipment-detail">
      <Link
        className="secondary-link back-link"
        to={{ pathname: "/gerencia/cargamentos", search: location.search }}
      >
        {tr("← VOLVER AL HISTORIAL", "← BACK TO HISTORY")}
      </Link>

      <section className="shipment-detail-hero">
        <div>
          <p className="eyebrow light">
            {tr("CARGAMENTO CERRADO", "CLOSED SHIPMENT")}
          </p>
          <h2>{shortShipmentId(shipment.data.shipmentId)}</h2>
          <p>
            {shipment.data.productionLineName} · {shipment.data.supplierName}
          </p>
        </div>
        <span className="line-status current">
          {tr("CONFIRMADO", "CONFIRMED")}
        </span>
      </section>

      <div className="detail-metrics">
        <DetailMetric
          label={tr("Cajuelas", "Cajuelas")}
          value={shipment.data.cajuelaTotal}
        />
        <DetailMetric
          label={tr("Barridas", "Sweeps")}
          value={shipment.data.sweepCount}
        />
        <DetailMetric
          label={tr("Responsable al cierre", "Responsible at closing")}
          value={
            shipment.data.responsibleWorkerName ??
            tr("Sin asignación", "Unassigned")
          }
        />
        <DetailMetric
          label={tr("Estación", "Station")}
          value={shipment.data.stationName}
        />
      </div>

      <section className="portal-panel detail-section">
        <header>
          <div>
            <h2>{tr("Momentos del cargamento", "Shipment timeline")}</h2>
            <p>
              {tr(
                "Horas operativas mostradas en Costa Rica",
                "Operating times shown in Costa Rica time",
              )}
            </p>
          </div>
        </header>
        <dl className="detail-times">
          <div>
            <dt>{tr("Inicio ocurrido", "Started at")}</dt>
            <dd>
              {formatCostaRicaDateTime(shipment.data.startedAtUtc, language)}
            </dd>
          </div>
          <div>
            <dt>{tr("Cierre ocurrido", "Closed at")}</dt>
            <dd>
              {formatCostaRicaDateTime(shipment.data.completedAtUtc, language)}
            </dd>
          </div>
          <div>
            <dt>{tr("Última actividad central", "Latest central activity")}</dt>
            <dd>
              {formatCostaRicaDateTime(
                shipment.data.lastActivityAtUtc,
                language,
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="portal-panel detail-section">
        <header>
          <div>
            <h2>{tr("Barridas y mercurio", "Sweeps and mercury")}</h2>
            <p>
              {tr(
                "Medición vigente por barrida y rastra",
                "Current measurement by sweep and component",
              )}
            </p>
          </div>
        </header>
        {sweeps.isPending ? (
          <ShipmentState title={tr("Consultando barridas", "Loading sweeps")}>
            {tr("Espere un momento.", "Please wait.")}
          </ShipmentState>
        ) : sweeps.isError ? (
          <ShipmentState
            title={tr(
              "No se pudieron consultar las barridas",
              "Sweeps could not be loaded",
            )}
            error
          >
            {requestErrorMessage(
              sweeps.error,
              tr(
                "El resumen del cargamento permanece disponible.",
                "The shipment summary remains available.",
              ),
              language,
            )}
          </ShipmentState>
        ) : sweepGroups.length === 0 ? (
          <ShipmentState
            title={tr("Sin barridas proyectadas", "No projected sweeps")}
          >
            {tr(
              "Este cargamento no tiene barridas disponibles en la proyección central.",
              "This shipment has no sweeps available in the central projection.",
            )}
          </ShipmentState>
        ) : (
          <div className="sweep-list">
            {sweepGroups.map((group) => (
              <article className="sweep-card" key={group.sweepId}>
                <header>
                  <div>
                    <strong>
                      {tr("Barrida", "Sweep")} {shortShipmentId(group.sweepId)}
                    </strong>
                    <small>
                      {formatCostaRicaDateTime(group.sweptAtUtc, language)}
                    </small>
                  </div>
                  <span>
                    {group.cajuelaCount} {tr("cajuelas", "cajuelas")}
                  </span>
                </header>
                <div className="mercury-grid">
                  {group.components.map((component) => (
                    <div key={component.lineComponentId}>
                      <strong>{component.lineComponentName}</strong>
                      <span>
                        {tr("Entrada", "Input")}:{" "}
                        {mercuryValue(component.inputGrams, language)}
                      </span>
                      <span>
                        {tr("Remanente", "Remainder")}:{" "}
                        {mercuryValue(component.remainderGrams, language)}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="portal-panel detail-section">
        <header>
          <div>
            <h2>{tr("Cambios auditados", "Audited changes")}</h2>
            <p>
              {tr(
                "Ocurrencia y confirmación central se muestran por separado",
                "Occurrence and central confirmation are shown separately",
              )}
            </p>
          </div>
        </header>
        {audit.isPending ? (
          <ShipmentState title={tr("Consultando auditoría", "Loading audit")}>
            {tr("Espere un momento.", "Please wait.")}
          </ShipmentState>
        ) : audit.isError ? (
          <ShipmentState
            title={tr(
              "No se pudo consultar la auditoría",
              "Audit could not be loaded",
            )}
            error
          >
            {requestErrorMessage(
              audit.error,
              tr(
                "El detalle operativo permanece disponible.",
                "Operational details remain available.",
              ),
              language,
            )}
          </ShipmentState>
        ) : events.length === 0 ? (
          <ShipmentState
            title={tr(
              "Sin cambios auditados para este cargamento",
              "No audited changes for this shipment",
            )}
          >
            {tr(
              "No hay entradas visibles dentro de la página de auditoría actual.",
              "There are no visible entries on the current audit page.",
            )}
          </ShipmentState>
        ) : (
          <AuditEventList events={events} />
        )}
      </section>
    </div>
  );
}

export function ShipmentAuditFeature() {
  const { language, tr } = useLanguage();
  const audit = useShipmentAuditEvents();
  const shipments = useRecentManagementShipments();

  if (audit.isPending || shipments.isPending)
    return (
      <ShipmentState title={tr("Consultando auditoría", "Loading audit")}>
        {tr(
          "Espere mientras se agrupan los movimientos.",
          "Please wait while changes are grouped.",
        )}
      </ShipmentState>
    );
  if (
    audit.isError ||
    shipments.isError ||
    audit.data === undefined ||
    shipments.data === undefined
  )
    return (
      <ShipmentState
        title={tr(
          "No se pudo consultar la auditoría",
          "Audit could not be loaded",
        )}
        error
      >
        {requestErrorMessage(
          audit.error ?? shipments.error,
          undefined,
          language,
        )}
      </ShipmentState>
    );

  const shipmentById = new Map(
    shipments.data.items.map((shipment) => [shipment.shipmentId, shipment]),
  );
  const grouped = groupAudit(audit.data.items);

  if (grouped.length === 0)
    return (
      <ShipmentState
        title={tr(
          "Aún no hay movimientos de cargamentos",
          "There are no shipment changes yet",
        )}
      >
        {tr(
          "La consulta central respondió correctamente, pero no devolvió cambios auditados de cargamentos.",
          "The central query responded successfully, but returned no audited shipment changes.",
        )}
      </ShipmentState>
    );

  return (
    <div className="audit-groups">
      {grouped.map(([shipmentId, events]) => {
        const shipment = shipmentById.get(shipmentId);
        return (
          <article className="audit-group" key={shipmentId}>
            <header>
              <div>
                <span>
                  {tr("CARGAMENTO", "SHIPMENT")} {shortShipmentId(shipmentId)}
                </span>
                <h3>
                  {shipment?.productionLineName ??
                    tr("Cargamento operativo", "Operational shipment")}
                </h3>
                <p>
                  {shipment === undefined
                    ? tr(
                        "Detalle disponible desde la ficha trazable",
                        "Details available from the traceability record",
                      )
                    : `${shipment.supplierName} · ${shipment.cajuelaTotal} ${tr("cajuelas", "cajuelas")}`}
                </p>
              </div>
              <Link
                className="secondary-link"
                to={`/gerencia/cargamentos/${shipmentId}`}
              >
                {tr("ABRIR CARGAMENTO →", "OPEN SHIPMENT →")}
              </Link>
            </header>
            <AuditEventList events={events} />
          </article>
        );
      })}
    </div>
  );
}

function ShipmentFiltersPanel({
  filters,
  items,
  update,
}: {
  filters: ShipmentFilters;
  items: ManagementShipment[];
  update(this: void, key: string, value: string): void;
}) {
  const { tr } = useLanguage();
  const lines = uniqueOptions(
    items.map((item) => [item.productionLineId, item.productionLineName]),
  );
  const suppliers = uniqueOptions(
    items.map((item) => [item.supplierId, item.supplierName]),
  );
  const responsible = uniqueOptions(
    items.flatMap((item) =>
      item.responsibleWorkerId === null
        ? []
        : [
            [
              item.responsibleWorkerId,
              item.responsibleWorkerName ?? tr("Sin nombre", "No name"),
            ],
          ],
    ),
  );

  return (
    <section
      className="shipment-filters"
      aria-label={tr("Filtros de cargamentos", "Shipment filters")}
    >
      <label>
        {tr("Período", "Period")}
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
          {tr("Fecha en Costa Rica", "Date in Costa Rica")}
          <input
            type="date"
            value={filters.date}
            onChange={(event) => update("date", event.target.value)}
          />
        </label>
      )}
      <FilterSelect
        label={tr("Línea", "Line")}
        name="line"
        value={filters.productionLineId ?? ""}
        options={lines}
        all={tr("Todas las líneas", "All lines")}
        update={update}
      />
      <FilterSelect
        label={tr("Proveedor", "Supplier")}
        name="supplier"
        value={filters.supplierId ?? ""}
        options={suppliers}
        all={tr("Todos los proveedores", "All suppliers")}
        update={update}
      />
      <FilterSelect
        label={tr("Responsable", "Responsible worker")}
        name="responsible"
        value={filters.responsibleWorkerId ?? ""}
        options={responsible}
        all={tr("Todos los responsables", "All responsible workers")}
        update={update}
      />
    </section>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
  all,
  update,
}: {
  label: string;
  name: string;
  value: string;
  options: [string, string][];
  all: string;
  update(this: void, key: string, value: string): void;
}) {
  const { tr } = useLanguage();

  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => update(name, event.target.value)}
      >
        <option value="">{all}</option>
        {value.length > 0 && !options.some(([id]) => id === value) && (
          <option value={value}>
            {tr("Filtro seleccionado", "Selected filter")}
          </option>
        )}
        {options.map(([id, nameValue]) => (
          <option value={id} key={id}>
            {nameValue}
          </option>
        ))}
      </select>
    </label>
  );
}

function Pagination({
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
      aria-label={tr("Páginas de cargamentos", "Shipment pages")}
    >
      <button type="button" disabled={page <= 1} onClick={() => go(page - 1)}>
        {tr("← Anterior", "← Previous")}
      </button>
      <span>
        {tr("Página", "Page")} {page} {tr("de", "of")} {Math.max(totalPages, 1)}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
      >
        {tr("Siguiente →", "Next →")}
      </button>
    </nav>
  );
}

function AuditEventList({ events }: { events: AuditEvent[] }) {
  const { language, tr } = useLanguage();

  return (
    <ol className="audit-timeline">
      {events.map((event) => (
        <li key={event.id}>
          <div>
            <strong>{auditAction(event.action, language)}</strong>
            <span>
              {event.actorDisplayName ?? tr("Sistema", "System")} ·{" "}
              {auditResult(event.result, language)}
            </span>
          </div>
          <dl>
            <div>
              <dt>{tr("Ocurrió", "Occurred")}</dt>
              <dd>{formatCostaRicaDateTime(event.occurredAt, language)}</dd>
            </div>
            <div>
              <dt>{tr("Confirmado en centro", "Confirmed centrally")}</dt>
              <dd>{formatCostaRicaDateTime(event.recordedAt, language)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}

function DetailMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ShipmentState({
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

function groupSweeps(items: ManagementSweepMercury[]) {
  const groups = new Map<
    string,
    {
      sweepId: string;
      sweptAtUtc: string;
      cajuelaCount: number;
      components: ManagementSweepMercury[];
    }
  >();
  for (const item of items) {
    const group = groups.get(item.sweepId);
    if (group === undefined) {
      groups.set(item.sweepId, {
        sweepId: item.sweepId,
        sweptAtUtc: item.sweptAtUtc,
        cajuelaCount: item.cajuelaCount,
        components: [item],
      });
    } else group.components.push(item);
  }
  return [...groups.values()];
}

function groupAudit(items: AuditEvent[]): [string, AuditEvent[]][] {
  const groups = new Map<string, AuditEvent[]>();
  for (const event of items) {
    if (event.entityType !== "shipment" || event.entityId === null) continue;
    const events = groups.get(event.entityId) ?? [];
    events.push(event);
    groups.set(event.entityId, events);
  }
  return [...groups.entries()];
}

function uniqueOptions(items: [string, string][]): [string, string][] {
  return [...new Map(items).entries()].sort((left, right) =>
    left[1].localeCompare(right[1], "es"),
  );
}

function mercuryValue(value: number | null, language: "es" | "en"): string {
  return value === null
    ? language === "es"
      ? "Pendiente"
      : "Pending"
    : `${value.toLocaleString(language === "es" ? "es-CR" : "en-US")} g`;
}

function auditAction(value: string, language: "es" | "en"): string {
  return value === "sync.ingest"
    ? language === "es"
      ? "Cambio operativo recibido"
      : "Operational change received"
    : value;
}

function auditResult(
  value: AuditEvent["result"],
  language: "es" | "en",
): string {
  if (value === "SUCCEEDED")
    return language === "es" ? "Confirmado" : "Confirmed";
  if (value === "REJECTED") return language === "es" ? "Rechazado" : "Rejected";
  return language === "es" ? "Falló" : "Failed";
}
