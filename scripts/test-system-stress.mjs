import { spawnSync } from "node:child_process";

const startedAt = performance.now();

run("50 sesiones locales y reconexión", "dotnet", [
  "test",
  "apps/desktop/IndustriasDoradas.Desktop.slnx",
  "--no-restore",
  "--configuration",
  "Release",
  "--",
  "--filter",
  "TestCategory=SystemStress",
]);
run("50 clientes contra la ingestión central", process.execPath, [
  "scripts/stress-central-sync.mjs",
]);
run("cola offline y caos de sincronización", process.execPath, [
  "scripts/test-sync-chaos.mjs",
]);
run("volumen histórico de gerencia", process.execPath, [
  "scripts/benchmark-management.mjs",
]);

console.log(
  `Batería de estrés local completada en ${round((performance.now() - startedAt) / 1000)} s.`,
);

function run(label, command, arguments_) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
