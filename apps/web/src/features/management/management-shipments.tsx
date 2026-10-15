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

export function ShipmentsFeature() {
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
            <h2>Historial</h2>
            <p>Cargamentos cerrados, ordenados por cierre más reciente</p>
          </div>
          {shipments.data !== undefined && (
            <span className="history-total">
              {shipments.data.total} resultado
              {shipments.data.total === 1 ? "" : "s"}
            </span>
          )}
        </header>
        {shipments.isPending ? (
          <ShipmentState title="Consultando cargamentos">
            Espere mientras se carga la proyección central.
          </ShipmentState>
        ) : shipments.isError || shipments.data === undefined ? (
          <ShipmentState title="No se pudo consultar el historial" error>
            {requestErrorMessage(shipments.error)}
          </ShipmentState>
        ) : shipments.data.items.length === 0 ? (
          <ShipmentState title="No hay cargamentos para estos filtros">
            La consulta central respondió correctamente. Cambie el período o
            quite algún filtro para ampliar la búsqueda.
          </ShipmentState>
        ) : (
          <>
            <div className="shipment-list">
              {shipments.data.items.map((shipment) => (
                <article className="shipment-row" key={shipment.shipmentId}>
                  <div className="shipment-primary">
                    <span>
                      CARGAMENTO {shortShipmentId(shipment.shipmentId)}
                    </span>
                    <strong>{shipment.productionLineName}</strong>
                    <small>
                      Cerrado {formatCostaRicaDateTime(shipment.completedAtUtc)}
                    </small>
                  </div>
                  <dl>
                    <div>
                      <dt>Proveedor</dt>
                      <dd>{shipment.supplierName}</dd>
                    </div>
                    <div>
                      <dt>Responsable al cierre</dt>
                      <dd>
                        {shipment.responsibleWorkerName ?? "Sin asignación"}
                      </dd>
                    </div>
                    <div>
                      <dt>Cajuelas</dt>
                      <dd>{shipment.cajuelaTotal}</dd>
                    </div>
                    <div>
                      <dt>Barridas</dt>
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
                    ABRIR DETALLE →
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
  const { shipmentId = "" } = useParams();
  const location = useLocation();
  const shipment = useManagementShipment(shipmentId);
  const sweeps = useManagementShipmentSweeps(shipmentId);
  const audit = useShipmentAuditEvents();

  if (shipment.isPending)
    return (
      <ShipmentState title="Consultando detalle">
        Espere mientras se reconstruye el cargamento.
      </ShipmentState>
    );
  if (shipment.isError || shipment.data === undefined)
    return (
      <ShipmentState title="No se pudo abrir el cargamento" error>
        {requestErrorMessage(
          shipment.error,
          "El cargamento no existe o la consulta central no está disponible.",
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
        ← VOLVER AL HISTORIAL
      </Link>

      <section className="shipment-detail-hero">
        <div>
          <p className="eyebrow light">CARGAMENTO CERRADO</p>
          <h2>{shortShipmentId(shipment.data.shipmentId)}</h2>
          <p>
            {shipment.data.productionLineName} · {shipment.data.supplierName}
          </p>
        </div>
        <span className="line-status current">CONFIRMADO</span>
      </section>

      <div className="detail-metrics">
        <DetailMetric label="Cajuelas" value={shipment.data.cajuelaTotal} />
        <DetailMetric label="Barridas" value={shipment.data.sweepCount} />
        <DetailMetric
          label="Responsable al cierre"
          value={shipment.data.responsibleWorkerName ?? "Sin asignación"}
        />
        <DetailMetric label="Estación" value={shipment.data.stationName} />
      </div>

      <section className="portal-panel detail-section">
        <header>
          <div>
            <h2>Momentos del cargamento</h2>
            <p>Horas operativas mostradas en Costa Rica</p>
          </div>
        </header>
        <dl className="detail-times">
          <div>
            <dt>Inicio ocurrido</dt>
            <dd>{formatCostaRicaDateTime(shipment.data.startedAtUtc)}</dd>
          </div>
          <div>
            <dt>Cierre ocurrido</dt>
            <dd>{formatCostaRicaDateTime(shipment.data.completedAtUtc)}</dd>
          </div>
          <div>
            <dt>Última actividad central</dt>
            <dd>{formatCostaRicaDateTime(shipment.data.lastActivityAtUtc)}</dd>
          </div>
        </dl>
      </section>

      <section className="portal-panel detail-section">
        <header>
          <div>
            <h2>Barridas y mercurio</h2>
            <p>Medición vigente por barrida y rastra</p>
          </div>
        </header>
        {sweeps.isPending ? (
          <ShipmentState title="Consultando barridas">
            Espere un momento.
          </ShipmentState>
        ) : sweeps.isError ? (
          <ShipmentState title="No se pudieron consultar las barridas" error>
            {requestErrorMessage(
              sweeps.error,
              "El resumen del cargamento permanece disponible.",
            )}
          </ShipmentState>
        ) : sweepGroups.length === 0 ? (
          <ShipmentState title="Sin barridas proyectadas">
            Este cargamento no tiene barridas disponibles en la proyección
            central.
          </ShipmentState>
        ) : (
          <div className="sweep-list">
            {sweepGroups.map((group) => (
              <article className="sweep-card" key={group.sweepId}>
                <header>
                  <div>
                    <strong>Barrida {shortShipmentId(group.sweepId)}</strong>
                    <small>{formatCostaRicaDateTime(group.sweptAtUtc)}</small>
                  </div>
                  <span>{group.cajuelaCount} cajuelas</span>
                </header>
                <div className="mercury-grid">
                  {group.components.map((component) => (
                    <div key={component.lineComponentId}>
                      <strong>{component.lineComponentName}</strong>
                      <span>Entrada: {mercuryValue(component.inputGrams)}</span>
                      <span>
                        Remanente: {mercuryValue(component.remainderGrams)}
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
            <h2>Cambios auditados</h2>
            <p>Ocurrencia y confirmación central se muestran por separado</p>
          </div>
        </header>
        {audit.isPending ? (
          <ShipmentState title="Consultando auditoría">
            Espere un momento.
          </ShipmentState>
        ) : audit.isError ? (
          <ShipmentState title="No se pudo consultar la auditoría" error>
            {requestErrorMessage(
              audit.error,
              "El detalle operativo permanece disponible.",
            )}
          </ShipmentState>
        ) : events.length === 0 ? (
          <ShipmentState title="Sin cambios auditados para este cargamento">
            No hay entradas visibles dentro de la página de auditoría actual.
          </ShipmentState>
        ) : (
          <AuditEventList events={events} />
        )}
      </section>
    </div>
  );
}

export function ShipmentAuditFeature() {
  const audit = useShipmentAuditEvents();
  const shipments = useRecentManagementShipments();

  if (audit.isPending || shipments.isPending)
    return (
      <ShipmentState title="Consultando auditoría">
        Espere mientras se agrupan los movimientos.
      </ShipmentState>
    );
  if (
    audit.isError ||
    shipments.isError ||
    audit.data === undefined ||
    shipments.data === undefined
  )
    return (
      <ShipmentState title="No se pudo consultar la auditoría" error>
        {requestErrorMessage(audit.error ?? shipments.error)}
      </ShipmentState>
    );

  const shipmentById = new Map(
    shipments.data.items.map((shipment) => [shipment.shipmentId, shipment]),
  );
  const grouped = groupAudit(audit.data.items);

  if (grouped.length === 0)
    return (
      <ShipmentState title="Aún no hay movimientos de cargamentos">
        La consulta central respondió correctamente, pero no devolvió cambios
        auditados de cargamentos.
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
                <span>CARGAMENTO {shortShipmentId(shipmentId)}</span>
                <h3>
                  {shipment?.productionLineName ?? "Cargamento operativo"}
                </h3>
                <p>
                  {shipment === undefined
                    ? "Detalle disponible desde la ficha trazable"
                    : `${shipment.supplierName} · ${shipment.cajuelaTotal} cajuelas`}
                </p>
              </div>
              <Link
                className="secondary-link"
                to={`/gerencia/cargamentos/${shipmentId}`}
              >
                ABRIR CARGAMENTO →
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
              item.responsibleWorkerName ?? "Sin nombre",
            ],
          ],
    ),
  );

  return (
    <section className="shipment-filters" aria-label="Filtros de cargamentos">
      <label>
        Período
        <select
          value={filters.period}
          onChange={(event) => update("period", event.target.value)}
        >
          <option value="current">Esta semana</option>
          <option value="previous">Semana anterior</option>
          <option value="date">Fecha específica</option>
        </select>
      </label>
      {filters.period === "date" && (
        <label>
          Fecha en Costa Rica
          <input
            type="date"
            value={filters.date}
            onChange={(event) => update("date", event.target.value)}
          />
        </label>
      )}
      <FilterSelect
        label="Línea"
        name="line"
        value={filters.productionLineId ?? ""}
        options={lines}
        all="Todas las líneas"
        update={update}
      />
      <FilterSelect
        label="Proveedor"
        name="supplier"
        value={filters.supplierId ?? ""}
        options={suppliers}
        all="Todos los proveedores"
        update={update}
      />
      <FilterSelect
        label="Responsable"
        name="responsible"
        value={filters.responsibleWorkerId ?? ""}
        options={responsible}
        all="Todos los responsables"
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
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => update(name, event.target.value)}
      >
        <option value="">{all}</option>
        {value.length > 0 && !options.some(([id]) => id === value) && (
          <option value={value}>Filtro seleccionado</option>
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
  const go = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage === 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  };

  return (
    <nav className="history-pagination" aria-label="Páginas de cargamentos">
      <button type="button" disabled={page <= 1} onClick={() => go(page - 1)}>
        ← Anterior
      </button>
      <span>
        Página {page} de {Math.max(totalPages, 1)}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
      >
        Siguiente →
      </button>
    </nav>
  );
}

function AuditEventList({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="audit-timeline">
      {events.map((event) => (
        <li key={event.id}>
          <div>
            <strong>{auditAction(event.action)}</strong>
            <span>
              {event.actorDisplayName ?? "Sistema"} ·{" "}
              {auditResult(event.result)}
            </span>
          </div>
          <dl>
            <div>
              <dt>Ocurrió</dt>
              <dd>{formatCostaRicaDateTime(event.occurredAt)}</dd>
            </div>
            <div>
              <dt>Confirmado en centro</dt>
              <dd>{formatCostaRicaDateTime(event.recordedAt)}</dd>
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

function mercuryValue(value: number | null): string {
  return value === null ? "Pendiente" : `${value.toLocaleString("es-CR")} g`;
}

function auditAction(value: string): string {
  return value === "sync.ingest" ? "Cambio operativo recibido" : value;
}

function auditResult(value: AuditEvent["result"]): string {
  if (value === "SUCCEEDED") return "Confirmado";
  if (value === "REJECTED") return "Rechazado";
  return "Falló";
}
