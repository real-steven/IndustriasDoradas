import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LanguageProvider } from "../../i18n/language-provider";
import { ManagementAuditDetail } from "./management-audit-detail";
import {
  managerAuditAction,
  managerAuditArea,
  managerAuditReason,
  managerSecurityMethod,
  managerVisibleAuditChanges,
} from "./management-audit-labels";
import type { AuditEvent } from "./management-shipments-data";

function securityEvent(
  eventType: string,
  method: string | null,
  outcome: string,
  result: AuditEvent["result"] = "SUCCEEDED",
): AuditEvent {
  return {
    id: "d1000000-0000-4000-8000-000000000001",
    actorDisplayName: "Jefe ficticio",
    actorRoleCode: "JEFE_PLANTA",
    origin: "DESKTOP",
    action: "station.security",
    entityType: "station_security_event",
    entityId: "4a000000-0000-4000-8000-000000000001",
    result,
    reasonCode: result === "SUCCEEDED" ? null : outcome,
    changedFields: ["security_event", "access_method", "security_outcome"],
    changes: {
      security_event: { before: null, after: eventType },
      access_method: { before: null, after: method },
      security_outcome: { before: null, after: outcome },
    },
    occurredAt: "2026-10-18T12:00:00.000Z",
    recordedAt: "2026-10-18T12:05:00.000Z",
  };
}

describe("station security audit labels", () => {
  it("distinguishes PIN, biometrics and PIN as an alternative", () => {
    expect(
      managerAuditAction(
        securityEvent("ELEVATION_ACCEPTED", "PIN", "ACEPTADO"),
        "es",
      ),
    ).toBe("Se autorizó el acceso de jefe de planta con PIN");
    expect(
      managerAuditAction(
        securityEvent("ELEVATION_ACCEPTED", "BIOMETRIC", "ACEPTADO"),
        "es",
      ),
    ).toBe("Se autorizó el acceso de jefe de planta con reconocimiento facial");
    expect(
      managerAuditAction(
        securityEvent("ELEVATION_ACCEPTED", "PIN_FALLBACK", "ACEPTADO"),
        "en",
      ),
    ).toBe("Plant manager access was authorized with PIN as an alternative");
  });

  it("separates identity rejection, missing face and camera failure", () => {
    const rejected = securityEvent(
      "BIOMETRIC_REJECTED",
      "BIOMETRIC",
      "NO_COINCIDE",
      "REJECTED",
    );
    const noFace = securityEvent(
      "BIOMETRIC_FACE_NOT_DETECTED",
      "BIOMETRIC",
      "TIEMPO_AGOTADO",
      "REJECTED",
    );
    const camera = securityEvent(
      "BIOMETRIC_CAMERA_UNAVAILABLE",
      "BIOMETRIC",
      "NO_DISPONIBLE",
      "FAILED",
    );

    const actions = [rejected, noFace, camera].map((event) =>
      managerAuditAction(event, "es"),
    );
    expect(new Set(actions).size).toBe(3);
    expect(actions).toEqual([
      "El reconocimiento facial no confirmó la identidad",
      "No se detectó un rostro a tiempo",
      "La cámara de la estación no estaba disponible",
    ]);
    expect(managerAuditReason("TIEMPO_AGOTADO", "es")).toBe(
      "No se detectó un rostro dentro del tiempo límite.",
    );
    expect(managerAuditReason("NO_DISPONIBLE", "es")).toBe(
      "La cámara no estaba conectada o no respondió.",
    );
  });

  it("never shows technical codes as changes and labels the area as security", () => {
    const event = securityEvent("SESSION_FOUND", "SESSION", "ENCONTRADA");
    expect(managerVisibleAuditChanges(event)).toEqual([]);
    expect(managerAuditArea(event.entityType, "es")).toBe("Seguridad");
    expect(managerSecurityMethod(event, "es")).toBe(
      "Sesión guardada en la estación",
    );
    expect(managerAuditAction(event, "es")).toBe(
      "Se encontró una sesión guardada en la estación",
    );
  });

  it("renders a biometric failure detail in plain language", () => {
    render(
      <LanguageProvider>
        <ManagementAuditDetail
          event={securityEvent(
            "BIOMETRIC_FACE_NOT_DETECTED",
            "BIOMETRIC",
            "TIEMPO_AGOTADO",
            "REJECTED",
          )}
          close={() => undefined}
        />
      </LanguageProvider>,
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("No se detectó un rostro a tiempo"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Reconocimiento facial"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "No se detectó un rostro dentro del tiempo límite.",
      ),
    ).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(
      /BIOMETRIC_|TIEMPO_AGOTADO|security_event|access_method/u,
    );
  });
});
