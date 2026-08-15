import { validateEnvironment } from "./environment";

describe("validateEnvironment", () => {
  it("normalizes a valid configuration", () => {
    expect(
      validateEnvironment({ NODE_ENV: "test", PORT: "3100" }),
    ).toMatchObject({
      NODE_ENV: "test",
      PORT: 3100,
    });
  });

  it("reports every missing mandatory variable", () => {
    expect(() => validateEnvironment({})).toThrow(
      "Invalid environment configuration: NODE_ENV is required; PORT is required",
    );
  });

  it("rejects an invalid port without echoing its value", () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: "development", PORT: "secret-value" }),
    ).toThrow("PORT must be an integer between 1 and 65535");
  });

  it("accepts valid optional Supabase settings", () => {
    expect(
      validateEnvironment({
        NODE_ENV: "production",
        PORT: 3000,
        SUPABASE_URL: "https://project-ref.supabase.co",
        SUPABASE_ANON_KEY: "public-anon-key-example",
        SUPABASE_SERVICE_ROLE_KEY: "private-service-role-example",
      }),
    ).toMatchObject({
      SUPABASE_URL: "https://project-ref.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key-example",
      SUPABASE_SERVICE_ROLE_KEY: "private-service-role-example",
    });
  });

  it("rejects invalid Supabase settings without echoing their values", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        PORT: 3000,
        SUPABASE_URL: "not-a-url-sensitive-value",
        SUPABASE_SERVICE_ROLE_KEY: "short-secret",
      }),
    ).toThrow(
      "SUPABASE_URL must be an absolute HTTP or HTTPS URL; SUPABASE_SERVICE_ROLE_KEY must contain at least 16 characters",
    );
  });
});
