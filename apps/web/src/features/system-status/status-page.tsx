import { useQuery } from "@tanstack/react-query";

import { getHealth } from "./health-api";

export function StatusPage() {
  const healthQuery = useQuery({
    queryKey: ["system", "health"],
    queryFn: ({ signal }) => getHealth(signal),
    refetchInterval: 30_000,
  });

  return (
    <section className="status-page" aria-labelledby="status-title">
      <div className="page-heading">
        <p className="eyebrow">Diagnóstico</p>
        <h1 id="status-title">Estado del sistema</h1>
        <p>Verificación básica de comunicación entre el portal web y la API.</p>
      </div>

      {healthQuery.isPending ? <LoadingState /> : null}

      {healthQuery.isError ? (
        <ErrorState
          isRetrying={healthQuery.isFetching}
          onRetry={() => void healthQuery.refetch()}
        />
      ) : null}

      {healthQuery.isSuccess ? (
        <AvailableState
          service={healthQuery.data.service}
          timestamp={healthQuery.data.timestamp}
          isRefreshing={healthQuery.isFetching}
          onRefresh={() => void healthQuery.refetch()}
        />
      ) : null}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="page-card state-card" role="status" aria-live="polite">
      <span className="status-indicator checking" aria-hidden="true" />
      <div>
        <h2>Comprobando conexión</h2>
        <p>Estamos consultando el estado de la API.</p>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  isRetrying: boolean;
  onRetry: () => void;
}

function ErrorState({ isRetrying, onRetry }: ErrorStateProps) {
  return (
    <div className="page-card state-card error-card" role="alert">
      <span className="status-indicator unavailable" aria-hidden="true" />
      <div className="state-content">
        <p className="state-label">Sin conexión</p>
        <h2>API no disponible</h2>
        <p>
          El portal sigue abierto, pero no pudo comunicarse con el servicio.
          Confirma que la API esté iniciada e inténtalo nuevamente.
        </p>
        <button type="button" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? "Reintentando…" : "Reintentar conexión"}
        </button>
      </div>
    </div>
  );
}

interface AvailableStateProps {
  service: string;
  timestamp: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function AvailableState({
  service,
  timestamp,
  isRefreshing,
  onRefresh,
}: AvailableStateProps) {
  const checkedAt = new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(timestamp));

  return (
    <div className="page-card state-card success-card">
      <span className="status-indicator available" aria-hidden="true" />
      <div className="state-content">
        <p className="state-label">Conectado</p>
        <h2>API disponible</h2>
        <dl className="status-details">
          <div>
            <dt>Servicio</dt>
            <dd>{service}</dd>
          </div>
          <div>
            <dt>Última respuesta</dt>
            <dd>{checkedAt}</dd>
          </div>
        </dl>
        <button type="button" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? "Actualizando…" : "Actualizar estado"}
        </button>
      </div>
    </div>
  );
}
