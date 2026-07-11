export const BUSINESS_TIME_ZONE = "Africa/Dar_es_Salaam";

const EAT_OFFSET_HOURS = 3;
const EAT_OFFSET_MS = EAT_OFFSET_HOURS * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function partsFromDateOnly(value: string): [number, number, number] {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw new Error("Expected date format YYYY-MM-DD");
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function utcDateFromEatParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - EAT_OFFSET_HOURS, minute, second, millisecond));
}

export function parseEatDateOnlyStart(value: string): Date {
  const [year, month, day] = partsFromDateOnly(value);
  return utcDateFromEatParts(year, month, day, 0, 0, 0, 0);
}

export function parseEatDateOnlyEnd(value: string): Date {
  const [year, month, day] = partsFromDateOnly(value);
  return utcDateFromEatParts(year, month, day, 23, 59, 59, 999);
}

export function parseEatDateTime(value: string): Date {
  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value);
  if (dateOnlyMatch) return parseEatDateOnlyEnd(value);

  const localDateTimeMatch = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (localDateTimeMatch) {
    const [, year, month, day, hour, minute, second = "0"] = localDateTimeMatch;
    return utcDateFromEatParts(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second), 0);
  }

  return new Date(value);
}

export function eatDateParts(value: Date): { year: number; month: number; day: number } {
  const eatTime = new Date(value.getTime() + EAT_OFFSET_MS);
  return {
    year: eatTime.getUTCFullYear(),
    month: eatTime.getUTCMonth() + 1,
    day: eatTime.getUTCDate(),
  };
}

function eatDateTimeParts(value: Date) {
  const eatTime = new Date(value.getTime() + EAT_OFFSET_MS);
  return {
    year: eatTime.getUTCFullYear(),
    month: eatTime.getUTCMonth() + 1,
    day: eatTime.getUTCDate(),
    hour: eatTime.getUTCHours(),
    minute: eatTime.getUTCMinutes(),
    second: eatTime.getUTCSeconds(),
    millisecond: eatTime.getUTCMilliseconds(),
  };
}

export function addEatCalendarDaysPreservingTime(value: Date, days: number): Date {
  const parts = eatDateTimeParts(value);
  const eatCalendarDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return utcDateFromEatParts(
    eatCalendarDate.getUTCFullYear(),
    eatCalendarDate.getUTCMonth() + 1,
    eatCalendarDate.getUTCDate(),
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );
}

export function addEatCalendarDaysAtEndOfDay(value: Date, days: number): Date {
  const parts = eatDateParts(value);
  const eatCalendarDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return utcDateFromEatParts(
    eatCalendarDate.getUTCFullYear(),
    eatCalendarDate.getUTCMonth() + 1,
    eatCalendarDate.getUTCDate(),
    23,
    59,
    59,
    999
  );
}
