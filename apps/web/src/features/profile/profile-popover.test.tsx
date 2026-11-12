import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SelfProfile } from "../../api/generated/api-client";
import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";
import { LanguageProvider } from "../../i18n/language-provider";
import type * as PhotoProcessing from "./photo-processing";
import { ProfileMenu } from "./profile-popover";

const preparePhoto = vi.hoisted(() => vi.fn());
vi.mock("./photo-processing", async (original) => ({
  ...(await original<typeof PhotoProcessing>()),
  preparePhoto,
}));

const SIGNED_URL =
  "https://project.supabase.co/storage/v1/object/sign/profile-photos/a.jpg?token=short";

let profile: SelfProfile;
let calls: Array<{ method: string; url: string; body: unknown }>;
let failNext: { status: number; code: string } | null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  profile = {
    id: "a1000000-0000-4000-8000-000000000001",
    organizationId: "30000000-0000-4000-8000-000000000001",
    role: "JEFE_EMPRESA",
    displayName: "Lucía Gómez",
    email: "lucia@example.test",
    pendingEmail: null,
    phone: null,
    photo: null,
  };
  calls = [];
  failNext = null;
  preparePhoto.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body });
      if (failNext !== null && method !== "GET") {
        const failure = failNext;
        failNext = null;
        return Promise.resolve(
          json({ code: failure.code, message: "x" }, failure.status),
        );
      }
      if (url.endsWith("/me/profile") && method === "PATCH") {
        const body = JSON.parse(init?.body as string) as {
          displayName?: string;
          phone?: string | null;
        };
        profile = {
          ...profile,
          ...(body.displayName === undefined
            ? {}
            : { displayName: body.displayName }),
          ...(body.phone === undefined ? {} : { phone: body.phone }),
        };
      }
      if (url.endsWith("/me/profile/email")) {
        const body = JSON.parse(init?.body as string) as { email: string };
        profile = { ...profile, pendingEmail: body.email };
      }
      if (url.endsWith("/me/profile/photo") && method === "PUT")
        profile = {
          ...profile,
          photo: { url: SIGNED_URL, expiresAt: "2026-11-11T00:01:00Z" },
        };
      if (url.endsWith("/me/profile/photo") && method === "DELETE")
        profile = { ...profile, photo: null };
      return Promise.resolve(json(profile));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderMenu(signOut = vi.fn(() => Promise.resolve())) {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: "30000000-0000-4000-8000-000000000001",
      displayName: "Lucía Gómez",
      role: "JEFE_EMPRESA",
      permissions: [],
      expiresAt: "2026-10-09T01:00:00Z",
    },
    foundSession: null,
    loading: false,
    error: null,
    continueFoundSession: vi.fn(),
    signIn: vi.fn(),
    recover: vi.fn(),
    signOut,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <AuthContext.Provider value={auth}>
      <QueryProvider client={client}>
        <LanguageProvider>
          <button type="button">fuera</button>
          <ProfileMenu />
        </LanguageProvider>
      </QueryProvider>
    </AuthContext.Provider>,
  );
  return auth;
}

async function openMenu() {
  const user = userEvent.setup();
  const trigger = await screen.findByRole("button", {
    name: "Perfil de Lucía Gómez",
  });
  await user.click(trigger);
  await screen.findByRole("dialog", { name: "Mi perfil" });
  return { user, trigger };
}

