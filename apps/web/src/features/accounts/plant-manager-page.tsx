import { useCallback, useEffect, useState, type FormEvent } from "react";

import type {
  Account,
  CreatePlantManagerInput,
  Worker,
} from "../../api/generated/api-client";
import { ApiRequestError, requestErrorMessage } from "../../api/http";
import { useLanguage } from "../../i18n/language-context";
import {
  useAccountPlants,
  useAccountStations,
  useCreateOperator,
  useCreatePlantManager,
  useGovernPlantManager,
  usePlantManagers,
  usePlantWorkers,
  useSetPlantWorkerState,
} from "./plant-manager-data";
import { workerDisplayName } from "../workers/worker-display";

interface PlantManagerForm {
  role: "OPERARIO" | "JEFE_PLANTA";
  displayName: string;
  email: string;
  phone: string;
  password: string;
  passwordConfirmation: string;
  pin: string;
  pinConfirmation: string;
}

type UserDirectoryEntry =
  | {
      kind: "manager";
      id: string;
      name: string;
      searchText: string;
      account: Account;
    }
  | {
      kind: "operator";
      id: string;
      name: string;
      searchText: string;
      worker: Worker;
    };

type UserRoleFilter = "JEFE_PLANTA" | "OPERARIO";

const usersPerPage = 8;

const emptyForm: PlantManagerForm = {
  role: "JEFE_PLANTA",
  displayName: "",
  email: "",
  phone: "",
  password: "",
  passwordConfirmation: "",
  pin: "",
  pinConfirmation: "",
};

