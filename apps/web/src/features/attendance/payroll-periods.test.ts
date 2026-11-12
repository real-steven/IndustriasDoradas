import { describe, expect, it } from "vitest";

import { costaRicaToday, payrollPeriodRange } from "./payroll-periods";

describe("períodos rápidos de la pre-nómina", () => {
  describe("fecha de hoy en Costa Rica", () => {
    it("usa America/Costa_Rica y no la fecha UTC", () => {
      // 03:00 UTC del 1 de marzo = 21:00 del 28 de febrero en Costa Rica.
      expect(costaRicaToday(new Date("2026-03-01T03:00:00.000Z"))).toBe(
        "2026-02-28",
      );
      // 06:00 UTC = medianoche exacta en Costa Rica (UTC-6, sin horario de verano).
      expect(costaRicaToday(new Date("2026-03-01T06:00:00.000Z"))).toBe(
        "2026-03-01",
      );
      expect(costaRicaToday(new Date("2026-03-01T05:59:59.999Z"))).toBe(
        "2026-02-28",
      );
    });

    it("no cambia de año antes de tiempo el 31 de diciembre", () => {
      expect(costaRicaToday(new Date("2027-01-01T04:00:00.000Z"))).toBe(
        "2026-12-31",
      );
    });
  });

  describe("semanas de lunes a domingo", () => {
    it("calcula esta semana y la anterior a mitad de mes", () => {
      expect(payrollPeriodRange("currentWeek", "2026-10-20")).toEqual({
        fromDate: "2026-10-19",
        toDate: "2026-10-25",
      });
      expect(payrollPeriodRange("previousWeek", "2026-10-20")).toEqual({
        fromDate: "2026-10-12",
        toDate: "2026-10-18",
      });
    });

    it("cruza de un mes a otro", () => {
      // Sábado 28 de febrero de 2026.
      expect(payrollPeriodRange("currentWeek", "2026-02-28")).toEqual({
        fromDate: "2026-02-23",
        toDate: "2026-03-01",
      });
      // Miércoles 1 de abril de 2026: la semana empieza en marzo.
      expect(payrollPeriodRange("currentWeek", "2026-04-01")).toEqual({
        fromDate: "2026-03-30",
        toDate: "2026-04-05",
      });
      expect(payrollPeriodRange("previousWeek", "2026-04-01")).toEqual({
        fromDate: "2026-03-23",
        toDate: "2026-03-29",
      });
    });

    it("cruza de un año a otro", () => {
      // Viernes 1 de enero de 2027.
      expect(payrollPeriodRange("currentWeek", "2027-01-01")).toEqual({
        fromDate: "2026-12-28",
        toDate: "2027-01-03",
      });
      expect(payrollPeriodRange("previousWeek", "2027-01-01")).toEqual({
        fromDate: "2026-12-21",
        toDate: "2026-12-27",
      });
    });

    it("trata el domingo como último día y el lunes como primero", () => {
      expect(payrollPeriodRange("currentWeek", "2026-10-25")).toEqual({
        fromDate: "2026-10-19",
        toDate: "2026-10-25",
      });
      expect(payrollPeriodRange("currentWeek", "2026-10-26")).toEqual({
        fromDate: "2026-10-26",
        toDate: "2026-11-01",
      });
    });
  });

  describe("quincena calendario", () => {
    it("usa del 1 al 15 hasta el día 15 inclusive", () => {
      for (const day of ["2026-11-01", "2026-11-11", "2026-11-15"]) {
        expect(payrollPeriodRange("currentFortnight", day)).toEqual({
          fromDate: "2026-11-01",
          toDate: "2026-11-15",
        });
      }
    });

    it("usa del 16 al último día del mes desde el día 16", () => {
      expect(payrollPeriodRange("currentFortnight", "2026-11-16")).toEqual({
        fromDate: "2026-11-16",
        toDate: "2026-11-30",
      });
      expect(payrollPeriodRange("currentFortnight", "2026-12-31")).toEqual({
        fromDate: "2026-12-16",
        toDate: "2026-12-31",
      });
    });

    it("termina el 28 de febrero en año común y el 29 en bisiesto", () => {
      expect(payrollPeriodRange("currentFortnight", "2026-02-20")).toEqual({
        fromDate: "2026-02-16",
        toDate: "2026-02-28",
      });
      expect(payrollPeriodRange("currentFortnight", "2028-02-16")).toEqual({
        fromDate: "2028-02-16",
        toDate: "2028-02-29",
      });
      expect(payrollPeriodRange("currentFortnight", "2028-02-15")).toEqual({
        fromDate: "2028-02-01",
        toDate: "2028-02-15",
      });
    });
  });

  describe("mes actual", () => {
    it("va del día 1 al último día del mes", () => {
      expect(payrollPeriodRange("currentMonth", "2026-11-11")).toEqual({
        fromDate: "2026-11-01",
        toDate: "2026-11-30",
      });
      expect(payrollPeriodRange("currentMonth", "2026-10-01")).toEqual({
        fromDate: "2026-10-01",
        toDate: "2026-10-31",
      });
    });

    it("respeta febrero común, febrero bisiesto y la regla de siglos", () => {
      expect(payrollPeriodRange("currentMonth", "2026-02-28")).toEqual({
        fromDate: "2026-02-01",
        toDate: "2026-02-28",
      });
      expect(payrollPeriodRange("currentMonth", "2028-02-10")).toEqual({
        fromDate: "2028-02-01",
        toDate: "2028-02-29",
      });
      expect(payrollPeriodRange("currentMonth", "2100-02-10").toDate).toBe(
        "2100-02-28",
      );
      expect(payrollPeriodRange("currentMonth", "2000-02-10").toDate).toBe(
        "2000-02-29",
      );
    });
  });

  it("nunca produce un rango invertido ni fechas fuera del calendario", () => {
    const presets = [
      "currentWeek",
      "previousWeek",
      "currentFortnight",
      "currentMonth",
    ] as const;
    const start = Date.UTC(2026, 0, 1);
    for (let offset = 0; offset < 731; offset += 1) {
      const today = new Date(start + offset * 86_400_000)
        .toISOString()
        .slice(0, 10);
      for (const preset of presets) {
        const { fromDate, toDate } = payrollPeriodRange(preset, today);
        expect(fromDate <= toDate).toBe(true);
        for (const value of [fromDate, toDate]) {
          expect(new Date(`${value}T00:00:00.000Z`).toISOString()).toBe(
            `${value}T00:00:00.000Z`,
          );
        }
        if (preset !== "previousWeek") {
          expect(fromDate <= today && today <= toDate).toBe(true);
        }
      }
    }
  });

  it("rechaza una fecha mal formada en vez de inventar otra", () => {
    expect(() => payrollPeriodRange("currentMonth", "2026-2-1")).toThrow(
      RangeError,
    );
  });
});
