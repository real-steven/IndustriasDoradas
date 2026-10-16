import { useEffect, type PropsWithChildren } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth, type RoleCode } from "../../auth/auth-context";
import { useOnlineStatus } from "../../app/connectivity";
import {
  translateKnownMessage,
  useLanguage,
} from "../../i18n/language-context";
import { LanguageSwitcher } from "../../i18n/language-switcher";
import {
  useManagementFreshness,
  type ManagementFreshnessQuery,
} from "../management/management-operation-data";

const primaryNavigation = [
  {
    to: "/gerencia",
    label: "Resumen",
    labelEn: "Overview",
    icon: "⌂",
    end: true,
  },
  {
    to: "/gerencia/operacion",
    label: "Operación",
    labelEn: "Operations",
    icon: "◫",
  },
  { to: "/gerencia/oro", label: "Oro", labelEn: "Gold", icon: "◆" },
  {
    to: "/gerencia/cargamentos",
    label: "Cargamentos",
    labelEn: "Shipments",
    icon: "▤",
  },
  {
    to: "/gerencia/auditoria",
    label: "Auditoría",
    labelEn: "Audit",
    icon: "◷",
  },
] as const;

const futureNavigation = [
  {
    to: "/gerencia/estadisticas",
    label: "Estadísticas",
    labelEn: "Statistics",
    icon: "⌁",
  },
  {
    to: "/gerencia/trabajadores",
    label: "Trabajadores",
    labelEn: "Workers",
    icon: "♙",
  },
  {
    to: "/gerencia/reportes",
    label: "Reportes",
    labelEn: "Reports",
    icon: "⇩",
  },
  {
    to: "/gerencia/inventario",
    label: "Inventario",
    labelEn: "Inventory",
    icon: "□",
  },
  {
    to: "/gerencia/configuracion",
    label: "Configuración",
    labelEn: "Settings",
    icon: "⚙",
  },
] as const;

const pageTitles: Record<string, readonly [string, string]> = {
  "/gerencia": ["Resumen", "Overview"],
  "/gerencia/operacion": ["Operación", "Operations"],
  "/gerencia/oro": ["Oro", "Gold"],
  "/gerencia/cargamentos": ["Cargamentos", "Shipments"],
  "/gerencia/auditoria": ["Auditoría", "Audit"],
  "/gerencia/estadisticas": ["Estadísticas", "Statistics"],
  "/gerencia/trabajadores": ["Trabajadores", "Workers"],
  "/gerencia/reportes": ["Reportes", "Reports"],
  "/gerencia/inventario": ["Inventario", "Inventory"],
  "/gerencia/configuracion": ["Configuración", "Settings"],
};

export function ProtectedPortal({ roles }: { roles: RoleCode[] }) {
  const auth = useAuth();
  const { tr } = useLanguage();
  if (auth.loading) {
    return (
      <main className="centered-state">
        <p role="status">{tr("Cargando sesión…", "Loading session…")}</p>
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
  const { language, tr } = useLanguage();
  const location = useLocation();
  const online = useOnlineStatus();
  const freshness = useManagementFreshness();

  useEffect(() => {
    document.getElementById("contenido-gerencial")?.focus();
  }, [location.pathname]);

  const configuredTitle = pageTitles[location.pathname];
  const pageTitle =
    configuredTitle === undefined
      ? location.pathname.startsWith("/gerencia/cargamentos/")
        ? tr("Detalle de cargamento", "Shipment detail")
        : "Portal"
      : tr(configuredTitle[0], configuredTitle[1]);

  if (auth.profile === null || auth.session === null) return null;

  return (
    <div className="manager-shell">
      <a className="skip-link" href="#contenido-gerencial">
        {tr("Saltar al contenido principal", "Skip to main content")}
      </a>
      <aside className="manager-sidebar">
        <div className="manager-brand">
          <img src="/logo-industrias-doradas.svg" alt="" />
          <span>
            <strong>INDUSTRIAS DORADAS</strong>
            <small>{tr("Portal gerencial", "Management portal")}</small>
          </span>
        </div>

        <p className="sidebar-label">
          {tr("VISIÓN GENERAL", "GENERAL OVERVIEW")}
        </p>
        <nav
          className="manager-nav"
          aria-label={tr("Navegación gerencial", "Management navigation")}
        >
          {primaryNavigation.map((item) => (
            <PortalNavLink
              key={item.to}
              {...item}
              label={tr(item.label, item.labelEn)}
            />
          ))}
        </nav>

        <p className="sidebar-label">{tr("PRÓXIMAMENTE", "COMING SOON")}</p>
        <nav
          className="manager-nav"
          aria-label={tr("Módulos futuros", "Future modules")}
        >
          {futureNavigation.map((item) => (
            <PortalNavLink
              key={item.to}
              {...item}
              label={tr(item.label, item.labelEn)}
              future
            />
          ))}
        </nav>

        <div className="manager-identity">
          <span className="manager-avatar" aria-hidden="true">
            LG
          </span>
          <span>
            <strong>{tr("Cuenta gerencial", "Management account")}</strong>
            <small>{tr("Sesión de Lucía", "Lucía's session")}</small>
          </span>
          <button
            type="button"
            className="icon-button sidebar-signout"
            aria-label={tr("Cerrar sesión", "Sign out")}
            title={tr("Cerrar sesión", "Sign out")}
            onClick={() => void auth.signOut()}
          >
            ↪
          </button>
        </div>
      </aside>

      <div className="manager-workspace">
        <header className="manager-topbar">
          <p>
            {tr("Planta principal", "Main plant")} /{" "}
            <strong>{pageTitle}</strong>
          </p>
          <div className="topbar-actions">
            <span className="freshness neutral">
              <i aria-hidden="true" />
              {tr("Datos centrales protegidos", "Protected central data")}
            </span>
            <LanguageSwitcher compact />
            <NavLink
              className="icon-button"
              to="/estado"
              aria-label={tr("Ver estado del sistema", "View system status")}
            >
              ↻
            </NavLink>
          </div>
        </header>
        {!online && (
          <div className="portal-alert offline" role="status">
            <strong>{tr("Sin conexión.", "Offline.")}</strong>{" "}
            {tr(
              "Puede consultar los últimos datos disponibles; las actualizaciones se reanudarán al recuperar la red.",
              "You can review the latest available data; updates will resume when the network returns.",
            )}
          </div>
        )}
        {auth.error !== null && auth.profile !== null && (
          <div className="portal-alert error" role="alert">
            {translateKnownMessage(auth.error, language)}
          </div>
        )}
        <main
          id="contenido-gerencial"
          className="manager-content"
          tabIndex={-1}
        >
          <Outlet context={{ freshness } satisfies PortalOutletContext} />
        </main>
      </div>
    </div>
  );
}

interface PortalOutletContext {
  freshness: ManagementFreshnessQuery;
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
  const { tr } = useLanguage();

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
      {future && <small>{tr("PRÓX.", "SOON")}</small>}
    </NavLink>
  );
}

function Forbidden() {
  const { tr } = useLanguage();

  return (
    <PublicMessage
      eyebrow="403"
      title={tr("Acceso restringido", "Restricted access")}
    >
      {tr(
        "Esta versión del portal está reservada a la cuenta gerencial.",
        "This version of the portal is reserved for the management account.",
      )}
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
