export const KST_TIME_ZONE = "Asia/Seoul";
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const formatKstDate = (date = new Date()) => {
  return kstDateFormatter.format(date);
};

export const normalizeToKstDateString = (value: string | Date) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return formatKstDate(value);
  }

  const trimmed = value.trim();
  if (ISO_DATE_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatKstDate(parsed);
};

export const createKstQueryDate = (date: string) => {
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  const [year, month, day] = date.split("-").map(Number);

  // Use UTC noon so local/UTC runtimes keep the same calendar date when
  // libraries derive year/month/day with local getters.
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
};

export const getKstDateWithOffset = (offsetDays = 0, baseDate = new Date()) => {
  const base = createKstQueryDate(formatKstDate(baseDate));
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return formatKstDate(base);
};
