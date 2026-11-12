import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { ApiConnectionError, ApiRequestError } from "../../api/http";
import { useAuth } from "../../auth/auth-context";
import { useLanguage } from "../../i18n/language-context";
import { formatPhone, initialsOf, normalizePhone } from "./phone";
import {
  PHOTO_ACCEPT,
  preparePhoto,
  PhotoValidationError,
} from "./photo-processing";
import {
  useRemoveProfilePhoto,
  useReplaceProfilePhoto,
  useRequestEmailChange,
  useSelfProfile,
  useUpdateOwnProfile,
} from "./profile-data";

type Mode = "view" | "edit" | "email";
type Feedback = { kind: "success" | "error"; text: string } | null;

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]):not([type="file"]), [href], [tabindex]:not([tabindex="-1"])';

export function ProfileAvatar({
  photoUrl,
  name,
  size = "small",
}: {
  photoUrl: string | null | undefined;
  name: string;
  size?: "small" | "large";
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const showPhoto =
    photoUrl !== null && photoUrl !== undefined && broken !== photoUrl;
  return (
    <span
      className={`manager-avatar profile-avatar-${size}`}
      aria-hidden="true"
    >
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(photoUrl)}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

/** Avatar interactivo de la cuenta gerencial y su ventana de perfil. */
export function ProfileMenu() {
  const auth = useAuth();
  const { tr } = useLanguage();
  const profile = useSelfProfile();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pickerOpen = useRef(false);
  const panelId = useId();
  const [placement, setPlacement] = useState<CSSProperties>({});

  const data = profile.data;
  const name = data?.displayName ?? auth.profile?.displayName ?? "Gerencia";

  const close = useCallback(() => {
    setOpen(false);
    setMode("view");
    setFeedback(null);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (pickerOpen.current) return;
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      setOpen(false);
      setMode("view");
      setFeedback(null);
    };
    const onFocus = () => {
      // Al volver del selector de archivos (aceptado o cancelado).
      window.setTimeout(() => {
        pickerOpen.current = false;
      }, 300);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("focus", onFocus);
    };
  }, [open]);

  // El panel vive en un portal para no quedar recortado por la barra lateral;
  // se ancla encima del avatar y se recalcula al cambiar el tamaño o desplazar.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect === undefined) return;
      const margin = 16;
      const width = Math.min(320, window.innerWidth - margin * 2);
      const left = Math.max(
        margin,
        Math.min(rect.left - 8, window.innerWidth - width - margin),
      );
      setPlacement({
        left,
        bottom: Math.max(margin, window.innerHeight - rect.top + 12),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>(
      mode === "view" ? "[data-profile-action]" : "input",
    );
    first?.focus();
  }, [open, mode]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (pickerOpen.current) return;
      event.preventDefault();
      if (mode !== "view") {
        setMode("view");
        setFeedback(null);
        return;
      }
      close();
      return;
    }
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Tab") {
      const next = event.shiftKey
        ? index <= 0
          ? items.length - 1
          : index - 1
        : index === items.length - 1
          ? 0
          : index + 1;
      event.preventDefault();
      items[next]?.focus();
    } else if (
      (event.key === "ArrowDown" || event.key === "ArrowUp") &&
      (document.activeElement as HTMLElement | null)?.tagName === "BUTTON"
    ) {
      const buttons = items.filter((item) => item.tagName === "BUTTON");
      const current = buttons.indexOf(document.activeElement as HTMLElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      event.preventDefault();
      buttons[(current + delta + buttons.length) % buttons.length]?.focus();
    }
  };

  return (
    <div className="profile-menu">
      <button
        ref={triggerRef}
        type="button"
        className="profile-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={tr(`Perfil de ${name}`, `${name}'s profile`)}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <ProfileAvatar photoUrl={data?.photo?.url} name={name} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="false"
            aria-label={tr("Mi perfil", "My profile")}
            className="profile-popover"
            style={placement}
            onKeyDown={onKeyDown}
          >
            {profile.isPending ? (
              <p role="status">{tr("Cargando perfil…", "Loading profile…")}</p>
            ) : profile.isError || data === undefined ? (
              <>
                <p role="alert" className="profile-feedback error">
                  {tr(
                    "No fue posible cargar el perfil. Revise la conexión.",
                    "The profile could not be loaded. Check the connection.",
                  )}
                </p>
                {/* Es la única salida de la sesión: debe existir aunque el perfil falle. */}
                <button
                  type="button"
                  className="profile-signout"
                  data-profile-action
                  onClick={() => void auth.signOut()}
                >
                  {tr("Cerrar sesión", "Sign out")}
                </button>
              </>
            ) : mode === "edit" ? (
              <EditForm
                displayName={data.displayName}
                phone={data.phone}
                onCancel={() => setMode("view")}
                onSaved={(text) => {
                  setMode("view");
                  setFeedback({ kind: "success", text });
                }}
              />
            ) : mode === "email" ? (
              <EmailForm
                currentEmail={data.email}
                onCancel={() => setMode("view")}
                onSaved={(text) => {
                  setMode("view");
                  setFeedback({ kind: "success", text });
                }}
              />
            ) : (
              <ProfileSummary
                name={name}
                photoUrl={data.photo?.url}
                email={data.email}
                pendingEmail={data.pendingEmail}
                phone={data.phone}
                hasPhoto={data.photo !== null}
                feedback={feedback}
                setFeedback={setFeedback}
                onEdit={() => {
                  setFeedback(null);
                  setMode("edit");
                }}
                onEmail={() => {
                  setFeedback(null);
                  setMode("email");
                }}
                onPickerChange={(isOpen) => {
                  pickerOpen.current = isOpen;
                }}
                onRefresh={() => void profile.refetch()}
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function ProfileSummary(props: {
  name: string;
  photoUrl: string | undefined;
  email: string | null;
  pendingEmail: string | null;
  phone: string | null;
  hasPhoto: boolean;
  feedback: Feedback;
  setFeedback: (feedback: Feedback) => void;
  onEdit: () => void;
  onEmail: () => void;
  onPickerChange: (open: boolean) => void;
  onRefresh: () => void;
}) {
  const auth = useAuth();
  const { tr } = useLanguage();
  const replace = useReplaceProfilePhoto();
  const remove = useRemoveProfilePhoto();
  const busy = replace.isPending || remove.isPending;
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    props.onPickerChange(false);
    if (file === undefined) return;
    props.setFeedback(null);
    try {
      const prepared = await preparePhoto(file);
      await replace.mutateAsync(prepared);
      props.setFeedback({
        kind: "success",
        text: tr("Fotografía actualizada.", "Photo updated."),
      });
    } catch (error) {
      props.setFeedback({ kind: "error", text: errorText(error, tr) });
    }
  };

  return (
    <>
      <div className="profile-header">
        <ProfileAvatar
          photoUrl={props.photoUrl}
          name={props.name}
          size="large"
        />
        <div>
          <strong>{props.name}</strong>
          <span className="profile-role">{tr("Gerencia", "Management")}</span>
        </div>
      </div>
      <dl className="profile-facts">
        <dt>{tr("Correo de acceso", "Sign-in email")}</dt>
        <dd>{props.email ?? "—"}</dd>
        {props.pendingEmail !== null && (
          <dd className="profile-pending">
            {tr(
              `Cambio pendiente a ${props.pendingEmail}. Confirme desde el enlace enviado por correo; hasta entonces sigue entrando con el correo actual.`,
              `Pending change to ${props.pendingEmail}. Confirm it from the emailed link; until then keep signing in with the current email.`,
            )}{" "}
            <button
              type="button"
              className="link-button"
              onClick={props.onRefresh}
            >
              {tr("Ya confirmé", "I confirmed")}
            </button>
          </dd>
        )}
        <dt>{tr("Teléfono", "Phone")}</dt>
        <dd>
          {props.phone === null
            ? tr("No registrado", "Not set")
            : formatPhone(props.phone)}
        </dd>
      </dl>
      {props.feedback !== null && (
        <p
          role={props.feedback.kind === "error" ? "alert" : "status"}
          className={`profile-feedback ${props.feedback.kind}`}
        >
          {props.feedback.text}
        </p>
      )}
      {busy && (
        <p role="status" className="profile-feedback">
          {tr("Guardando…", "Saving…")}
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={PHOTO_ACCEPT}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void onFile(file);
        }}
      />
      <div className="profile-actions">
        <button
          type="button"
          data-profile-action
          onClick={props.onEdit}
          disabled={busy}
        >
          {tr("Editar perfil", "Edit profile")}
        </button>
        <button type="button" onClick={props.onEmail} disabled={busy}>
          {tr("Cambiar correo", "Change email")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            props.onPickerChange(true);
            fileRef.current?.click();
          }}
        >
          {tr("Cambiar fotografía", "Change photo")}
        </button>
        {props.hasPhoto && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              props.setFeedback(null);
              remove.mutate(undefined, {
                onSuccess: () =>
                  props.setFeedback({
                    kind: "success",
                    text: tr("Fotografía quitada.", "Photo removed."),
                  }),
                onError: (error) =>
                  props.setFeedback({
                    kind: "error",
                    text: errorText(error, tr),
                  }),
              });
            }}
          >
            {tr("Quitar fotografía", "Remove photo")}
          </button>
        )}
        <button
          type="button"
          className="profile-signout"
          onClick={() => void auth.signOut()}
        >
          {tr("Cerrar sesión", "Sign out")}
        </button>
      </div>
    </>
  );
}

