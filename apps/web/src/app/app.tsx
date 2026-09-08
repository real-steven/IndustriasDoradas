import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";

import { LoginPage } from "../auth/login-page";
import {
  AdminPage,
  AuditPage,
  ManagerPage,
  PortalLayout,
  ProtectedPortal,
} from "../features/portal/portal-pages";
import { StatusPage } from "../features/system-status/status-page";

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<ProtectedPortal roles={["JEFE_EMPRESA"]} />}>
        <Route path="gerencia" element={<PortalLayout />}>
          <Route index element={<ManagerPage />} />
          <Route path="administracion">
            <Route index element={<AdminPage />} />
            <Route
              path="administradores"
              element={<AdminPage section="administradores" />}
            />
            <Route
              path="jefes-planta"
              element={<AdminPage section="jefes-planta" />}
            />
            <Route
              path="operarios"
              element={<AdminPage section="operarios" />}
            />
            <Route
              path="proveedores"
              element={<AdminPage section="proveedores" />}
            />
            <Route path="plantas" element={<AdminPage section="plantas" />} />
          </Route>
          <Route path="auditoria" element={<AuditPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedPortal roles={["ADMINISTRADOR"]} />}>
        <Route path="administracion" element={<PortalLayout />}>
          <Route index element={<AdminPage />} />
          <Route
            path="administradores"
            element={<AdminPage section="administradores" />}
          />
          <Route
            path="jefes-planta"
            element={<AdminPage section="jefes-planta" />}
          />
          <Route path="operarios" element={<AdminPage section="operarios" />} />
          <Route
            path="proveedores"
            element={<AdminPage section="proveedores" />}
          />
          <Route path="plantas" element={<AdminPage section="plantas" />} />
          <Route path="auditoria" element={<AuditPage />} />
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
