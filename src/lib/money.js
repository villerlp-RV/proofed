export function formatCents(cents) {
  const n = (Number(cents) || 0) / 100;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// "85", "$85.50", "85.5" → cents. Returns null for anything that isn't a price.
export function parseDollars(text) {
  const clean = String(text ?? "").replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function centsToInput(cents) {
  if (cents === null || cents === undefined || cents === "") return "";
  const n = Number(cents) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
