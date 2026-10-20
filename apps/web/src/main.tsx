import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/app";
import { QueryProvider } from "./app/query-provider";
import { AuthProvider } from "./auth/auth-provider";
import { LanguageProvider } from "./i18n/language-provider";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("No se encontro el elemento raiz de la aplicacion web.");
}

createRoot(rootElement).render(
  <StrictMode>
    <LanguageProvider>
      <QueryProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryProvider>
    </LanguageProvider>
  </StrictMode>,
);
