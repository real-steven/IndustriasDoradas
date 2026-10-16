import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { useLanguage } from "./language-context";
import { LanguageProvider } from "./language-provider";
import { LanguageSwitcher } from "./language-switcher";

describe("LanguageProvider", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.lang = "es";
  });

  it("switches the interface to English and persists the preference", async () => {
    const user = userEvent.setup();

    render(
      <LanguageProvider>
        <LanguageProbe />
        <LanguageSwitcher />
      </LanguageProvider>,
    );

    expect(screen.getByRole("heading", { name: "Bienvenido" })).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Cambiar idioma a inglés" }),
    );

    expect(screen.getByRole("heading", { name: "Welcome" })).toBeVisible();
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(window.localStorage.getItem("industrias-doradas:language")).toBe(
      "en",
    );
  });

  it("restores a previously selected language", () => {
    window.localStorage.setItem("industrias-doradas:language", "en");

    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>,
    );

    expect(screen.getByRole("heading", { name: "Welcome" })).toBeVisible();
  });
});

function LanguageProbe() {
  const { tr } = useLanguage();
  return <h1>{tr("Bienvenido", "Welcome")}</h1>;
}
