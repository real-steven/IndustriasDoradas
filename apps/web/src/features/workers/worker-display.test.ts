import { describe, expect, it } from "vitest";

import {
  compareWorkersForDirectory,
  workerDisplayName,
} from "./worker-display";

describe("presentación de trabajadores", () => {
  it("muestra el nombre guardado sin agregar prefijos de rol", () => {
    expect(workerDisplayName("Daniela Demo")).toBe("Daniela Demo");
    expect(workerDisplayName("Mario Planta")).not.toMatch(/^(JF|OP)\b/u);
  });

  it("pone primero a los jefes de planta y ordena alfabéticamente en español", () => {
    const workers = [
      { name: "Óscar Zamora", category: "OPERARIO" },
      { name: "Zoila Mena", category: "JEFE_PLANTA" },
      { name: "ana Brenes", category: "OPERARIO" },
      { name: "Ñandú Rojas", category: "OPERARIO" },
      { name: "Álvaro Solís", category: "JEFE_PLANTA" },
      { name: "Nora Vega", category: "OPERARIO" },
    ];

    expect(
      [...workers]
        .sort(compareWorkersForDirectory)
        .map((worker) => worker.name),
    ).toEqual([
      "Álvaro Solís",
      "Zoila Mena",
      "ana Brenes",
      "Nora Vega",
      "Ñandú Rojas",
      "Óscar Zamora",
    ]);
  });

  it("no modifica la lista original", () => {
    const workers = [
      { name: "B", category: "OPERARIO" },
      { name: "A", category: "JEFE_PLANTA" },
    ];
    [...workers].sort(compareWorkersForDirectory);
    expect(workers.map((worker) => worker.name)).toEqual(["B", "A"]);
  });
});
