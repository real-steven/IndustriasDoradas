import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";

import { LoginPage } from "../auth/login-page";
import {
  AuditPage,
  DashboardPage,
  GoldPage,
  OperationPage,
  ShipmentsPage,
  UpcomingPage,
} from "../features/portal/portal-pages";
import { PortalLayout, ProtectedPortal } from "../features/portal/portal-shell";
import { StatusPage } from "../features/system-status/status-page";

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<ProtectedPortal roles={["JEFE_EMPRESA"]} />}>
        <Route path="gerencia" element={<PortalLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="operacion" element={<OperationPage />} />
          <Route path="oro" element={<GoldPage />} />
          <Route path="cargamentos" element={<ShipmentsPage />} />
          <Route path="auditoria" element={<AuditPage />} />
          <Route path="estadisticas" element={<UpcomingPage title="Estadísticas" description="Comparación de proveedores, líneas y períodos con cobertura de datos visible." />} />
          <Route path="trabajadores" element={<UpcomingPage title="Trabajadores" description="Creación futura de operarios y jefes de planta, asistencia y horas." />} />
          <Route path="reportes" element={<UpcomingPage title="Reportes" description="Generación futura de archivos Excel gerenciales." />} />
          <Route path="inventario" element={<UpcomingPage title="Inventario" description="Trazabilidad futura de herramientas, componentes y mantenimiento." />} />
          <Route path="configuracion" element={<UpcomingPage title="Configuración" description="Administración futura de líneas y catálogos sin eliminar historial." />} />
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
  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido principal
      </a>
      <header className="site-header">
        <div className="brand" aria-label="Industrias Doradas">
          <span className="brand-mark" aria-hidden="true">
            ID
          </span>
          <span>
            <strong>Industrias Doradas</strong>
            <small>Portal de gestión</small>
          </span>
        </div>
        <nav aria-label="Navegación principal">
          <NavLink className="nav-link" to="/login">
            Ingresar
          </NavLink>
          <NavLink className="nav-link" to="/estado">
            Estado del sistema
          </NavLink>
        </nav>
      </header>
      <main id="contenido-principal" tabIndex={-1}>
        <Outlet />
      </main>
      <footer>
        <span>Industrias Doradas</span>
        <span>Identidad y catálogos · Sprint 1</span>
      </footer>
    </div>
  );
}

function NotFoundPage() {
  return (
    <section className="page-card compact-card">
      <p className="eyebrow">Error 404</p>
      <h1>Página no encontrada</h1>
      <p>La dirección solicitada no existe en este portal.</p>
      <NavLink className="button-link" to="/login">
        Volver al acceso
      </NavLink>
    </section>
  );
}
