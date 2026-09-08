import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  useState,
  type FormEvent,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";

import { apiRequest, ApiRequestError } from "../../api/http";
import { useAuth, type RoleCode } from "../../auth/auth-context";

interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
interface Account {
  id: string;
  displayName: string;
  preferredLocale: "es" | "en";
  accountStatus: string;
  roleCode: RoleCode;
  statusReason: string | null;
}
interface Catalog {
  id: string;
  code?: string;
  name: string;
  isActive: boolean;
  email?: string | null;
  phone?: string | null;
}
interface WorkerRequest {
  id: string;
  requestedName: string;
  status: string;
  reviewDueAt: string;
  isOverdue: boolean;
}
interface AuditEvent {
  id: string;
  actorDisplayName: string | null;
  actorRoleCode: string | null;
  action: string;
  entityType: string;
  result: string;
  reasonCode: string | null;
  occurredAt: string;
}
interface AdministratorPermission {
  code: string;
  description: string;
  assigned: boolean;
}
type AdminSection =
  "administradores" | "jefes-planta" | "operarios" | "proveedores" | "plantas";
interface AdminModule {
  section: AdminSection;
  title: string;
  description: string;
  access: (permissions: readonly string[]) => boolean;
}
interface PermissionGroupDefinition {
  id: string;
  title: string;
  description: string;
  prefixes: readonly string[];
}

const ADMIN_MODULES: readonly AdminModule[] = [
  {
    section: "administradores",
    title: "Usuarios administradores",
    description: "Invitaciones, suspensión y permisos individuales.",
    access: (permissions) =>
      permissions.some((permission) =>
        [
          "administrators.create",
          "administrators.govern",
          "administrators.permissions.manage",
        ].includes(permission),
      ),
  },
  {
    section: "jefes-planta",
    title: "Jefes de planta",
    description: "Revisión y gobierno de las cuentas de planta.",
    access: (permissions) => permissions.includes("plant_managers.manage"),
  },
  {
    section: "operarios",
    title: "Operarios",
    description: "Solicitudes provisionales y aprobación de trabajadores.",
    access: (permissions) => permissions.includes("workers.read"),
  },
  {
    section: "proveedores",
    title: "Proveedores",
    description: "Catálogo de proveedores y sus datos de contacto.",
    access: (permissions) => permissions.includes("organization_catalogs.read"),
  },
  {
    section: "plantas",
    title: "Plantas",
    description: "Catálogo y configuración básica de plantas.",
    access: (permissions) => permissions.includes("organization_catalogs.read"),
  },
];

const PERMISSION_GROUPS: readonly PermissionGroupDefinition[] = [
  {
    id: "people",
    title: "Usuarios y personal",
    description: "Administradores, jefes de planta y operarios.",
    prefixes: ["administrators.", "plant_managers.", "workers."],
  },
  {
    id: "catalogs",
    title: "Catálogos y proveedores",
    description: "Estructura organizacional y proveedores.",
    prefixes: ["organization_catalogs.", "suppliers."],
  },
  {
    id: "plant-operation",
    title: "Operación de planta",
    description: "Estaciones, privilegios temporales y ciclos.",
    prefixes: ["stations.", "privilege.", "cycles."],
  },
  {
    id: "control",
    title: "Asistencia e inventario",
    description: "Asistencia, inventario y entregas de oro.",
    prefixes: ["attendance.", "inventory.", "gold_deliveries."],
  },
  {
    id: "oversight",
    title: "Reportes y auditoría",
    description: "Consulta de reportes e historial auditado.",
    prefixes: ["reports.", "audit."],
  },
];

export function ProtectedPortal({ roles }: { roles: RoleCode[] }) {
  const auth = useAuth();
  if (auth.loading)
    return (
      <main>
        <p role="status">Cargando sesión…</p>
      </main>
    );
  if (auth.profile === null || auth.session === null)
    return <Navigate to="/login" replace />;
  if (!roles.includes(auth.profile.role)) return <Forbidden />;
  return <Outlet />;
}

