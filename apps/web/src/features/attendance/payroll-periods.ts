// Períodos rápidos del expediente del trabajador.
// Definición documentada en docs/product/gerencia-web-mvp.md
// («Períodos rápidos del expediente del trabajador»).
//
// Todas las fechas son días locales de Costa Rica en formato AAAA-MM-DD y
// ambos extremos son inclusivos. Los cálculos se hacen con aritmética de
// calendario en UTC puro (sin horas), así que la zona horaria del navegador
// nunca desplaza un día.

export const PAYROLL_TIME_ZONE = "America/Costa_Rica";

export type PayrollPeriodPreset =
  "currentWeek" | "previousWeek" | "currentFortnight" | "currentMonth";

export type PayrollPeriodSelection = PayrollPeriodPreset | "custom";

export interface PayrollDateRange {
  fromDate: string;
  toDate: string;
}

export const PAYROLL_PERIOD_PRESETS: readonly PayrollPeriodPreset[] = [
  "currentWeek",
  "previousWeek",
  "currentFortnight",
  "currentMonth",
];

/** Fecha de hoy (AAAA-MM-DD) en Costa Rica para el instante dado. */
export function costaRicaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PAYROLL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Rango de un acceso rápido a partir de la fecha local de hoy.
 * - Semanas: lunes a domingo.
 * - Quincena calendario: días 1–15 o 16–último día del mes.
 * - Mes: día 1 al último día del mes.
 */
export function payrollPeriodRange(
  preset: PayrollPeriodPreset,
  today: string,
): PayrollDateRange {
  const { year, month, day } = parseLocalDate(today);
  switch (preset) {
    case "currentWeek":
    case "previousWeek": {
      const date = new Date(Date.UTC(year, month - 1, day));
      const daysSinceMonday = (date.getUTCDay() + 6) % 7;
      const offset = preset === "previousWeek" ? 7 : 0;
      date.setUTCDate(date.getUTCDate() - daysSinceMonday - offset);
      const fromDate = formatUtcDate(date);
      date.setUTCDate(date.getUTCDate() + 6);
      return { fromDate, toDate: formatUtcDate(date) };
    }
    case "currentFortnight": {
      const lastDay = daysInMonth(year, month);
      return day <= 15
        ? {
            fromDate: localDate(year, month, 1),
            toDate: localDate(year, month, 15),
          }
        : {
            fromDate: localDate(year, month, 16),
            toDate: localDate(year, month, lastDay),
          };
    }
    case "currentMonth":
      return {
        fromDate: localDate(year, month, 1),
        toDate: localDate(year, month, daysInMonth(year, month)),
      };
  }
}

function parseLocalDate(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) throw new RangeError(`Invalid local date: ${value}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function daysInMonth(year: number, month: number): number {
  // Día 0 del mes siguiente = último día de este mes.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function localDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatUtcDate(date: Date): string {
  return localDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}
