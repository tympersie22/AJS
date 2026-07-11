import { prisma } from "../data/prisma";

const DAY_MS = 86_400_000;
const NEAR_STORAGE_LIMIT_DAYS = 170;
const BONDED_STORAGE_DAYS = 180;

function elapsedDays(from: Date, to = new Date()) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function storageFlag(days: number) {
  if (days >= BONDED_STORAGE_DAYS) return "OVER_LIMIT";
  if (days > NEAR_STORAGE_LIMIT_DAYS) return "NEAR_LIMIT";
  return "OK";
}

function monthKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
  }).format(value);
}

export async function buildComplianceSummary(now = new Date()) {
  const movements = await prisma.movement.findMany({
    where: { type: "carry_in", exit_date: null },
    orderBy: [{ entry_date: "asc" }, { id: "asc" }],
  });
  const byFlag = {
    OK: { count: 0, bond_value_tzs: 0 },
    NEAR_LIMIT: { count: 0, bond_value_tzs: 0 },
    OVER_LIMIT: { count: 0, bond_value_tzs: 0 },
  };
  const tableRows = movements.map((movement) => {
    const days = elapsedDays(movement.entry_date, now);
    const flag = storageFlag(days);
    const bondValue = Number(movement.bond_value_tzs ?? 0);
    byFlag[flag].count += 1;
    byFlag[flag].bond_value_tzs += bondValue;
    return {
      id: movement.id,
      reference_number: movement.reference_number,
      chassis_number: movement.chassis_number,
      vehicle_description: movement.vehicle_description,
      item_category: movement.item_category,
      bond_value_tzs: bondValue,
      entry_date: movement.entry_date,
      days_in_storage: days,
      storage_flag: flag,
      status: movement.status,
    };
  });

  const trendByMonth = new Map<string, number>();
  for (const movement of movements) {
    const crossingDate = new Date(movement.entry_date.getTime() + BONDED_STORAGE_DAYS * DAY_MS);
    const key = monthKey(crossingDate);
    trendByMonth.set(key, (trendByMonth.get(key) ?? 0) + 1);
  }

  return {
    total_bond_value_tzs: tableRows.reduce((sum, row) => sum + row.bond_value_tzs, 0),
    by_flag: byFlag,
    risk_items: tableRows
      .filter((row) => row.storage_flag !== "OK")
      .sort((left, right) => right.days_in_storage - left.days_in_storage || right.bond_value_tzs - left.bond_value_tzs),
    crossing_trend: [...trendByMonth.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, count]) => ({ month, count })),
  };
}
