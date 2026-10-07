import { format, parseISO } from "date-fns";

export function niceDate(date, pattern = "EEE MMM d") {
  if (!date) return "";
  return format(parseISO(date), pattern);
}

export function niceTime(time) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return time;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

export function niceDateTime(iso) {
  if (!iso) return "";
  return format(new Date(iso), "EEE MMM d, h:mm a");
}
