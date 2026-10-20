import { useEffect, useMemo, useState, type PropsWithChildren } from "react";

import {
  LanguageContext,
  type Language,
  type LanguageContextValue,
} from "./language-context";

const languageStorageKey = "industrias-doradas:language";

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>(loadLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        language === "es"
          ? "Portal web de Industrias Doradas"
          : "Industrias Doradas web portal",
      );
    try {
      window.localStorage.setItem(languageStorageKey, language);
    } catch {
      // La preferencia visual no debe impedir el uso del portal.
    }
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: language === "es" ? "es-CR" : "en-US",
      setLanguage: setLanguageState,
      toggleLanguage: () =>
        setLanguageState((current) => (current === "es" ? "en" : "es")),
      tr: (spanish, english) => (language === "es" ? spanish : english),
    }),
    [language],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

function loadLanguage(): Language {
  try {
    return window.localStorage.getItem(languageStorageKey) === "en"
      ? "en"
      : "es";
  } catch {
    return "es";
  }
}
