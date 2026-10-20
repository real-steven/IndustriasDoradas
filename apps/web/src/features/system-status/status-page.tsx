import { useQuery } from "@tanstack/react-query";

import { useLanguage } from "../../i18n/language-context";
import { getHealth } from "./health-api";

export function StatusPage() {
  const { tr } = useLanguage();
  const healthQuery = useQuery({
    queryKey: ["system", "health"],
    queryFn: ({ signal }) => getHealth(signal),
    refetchInterval: 30_000,
  });

  return (
    <section className="status-page" aria-labelledby="status-title">
      <div className="page-heading">
        <p className="eyebrow">{tr("Diagnóstico", "Diagnostics")}</p>
        <h1 id="status-title">{tr("Estado del sistema", "System status")}</h1>
        <p>
          {tr(
            "Verificación básica de comunicación entre el portal web y la API.",
            "Basic communication check between the web portal and the API.",
          )}
        </p>
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
  const { tr } = useLanguage();

  return (
    <div className="page-card state-card" role="status" aria-live="polite">
      <span className="status-indicator checking" aria-hidden="true" />
      <div>
        <h2>{tr("Comprobando conexión", "Checking connection")}</h2>
        <p>
          {tr(
            "Estamos consultando el estado de la API.",
            "We are checking the API status.",
          )}
        </p>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  isRetrying: boolean;
  onRetry: () => void;
}

function ErrorState({ isRetrying, onRetry }: ErrorStateProps) {
  const { tr } = useLanguage();

  return (
    <div className="page-card state-card error-card" role="alert">
      <span className="status-indicator unavailable" aria-hidden="true" />
      <div className="state-content">
        <p className="state-label">{tr("Sin conexión", "Offline")}</p>
        <h2>{tr("API no disponible", "API unavailable")}</h2>
        <p>
          {tr(
            "El portal sigue abierto, pero no pudo comunicarse con el servicio. Confirma que la API esté iniciada e inténtalo nuevamente.",
            "The portal remains open, but it could not reach the service. Confirm that the API is running and try again.",
          )}
        </p>
        <button type="button" onClick={onRetry} disabled={isRetrying}>
          {isRetrying
            ? tr("Reintentando…", "Retrying…")
            : tr("Reintentar conexión", "Retry connection")}
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
  const { locale, tr } = useLanguage();
  const checkedAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "America/Costa_Rica",
  }).format(new Date(timestamp));

  return (
    <div className="page-card state-card success-card">
      <span className="status-indicator available" aria-hidden="true" />
      <div className="state-content">
        <p className="state-label">{tr("Conectado", "Connected")}</p>
        <h2>{tr("API disponible", "API available")}</h2>
        <dl className="status-details">
          <div>
            <dt>{tr("Servicio", "Service")}</dt>
            <dd>{service}</dd>
          </div>
          <div>
            <dt>{tr("Última respuesta", "Latest response")}</dt>
            <dd>{checkedAt}</dd>
          </div>
        </dl>
        <button type="button" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing
            ? tr("Actualizando…", "Refreshing…")
            : tr("Actualizar estado", "Refresh status")}
        </button>
      </div>
    </div>
  );
}