describe("perfil gerencial", () => {
  it("muestra iniciales, nombre, rol Gerencia, correo y teléfono vacío", async () => {
    renderMenu();
    const trigger = await screen.findByRole("button", {
      name: "Perfil de Lucía Gómez",
    });
    expect(trigger).toHaveTextContent("LG");
    await openMenu();
    expect(screen.getByText("Gerencia")).toBeInTheDocument();
    expect(screen.getByText("lucia@example.test")).toBeInTheDocument();
    expect(screen.getByText("No registrado")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Quitar fotografía" }),
    ).not.toBeInTheDocument();
  });

  it("permite cerrar sesión aunque el perfil no cargue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(json({ code: "UNAVAILABLE", message: "x" }, 503)),
      ),
    );
    const signOut = vi.fn(() => Promise.resolve());
    renderMenu(signOut);
    await openMenu();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No fue posible cargar el perfil",
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("edita nombre y teléfono, y valida formatos sin llamar a la API", async () => {
    renderMenu();
    const { user } = await openMenu();
    await user.click(screen.getByRole("button", { name: "Editar perfil" }));
    const phone = screen.getByLabelText("Teléfono (opcional)");
    await user.type(phone, "123");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Teléfono no válido",
    );
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);

    await user.clear(phone);
    await user.type(phone, "8888-7777");
    const name = screen.getByLabelText("Nombre");
    await user.clear(name);
    await user.type(name, "Lucía G.");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Perfil guardado.")).toBeInTheDocument();
    const patch = calls.find((call) => call.method === "PATCH");
    expect(JSON.parse(String(patch?.body))).toEqual({
      displayName: "Lucía G.",
      phone: "+50688887777",
    });
    expect(screen.getByText("+506 8888 7777")).toBeInTheDocument();
  });

  it("permite dejar el teléfono vacío", async () => {
    profile.phone = "+50688887777";
    renderMenu();
    const { user } = await openMenu();
    await user.click(screen.getByRole("button", { name: "Editar perfil" }));
    await user.clear(screen.getByLabelText("Teléfono (opcional)"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Perfil guardado.");
    const patch = calls.find((call) => call.method === "PATCH");
    expect(JSON.parse(String(patch?.body))).toMatchObject({ phone: null });
  });

  it("solicita el cambio de correo y lo muestra como pendiente, no definitivo", async () => {
    renderMenu();
    const { user } = await openMenu();
    await user.click(screen.getByRole("button", { name: "Cambiar correo" }));
    await user.type(
      screen.getByLabelText("Correo nuevo"),
      "nueva@example.test",
    );
    await user.click(
      screen.getByRole("button", { name: "Enviar confirmación" }),
    );
    expect(await screen.findByText(/Solicitud enviada/u)).toBeInTheDocument();
    expect(screen.getByText("lucia@example.test")).toBeInTheDocument();
    expect(
      screen.getByText(/Cambio pendiente a nueva@example.test/u),
    ).toBeInTheDocument();
    const put = calls.find((call) => call.url.endsWith("/me/profile/email"));
    expect(JSON.parse(String(put?.body))).toMatchObject({
      email: "nueva@example.test",
    });
    expect(String(put?.body)).not.toContain("token");
  });

  it("sube y quita la foto privada; la URL firmada solo vive en memoria", async () => {
    preparePhoto.mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
    renderMenu();
    const { user } = await openMenu();
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input?.accept).toBe("image/jpeg,image/png,image/webp");
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
    expect(
      await screen.findByText("Fotografía actualizada."),
    ).toBeInTheDocument();
    const upload = calls.find(
      (call) => call.method === "PUT" && call.url.endsWith("/photo"),
    );
    expect(upload?.body).toBeInstanceOf(Blob);
    const image = screen.getByRole("dialog").querySelector("img");
    expect(image?.getAttribute("src")).toBe(SIGNED_URL);
    expect(JSON.stringify(window.localStorage)).not.toContain("token=short");

    await user.click(screen.getByRole("button", { name: "Quitar fotografía" }));
    expect(await screen.findByText("Fotografía quitada.")).toBeInTheDocument();
    expect(screen.getByRole("dialog").querySelector("img")).toBeNull();
  });

  it("muestra el error si la imagen no es válida y no la envía", async () => {
    const real =
      await vi.importActual<typeof PhotoProcessing>("./photo-processing");
    preparePhoto.mockImplementation(real.preparePhoto);
    renderMenu();
    await openMenu();
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    const fake = new File(["<svg></svg>"], "foto.jpg", { type: "image/jpeg" });
    fireEvent.change(input as HTMLInputElement, { target: { files: [fake] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Solo se aceptan imágenes JPEG, PNG o WebP.",
    );
    expect(calls.some((call) => call.url.endsWith("/photo"))).toBe(false);
  });

  it("vuelve a las iniciales si la foto no carga", async () => {
    profile.photo = { url: SIGNED_URL, expiresAt: "2026-11-11T00:01:00Z" };
    renderMenu();
    const trigger = await screen.findByRole("button", {
      name: "Perfil de Lucía Gómez",
    });
    await waitFor(() => expect(trigger.querySelector("img")).not.toBeNull());
    fireEvent.error(trigger.querySelector("img") as HTMLImageElement);
    expect(trigger).toHaveTextContent("LG");
  });

  it("se navega con teclado, cierra con Escape y devuelve el foco al avatar", async () => {
    renderMenu();
    const { user, trigger } = await openMenu();
    expect(screen.getByRole("button", { name: "Editar perfil" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("button", { name: "Cambiar correo" }),
    ).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("cierra al hacer clic fuera", async () => {
    renderMenu();
    const { user } = await openMenu();
    await user.click(screen.getByRole("button", { name: "fuera" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explica el error cuando la API rechaza el cambio", async () => {
    renderMenu();
    const { user } = await openMenu();
    failNext = { status: 409, code: "EMAIL_CHANGE_EMAIL_UNAVAILABLE" };
    await user.click(screen.getByRole("button", { name: "Cambiar correo" }));
    await user.type(screen.getByLabelText("Correo nuevo"), "otra@example.test");
    await user.click(
      screen.getByRole("button", { name: "Enviar confirmación" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ese correo no se puede usar.",
    );
  });
});
