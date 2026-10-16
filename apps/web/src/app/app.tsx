import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";

import { LoginPage } from "../auth/login-page";
import {
  AuditPage,
  DashboardPage,
  GoldPage,
  OperationPage,
  ShipmentDetailPage,
  ShipmentsPage,
  UpcomingPage,
} from "../features/portal/portal-pages";
import { PortalLayout, ProtectedPortal } from "../features/portal/portal-shell";
import { StatusPage } from "../features/system-status/status-page";
import { useLanguage } from "../i18n/language-context";
import { LanguageSwitcher } from "../i18n/language-switcher";

export function App() {
  const { tr } = useLanguage();

  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<ProtectedPortal roles={["JEFE_EMPRESA"]} />}>
        <Route path="gerencia" element={<PortalLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="operacion" element={<OperationPage />} />
          <Route path="oro" element={<GoldPage />} />
          <Route path="cargamentos" element={<ShipmentsPage />} />
          <Route
            path="cargamentos/:shipmentId"
            element={<ShipmentDetailPage />}
          />
          <Route path="auditoria" element={<AuditPage />} />
          <Route
            path="estadisticas"
            element={
              <UpcomingPage
                title={tr("Estadísticas", "Statistics")}
                description={tr(
                  "Comparación de proveedores, líneas y períodos con cobertura de datos visible.",
                  "Comparison of suppliers, lines, and periods with visible data coverage.",
                )}
              />
            }
          />
          <Route
            path="trabajadores"
            element={
              <UpcomingPage
                title={tr("Trabajadores", "Workers")}
                description={tr(
                  "Creación futura de operarios y jefes de planta, asistencia y horas.",
                  "Future creation of operators and plant managers, attendance, and hours.",
                )}
              />
            }
          />
          <Route
            path="reportes"
            element={
              <UpcomingPage
                title={tr("Reportes", "Reports")}
                description={tr(
                  "Generación futura de archivos Excel gerenciales.",
                  "Future generation of management Excel files.",
                )}
              />
            }
          />
          <Route
            path="inventario"
            element={
              <UpcomingPage
                title={tr("Inventario", "Inventory")}
                description={tr(
                  "Trazabilidad futura de herramientas, componentes y mantenimiento.",
                  "Future traceability of tools, components, and maintenance.",
                )}
              />
            }
          />
          <Route
            path="configuracion"
            element={
              <UpcomingPage
                title={tr("Configuración", "Settings")}
                description={tr(
                  "Administración futura de líneas y catálogos sin eliminar historial.",
                  "Future management of lines and catalogs without deleting history.",
                )}
              />
            }
          />
        </Route>
      </Route>
      <Route element={<PublicLayout />}>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="estado" element={<StatusPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function PublicLayout() {
  const { tr } = useLanguage();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido-principal">
        {tr("Saltar al contenido principal", "Skip to main content")}
      </a>
      <header className="site-header">
        <div className="brand" aria-label="Industrias Doradas">
          <span className="brand-mark" aria-hidden="true">
            ID
          </span>
          <span>
            <strong>Industrias Doradas</strong>
            <small>{tr("Portal de gestión", "Management portal")}</small>
          </span>
        </div>
        <nav aria-label={tr("Navegación principal", "Main navigation")}>
          <NavLink className="nav-link" to="/login">
            {tr("Ingresar", "Sign in")}
          </NavLink>
          <NavLink className="nav-link" to="/estado">
            {tr("Estado del sistema", "System status")}
          </NavLink>
          <LanguageSwitcher compact />
        </nav>
      </header>
      <main id="contenido-principal" tabIndex={-1}>
        <Outlet />
      </main>
      <footer>
        <span>Industrias Doradas</span>
        <span>
          {tr("Identidad y catálogos", "Identity and catalogs")} · Sprint 1
        </span>
      </footer>
    </div>
  );
}

function NotFoundPage() {
  const { tr } = useLanguage();

  return (
    <section className="page-card compact-card">
      <p className="eyebrow">Error 404</p>
      <h1>{tr("Página no encontrada", "Page not found")}</h1>
      <p>
        {tr(
          "La dirección solicitada no existe en este portal.",
          "The requested address does not exist in this portal.",
        )}
      </p>
      <NavLink className="button-link" to="/login">
        {tr("Volver al acceso", "Back to sign in")}
      </NavLink>
    </section>
  );
}
