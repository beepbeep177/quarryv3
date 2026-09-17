export interface StoneCrusherOutputRates {
  g1: number;
  threeFourth: number;
  sThreeFourth: number;
  s1c: number;
}

function nonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateStoneCrusherVolumes(
  operationMinutes: number,
  outputRates: StoneCrusherOutputRates,
) {
  const safeOperationMinutes = Math.max(0, Math.round(operationMinutes));
  const operationHours = safeOperationMinutes / 60;
  const rates = {
    g1: nonNegative(outputRates.g1),
    threeFourth: nonNegative(outputRates.threeFourth),
    sThreeFourth: nonNegative(outputRates.sThreeFourth),
    s1c: nonNegative(outputRates.s1c),
  };
  const volumes = {
    g1: round2(rates.g1 * operationHours),
    threeFourth: round2(rates.threeFourth * operationHours),
    sThreeFourth: round2(rates.sThreeFourth * operationHours),
    s1c: round2(rates.s1c * operationHours),
  };
  const totalVolume = round2(volumes.g1 + volumes.threeFourth + volumes.sThreeFourth + volumes.s1c);

  return {
    operationMinutes: safeOperationMinutes,
    operationHours: round2(operationHours),
    rates,
    volumes,
    totalVolume,
    plantCapacityCbmPerHour: operationHours > 0 ? round2(totalVolume / operationHours) : 0,
  };
}

export function deriveStoneCrusherRate(
  storedRate: number | null,
  volumeCbm: number,
  operationMinutes: number,
) {
  if (storedRate !== null) return nonNegative(storedRate);
  if (operationMinutes <= 0) return 0;
  return round2(nonNegative(volumeCbm) / (operationMinutes / 60));
}
