import { Injectable } from "@nestjs/common";
import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(pbkdf2);
const ITERATIONS = 600_000;
const KEY_LENGTH = 32;

@Injectable()
export class PinVerifierService {
  async create(pin: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await derive(pin, salt, ITERATIONS, KEY_LENGTH, "sha256");
    return `pbkdf2-sha256$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
  }

  async verify(pin: string, verifier: string): Promise<boolean> {
    const [algorithm, iterationsText, saltText, hashText] = verifier.split("$");
    if (
      algorithm !== "pbkdf2-sha256" ||
      !iterationsText ||
      !saltText ||
      !hashText
    )
      return false;
    const iterations = Number(iterationsText);
    if (iterations !== ITERATIONS) return false;
    const salt = Buffer.from(saltText, "base64");
    const expected = Buffer.from(hashText, "base64");
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const actual = await derive(pin, salt, iterations, KEY_LENGTH, "sha256");
    return timingSafeEqual(actual, expected);
  }
}
