import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, "..");
const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
const testsDirectory = join(repositoryRoot, "supabase", "tests");
const seedPath = join(repositoryRoot, "supabase", "seed.sql");

async function readSqlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    files.map(async (name) => ({
      name,
      sql: await readFile(join(directory, name), "utf8"),
    })),
  );
}

const database = await PGlite.create();

try {
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text
    );
  `);

  const migrations = await readSqlFiles(migrationsDirectory);
  if (migrations.length === 0) {
    throw new Error("No se encontraron migraciones SQL.");
  }

  for (const migration of migrations) {
    await database.exec(migration.sql);
    console.log(`Migracion aplicada: ${migration.name}`);
  }

  const seed = await readFile(seedPath, "utf8");
  await database.exec(seed);
  await database.exec(seed);
  console.log("Seed aplicado dos veces sin error.");

  const tests = await readSqlFiles(testsDirectory);
  if (tests.length === 0) {
    throw new Error("No se encontraron pruebas SQL.");
  }

  for (const test of tests) {
    await database.exec(test.sql);
    console.log(`Prueba SQL aprobada: ${test.name}`);
  }

  console.log("Pruebas de base de datos: correctas.");
} finally {
  await database.close();
}