function EditForm(props: {
  displayName: string;
  phone: string | null;
  onCancel: () => void;
  onSaved: (text: string) => void;
}) {
  const { tr } = useLanguage();
  const update = useUpdateOwnProfile();
  const [name, setName] = useState(props.displayName);
  const [phone, setPhone] = useState(formatPhone(props.phone));
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const phoneId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.replace(/\s+/gu, " ").trim();
    if (trimmed === "" || trimmed.length > 80) {
      setError(
        tr(
          "Escriba un nombre de 1 a 80 caracteres.",
          "Enter a name of 1 to 80 characters.",
        ),
      );
      return;
    }
    const normalized = phone.trim() === "" ? null : normalizePhone(phone);
    if (phone.trim() !== "" && normalized === null) {
      setError(
        tr(
          "Teléfono no válido. Use 8 dígitos de Costa Rica (8888-7777) o un número internacional con + (por ejemplo +1 415 555 0100).",
          "Invalid phone. Use 8 Costa Rica digits (8888-7777) or an international number with + (e.g. +1 415 555 0100).",
        ),
      );
      return;
    }
    setError(null);
    update.mutate(
      { displayName: trimmed, phone: normalized },
      {
        onSuccess: () =>
          props.onSaved(tr("Perfil guardado.", "Profile saved.")),
        onError: (failure) => setError(errorText(failure, tr)),
      },
    );
  };

  return (
    <form className="profile-form" onSubmit={submit} noValidate>
      <strong>{tr("Editar perfil", "Edit profile")}</strong>
      <label htmlFor={nameId}>{tr("Nombre", "Name")}</label>
      <input
        id={nameId}
        value={name}
        maxLength={80}
        autoComplete="name"
        onChange={(e) => setName(e.target.value)}
      />
      <label htmlFor={phoneId}>
        {tr("Teléfono (opcional)", "Phone (optional)")}
      </label>
      <input
        id={phoneId}
        value={phone}
        inputMode="tel"
        autoComplete="tel"
        maxLength={24}
        placeholder="8888-7777"
        onChange={(e) => setPhone(e.target.value)}
      />
      <p className="profile-hint">
        {tr(
          "El rol, la organización y los datos técnicos no se editan aquí.",
          "Role, organization and technical data are not edited here.",
        )}
      </p>
      {error !== null && (
        <p role="alert" className="profile-feedback error">
          {error}
        </p>
      )}
      <div className="profile-form-actions">
        <button
          type="button"
          onClick={props.onCancel}
          disabled={update.isPending}
        >
          {tr("Cancelar", "Cancel")}
        </button>
        <button type="submit" className="primary" disabled={update.isPending}>
          {update.isPending
            ? tr("Guardando…", "Saving…")
            : tr("Guardar", "Save")}
        </button>
      </div>
    </form>
  );
}

