import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";

import { StatusPage } from "../features/system-status/status-page";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/estado" replace />} />
        <Route path="estado" element={<StatusPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function AppLayout() {
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
          <NavLink
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
            to="/estado"
          >
            Estado del sistema
          </NavLink>
        </nav>
      </header>

      <main id="contenido-principal" tabIndex={-1}>
        <Outlet />
      </main>

      <footer>
        <span>Industrias Doradas</span>
        <span>Base técnica del portal web</span>
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
      <NavLink className="button-link" to="/estado">
        Volver al estado del sistema
      </NavLink>
    </section>
  );
}
