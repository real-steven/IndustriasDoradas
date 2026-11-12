import { useId, useState, type InputHTMLAttributes } from "react";

type SecretInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "type" | "value" | "onChange"
>;

/**
 * Campo de contraseña o PIN con su propio botón mostrar/ocultar.
 * La visibilidad vive solo en memoria del componente: empieza oculta y se
 * pierde al desmontarlo. El valor nunca se escribe en URL, almacenamiento ni
 * logs desde aquí.
 */
export function SecretField({
  label,
  showLabel,
  hideLabel,
  value,
  onChange,
  inputProps,
}: {
  label: string;
  showLabel: string;
  hideLabel: string;
  value: string;
  onChange: (value: string) => void;
  inputProps?: SecretInputProps;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? hideLabel : showLabel;

  return (
    <div className="secret-field-group">
      <label htmlFor={id}>{label}</label>
      <div className="secret-field">
        <input
          {...inputProps}
          id={id}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="secret-field-toggle"
          aria-controls={id}
          aria-label={toggleLabel}
          title={toggleLabel}
          // Con mouse el foco se queda en el campo.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
        >
          <VisibilityIcon visible={visible} />
        </button>
      </div>
    </div>
  );
}

function VisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 10C4 5.2 7 3.8 10 3.8S16 5.2 18.5 10C16 14.8 13 16.2 10 16.2S4 14.8 1.5 10Z" />
      <circle cx="10" cy="10" r="3" />
      {visible && <path d="M3 2.5 17 17.5" />}
    </svg>
  );
}
