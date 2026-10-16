import { useLanguage } from "./language-context";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, toggleLanguage, tr } = useLanguage();
  const targetLanguage = language === "es" ? "English" : "Español";

  return (
    <button
      type="button"
      className={`language-switcher${compact ? " compact" : ""}`}
      onClick={toggleLanguage}
      aria-label={tr("Cambiar idioma a inglés", "Switch language to Spanish")}
      title={tr("Cambiar a inglés", "Switch to Spanish")}
    >
      <span aria-hidden="true">文</span>
      <strong>{language === "es" ? "EN" : "ES"}</strong>
      {!compact && <small>{targetLanguage}</small>}
    </button>
  );
}
