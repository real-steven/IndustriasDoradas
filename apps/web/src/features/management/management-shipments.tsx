import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type {
  GoldShipmentOverview,
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
  normalizeShipmentCode,
  parseShipmentFilters,
  shortShipmentId,
  useManagementShipment,
  useManagementShipments,
  useManagementShipmentSweeps,
  useAuditFilterCatalog,
  useShipmentAuditEvents,
  type AuditEvent,
  type ShipmentFilters,
} from "./management-shipments-data";
import {
  auditActivityServerFilters,
  auditFilterDefinitions,
  selectedAuditFilter,
  shipmentServerFilters,
  type AuditGroupKey,
  type AuditViewKey,
} from "./management-audit-filters";
import {
  managerAuditAction,
  managerAuditArea,
  managerAuditOrigin,
  managerAuditResult,
} from "./management-audit-labels";
import { ManagementAuditDetail } from "./management-audit-detail";
import { ShipmentIdentifier } from "./shipment-identifier";
import { useGoldOverview } from "../gold/gold-data";
import { requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";

export function ShipmentsFeature({
  view,
  onViewChange,
}: {
  view: AuditViewKey;
  onViewChange: (view: AuditViewKey) => void;
}) {
  const { language, locale, tr } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilters = parseShipmentFilters(searchParams);
  const search = searchParams.get("search")?.trim();
  const fromDate = auditDate(searchParams.get("from"));
  const toDate = auditDate(searchParams.get("to"));
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const unifiedFilters =
    search !== undefined || fromDate !== undefined || toDate !== undefined;
  const requestedRangeStart = fromDate ?? toDate ?? requestedFilters.date;
  const requestedRangeEnd = toDate ?? fromDate ?? requestedFilters.toDate;
  const [rangeStart, rangeEnd] =
    requestedRangeStart <= requestedRangeEnd
      ? [requestedRangeStart, requestedRangeEnd]
      : [requestedRangeEnd, requestedRangeStart];
  const baseFilters: ShipmentFilters = unifiedFilters
    ? {
        period: fromDate === undefined && toDate === undefined ? "all" : "date",
        date: rangeStart,
        toDate: rangeEnd,
        shipmentReference: search ?? "",
        page:
          Number.isSafeInteger(requestedPage) && requestedPage > 0
            ? requestedPage
            : 1,
      }
    : requestedFilters;
  // El código se busca en el servidor (código corto o UUID completo); nunca se
  // descargan los cargamentos para buscarlo en el navegador.
  const searchedReference = baseFilters.shipmentReference.trim();
  const shipmentCode = normalizeShipmentCode(searchedReference);
  const searchingCode = searchedReference.length > 0;
  const invalidCode = searchingCode && shipmentCode === undefined;
  const filters: ShipmentFilters = {
    ...baseFilters,
    ...shipmentServerFilters(selectedAuditFilter(view, searchParams)),
    ...(shipmentCode === undefined ? {} : { shipmentCode }),
  };
  const shipments = useManagementShipments(filters, { enabled: !invalidCode });
  const mercury = useGoldOverview(
    invalidCode
      ? []
      : (shipments.data?.items ?? []).map((item) => item.shipmentId),
  );
  const [draftSearch, setDraftSearch] = useState(filters.shipmentReference);

  const update = (key: "from" | "to", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.length === 0) next.delete(key);
    else next.set(key, value);
    next.delete("date");
    next.delete("shipment");
    next.set("period", "all");
    next.delete("page");
    setSearchParams(next);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    const value = draftSearch.trim();
    if (value.length === 0) next.delete("search");
    else next.set("search", value);
    next.delete("shipment");
    next.delete("page");
    setSearchParams(next);
  };

  const clear = () => {
    setDraftSearch("");
    setSearchParams(new URLSearchParams({ view: "shipments", period: "all" }));
  };

  return (
    <>
      <form className="audit-filters" onSubmit={submitSearch}>
        <AuditViewField value={view} onChange={onViewChange} />
        <AuditDependentFilters
          view={view}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
        />
        <label className="audit-search">
          <span>{tr("Buscar actividad", "Search activity")}</span>
          <input
            type="search"
            value={draftSearch}
            placeholder={tr(
              "Código del cargamento (5510B16A) o UUID",
              "Shipment code (5510B16A) or UUID",
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
      <section className="shipment-history" aria-live="polite">
        {invalidCode ? (
          <ShipmentState
            title={tr(
              "No se encontró un cargamento con ese código.",
              "No shipment was found with that code.",
            )}
          >
            {tr(
              "Pegue el código de 8 caracteres (por ejemplo 5510B16A) o el identificador completo.",
              "Paste the 8-character code (for example 5510B16A) or the full identifier.",
            )}
          </ShipmentState>
        ) : shipments.isPending ? (
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
        ) : shipments.data.items.length === 0 && searchingCode ? (
          <ShipmentState
            title={tr(
              "No se encontró un cargamento con ese código.",
              "No shipment was found with that code.",
            )}
          >
            {tr(
              "Revise el código o quite los demás filtros y el rango de fechas.",
              "Check the code or remove the other filters and the date range.",
            )}
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
                    <ShipmentIdentifier
                      shipmentId={shipment.shipmentId}
                      supplierName={shipment.supplierName}
                    />
                    <strong>{shipment.productionLineName}</strong>
                    <small>
                      {tr("Inicio", "Started")}{" "}
                      {formatCostaRicaDateTime(shipment.startedAtUtc, language)}
                    </small>
                    <small>
                      {tr("Cerrado", "Closed")}{" "}
                      {formatCostaRicaDateTime(
                        shipment.completedAtUtc,
                        language,
                      )}
                    </small>
                    <span className="shipment-row-status">
                      {tr("FINALIZADO", "COMPLETED")}
                    </span>
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
                    {shipment.hasGoldResult &&
                      shipment.goldAmountGrams !== null && (
                        <div>
                          <dt>{tr("Oro", "Gold")}</dt>
                          <dd>
                            {formatShipmentNumber(
                              shipment.goldAmountGrams,
                              locale,
                              2,
                            )}{" "}
                            g
                          </dd>
                        </div>
                      )}
                    {shipment.hasGoldResult && shipment.goldKarat !== null && (
                      <div>
                        <dt>{tr("Quilataje", "Karat")}</dt>
                        <dd>
                          {formatShipmentNumber(shipment.goldKarat, locale, 3)}{" "}
                          k
                        </dd>
                      </div>
                    )}
                    <ShipmentMercuryFact
                      overview={mercury.data?.find(
                        (item) => item.shipmentId === shipment.shipmentId,
                      )}
                    />
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
  const backSearch = new URLSearchParams(location.search);
  backSearch.set("view", "shipments");

  return (
    <div className="shipment-detail">
      <Link
        className="secondary-link back-link"
        to={{
          pathname: "/gerencia/auditoria",
          search: backSearch.toString(),
        }}
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
          <ShipmentIdentifier
            className="light"
            shipmentId={shipment.data.shipmentId}
            supplierName={shipment.data.supplierName}
          />
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
  const [searchParams, setSearchParams] = useSearchParams();
  const view = selectedAuditView(searchParams.get("view"));

  const selectView = (nextView: AuditViewKey) => {
    const next = new URLSearchParams();
    if (nextView !== "all") next.set("view", nextView);
    if (nextView === "shipments") next.set("period", "all");
    setSearchParams(next);
  };

  if (view === "shipments")
    return (
      <div className="manager-audit">
        <ShipmentsFeature view={view} onViewChange={selectView} />
      </div>
    );

  return <AuditActivityFeature view={view} onViewChange={selectView} />;
}

function AuditActivityFeature({
  view,
  onViewChange,
}: {
  view: Exclude<AuditViewKey, "shipments">;
  onViewChange: (view: AuditViewKey) => void;
}) {
  const { language, tr } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search")?.trim() ?? "";
  const selectedGroup = view === "all" ? undefined : selectedAuditGroup(view);
  const fromDate = auditDate(searchParams.get("from"));
  const toDate = auditDate(searchParams.get("to"));
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const [draftSearch, setDraftSearch] = useState(search);
  const searchedShipmentCode = normalizeShipmentCode(search);
  const audit = useShipmentAuditEvents({
    search,
    ...(selectedGroup === undefined ? {} : { category: selectedGroup.key }),
    ...auditActivityServerFilters(selectedAuditFilter(view, searchParams)),
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
    // Limpiar conserva solo el área elegida.
    setDraftSearch("");
    const next = new URLSearchParams();
    if (view !== "all") next.set("view", view);
    setSearchParams(next);
  };

  return (
    <div className="manager-audit">
      <form className="audit-filters" onSubmit={submitSearch}>
        <AuditViewField value={view} onChange={onViewChange} />
        <AuditDependentFilters
          view={view}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
        />
        <label className="audit-search">
          <span>{tr("Buscar actividad", "Search activity")}</span>
          <input
            type="search"
            value={draftSearch}
            placeholder={tr(
              "Código de cargamento, persona o referencia",
              "Shipment code, person, or reference",
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

      {searchedShipmentCode !== undefined && (
        <div className="audit-shipment-code-hint" role="note">
          <span>
            {tr(
              "Parece un identificador de cargamento.",
              "This looks like a shipment identifier.",
            )}
          </span>
          <Link
            className="secondary-link"
            to={{
              pathname: "/gerencia/auditoria",
              search: new URLSearchParams({
                view: "shipments",
                period: "all",
                search: search,
              }).toString(),
            }}
          >
            {tr("BUSCAR EL CARGAMENTO", "FIND THE SHIPMENT")}{" "}
            {shortShipmentId(searchedShipmentCode)} →
          </Link>
        </div>
      )}

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

function AuditViewField({
  value,
  onChange,
}: {
  value: AuditViewKey;
  onChange: (view: AuditViewKey) => void;
}) {
  const { tr } = useLanguage();

  return (
    <label className="audit-view-field">
      <span>{tr("Área", "Area")}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as AuditViewKey)}
      >
        <option value="all">{tr("Toda la actividad", "All activity")}</option>
        <option value="shipments">
          {tr("Cargamentos finalizados", "Completed shipments")}
        </option>
        {auditGroups.map((group) => (
          <option key={group.key} value={group.key}>
            {tr(group.spanish, group.english)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** «Filtrar por» y su valor; ambos dependen del área y se guardan en la URL. */
function AuditDependentFilters({
  view,
  searchParams,
  setSearchParams,
}: {
  view: AuditViewKey;
  searchParams: URLSearchParams;
  setSearchParams(this: void, params: URLSearchParams): void;
}) {
  const { tr } = useLanguage();
  const definitions = auditFilterDefinitions(view);
  const selected = selectedAuditFilter(view, searchParams);
  const catalog = useAuditFilterCatalog(
    selected.definition?.source === "fixed"
      ? undefined
      : selected.definition?.source,
  );

  const change = (key: "filter" | "value", nextValue: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextValue.length === 0) next.delete(key);
    else next.set(key, nextValue);
    if (key === "filter") next.delete("value");
    next.delete("page");
    setSearchParams(next);
  };

  const valuePlaceholder =
    selected.definition === undefined
      ? tr("Elija primero un filtro", "Choose a filter first")
      : catalog.isPending
        ? tr("Cargando…", "Loading…")
        : catalog.isError
          ? tr("No se pudo cargar", "Could not load")
          : tr("Todos", "All");

  return (
    <>
      <label className="audit-filter-by">
        <span>{tr("Filtrar por", "Filter by")}</span>
        <select
          value={selected.definition?.key ?? ""}
          disabled={definitions.length === 0}
          onChange={(event) => change("filter", event.target.value)}
        >
          <option value="">
            {definitions.length === 0
              ? tr("Elija un área", "Choose an area")
              : tr("Sin filtro", "No filter")}
          </option>
          {definitions.map((definition) => (
            <option key={definition.key} value={definition.key}>
              {tr(definition.spanish, definition.english)}
            </option>
          ))}
        </select>
      </label>
      <label className="audit-filter-value">
        <span>{tr("Valor del filtro", "Filter value")}</span>
        <select
          value={selected.value ?? ""}
          disabled={selected.definition === undefined}
          onChange={(event) => change("value", event.target.value)}
        >
          <option value="">{valuePlaceholder}</option>
          {selected.definition?.source === "fixed"
            ? (selected.definition.values ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {tr(option.spanish, option.english)}
                </option>
              ))
            : catalog.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.isActive
                    ? option.name
                    : `${option.name} (${tr("inactivo", "inactive")})`}
                </option>
              ))}
        </select>
      </label>
    </>
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

interface AuditGroupOption {
  key: AuditGroupKey;
  spanish: string;
  english: string;
}

const auditGroups: readonly AuditGroupOption[] = [
  {
    key: "operation",
    spanish: "Operación de planta",
    english: "Plant operations",
  },
  {
    key: "people",
    spanish: "Personal",
    english: "People",
  },
  {
    key: "security",
    spanish: "Seguridad",
    english: "Security",
  },
  {
    key: "administration",
    spanish: "Administración",
    english: "Administration",
  },
];

function selectedAuditGroup(
  value: string | null,
): AuditGroupOption | undefined {
  return auditGroups.find((group) => group.key === value);
}

function selectedAuditView(value: string | null): AuditViewKey {
  if (value === "shipments" || value === "all") return value;
  return selectedAuditGroup(value)?.key ?? "all";
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

function ShipmentMercuryFact({
  overview,
}: {
  overview: GoldShipmentOverview | undefined;
}) {
  const { locale, tr } = useLanguage();
  const latest = overview?.mercury.latestCompleteSweep;
  if (overview === undefined || latest === null || latest === undefined)
    return null;
  // Última barrida completa (suma de sus rastras); nunca se suman barridas.
  return (
    <div>
      <dt>{tr("Mercurio", "Mercury")}</dt>
      <dd>
        {tr("Entrada", "Input")}{" "}
        {formatShipmentNumber(latest.inputGrams, locale, 2)} g ·{" "}
        {tr("Final", "Final")}{" "}
        {formatShipmentNumber(latest.remainderGrams, locale, 2)} g
        <small>
          {overview.mercury.completeSweepCount} {tr("de", "of")}{" "}
          {overview.mercury.sweepCount}{" "}
          {tr("barridas completas", "complete sweeps")}
        </small>
      </dd>
    </div>
  );
}

function formatShipmentNumber(
  value: number,
  locale: string,
  maximumFractionDigits: number,
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}
