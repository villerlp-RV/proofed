export const STATUS = {
  requested: { label: "New", tone: "new" },
  quoted: { label: "Deposit due", tone: "new" },
  booked: { label: "Booked", tone: "ok" },
  ready: { label: "Ready", tone: "ok" },
  picked_up: { label: "Picked up", tone: "mute" },
  declined: { label: "Declined", tone: "mute" },
  expired: { label: "Quote expired", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "mute" },
};

export const PAYMENT_METHODS = [
  ["venmo", "Venmo"],
  ["cashapp", "Cash App"],
  ["zelle", "Zelle"],
  ["paypal", "PayPal"],
  ["cash", "Cash"],
  ["card", "Card"],
  ["other", "Other"],
];

export function methodLabel(m) {
  return PAYMENT_METHODS.find(([k]) => k === m)?.[1] || m;
}

export function itemSummary(items = []) {
  return items
    .map((i) => [i.qty > 1 ? `${i.qty} ×` : "", i.size_label, i.name].filter(Boolean).join(" "))
    .join(", ");
}

export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
