import { describe, expect, it } from "vitest";

import { readWebEnvironment } from "./environment";

describe("readWebEnvironment", () => {
  it("uses the same-origin API path by default", () => {
    expect(readWebEnvironment({})).toEqual({ apiBaseUrl: "/api" });
  });

  it("accepts an absolute HTTPS API URL", () => {
    expect(
      readWebEnvironment({ VITE_API_BASE_URL: "https://api.example.test/" }),
    ).toEqual({ apiBaseUrl: "https://api.example.test" });
  });

  it("rejects an invalid URL without echoing its value", () => {
    expect(() =>
      readWebEnvironment({ VITE_API_BASE_URL: "sensitive-invalid-value" }),
    ).toThrow("Configuracion web invalida: VITE_API_BASE_URL");
  });
});
