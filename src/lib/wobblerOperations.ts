export type WobblerStatus = 'Completed' | 'With Downtime' | 'Needs Review' | 'No Operation';

export interface WobblerStatusInput {
  operationMinutes: number;
  downtimeMinutes: number;
  dumps: number;
  loaders: number;
  breakdown: string;
}

export interface WobblerMetricsInput {
  operationHours: number;
  downtimeHours: number;
  dumps: number;
  loaders: number;
  dieselLiters: number;
  breakdown: string;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isBreakdownRecorded(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== 'no trouble' && normalized !== 'no breakdown';
}

export function getWobblerStatus(input: WobblerStatusInput): WobblerStatus {
  if (input.operationMinutes === 0 && input.dumps === 0) return 'No Operation';
  if (
    (input.operationMinutes > 0 && input.dumps === 0)
    || (input.operationMinutes === 0 && input.dumps > 0)
    || (input.dumps > 0 && input.loaders === 0)
  ) return 'Needs Review';
  if (input.downtimeMinutes > 0 || isBreakdownRecorded(input.breakdown)) return 'With Downtime';
  return 'Completed';
}

export function calculateWobblerMetrics(input: WobblerMetricsInput) {
  const operationHours = Math.max(0, input.operationHours);
  const downtimeHours = Math.max(0, input.downtimeHours);
  const dumps = Math.max(0, Math.trunc(input.dumps));
  const loaders = Math.max(0, Math.trunc(input.loaders));
  const dieselLiters = Math.max(0, input.dieselLiters);
  const operationMinutes = Math.round(operationHours * 60);
  const downtimeMinutes = Math.round(downtimeHours * 60);

  return {
    operationMinutes,
    downtimeMinutes,
    operationHours: round2(operationMinutes / 60),
    downtimeHours: round2(downtimeMinutes / 60),
    trackedHours: round2((operationMinutes + downtimeMinutes) / 60),
    dumps,
    loaders,
    dieselLiters: round2(dieselLiters),
    dumpsPerHour: operationMinutes > 0 ? round2(dumps / (operationMinutes / 60)) : 0,
    dieselLitersPerHour: operationMinutes > 0 ? round2(dieselLiters / (operationMinutes / 60)) : 0,
    status: getWobblerStatus({
      operationMinutes,
      downtimeMinutes,
      dumps,
      loaders,
      breakdown: input.breakdown,
    }),
  };
}
