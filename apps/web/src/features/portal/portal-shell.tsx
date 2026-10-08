import type { PropsWithChildren } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth, type RoleCode } from "../../auth/auth-context";

const primaryNavigation = [
  { to: "/gerencia", label: "Resumen", icon: "⌂", end: true },
  { to: "/gerencia/operacion", label: "Operación", icon: "◫" },
  { to: "/gerencia/oro", label: "Oro", icon: "◆" },
  { to: "/gerencia/cargamentos", label: "Cargamentos", icon: "▤" },
  { to: "/gerencia/auditoria", label: "Auditoría", icon: "◷" },
] as const;

const futureNavigation = [
  { to: "/gerencia/estadisticas", label: "Estadísticas", icon: "⌁" },
  { to: "/gerencia/trabajadores", label: "Trabajadores", icon: "♙" },
  { to: "/gerencia/reportes", label: "Reportes", icon: "⇩" },
  { to: "/gerencia/inventario", label: "Inventario", icon: "□" },
  { to: "/gerencia/configuracion", label: "Configuración", icon: "⚙" },
] as const;

const pageTitles: Record<string, string> = {
  "/gerencia": "Resumen",
  "/gerencia/operacion": "Operación",
  "/gerencia/oro": "Oro",
  "/gerencia/cargamentos": "Cargamentos",
  "/gerencia/auditoria": "Auditoría",
  "/gerencia/estadisticas": "Estadísticas",
  "/gerencia/trabajadores": "Trabajadores",
  "/gerencia/reportes": "Reportes",
  "/gerencia/inventario": "Inventario",
  "/gerencia/configuracion": "Configuración",
};

export function ProtectedPortal({ roles }: { roles: RoleCode[] }) {
  const auth = useAuth();
  if (auth.loading) {
    return (
      <main className="centered-state">
        <p role="status">Cargando sesión…</p>
      </main>
    );
  }
  if (auth.profile === null || auth.session === null) {
    return <Navigate to="/login" replace />;
  }
  if (!roles.includes(auth.profile.role)) return <Forbidden />;
  return <Outlet />;
}

export function PortalLayout() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.profile === null || auth.session === null) return null;

  return (
    <div className="manager-shell">
      <a className="skip-link" href="#contenido-gerencial">
        Saltar al contenido principal
      </a>
      <aside className="manager-sidebar">
        <div className="manager-brand">
          <img src="/logo-industrias-doradas.svg" alt="" />
          <span>
            <strong>INDUSTRIAS DORADAS</strong>
            <small>Portal gerencial</small>
          </span>
        </div>

        <p className="sidebar-label">VISIÓN GENERAL</p>
        <nav className="manager-nav" aria-label="Navegación gerencial">
          {primaryNavigation.map((item) => (
            <PortalNavLink key={item.to} {...item} />
          ))}
        </nav>

        <p className="sidebar-label">PRÓXIMAMENTE</p>
        <nav className="manager-nav" aria-label="Módulos futuros">
          {futureNavigation.map((item) => (
            <PortalNavLink key={item.to} {...item} future />
          ))}
        </nav>

        <div className="manager-identity">
          <span className="manager-avatar" aria-hidden="true">
            LG
          </span>
          <span>
            <strong>Cuenta gerencial</strong>
            <small>Sesión de Lucía</small>
          </span>
          <button
            type="button"
            className="icon-button sidebar-signout"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            onClick={() => void auth.signOut()}
          >
            ↪
          </button>
        </div>
      </aside>

      <div className="manager-workspace">
        <header className="manager-topbar">
          <p>
            Planta principal /{" "}
            <strong>{pageTitles[location.pathname] ?? "Portal"}</strong>
          </p>
          <div className="topbar-actions">
            <span className="freshness neutral">
              <i />
              Datos pendientes de conectar
            </span>
            <NavLink
              className="icon-button"
              to="/estado"
              aria-label="Ver estado del sistema"
            >
              ↻
            </NavLink>
          </div>
        </header>
        <div className="implementation-note">
          NUEVA ESTRUCTURA WEB · LOS DATOS OPERATIVOS SE CONECTARÁN DESPUÉS DE
          CERRAR LA SINCRONIZACIÓN
        </div>
        <main
          id="contenido-gerencial"
          className="manager-content"
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function PortalNavLink({
  to,
  label,
  icon,
  end,
  future = false,
}: {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  future?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `manager-nav-link${isActive ? " active" : ""}`
      }
    >
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      {future && <small>PRÓX.</small>}
    </NavLink>
  );
}

function Forbidden() {
  return (
    <PublicMessage eyebrow="403" title="Acceso restringido">
      Esta versión del portal está reservada a la cuenta gerencial.
    </PublicMessage>
  );
}

function PublicMessage({
  eyebrow,
  title,
  children,
}: PropsWithChildren<{ eyebrow: string; title: string }>) {
  return (
    <main className="centered-state">
      <section className="page-card compact-card">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{children}</p>
      </section>
    </main>
  );
}