export function PlantManagerPage() {
  const { language, locale, tr } = useLanguage();
  const managers = usePlantManagers();
  const workers = usePlantWorkers();
  const plants = useAccountPlants();
  const stations = useAccountStations();
  const activePlantIds = new Set(
    (plants.data?.items ?? [])
      .filter((plant) => plant.isActive)
      .map((plant) => plant.id),
  );
  const hasActivePlants = activePlantIds.size > 0;
  const selectedStation = stations.data?.items.find(
    (station) =>
      station.isActive &&
      station.plantId !== undefined &&
      activePlantIds.has(station.plantId),
  );
  const selectedPlantId = selectedStation?.plantId ?? "";
  const selectedStationId = selectedStation?.id ?? "";
  const automaticStationIds =
    selectedStationId.length === 0 ? [] : [selectedStationId];
  const createManager = useCreatePlantManager();
  const createOperator = useCreateOperator();
  const governManager = useGovernPlantManager();
  const governWorker = useSetPlantWorkerState();
  const isCreating = createManager.isPending || createOperator.isPending;
  const isResolvingAutomaticStation =
    selectedStationId.length === 0 &&
    (plants.isLoading || stations.isLoading || stations.isFetching);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("JEFE_PLANTA");
  const [page, setPage] = useState(1);
  const dismissSuccess = useCallback(() => setSuccess(null), []);
  const managerAccounts = managers.data?.items ?? [];
  const operatorAccounts = (workers.data?.items ?? []).filter(
    (worker) => worker.category === "OPERARIO",
  );
  const normalizedSearch = search.trim().toLocaleLowerCase(locale);
  const directoryEntries: UserDirectoryEntry[] = [
    ...managerAccounts.map((account) => ({
      kind: "manager" as const,
      id: account.id,
      name: account.displayName,
      searchText:
        `${account.displayName} ${account.roleCode}`.toLocaleLowerCase(locale),
      account,
    })),
    ...operatorAccounts.map((worker) => ({
      kind: "operator" as const,
      id: worker.id,
      name: worker.name,
      searchText:
        `${worker.name} ${worker.email ?? ""} ${worker.phone ?? ""}`.toLocaleLowerCase(
          locale,
        ),
      worker,
    })),
  ].filter(
    (entry) =>
      ((roleFilter === "JEFE_PLANTA" && entry.kind === "manager") ||
        (roleFilter === "OPERARIO" && entry.kind === "operator")) &&
      (normalizedSearch.length === 0 ||
        entry.searchText.includes(normalizedSearch)),
  );
  const totalPages = Math.max(
    1,
    Math.ceil(directoryEntries.length / usersPerPage),
  );
  const visibleEntries = directoryEntries.slice(
    (page - 1) * usersPerPage,
    page * usersPerPage,
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);
    const validation = validateForm(
      form,
      selectedPlantId,
      automaticStationIds,
      language,
    );
    if (validation !== null) {
      setFormError(validation);
      return;
    }
    if (form.role === "OPERARIO") {
      try {
        await createOperator.mutateAsync({
          name: form.displayName.trim(),
          plantId: selectedPlantId,
          ...(form.email.trim().length === 0
            ? {}
            : { email: form.email.trim() }),
          ...(form.phone.trim().length === 0
            ? {}
            : { phone: form.phone.trim() }),
        });
        setForm(emptyForm);
        setShowCreate(false);
        setRoleFilter("OPERARIO");
        setPage(1);
        setSuccess(
          tr(
            "Operario registrado con estado pendiente de aprobación.",
            "Operator registered with pending approval status.",
          ),
        );
      } catch (error) {
        setFormError(accountError(error, language));
      }
      return;
    }
    const input: CreatePlantManagerInput = {
      displayName: form.displayName.trim(),
      email: form.email.trim(),
      password: form.password,
      pin: form.pin,
      plantId: selectedPlantId,
      stationIds: automaticStationIds,
      preferredLocale: "es",
    };
    try {
      await createManager.mutateAsync(input);
      setForm(emptyForm);
      setShowCreate(false);
      setRoleFilter("JEFE_PLANTA");
      setPage(1);
      setSuccess(
        tr(
          "Cuenta creada pendiente de activación. Entregue la contraseña y el PIN por un canal seguro; no volverán a mostrarse.",
          "Account created pending activation. Deliver the password and PIN through a secure channel; they will not be shown again.",
        ),
      );
    } catch (error) {
      setFormError(accountError(error, language));
    }
  };

  const govern = async (
    account: Account,
    action: "approve" | "suspend" | "reactivate",
  ) => {
    setFormError(null);
    setSuccess(null);
    try {
      await governManager.mutateAsync({
        profileId: account.id,
        action,
        ...(action === "suspend" ? { reason: suspensionReason.trim() } : {}),
      });
      setSuspendingId(null);
      setSuspensionReason("");
      setSuccess(
        action === "approve"
          ? tr("Cuenta activada correctamente.", "Account activated.")
          : action === "suspend"
            ? tr("Cuenta suspendida.", "Account suspended.")
            : tr("Cuenta reactivada.", "Account reactivated."),
      );
    } catch (error) {
      setFormError(accountError(error, language));
    }
  };

  const setOperatorState = async (worker: Worker, active: boolean) => {
    setFormError(null);
    setSuccess(null);
    try {
      await governWorker.mutateAsync({ workerId: worker.id, active });
      setSuspendingId(null);
      setSuccess(
        active
          ? tr("Operario reactivado.", "Operator reactivated.")
          : tr("Operario suspendido.", "Operator suspended."),
      );
    } catch (error) {
      setFormError(accountError(error, language));
    }
  };

  return (
    <div className="portal-view">
      {success !== null && (
        <SuccessNotification
          message={success}
          label={tr("Notificación de éxito", "Success notification")}
          closeLabel={tr("Cerrar notificación", "Close notification")}
          onDismiss={dismissSuccess}
        />
      )}
      {showCreate && (
        <div
          className="account-modal-backdrop"
          onMouseDown={() => setShowCreate(false)}
        >
          <section
            className="portal-panel account-create-panel account-create-modal"
            role="dialog"
            aria-modal="true"
            aria-label={tr("Crear usuario de planta", "Create plant user")}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>{tr("Crear usuario de planta", "Create plant user")}</h2>
                <p>
                  {tr(
                    "Aprovisionamiento directo local · queda pendiente hasta activarlo",
                    "Direct local provisioning · remains pending until activated",
                  )}
                </p>
              </div>
              <button
                type="button"
                className="secondary account-modal-close"
                aria-label={tr("Cerrar", "Close")}
                onClick={() => setShowCreate(false)}
              >
                ×
              </button>
            </header>
            <form
              className="account-form"
              onSubmit={(event) => void submit(event)}
            >
              <label>
                {tr("Rol de la persona", "Person role")}
                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      role: event.target.value as PlantManagerForm["role"],
                    })
                  }
                >
                  <option value="JEFE_PLANTA">
                    {tr("Jefe de planta", "Plant manager")}
                  </option>
                  <option value="OPERARIO">{tr("Operario", "Operator")}</option>
                </select>
              </label>
              <label>
                {tr("Nombre completo", "Full name")}
                <input
                  required
                  maxLength={120}
                  autoComplete="name"
                  value={form.displayName}
                  onChange={(event) =>
                    setForm({ ...form, displayName: event.target.value })
                  }
                />
              </label>
              <label>
                {form.role === "JEFE_PLANTA"
                  ? tr("Correo de acceso", "Sign-in email")
                  : tr(
                      "Correo de contacto (opcional)",
                      "Contact email (optional)",
                    )}
                <input
                  required={form.role === "JEFE_PLANTA"}
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                />
              </label>
              {form.role === "OPERARIO" && (
                <label>
                  {tr("Teléfono (opcional)", "Phone (optional)")}
                  <input
                    type="tel"
                    maxLength={40}
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(event) =>
                      setForm({ ...form, phone: event.target.value })
                    }
                  />
                </label>
              )}
              {form.role === "JEFE_PLANTA" && (
                <>
                  <div className="account-form-grid">
                    <label>
                      {tr("Contraseña temporal", "Temporary password")}
                      <input
                        required
                        type="password"
                        minLength={12}
                        maxLength={128}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(event) =>
                          setForm({ ...form, password: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {tr("Confirmar contraseña", "Confirm password")}
                      <input
                        required
                        type="password"
                        minLength={12}
                        maxLength={128}
                        autoComplete="new-password"
                        value={form.passwordConfirmation}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            passwordConfirmation: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <p className="field-help">
                    {tr(
                      "Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.",
                      "At least 12 characters with uppercase, lowercase, number, and symbol.",
                    )}
                  </p>
                  <div className="account-form-grid">
                    <label>
                      {tr("PIN de elevación", "Elevation PIN")}
                      <input
                        required
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]{6,12}"
                        minLength={6}
                        maxLength={12}
                        autoComplete="off"
                        value={form.pin}
                        onChange={(event) =>
                          setForm({ ...form, pin: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {tr("Confirmar PIN", "Confirm PIN")}
                      <input
                        required
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]{6,12}"
                        minLength={6}
                        maxLength={12}
                        autoComplete="off"
                        value={form.pinConfirmation}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            pinConfirmation: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="credential-warning">
                    <strong>{tr("Entrega segura", "Secure delivery")}</strong>
                    <p>
                      {tr(
                        "La contraseña y el PIN no quedan disponibles ni vuelven a mostrarse en el portal. Entréguelos directamente al usuario.",
                        "The password and PIN do not remain available and are not shown again in the portal. Deliver them directly to the user.",
                      )}
                    </p>
                  </div>
                </>
              )}
              {formError !== null && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}
              {form.role === "JEFE_PLANTA" &&
                selectedStationId.length === 0 &&
                formError === null && (
                  <p
                    className={
                      isResolvingAutomaticStation ? "field-help" : "form-error"
                    }
                    role={isResolvingAutomaticStation ? "status" : "alert"}
                  >
                    {automaticStationMessage({
                      plantsLoading: plants.isLoading,
                      plantsError: plants.isError,
                      hasActivePlants,
                      stationsLoading:
                        stations.isLoading || stations.isFetching,
                      stationsError: stations.isError,
                      tr,
                    })}
                  </p>
                )}
              <button
                type="submit"
                aria-busy={isCreating}
                disabled={
                  isCreating ||
                  selectedPlantId.length === 0 ||
                  (form.role === "JEFE_PLANTA" &&
                    selectedStationId.length === 0)
                }
              >
                {isCreating
                  ? tr("CREANDO…", "CREATING…")
                  : form.role === "JEFE_PLANTA"
                    ? tr("CREAR CUENTA PENDIENTE", "CREATE PENDING ACCOUNT")
                    : tr("REGISTRAR OPERARIO", "REGISTER OPERATOR")}
              </button>
            </form>
          </section>
        </div>
      )}

      <AccountDirectory
        entries={visibleEntries}
        totalRegistered={managerAccounts.length + operatorAccounts.length}
        totalFiltered={directoryEntries.length}
        totalPages={totalPages}
        page={page}
        locale={locale}
        search={search}
        roleFilter={roleFilter}
        loading={managers.isLoading || workers.isLoading}
        error={managers.error ?? workers.error}
        actionError={showCreate ? null : formError}
        language={language}
        suspendingId={suspendingId}
        suspensionReason={suspensionReason}
        managerPending={governManager.isPending}
        workerPending={governWorker.isPending}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onFilter={(value) => {
          setRoleFilter(value);
          setPage(1);
        }}
        onCreate={() => {
          setFormError(null);
          setShowCreate(true);
        }}
        onPage={setPage}
        onSuspendManager={(account) => setSuspendingId(account.id)}
        onConfirmManager={(account) => void govern(account, "suspend")}
        onManagerAction={(account, action) => void govern(account, action)}
        onSuspendWorker={(worker) => setSuspendingId(worker.id)}
        onConfirmWorker={(worker) => void setOperatorState(worker, false)}
        onReactivateWorker={(worker) => void setOperatorState(worker, true)}
        onReasonChange={setSuspensionReason}
        onCancelSuspend={() => {
          setSuspendingId(null);
          setSuspensionReason("");
        }}
      />
    </div>
  );
}

