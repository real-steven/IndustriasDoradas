import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ignoredPathParts = [
  "/node_modules/",
  "/dist/",
  "/coverage/",
  "/bin/",
  "/obj/",
];
const ignoredFiles = new Set(["scripts/check-secrets.mjs"]);
const patterns = [
  {
    name: "private key",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  },
  {
    name: "Supabase secret key",
    expression: /\bsb_secret_[A-Za-z0-9_-]{16,}/u,
  },
  {
    name: "service role assignment",
    expression:
      /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!YOUR_|<|$)["']?[^\s"']{16,}/u,
  },
];

const output = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
);
const files = output
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => !ignoredFiles.has(file))
  .filter(
    (file) => !ignoredPathParts.some((part) => `/${file}`.includes(part)),
  );

const findings = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const pattern of patterns) {
    if (pattern.expression.test(content)) {
      findings.push(`${file}: posible ${pattern.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error(
    "La revision de secretos encontro valores que deben investigarse:",
  );
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log("Revision de secretos: sin patrones sensibles detectados.");
}
