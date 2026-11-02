export const lineAccents = ["purple", "cyan", "pink", "orange"] as const;

const lineColors = ["#8b5cf6", "#2aaed8", "#ec6fa9", "#f5a524"] as const;

export function lineAccent(displayOrder: number) {
  return (
    lineAccents[Math.abs(displayOrder - 1) % lineAccents.length] ??
    lineAccents[0]
  );
}

export function lineChartColor(displayOrder: number): string {
  return (
    lineColors[Math.abs(displayOrder - 1) % lineColors.length] ?? lineColors[0]
  );
}