function EmailForm(props: {
  currentEmail: string | null;
  onCancel: () => void;
  onSaved: (text: string) => void;
}) {
  const { tr } = useLanguage();
  const request = useRequestEmailChange();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
      setError(tr("Escriba un correo válido.", "Enter a valid email."));
      return;
    }
    setError(null);
    request.mutate(
      { email: value, redirectTo: `${window.location.origin}/gerencia` },
      {
        onSuccess: () =>
          props.onSaved(
            tr(
              "Solicitud enviada. Revise el correo nuevo (y, si se lo piden, también el actual) y abra el enlace de confirmación. El cambio no es definitivo hasta confirmarlo.",
              "Request sent. Check the new inbox (and the current one if asked) and open the confirmation link. The change is not final until confirmed.",
            ),
          ),
        onError: (failure) => setError(errorText(failure, tr)),
      },
    );
  };

  return (
    <form className="profile-form" onSubmit={submit} noValidate>
      <strong>{tr("Cambiar correo de acceso", "Change sign-in email")}</strong>
      <p className="profile-hint">
        {tr(
          `Correo actual: ${props.currentEmail ?? "—"}`,
          `Current email: ${props.currentEmail ?? "—"}`,
        )}
      </p>
      <label htmlFor={emailId}>{tr("Correo nuevo", "New email")}</label>
      <input
        id={emailId}
        type="email"
        value={email}
        autoComplete="email"
        maxLength={254}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error !== null && (
        <p role="alert" className="profile-feedback error">
          {error}
        </p>
      )}
      <div className="profile-form-actions">
        <button
          type="button"
          onClick={props.onCancel}
          disabled={request.isPending}
        >
          {tr("Cancelar", "Cancel")}
        </button>
        <button type="submit" className="primary" disabled={request.isPending}>
          {request.isPending
            ? tr("Enviando…", "Sending…")
            : tr("Enviar confirmación", "Send confirmation")}
        </button>
      </div>
    </form>
  );
}

