import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const E = () => base44.entities;

// RLS limits every read to the signed-in baker's own rows.
export function useBakery({ enabled = true } = {}) {
  return useQuery({
    queryKey: ["bakery"],
    enabled,
    queryFn: async () => (await E().Bakery.filter({}, "created_date", 1))?.[0] || null,
  });
}

function useRows(key, entity, bakeryId, sort = "-created_date") {
  return useQuery({
    queryKey: [key, bakeryId],
    enabled: !!bakeryId,
    queryFn: async () => (await E()[entity].filter({ bakery_id: bakeryId }, sort)) || [],
  });
}

export const useOrders = (id) => useRows("orders", "Order", id);
export const usePayments = (id) => useRows("payments", "Payment", id);
export const useBlocked = (id) => useRows("blocked", "BlockedDate", id, "date");
export const useMenu = (id) => useRows("menu", "MenuItem", id, "sort");
export const useOptions = (id) => useRows("options", "MenuOption", id, "name");

export function useRefresh() {
  const qc = useQueryClient();
  return (...keys) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

// The public function. Throws an Error whose message is safe to show.
export async function callShop(action, payload = {}) {
  try {
    const res = await base44.functions.invoke("publicShop", { action, ...payload });
    if (res?.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    const msg = e?.response?.data?.error || e?.data?.error || e?.message;
    throw new Error(msg && !/status code/i.test(msg) ? msg : "We couldn’t reach the shop. Check your connection and try again.");
  }
}

export function paidByOrder(payments = []) {
  const out = {};
  for (const p of payments) out[p.order_id] = (out[p.order_id] || 0) + (Number(p.cents) || 0);
  return out;
}

export function statusLink(token) {
  return `${window.location.origin}/o/${token}`;
}

export function shopLink(slug) {
  return `${window.location.origin}/b/${slug}`;
}
