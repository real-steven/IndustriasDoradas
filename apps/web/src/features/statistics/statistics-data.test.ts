import { describe, expect, it } from "vitest";

import {
  previousStatisticsDateRange,
  statisticsDateRange,
  type StatisticsFilters,
} from "./statistics-data";

const now = new Date("2026-11-10T18:00:00.000Z");

describe("rangos de estadísticas", () => {
  it("compares the current partial month with the immediately preceding days", () => {
    const filters = makeFilters("current-month");

    expect(statisticsDateRange(filters, now)).toMatchObject({
      fromDate: "2026-11-01",
      toDate: "2026-11-10",
    });
    expect(previousStatisticsDateRange(filters, now)).toEqual({
      fromDate: "2026-10-22",
      toDate: "2026-10-31",
    });
  });

  it("uses the exact same duration for the previous full-month comparison", () => {
    const filters = makeFilters("previous-month");

    expect(statisticsDateRange(filters, now)).toMatchObject({
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
    });
    expect(previousStatisticsDateRange(filters, now)).toEqual({
      fromDate: "2026-08-31",
      toDate: "2026-09-30",
    });
  });

  it("shows the immediately preceding custom range", () => {
    const filters = {
      ...makeFilters("custom"),
      fromDate: "2026-11-05",
      toDate: "2026-11-10",
    };

    expect(previousStatisticsDateRange(filters, now)).toEqual({
      fromDate: "2026-10-30",
      toDate: "2026-11-04",
    });
  });
});

function makeFilters(period: StatisticsFilters["period"]): StatisticsFilters {
  return {
    period,
    fromDate: "2026-11-10",
    toDate: "2026-11-10",
    comparePrevious: true,
  };
}