function errorText(
  error: unknown,
  tr: (es: string, en: string) => string,
): string {
  if (error instanceof PhotoValidationError) return error.message;
  if (error instanceof ApiConnectionError)
    return tr(
      "Sin conexión. Intente de nuevo cuando vuelva la red.",
      "Offline. Try again when the network returns.",
    );
  if (error instanceof ApiRequestError) {
    const messages: Record<string, readonly [string, string]> = {
      PHONE_INVALID: ["Teléfono no válido.", "Invalid phone."],
      DISPLAY_NAME_INVALID: ["Nombre no válido.", "Invalid name."],
      EMAIL_UNCHANGED: [
        "Ese ya es su correo actual.",
        "That is already your email.",
      ],
      EMAIL_CHANGE_EMAIL_UNAVAILABLE: [
        "Ese correo no se puede usar.",
        "That email cannot be used.",
      ],
      EMAIL_CHANGE_RATE_LIMITED: [
        "Demasiadas solicitudes. Espere unos minutos.",
        "Too many requests. Wait a few minutes.",
      ],
      PHOTO_TOO_LARGE: [
        "La imagen es demasiado pesada.",
        "The image is too large.",
      ],
      PHOTO_NOT_JPEG: ["La imagen no es válida.", "The image is not valid."],
      PHOTO_CORRUPT: ["La imagen está dañada.", "The image is damaged."],
      PHOTO_DIMENSIONS: [
        "La imagen tiene un tamaño no admitido.",
        "Unsupported image size.",
      ],
    };
    const message = messages[error.code];
    if (message !== undefined) return tr(message[0], message[1]);
  }
  return tr(
    "No fue posible guardar. Intente nuevamente.",
    "Could not save. Try again.",
  );
}
