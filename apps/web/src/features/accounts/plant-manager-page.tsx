import { useCallback, useEffect, useState, type FormEvent } from "react";

import type {
  Account,
  CreatePlantManagerInput,
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
  const selectedPlantId =
    plants.data?.items.find((plant) => plant.isActive)?.id ?? "";
  const stations = useAccountStations(selectedPlantId);
  const selectedStationId =
    stations.data?.items.find((station) => station.isActive)?.id ?? "";
  const automaticStationIds =
    selectedStationId.length === 0 ? [] : [selectedStationId];
  const createManager = useCreatePlantManager();
  const createOperator = useCreateOperator();
  const governManager = useGovernPlantManager();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const dismissSuccess = useCallback(() => setSuccess(null), []);

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
      <header className="portal-page-head">
        <div>
          <p className="eyebrow">{tr("ACCESO DE PLANTA", "PLANT ACCESS")}</p>
          <h1>{tr("Usuarios de planta", "Plant users")}</h1>
          <p>
            {tr(
              "Cree cuentas personales para desktop, prepare sus estaciones y actívelas cuando haya entregado las credenciales.",
              "Create personal desktop accounts, prepare their stations, and activate them after delivering the credentials.",
            )}
          </p>
        </div>
      </header>

      <section className="account-layout">
        <section className="portal-panel account-create-panel">
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
            <button
              type="submit"
              disabled={
                createManager.isPending ||
                createOperator.isPending ||
                selectedPlantId.length === 0 ||
                (form.role === "JEFE_PLANTA" && selectedStationId.length === 0)
              }
            >
              {createManager.isPending || createOperator.isPending
                ? tr("CREANDO…", "CREATING…")
                : form.role === "JEFE_PLANTA"
                  ? tr("CREAR CUENTA PENDIENTE", "CREATE PENDING ACCOUNT")
                  : tr("REGISTRAR OPERARIO", "REGISTER OPERATOR")}
            </button>
          </form>
        </section>

        <section className="portal-panel account-list-panel">
          <header>
            <div>
              <h2>{tr("Jefes de planta", "Plant managers")}</h2>
              <p>
                {tr(
                  "Active únicamente después de entregar las credenciales",
                  "Activate only after delivering the credentials",
                )}
              </p>
            </div>
            <span className="account-total">
              {managers.data?.total ?? 0} {tr("cuentas", "accounts")}
            </span>
          </header>
          {managers.isLoading && (
            <p className="query-message">
              {tr("Cargando cuentas…", "Loading accounts…")}
            </p>
          )}
          {managers.isError && (
            <p className="query-message error" role="alert">
              {requestErrorMessage(managers.error, undefined, language)}
            </p>
          )}
          {managers.data?.items.length === 0 && (
            <div className="empty-state">
              <span aria-hidden="true">♙</span>
              <h3>{tr("Sin cuentas creadas", "No accounts created")}</h3>
              <p>
                {tr(
                  "Use el formulario para preparar el primer acceso de desktop.",
                  "Use the form to prepare the first desktop access.",
                )}
              </p>
            </div>
          )}
          <div className="account-list">
            {managers.data?.items.map((account) => (
              <article className="account-card" key={account.id}>
                <header>
                  <div>
                    <h3>{workerDisplayName(account.displayName)}</h3>
                    <p>
                      {tr("Creada", "Created")}{" "}
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                      }).format(new Date(account.createdAt))}
                    </p>
                  </div>
                  <span
                    className={`account-status ${account.accountStatus.toLowerCase()}`}
                  >
                    {statusLabel(account, tr)}
                  </span>
                </header>
                <dl>
                  <div>
                    <dt>{tr("Rol", "Role")}</dt>
                    <dd>{tr("Jefe de planta", "Plant manager")}</dd>
                  </div>
                </dl>
                {account.statusReason !== null && (
                  <p className="account-reason">{account.statusReason}</p>
                )}
                {suspendingId === account.id ? (
                  <div className="suspension-form">
                    <label>
                      {tr("Motivo de suspensión", "Suspension reason")}
                      <textarea
                        required
                        maxLength={300}
                        rows={3}
                        value={suspensionReason}
                        onChange={(event) =>
                          setSuspensionReason(event.target.value)
                        }
                      />
                    </label>
                    <div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setSuspendingId(null);
                          setSuspensionReason("");
                        }}
                      >
                        {tr("Cancelar", "Cancel")}
                      </button>
                      <button
                        type="button"
                        disabled={
                          suspensionReason.trim().length === 0 ||
                          governManager.isPending
                        }
                        onClick={() => void govern(account, "suspend")}
                      >
                        {tr("Confirmar suspensión", "Confirm suspension")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="account-actions">
                    {account.accountStatus === "PENDING_APPROVAL" && (
                      <button
                        type="button"
                        disabled={governManager.isPending}
                        onClick={() => void govern(account, "approve")}
                      >
                        {tr("ACTIVAR CUENTA", "ACTIVATE ACCOUNT")}
                      </button>
                    )}
                    {account.accountStatus === "ACTIVE" && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setSuspendingId(account.id)}
                      >
                        {tr("SUSPENDER", "SUSPEND")}
                      </button>
                    )}
                    {account.accountStatus === "SUSPENDED" && (
                      <button
                        type="button"
                        disabled={governManager.isPending}
                        onClick={() => void govern(account, "reactivate")}
                      >
                        {tr("REACTIVAR", "REACTIVATE")}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      </section>
      <section className="portal-panel account-list-panel">
        <header>
          <div>
            <h2>{tr("Operarios", "Operators")}</h2>
            <p>
              {tr(
                "El prefijo OP identifica el rol sin modificar el nombre guardado.",
                "The OP prefix identifies the role without modifying the stored name.",
              )}
            </p>
          </div>
        </header>
        {workers.isLoading && (
          <p className="query-message">
            {tr("Cargando operarios…", "Loading operators…")}
          </p>
        )}
        {workers.isError && (
          <p className="query-message error" role="alert">
            {requestErrorMessage(workers.error, undefined, language)}
          </p>
        )}
        <div className="account-list">
          {(workers.data?.items ?? [])
            .filter((worker) => worker.category === "OPERARIO")
            .map((worker) => (
              <article className="account-card" key={worker.id}>
                <header>
                  <div>
                    <h3>{workerDisplayName(worker.name)}</h3>
                    <p>
                      {worker.email ??
                        worker.phone ??
                        tr("Sin contacto", "No contact")}
                    </p>
                  </div>
                  <span
                    className={`account-status ${worker.isActive ? "active" : "suspended"}`}
                  >
                    {worker.status === "PROVISIONAL"
                      ? tr("PENDIENTE", "PENDING")
                      : worker.isActive
                        ? tr("ACTIVO", "ACTIVE")
                        : tr("INACTIVO", "INACTIVE")}
                  </span>
                </header>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
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
