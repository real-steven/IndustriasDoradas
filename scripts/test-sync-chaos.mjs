import { spawnSync } from "node:child_process";

const configuredRuns = Number.parseInt(process.env.SYNC_CHAOS_RUNS ?? "3", 10);
if (
  !Number.isInteger(configuredRuns) ||
  configuredRuns < 1 ||
  configuredRuns > 10
) {
  throw new Error("SYNC_CHAOS_RUNS must be an integer between 1 and 10");
}

const solution = "apps/desktop/IndustriasDoradas.Desktop.slnx";
const startedAt = performance.now();
for (let run = 1; run <= configuredRuns; run += 1) {
  console.log(`Sync chaos run ${run}/${configuredRuns}`);
  const result = spawnSync(
    "dotnet",
    [
      "test",
      solution,
      "--no-restore",
      "--configuration",
      "Release",
      "--",
      "--filter",
      "TestCategory=SyncChaos",
      "--show-stdout",
      "All",
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(
  `Sync chaos suite passed ${configuredRuns} consecutive run(s) in ${(
    (performance.now() - startedAt) /
    1000
  ).toFixed(2)} s.`,
);
