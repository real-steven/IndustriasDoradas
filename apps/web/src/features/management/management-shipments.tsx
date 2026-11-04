import { useRef, useState, type FormEvent, type ReactNode } from "react";
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
  resolveShipmentReference,
  shortShipmentId,
  useManagementShipment,
  useManagementShipmentFilterOptions,
  useManagementShipments,
  useManagementShipmentSweeps,
  useShipmentAuditEvents,
  type AuditEvent,
  type ShipmentFilters,
} from "./management-shipments-data";
import {
  managerAuditAction,
  managerAuditArea,
  managerAuditOrigin,
  managerAuditResult,
} from "./management-audit-labels";
import { ManagementAuditDetail } from "./management-audit-detail";
import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";

export function ShipmentsFeature() {
  const { language, tr } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilters = parseShipmentFilters(searchParams);
  const filterOptions = useManagementShipmentFilterOptions(requestedFilters);
  const shipmentId = resolveShipmentReference(
    requestedFilters.shipmentReference,
    filterOptions.data?.items ?? [],
  );
  const filters: ShipmentFilters = {
    ...requestedFilters,
    ...(shipmentId === undefined ? {} : { shipmentId }),
  };
  const shipments = useManagementShipments(filters);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.length === 0) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    if (key === "period" && value !== "date") {
      next.delete("date");
      next.delete("to");
    }
    if (key === "period" && value === "date") {
      if (!next.has("date")) next.set("date", filters.date);
      if (!next.has("to")) next.set("to", filters.toDate);
    }
    if (key === "date" && value > filters.toDate) next.set("to", value);
    if (key === "to" && value < filters.date) next.set("date", value);
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
  const audit = useShipmentAuditEvents({
    search: shipmentId,
    action: "sync.ingest",
    entityType: "shipment",
    page: 1,
    pageSize: 100,
  });

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
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search")?.trim() ?? "";
  const requestedAction = selectedAuditActionFilter(searchParams.get("action"));
  const requestedGroup = selectedAuditGroup(searchParams.get("group"));
  const actionFilter =
    requestedGroup === undefined ||
    requestedAction?.group === requestedGroup.key
      ? requestedAction
      : undefined;
  const selectedGroup =
    requestedGroup ??
    auditGroups.find((group) => group.key === actionFilter?.group);
  const fromDate = auditDate(searchParams.get("from"));
  const toDate = auditDate(searchParams.get("to"));
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const [draftSearch, setDraftSearch] = useState(search);
  const audit = useShipmentAuditEvents({
    search,
    ...(selectedGroup === undefined || actionFilter !== undefined
      ? {}
      : { category: selectedGroup.key }),
    ...(actionFilter === undefined ? {} : { action: actionFilter.action }),
    ...(actionFilter?.entityType === undefined
      ? {}
      : { entityType: actionFilter.entityType }),
    fromDate,
    toDate,
    page,
    pageSize: 12,
  });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.length === 0) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    setSearchParams(next);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update("search", draftSearch.trim());
  };

  const clear = () => {
    setDraftSearch("");
    setSearchParams(new URLSearchParams());
  };

  const selectGroup = (group: AuditGroupKey | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (group === undefined) next.delete("group");
    else next.set("group", group);
    next.delete("action");
    next.delete("page");
    setSearchParams(next);
  };

  const selectAction = (action: string | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (action === undefined) next.delete("action");
    else next.set("action", action);
    next.delete("page");
    setSearchParams(next);
  };

  return (
    <div className="manager-audit">
      <section className="audit-category-panel" aria-labelledby="audit-groups">
        <header className="audit-category-heading">
          <div>
            <h3 id="audit-groups">
              {tr("Explorar por área", "Browse by area")}
            </h3>
            <p>
              {tr(
                "Seleccione un grupo y luego refine la actividad que desea consultar.",
                "Select a group and then refine the activity you want to review.",
              )}
            </p>
          </div>
          <button
            type="button"
            className={`audit-all-button${selectedGroup === undefined ? " active" : ""}`}
            aria-pressed={selectedGroup === undefined}
            onClick={() => selectGroup(undefined)}
          >
            {tr("VER TODO", "VIEW ALL")}
          </button>
        </header>

        <div className="audit-category-cards" role="group">
          {auditGroups.map((group) => {
            const active = selectedGroup?.key === group.key;
            return (
              <button
                key={group.key}
                type="button"
                className={`audit-category-card${active ? " active" : ""}`}
                aria-pressed={active}
                onClick={() => selectGroup(group.key)}
              >
                <span className="audit-category-icon" aria-hidden="true">
                  {group.icon}
                </span>
                <span className="audit-category-copy">
                  <strong>{tr(group.spanish, group.english)}</strong>
                  <small>
                    {tr(group.descriptionSpanish, group.descriptionEnglish)}
                  </small>
                </span>
                <span className="audit-category-state" aria-hidden="true">
                  {active ? "✓" : "›"}
                </span>
              </button>
            );
          })}
        </div>

        {selectedGroup !== undefined && (
          <div className="audit-subactions">
            <span>{tr("Acciones del grupo", "Group actions")}</span>
            <div
              className="audit-subaction-chips"
              role="group"
              aria-label={tr(
                `Acciones de ${selectedGroup.spanish}`,
                `${selectedGroup.english} actions`,
              )}
            >
              <button
                type="button"
                className={actionFilter === undefined ? "active" : ""}
                aria-pressed={actionFilter === undefined}
                onClick={() => selectAction(undefined)}
              >
                {tr("Todo el grupo", "Entire group")}
              </button>
              {auditActionFilters
                .filter((option) => option.group === selectedGroup.key)
                .map((option) => {
                  const active = actionFilter?.key === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={active ? "active" : ""}
                      aria-pressed={active}
                      onClick={() => selectAction(option.key)}
                    >
                      {tr(option.spanish, option.english)}
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </section>

      <form className="audit-filters" onSubmit={submitSearch}>
        <label className="audit-search">
          <span>{tr("Buscar actividad", "Search activity")}</span>
          <input
            type="search"
            value={draftSearch}
            placeholder={tr(
              "ID completo de cargamento, persona o referencia",
              "Full shipment ID, person, or reference",
            )}
            onChange={(event) => setDraftSearch(event.target.value)}
          />
        </label>
        <label>
          <span>{tr("Desde", "From")}</span>
          <input
            type="date"
            value={fromDate ?? ""}
            max={toDate}
            onChange={(event) => update("from", event.target.value)}
          />
        </label>
        <label>
          <span>{tr("Hasta", "To")}</span>
          <input
            type="date"
            value={toDate ?? ""}
            min={fromDate}
            onChange={(event) => update("to", event.target.value)}
          />
        </label>
        <div className="audit-filter-actions">
          <button type="submit" className="primary-button">
            {tr("BUSCAR", "SEARCH")}
          </button>
          <button type="button" className="secondary" onClick={clear}>
            {tr("LIMPIAR", "CLEAR")}
          </button>
        </div>
      </form>

      {audit.isPending ? (
        <ShipmentState title={tr("Consultando auditoría", "Loading audit")}>
          {tr(
            "Espere mientras se consulta la actividad importante.",
            "Please wait while important activity is loaded.",
          )}
        </ShipmentState>
      ) : audit.isError || audit.data === undefined ? (
        <ShipmentState
          title={tr(
            "No se pudo consultar la auditoría",
            "Audit could not be loaded",
          )}
          error
        >
          {requestErrorMessage(audit.error, undefined, language)}
        </ShipmentState>
      ) : audit.data.items.length === 0 ? (
        <ShipmentState
          title={tr("No hay actividad para mostrar", "No activity to show")}
        >
          {tr(
            "Pruebe otro texto o amplíe el rango de fechas.",
            "Try another search or broaden the date range.",
          )}
        </ShipmentState>
      ) : (
        <>
          <div className="audit-list" aria-live="polite">
            {audit.data.items.map((event) => (
              <ManagerAuditEvent key={event.id} event={event} />
            ))}
          </div>
          <AuditPagination
            page={audit.data.page}
            totalPages={audit.data.totalPages}
            total={audit.data.total}
            searchParams={searchParams}
            setSearchParams={setSearchParams}
          />
        </>
      )}
    </div>
  );
}

function ManagerAuditEvent({ event }: { event: AuditEvent }) {
  const { language, tr } = useLanguage();
  const [detailOpen, setDetailOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeDetail = () => {
    setDetailOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <article className="manager-audit-event">
        <div className="audit-event-main">
          <span className={`audit-result ${event.result.toLowerCase()}`}>
            {managerAuditResult(event.result, language)}
          </span>
          <div>
            <h3>{managerAuditAction(event, language)}</h3>
            <p>
              {tr("Realizado por", "Performed by")}{" "}
              <strong>
                {event.actorDisplayName ?? tr("Sistema", "System")}
              </strong>
              <span className="audit-origin">
                {managerAuditOrigin(event.origin, language)}
              </span>
            </p>
          </div>
        </div>
        <dl className="audit-event-context">
          <div>
            <dt>{tr("Fecha y hora", "Date and time")}</dt>
            <dd>{formatCostaRicaDateTime(event.occurredAt, language)}</dd>
          </div>
          <div>
            <dt>{tr("Área", "Area")}</dt>
            <dd>{managerAuditArea(event.entityType, language)}</dd>
          </div>
          {event.entityId !== null && (
            <div>
              <dt>{tr("Referencia", "Reference")}</dt>
              <dd>{shortShipmentId(event.entityId)}</dd>
            </div>
          )}
        </dl>
        <div className="audit-event-actions">
          {event.entityType === "shipment" &&
            event.entityId !== null &&
            event.result === "SUCCEEDED" &&
            event.shipmentStatus === "COMPLETED" && (
              <Link
                className="secondary-link audit-shipment-link"
                to={`/gerencia/cargamentos/${event.entityId}`}
              >
                {tr("VER CARGAMENTO", "VIEW SHIPMENT")}
              </Link>
            )}
          {event.entityType === "shipment" &&
            event.entityId !== null &&
            event.result === "SUCCEEDED" &&
            event.shipmentStatus === "ACTIVE" && (
              <span className="audit-shipment-state">
                {tr("CARGAMENTO ACTIVO", "ACTIVE SHIPMENT")}
              </span>
            )}
          <button
            ref={triggerRef}
            type="button"
            className="secondary audit-detail-trigger"
            onClick={() => setDetailOpen(true)}
          >
            {tr("ABRIR DETALLE", "OPEN DETAILS")}
          </button>
        </div>
      </article>
      {detailOpen && (
        <ManagementAuditDetail event={event} close={closeDetail} />
      )}
    </>
  );
}

function AuditPagination({
  page,
  totalPages,
  total,
  searchParams,
  setSearchParams,
}: {
  page: number;
  totalPages: number;
  total: number;
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
      className="history-pagination audit-pagination"
      aria-label={tr("Páginas de auditoría", "Audit pages")}
    >
      <span>
        {total}{" "}
        {total === 1
          ? tr("actividad", "activity")
          : tr("actividades", "activities")}
      </span>
      <button type="button" disabled={page <= 1} onClick={() => go(page - 1)}>
        {tr("← Anterior", "← Previous")}
      </button>
      <span>
        {tr("Página", "Page")} {page} {tr("de", "of")} {Math.max(totalPages, 1)}
      </span>
      <button
        type="button"
        disabled={totalPages === 0 || page >= totalPages}
        onClick={() => go(page + 1)}
      >
        {tr("Siguiente →", "Next →")}
      </button>
    </nav>
  );
}

function auditDate(value: string | null): string | undefined {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  return value;
}

type AuditGroupKey = "operation" | "people" | "administration";

interface AuditGroupOption {
  key: AuditGroupKey;
  icon: string;
  spanish: string;
  english: string;
  descriptionSpanish: string;
  descriptionEnglish: string;
}

interface AuditActionFilterOption {
  key: string;
  group: AuditGroupKey;
  spanish: string;
  english: string;
  action: string;
  entityType?: string;
}

const auditGroups: readonly AuditGroupOption[] = [
  {
    key: "operation",
    icon: "▤",
    spanish: "Operación de planta",
    english: "Plant operations",
    descriptionSpanish: "Cargamentos, producción y movimientos de planta",
    descriptionEnglish: "Shipments, production, and plant movements",
  },
  {
    key: "people",
    icon: "♙",
    spanish: "Personal",
    english: "People",
    descriptionSpanish: "Marcaciones y correcciones de asistencia",
    descriptionEnglish: "Attendance entries and corrections",
  },
  {
    key: "administration",
    icon: "⚙",
    spanish: "Seguridad y administración",
    english: "Security and administration",
    descriptionSpanish: "Cuentas, permisos y accesos protegidos",
    descriptionEnglish: "Accounts, permissions, and protected access",
  },
];

const auditActionFilters: readonly AuditActionFilterOption[] = [
  {
    key: "desktop-shipments",
    group: "operation",
    spanish: "Cargamentos del desktop",
    english: "Desktop shipments",
    action: "sync.ingest",
    entityType: "shipment",
  },
  {
    key: "desktop-cajuelas",
    group: "operation",
    spanish: "Cajuelas registradas",
    english: "Recorded cajuelas",
    action: "sync.ingest",
    entityType: "production_event",
  },
  {
    key: "desktop-sweeps",
    group: "operation",
    spanish: "Barridas de producción",
    english: "Production sweeps",
    action: "sync.ingest",
    entityType: "production_sweep",
  },
  {
    key: "desktop-mercury",
    group: "operation",
    spanish: "Movimientos de mercurio",
    english: "Mercury movements",
    action: "sync.ingest",
    entityType: "mercury_movement",
  },
  {
    key: "attendance-recorded",
    group: "people",
    spanish: "Marcaciones de asistencia",
    english: "Attendance entries",
    action: "attendance.record",
  },
  {
    key: "attendance-corrected",
    group: "people",
    spanish: "Correcciones de asistencia",
    english: "Attendance corrections",
    action: "attendance.correct",
  },
  {
    key: "account-created",
    group: "administration",
    spanish: "Cuentas creadas",
    english: "Created accounts",
    action: "account.provision",
  },
  {
    key: "account-status",
    group: "administration",
    spanish: "Estados de cuenta",
    english: "Account status changes",
    action: "account.governance",
  },
  {
    key: "permissions",
    group: "administration",
    spanish: "Cambios de permisos",
    english: "Permission changes",
    action: "permission.governance",
  },
  {
    key: "protected-access",
    group: "administration",
    spanish: "Accesos protegidos",
    english: "Protected access",
    action: "privilege.elevation",
  },
  {
    key: "authorization-blocks",
    group: "administration",
    spanish: "Bloqueos por autorización",
    english: "Authorization blocks",
    action: "authorization.policy",
  },
  {
    key: "business-changes",
    group: "administration",
    spanish: "Cambios administrativos",
    english: "Administrative changes",
    action: "business.mutation",
  },
];

function selectedAuditGroup(
  value: string | null,
): AuditGroupOption | undefined {
  return auditGroups.find((group) => group.key === value);
}

function selectedAuditActionFilter(
  value: string | null,
): AuditActionFilterOption | undefined {
  return auditActionFilters.find((option) => option.key === value);
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
      <label className="shipment-reference-filter">
        {tr("Buscar por ID", "Search by ID")}
        <input
          type="search"
          value={filters.shipmentReference}
          placeholder={tr("Ej. 22B1CC83", "E.g. 22B1CC83")}
          autoComplete="off"
          maxLength={36}
          onChange={(event) => update("shipment", event.target.value)}
        />
      </label>
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
          <option value="date">{tr("Rango de fechas", "Date range")}</option>
          <option value="all">{tr("Mostrar todo", "All")}</option>
        </select>
      </label>
      {filters.period === "date" && (
        <>
          <label>
            {tr("Desde", "From")}
            <input
              type="date"
              max={filters.toDate}
              value={filters.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </label>
          <label>
            {tr("Hasta", "To")}
            <input
              type="date"
              min={filters.date}
              value={filters.toDate}
              onChange={(event) => update("to", event.target.value)}
            />
          </label>
        </>
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