function AccountDirectory({
  entries,
  totalRegistered,
  totalFiltered,
  totalPages,
  page,
  locale,
  search,
  roleFilter,
  loading,
  error,
  actionError,
  language,
  suspendingId,
  suspensionReason,
  managerPending,
  workerPending,
  onSearch,
  onFilter,
  onCreate,
  onPage,
  onSuspendManager,
  onConfirmManager,
  onManagerAction,
  onSuspendWorker,
  onConfirmWorker,
  onReactivateWorker,
  onReasonChange,
  onCancelSuspend,
}: {
  entries: UserDirectoryEntry[];
  totalRegistered: number;
  totalFiltered: number;
  totalPages: number;
  page: number;
  locale: string;
  search: string;
  roleFilter: UserRoleFilter;
  loading: boolean;
  error: unknown;
  actionError: string | null;
  language: "es" | "en";
  suspendingId: string | null;
  suspensionReason: string;
  managerPending: boolean;
  workerPending: boolean;
  onSearch: (value: string) => void;
  onFilter: (value: UserRoleFilter) => void;
  onCreate: () => void;
  onPage: (page: number) => void;
  onSuspendManager: (account: Account) => void;
  onConfirmManager: (account: Account) => void;
  onManagerAction: (account: Account, action: "approve" | "reactivate") => void;
  onSuspendWorker: (worker: Worker) => void;
  onConfirmWorker: (worker: Worker) => void;
  onReactivateWorker: (worker: Worker) => void;
  onReasonChange: (value: string) => void;
  onCancelSuspend: () => void;
}) {
  const { tr } = useLanguage();
  return (
    <section className="portal-panel account-directory-panel">
      <header>
        <div>
          <h1>{tr("Usuarios de planta", "Plant users")}</h1>
          <p>
            {totalFiltered.toLocaleString(locale)} {tr("de", "of")}{" "}
            {totalRegistered.toLocaleString(locale)}{" "}
            {tr("usuarios registrados", "registered users")}
          </p>
        </div>
        <div className="account-directory-controls">
          <div
            className="account-role-switch"
            role="group"
            aria-label={tr("Filtrar por rol", "Filter by role")}
          >
            <button
              type="button"
              className={roleFilter === "JEFE_PLANTA" ? "active" : ""}
              aria-pressed={roleFilter === "JEFE_PLANTA"}
              onClick={() => onFilter("JEFE_PLANTA")}
            >
              {tr("Jefes de planta", "Plant managers")}
            </button>
            <button
              type="button"
              className={roleFilter === "OPERARIO" ? "active" : ""}
              aria-pressed={roleFilter === "OPERARIO"}
              onClick={() => onFilter("OPERARIO")}
            >
              {tr("Operarios", "Operators")}
            </button>
          </div>
          <label>
            <input
              type="search"
              aria-label={tr("Buscar usuario", "Search user")}
              value={search}
              placeholder={tr(
                "Buscar por nombre o contacto",
                "Search by name or contact",
              )}
              onChange={(event) => onSearch(event.target.value)}
            />
          </label>
          <button type="button" onClick={onCreate}>
            {tr("+ CREAR USUARIO", "+ CREATE USER")}
          </button>
        </div>
      </header>

      {loading && (
        <p className="query-message" role="status">
          {tr("Cargando usuarios…", "Loading users…")}
        </p>
      )}
      {error !== null && error !== undefined && (
        <p className="query-message error" role="alert">
          {requestErrorMessage(error, undefined, language)}
        </p>
      )}
      {actionError !== null && (
        <p className="query-message error" role="alert">
          {actionError}
        </p>
      )}

      <div className="account-directory-list">
        {entries.map((entry) =>
          entry.kind === "manager" ? (
            <article className="account-directory-row" key={entry.id}>
              <div className="account-directory-identity">
                <strong>{workerDisplayName(entry.account.displayName)}</strong>
                <span>
                  {tr("Creada", "Created")}{" "}
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                  }).format(new Date(entry.account.createdAt))}
                </span>
              </div>
              <span className="account-role-label">
                {tr("Jefe de planta", "Plant manager")}
              </span>
              <span
                className={`account-status ${entry.account.accountStatus.toLowerCase()}`}
              >
                {statusLabel(entry.account, tr)}
              </span>
              {suspendingId === entry.id ? (
                <div className="account-inline-confirm account-manager-confirm">
                  <input
                    autoFocus
                    value={suspensionReason}
                    maxLength={300}
                    placeholder={tr(
                      "Motivo de suspensión",
                      "Suspension reason",
                    )}
                    onChange={(event) => onReasonChange(event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={
                      suspensionReason.trim().length === 0 || managerPending
                    }
                    onClick={() => onConfirmManager(entry.account)}
                  >
                    {tr("CONFIRMAR", "CONFIRM")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={onCancelSuspend}
                  >
                    {tr("CANCELAR", "CANCEL")}
                  </button>
                </div>
              ) : (
                <div className="account-directory-action">
                  {entry.account.accountStatus === "PENDING_APPROVAL" && (
                    <button
                      type="button"
                      disabled={managerPending}
                      onClick={() => onManagerAction(entry.account, "approve")}
                    >
                      {tr("ACTIVAR", "ACTIVATE")}
                    </button>
                  )}
                  {entry.account.accountStatus === "ACTIVE" && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onSuspendManager(entry.account)}
                    >
                      {tr("SUSPENDER", "SUSPEND")}
                    </button>
                  )}
                  {entry.account.accountStatus === "SUSPENDED" && (
                    <button
                      type="button"
                      disabled={managerPending}
                      onClick={() =>
                        onManagerAction(entry.account, "reactivate")
                      }
                    >
                      {tr("REACTIVAR", "REACTIVATE")}
                    </button>
                  )}
                </div>
              )}
            </article>
          ) : (
            <article className="account-directory-row" key={entry.id}>
              <div className="account-directory-identity">
                <strong>{workerDisplayName(entry.worker.name)}</strong>
                <span>
                  {entry.worker.email ??
                    entry.worker.phone ??
                    tr("Sin contacto", "No contact")}
                </span>
              </div>
              <span className="account-role-label">
                {tr("Operario", "Operator")}
              </span>
              <span
                className={`account-status ${entry.worker.isActive ? "active" : "suspended"}`}
              >
                {!entry.worker.isActive
                  ? tr("SUSPENDIDO", "SUSPENDED")
                  : entry.worker.status === "PROVISIONAL"
                    ? tr("PENDIENTE", "PENDING")
                    : tr("ACTIVO", "ACTIVE")}
              </span>
              {suspendingId === entry.id ? (
                <div className="account-inline-confirm">
                  <span>
                    {tr("¿Suspender este operario?", "Suspend this operator?")}
                  </span>
                  <button
                    type="button"
                    disabled={workerPending}
                    onClick={() => onConfirmWorker(entry.worker)}
                  >
                    {tr("CONFIRMAR", "CONFIRM")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={onCancelSuspend}
                  >
                    {tr("CANCELAR", "CANCEL")}
                  </button>
                </div>
              ) : (
                <div className="account-directory-action">
                  {entry.worker.isActive ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onSuspendWorker(entry.worker)}
                    >
                      {tr("SUSPENDER", "SUSPEND")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={workerPending}
                      onClick={() => onReactivateWorker(entry.worker)}
                    >
                      {tr("REACTIVAR", "REACTIVATE")}
                    </button>
                  )}
                </div>
              )}
            </article>
          ),
        )}
        {!loading && totalFiltered === 0 && (
          <p className="attendance-empty">
            {tr("No se encontraron usuarios.", "No users found.")}
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <nav
          className="account-pagination"
          aria-label={tr("Paginación", "Pagination")}
        >
          <button
            type="button"
            className="secondary"
            aria-label={tr("Página anterior", "Previous page")}
            disabled={page === 1}
            onClick={() => onPage(Math.max(1, page - 1))}
          >
            ‹
          </button>
          {compactPageNumbers(page, totalPages).map((item, index) =>
            item === null ? (
              <span key={`ellipsis-${index}`} aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={item === page ? "active" : "secondary"}
                aria-label={`${tr("Página", "Page")} ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPage(item)}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className="secondary"
            aria-label={tr("Página siguiente", "Next page")}
            disabled={page === totalPages}
            onClick={() => onPage(Math.min(totalPages, page + 1))}
          >
            ›
          </button>
        </nav>
      )}
    </section>
  );
}

function compactPageNumbers(page: number, totalPages: number) {
  const visiblePages = new Set([
    1,
    totalPages,
    Math.max(1, page - 1),
    page,
    Math.min(totalPages, page + 1),
  ]);
  const sortedPages = [...visiblePages].sort((left, right) => left - right);
  const result: Array<number | null> = [];
  sortedPages.forEach((pageNumber, index) => {
    const previous = sortedPages[index - 1];
    if (previous !== undefined && pageNumber - previous > 1) result.push(null);
    result.push(pageNumber);
  });
  return result;
}

function SuccessNotification({
  message,
  label,
  closeLabel,
  onDismiss,
}: {
  message: string;
  label: string;
  closeLabel: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onDismiss, 5_000);
    return () => window.clearTimeout(timeoutId);
  }, [message, onDismiss]);

  return (
    <div
      className="account-success-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={label}
    >
      <span className="account-success-toast-icon" aria-hidden="true">
        ✓
      </span>
      <p>{message}</p>
      <button type="button" aria-label={closeLabel} onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}

function validateForm(
  form: PlantManagerForm,
  plantId: string,
  stationIds: readonly string[],
  language: "es" | "en",
): string | null {
  const message = (spanish: string, english: string) =>
    language === "es" ? spanish : english;
  if (form.displayName.trim().length === 0)
    return message("Indique el nombre completo.", "Enter the full name.");
  if (plantId.length === 0)
    return message("Seleccione una planta.", "Select a plant.");
  if (form.role === "OPERARIO") return null;
  if (form.password !== form.passwordConfirmation)
    return message("Las contraseñas no coinciden.", "Passwords do not match.");
  if (
    form.password.length < 12 ||
    !/[a-z]/u.test(form.password) ||
    !/[A-Z]/u.test(form.password) ||
    !/[0-9]/u.test(form.password) ||
    !/[^A-Za-z0-9\s]/u.test(form.password)
  )
    return message(
      "La contraseña no cumple los requisitos indicados.",
      "The password does not meet the stated requirements.",
    );
  if (form.pin !== form.pinConfirmation)
    return message("Los PIN no coinciden.", "PINs do not match.");
  if (!/^\d{6,12}$/u.test(form.pin))
    return message(
      "El PIN debe contener de 6 a 12 dígitos.",
      "The PIN must contain 6 to 12 digits.",
    );
  if (stationIds.length === 0)
    return message(
      "Seleccione al menos una estación.",
      "Select at least one station.",
    );
  return null;
}

function accountError(error: unknown, language: "es" | "en"): string {
  if (
    error instanceof ApiRequestError &&
    error.code === "ACCOUNT_EMAIL_ALREADY_REGISTERED"
  ) {
    return language === "es"
      ? "El correo ya pertenece a otra cuenta."
      : "The email already belongs to another account.";
  }
  return requestErrorMessage(
    error,
    language === "es"
      ? "No se pudo completar la gestión de la cuenta."
      : "The account operation could not be completed.",
    language,
  );
}

function automaticStationMessage({
  plantsLoading,
  plantsError,
  hasActivePlants,
  stationsLoading,
  stationsError,
  tr,
}: {
  plantsLoading: boolean;
  plantsError: boolean;
  hasActivePlants: boolean;
  stationsLoading: boolean;
  stationsError: boolean;
  tr: (spanish: string, english: string) => string;
}): string {
  if (plantsLoading || stationsLoading) {
    return tr(
      "Preparando la asignación automática de estación…",
      "Preparing automatic station assignment…",
    );
  }
  if (plantsError || !hasActivePlants) {
    return tr(
      "No se pudo identificar una planta activa. Actualice la página e intente nuevamente.",
      "An active plant could not be identified. Refresh the page and try again.",
    );
  }
  if (stationsError) {
    return tr(
      "No se pudo consultar la estación activa. Actualice la página e intente nuevamente.",
      "The active station could not be loaded. Refresh the page and try again.",
    );
  }
  return tr(
    "No hay una estación activa disponible en las plantas activas. Active la estación compartida y vuelva a esta vista.",
    "There is no active station available in the active plants. Activate the shared station and return to this view.",
  );
}

function statusLabel(
  account: Account,
  tr: (spanish: string, english: string) => string,
): string {
  if (account.accountStatus === "PENDING_APPROVAL")
    return tr("PENDIENTE", "PENDING");
  if (account.accountStatus === "SUSPENDED")
    return tr("SUSPENDIDA", "SUSPENDED");
  return tr("ACTIVA", "ACTIVE");
}