export function PortalLayout() {
  const auth = useAuth();
  const [locale, setLocale] = useState<"es" | "en">("es");
  if (auth.profile === null || auth.session === null) return null;
  const destination =
    auth.profile.role === "JEFE_EMPRESA" ? "/gerencia" : "/administracion";

  async function updateLocale(event: FormEvent) {
    event.preventDefault();
    await apiRequest("/profile/locale", auth.session!.access_token, {
      method: "PATCH",
      body: JSON.stringify({ locale }),
    });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido-principal">
        Saltar al contenido principal
      </a>
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ID
          </span>
          <span>
            <strong>Industrias Doradas</strong>
            <small>{auth.profile.role}</small>
          </span>
        </div>
        <nav aria-label="Navegación principal">
          <NavLink className="nav-link" to={destination}>
            Panel
          </NavLink>
          {auth.profile.role === "JEFE_EMPRESA" && (
            <NavLink className="nav-link" to="/gerencia/administracion">
              Administración
            </NavLink>
          )}
          {auth.profile.permissions.some((permission) =>
            ["audit.read_redacted", "audit.read_operational"].includes(
              permission,
            ),
          ) && (
            <NavLink className="nav-link" to={`${destination}/auditoria`}>
              Auditoría
            </NavLink>
          )}
        </nav>
        <form
          onSubmit={(event) => void updateLocale(event)}
          className="locale-form"
        >
          <label htmlFor="locale">Idioma</label>
          <select
            id="locale"
            value={locale}
            onChange={(event) => setLocale(event.target.value as "es" | "en")}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
          <button type="submit" className="secondary">
            Guardar
          </button>
        </form>
        <button
          type="button"
          className="secondary"
          onClick={() => void auth.signOut()}
        >
          Cerrar sesión
        </button>
      </header>
      <main id="contenido-principal" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

export function ManagerPage() {
  return (
    <PortalPage title="Gerencia" eyebrow="Datos, indicadores y supervisión">
      <section className="notice">
        <h2>Reportes</h2>
        <p>
          Acceso autorizado. Los reportes operativos se incorporarán en su
          sprint funcional; aquí no se inventan cifras.
        </p>
      </section>
      <p>
        Las altas, correcciones y asignaciones de permisos están separadas en el
        módulo Administración, sin cerrar esta sesión.
      </p>
    </PortalPage>
  );
}

export function AdminPage({ section }: { section?: AdminSection }) {
  const context = usePortalContext();
  const modules = ADMIN_MODULES.filter((module) =>
    module.access(context.permissions),
  );
  const basePath =
    context.role === "JEFE_EMPRESA"
      ? "/gerencia/administracion"
      : "/administracion";

  if (section === undefined) {
    return (
      <PortalPage title="Administración" eyebrow="Ediciones y correcciones">
        <ManagerAdministrationNotice role={context.role} />
        {modules.length === 0 ? (
          <p className="notice">No tienes módulos administrativos asignados.</p>
        ) : (
          <nav
            className="admin-module-grid"
            aria-label="Módulos de administración"
          >
            {modules.map((module, index) => (
              <NavLink
                key={module.section}
                className="admin-module-card"
                to={`${basePath}/${module.section}`}
              >
                <span className="admin-module-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <strong>{module.title}</strong>
                <span>{module.description}</span>
                <span className="admin-module-action">Abrir módulo →</span>
              </NavLink>
            ))}
          </nav>
        )}
      </PortalPage>
    );
  }

  const selectedModule = modules.find((module) => module.section === section);
  if (selectedModule === undefined) {
    return (
      <PortalPage title="Acceso restringido" eyebrow="403">
        <p className="notice">No tienes permiso para abrir este módulo.</p>
        <NavLink className="button-link secondary-link" to={basePath}>
          Volver a Administración
        </NavLink>
      </PortalPage>
    );
  }

  return (
    <AdminSectionPage
      title={selectedModule.title}
      basePath={basePath}
      role={context.role}
    >
      {section === "administradores" && <AdministratorManagement />}
      {section === "jefes-planta" && <PlantManagerAdministration />}
      {section === "operarios" && <WorkerAdministration />}
      {section === "proveedores" && <SupplierAdministration />}
      {section === "plantas" && <PlantAdministration />}
    </AdminSectionPage>
  );
}

function AdminSectionPage({
  title,
  basePath,
  role,
  children,
}: PropsWithChildren<{
  title: string;
  basePath: string;
  role: RoleCode;
}>) {
  return (
    <PortalPage title={title} eyebrow="Módulo de administración">
      <div className="admin-section-toolbar">
        <NavLink className="button-link secondary-link" to={basePath}>
          ← Volver a Administración
        </NavLink>
      </div>
      <ManagerAdministrationNotice role={role} />
      {children}
    </PortalPage>
  );
}

function ManagerAdministrationNotice({ role }: { role: RoleCode }) {
  return role === "JEFE_EMPRESA" ? (
    <p className="notice">
      Estás usando la cuenta gerencial. Todas las acciones permanecen auditadas.
    </p>
  ) : null;
}

function PlantAdministration() {
  const context = usePortalContext();
  const plants = useApiQuery<Page<Catalog>>(
    ["plants"],
    `/organizations/${context.organizationId}/plants`,
  );
  return (
    <CatalogSection
      title="Plantas"
      path={`/organizations/${context.organizationId}/plants`}
      query={plants}
      fields="plant"
      canManage={context.permissions.includes("organization_catalogs.manage")}
    />
  );
}

function SupplierAdministration() {
  const context = usePortalContext();
  const suppliers = useApiQuery<Page<Catalog>>(
    ["suppliers"],
    `/organizations/${context.organizationId}/suppliers`,
  );
  return (
    <CatalogSection
      title="Proveedores"
      path={`/organizations/${context.organizationId}/suppliers`}
      query={suppliers}
      fields="supplier"
      canManage={context.permissions.includes("suppliers.manage")}
    />
  );
}

function WorkerAdministration() {
  const context = usePortalContext();
  const requests = useApiQuery<Page<WorkerRequest>>(
    ["worker-requests"],
    `/organizations/${context.organizationId}/worker-requests`,
  );
  return (
    <section>
      <h2>Solicitudes de trabajadores</h2>
      <QueryState query={requests}>
        {(data) => (
          <WorkerRequests
            items={data.items}
            canResolve={context.permissions.includes("workers.resolve")}
          />
        )}
      </QueryState>
    </section>
  );
}

function PlantManagerAdministration() {
  const context = usePortalContext();
  const accounts = useApiQuery<Page<Account>>(
    ["plant-manager-accounts"],
    `/organizations/${context.organizationId}/accounts?roleCode=JEFE_PLANTA`,
  );
  return (
    <section>
      <h2>Jefes de planta</h2>
      <QueryState query={accounts}>
        {(data) => (
          <AccountList
            accounts={data.items}
            canGovern
            canManagePermissions={false}
          />
        )}
      </QueryState>
    </section>
  );
}

export function AuditPage() {
  const context = usePortalContext();
  const audit = useApiQuery<Page<AuditEvent>>(
    ["audit"],
    `/organizations/${context.organizationId}/audit-events`,
  );
  return (
    <PortalPage title="Auditoría" eyebrow="Historial inmutable">
      <QueryState query={audit}>
        {(data) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Momento</th>
                  <th>Actor</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.occurredAt).toLocaleString()}</td>
                    <td>{item.actorDisplayName ?? "Sistema"}</td>
                    <td>{item.action}</td>
                    <td>{item.entityType}</td>
                    <td>{item.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </PortalPage>
  );
}

function CatalogSection({
  title,
  path,
  query,
  fields,
  canManage,
}: {
  title: string;
  path: string;
  query: UseQueryResult<Page<Catalog>, Error>;
  fields: "plant" | "supplier";
  canManage: boolean;
}) {
  const { token } = usePortalContext();
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest(path, token, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      setMessage("Guardado.");
      await client.invalidateQueries({
        queryKey: [fields === "plant" ? "plants" : "suppliers"],
      });
    },
    onError: (error) =>
      setMessage(
        error instanceof ApiRequestError
          ? `${error.code}: ${error.message}`
          : "No se pudo guardar.",
      ),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> =
      fields === "plant"
        ? {
            code: formString(form, "code"),
            name: formString(form, "name"),
            timezone: "America/Costa_Rica",
          }
        : {
            name: formString(form, "name"),
            email: formString(form, "email") || null,
          };
    mutation.mutate(body);
  }
  return (
    <section>
      <h2>{title}</h2>
      {canManage && (
        <form onSubmit={submit} className="inline-form">
          {fields === "plant" && (
            <>
              <label htmlFor={`${fields}-code`}>Código</label>
              <input
                id={`${fields}-code`}
                name="code"
                required
                pattern="[A-Z0-9_]+"
              />
            </>
          )}
          <label htmlFor={`${fields}-name`}>Nombre</label>
          <input id={`${fields}-name`} name="name" required />
          {fields === "supplier" && (
            <>
              <label htmlFor="supplier-email">Correo opcional</label>
              <input id="supplier-email" name="email" type="email" />
            </>
          )}
          <button disabled={mutation.isPending}>Agregar</button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      <QueryState query={query}>
        {(data) => (
          <ul className="item-list">
            {data.items.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.isActive ? "Activo" : "Inactivo"}</span>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </section>
  );
}

function AccountList({
  accounts,
  canGovern,
  canManagePermissions,
}: {
  accounts: Account[];
  canGovern: boolean;
  canManagePermissions: boolean;
}) {
  const { organizationId, token } = usePortalContext();
  const client = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: string;
      reason?: string;
    }) =>
      apiRequest(
        `/organizations/${organizationId}/accounts/${id}/${action}`,
        token,
        { method: "POST", body: JSON.stringify(reason ? { reason } : {}) },
      ),
    onSuccess: async () => {
      await client.invalidateQueries();
    },
  });
  if (accounts.length === 0) return <p>No hay cuentas en este estado.</p>;
  return (
    <ul className="item-list">
      {accounts.map((account) => (
        <li key={account.id}>
          <div>
            <strong>{account.displayName}</strong>
            <span>{account.accountStatus}</span>
          </div>
          {(canGovern || canManagePermissions) && (
            <div className="row-actions">
              {canGovern && (
                <>
                  <button
                    onClick={() =>
                      mutation.mutate({ id: account.id, action: "approve" })
                    }
                  >
                    Aprobar
                  </button>
                  <form
                    className="suspension-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      mutation.mutate({
                        id: account.id,
                        action: "suspend",
                        reason: reasons[account.id]?.trim(),
                      });
                    }}
                  >
                    <label htmlFor={`suspension-reason-${account.id}`}>
                      Razón de suspensión
                    </label>
                    <input
                      id={`suspension-reason-${account.id}`}
                      value={reasons[account.id] ?? ""}
                      required
                      maxLength={300}
                      onChange={(event) =>
                        setReasons((current) => ({
                          ...current,
                          [account.id]: event.target.value,
                        }))
                      }
                    />
                    <button
                      className="danger"
                      disabled={
                        mutation.isPending ||
                        !(reasons[account.id]?.trim() ?? "")
                      }
                    >
                      Suspender
                    </button>
                  </form>
                </>
              )}
              {canManagePermissions && (
                <PermissionEditor accountId={account.id} />
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function AdministratorManagement() {
  const context = usePortalContext();
  const canCreate = context.permissions.includes("administrators.create");
  const canGovern = context.permissions.includes("administrators.govern");
  const canManagePermissions = context.permissions.includes(
    "administrators.permissions.manage",
  );
  const accounts = useApiQuery<Page<Account>>(
    ["administrator-accounts"],
    `/organizations/${context.organizationId}/accounts?roleCode=ADMINISTRADOR`,
  );
  const available = useApiQuery<AdministratorPermission[]>(
    ["administrator-permissions"],
    `/organizations/${context.organizationId}/accounts/administrator-permissions`,
    canCreate,
  );
  const client = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest(
        `/organizations/${context.organizationId}/accounts/administrators`,
        context.token,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: async () => {
      setMessage("Invitación administrativa creada.");
      setSelected([]);
      await client.invalidateQueries({ queryKey: ["administrator-accounts"] });
    },
    onError: (error) =>
      setMessage(
        error instanceof ApiRequestError &&
          error.code === "ACCOUNT_EMAIL_ALREADY_REGISTERED"
          ? "Ese correo ya está registrado. Use otro correo para enviar una nueva invitación."
          : error instanceof ApiRequestError
            ? `${error.code}: ${error.message}`
            : "No se pudo crear la cuenta administrativa.",
      ),
  });
  return (
    <section>
      <h2>Administradores y permisos</h2>
      {canCreate && (
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            create.mutate({
              email: formString(form, "email"),
              displayName: formString(form, "displayName"),
              preferredLocale: "es",
              permissionCodes: selected,
            });
          }}
        >
          <label htmlFor="administrator-name">Nombre</label>
          <input id="administrator-name" name="displayName" required />
          <label htmlFor="administrator-email">Correo</label>
          <input id="administrator-email" name="email" type="email" required />
          <fieldset>
            <legend>Permisos iniciales</legend>
            <QueryState query={available}>
              {(items) => (
                <PermissionCheckboxes
                  items={items}
                  selected={selected}
                  onChange={setSelected}
                />
              )}
            </QueryState>
          </fieldset>
          <button disabled={create.isPending}>Crear e invitar</button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      <QueryState query={accounts}>
        {(data) => (
          <AccountList
            accounts={data.items}
            canGovern={canGovern}
            canManagePermissions={canManagePermissions}
          />
        )}
      </QueryState>
    </section>
  );
}

function PermissionEditor({ accountId }: { accountId: string }) {
  const context = usePortalContext();
  const client = useQueryClient();
  const query = useApiQuery<AdministratorPermission[]>(
    ["account-permissions", accountId],
    `/organizations/${context.organizationId}/accounts/${accountId}/permissions`,
  );
  const [selected, setSelected] = useState<string[] | null>(null);
  const effectiveSelection =
    selected ??
    query.data?.filter((item) => item.assigned).map((item) => item.code) ??
    [];
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(
        `/organizations/${context.organizationId}/accounts/${accountId}/permissions`,
        context.token,
        {
          method: "PUT",
          body: JSON.stringify({ permissionCodes: effectiveSelection }),
        },
      ),
    onSuccess: async () => {
      setSelected(null);
      await client.invalidateQueries({
        queryKey: ["account-permissions", accountId],
      });
    },
  });
  return (
    <details>
      <summary>Editar permisos</summary>
      <QueryState query={query}>
        {(items) => (
          <>
            <PermissionCheckboxes
              items={items}
              selected={effectiveSelection}
              onChange={setSelected}
            />
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              Guardar permisos
            </button>
          </>
        )}
      </QueryState>
    </details>
  );
}

function PermissionCheckboxes({
  items,
  selected,
  onChange,
}: {
  items: AdministratorPermission[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const groupedCodes = new Set<string>();
  const groups = PERMISSION_GROUPS.map((definition) => {
    const permissions = items.filter((item) =>
      definition.prefixes.some((prefix) => item.code.startsWith(prefix)),
    );
    permissions.forEach((item) => groupedCodes.add(item.code));
    return { ...definition, permissions };
  }).filter((group) => group.permissions.length > 0);
  const ungrouped = items.filter((item) => !groupedCodes.has(item.code));
  if (ungrouped.length > 0) {
    groups.push({
      id: "other",
      title: "Otros permisos",
      description: "Capacidades disponibles sin un área específica.",
      prefixes: [],
      permissions: ungrouped,
    });
  }

  function replaceGroup(codes: readonly string[], checked: boolean) {
    const next = new Set(selected);
    codes.forEach((code) => (checked ? next.add(code) : next.delete(code)));
    onChange([...next].sort());
  }

  if (items.length === 0) {
    return <p>No hay permisos disponibles para asignar.</p>;
  }

  return (
    <div className="permission-selector">
      <div className="permission-selection-heading">
        <div>
          <strong>Selección rápida por área</strong>
          <span>
            Marca un bloque completo y ajusta detalles solo si hace falta.
          </span>
        </div>
        <span role="status">
          {selected.length} de {items.length} seleccionados
        </span>
      </div>
      <div className="permission-group-grid">
        {groups.map((group) => {
          const codes = group.permissions.map((item) => item.code);
          const selectedCount = codes.filter((code) =>
            selected.includes(code),
          ).length;
          return (
            <label className="permission-group-card" key={group.id}>
              <input
                type="checkbox"
                checked={selectedCount === codes.length}
                onChange={(event) => replaceGroup(codes, event.target.checked)}
              />
              <span>
                <strong>{group.title}</strong>
                <small>{group.description}</small>
                <small>
                  {selectedCount} de {codes.length} permisos
                </small>
              </span>
            </label>
          );
        })}
      </div>
      <div className="permission-bulk-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => onChange(items.map((item) => item.code).sort())}
        >
          Seleccionar todo
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => onChange([])}
          disabled={selected.length === 0}
        >
          Limpiar selección
        </button>
      </div>
      <details className="permission-advanced">
        <summary>Opciones avanzadas · configurar uno a uno</summary>
        <div className="permission-grid">
          {items.map((item) => (
            <label key={item.code}>
              <input
                type="checkbox"
                checked={selected.includes(item.code)}
                onChange={(event) =>
                  replaceGroup([item.code], event.target.checked)
                }
              />
              <span>
                <strong>{item.description}</strong>
                <small>{item.code}</small>
              </span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function WorkerRequests({
  items,
  canResolve,
}: {
  items: WorkerRequest[];
  canResolve: boolean;
}) {
  const { organizationId, token } = usePortalContext();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(
        `/organizations/${organizationId}/worker-requests/${id}/approve`,
        token,
        { method: "POST", body: "{}" },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["worker-requests"] });
    },
  });
  if (items.length === 0) return <p>No hay solicitudes pendientes.</p>;
  return (
    <ul className="item-list">
      {items.map((item) => (
        <li key={item.id}>
          <div>
            <strong>{item.requestedName}</strong>
            <span>{item.isOverdue ? "Provisional vencido" : item.status}</span>
          </div>
          {canResolve && (
            <button onClick={() => mutation.mutate(item.id)}>Aprobar</button>
          )}
        </li>
      ))}
    </ul>
  );
}

function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T, Error>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <p role="status">Cargando…</p>;
  if (query.isError)
    return (
      <p role="alert">
        {query.error instanceof ApiRequestError && query.error.status === 403
          ? "No tienes permiso para esta información."
          : "No se pudo cargar la información."}
      </p>
    );
  return children(query.data);
}

function useApiQuery<T>(
  key: string[],
  path: string,
  enabled = true,
): UseQueryResult<T, Error> {
  const { token } = usePortalContext();
  return useQuery({
    queryKey: key,
    queryFn: () => apiRequest<T>(path, token),
    enabled,
  });
}

function usePortalContext() {
  const auth = useAuth();
  if (auth.session === null || auth.profile === null)
    throw new Error("Authenticated portal context required");
  return {
    token: auth.session.access_token,
    organizationId: auth.profile.organizationId,
    permissions: auth.profile.permissions,
    role: auth.profile.role,
  };
}

function PortalPage({
  title,
  eyebrow,
  children,
}: PropsWithChildren<{ title: string; eyebrow: string }>) {
  return (
    <div className="portal-page">
      <header className="page-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </header>
      {children}
    </div>
  );
}

function Forbidden() {
  return (
    <main>
      <section className="page-card compact-card">
        <p className="eyebrow">403</p>
        <h1>Acceso restringido</h1>
        <p>Tu rol no puede abrir esta sección.</p>
      </section>
    </main>
  );
}

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
