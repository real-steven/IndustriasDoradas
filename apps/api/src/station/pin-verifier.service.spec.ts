import { PinVerifierService } from "./pin-verifier.service";

describe("PinVerifierService", () => {
  const service = new PinVerifierService();

  it("creates a versioned verifier and compares in constant-time compatible form", async () => {
    const verifier = await service.create("123456");

    expect(verifier).toMatch(/^pbkdf2-sha256\$600000\$/u);
    await expect(service.verify("123456", verifier)).resolves.toBe(true);
    await expect(service.verify("654321", verifier)).resolves.toBe(false);
  });

  it("rejects malformed and obsolete verifiers", async () => {
    await expect(service.verify("123456", "fixture-not-a-pin")).resolves.toBe(
      false,
    );
    await expect(
      service.verify(
        "123456",
        "pbkdf2-sha256$999999999$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      ),
    ).resolves.toBe(false);
  });
});
