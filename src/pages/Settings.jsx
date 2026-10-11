import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { shopLink, useBakery, useBlocked, useRefresh } from "@/lib/data";
import { niceDate } from "@/lib/dates";
import { PAYMENT_METHODS } from "@/lib/labels";
import { todayIn } from "@/lib/rules";
import { ErrorNote, Field, Screen } from "@/components/ui";

const HANDLE_METHODS = PAYMENT_METHODS.filter(([k]) => !["cash", "card"].includes(k));
const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];

const num = (v, min = 0) => Math.max(min, Math.round(Number(v) || 0));

export default function Settings() {
  const { data: bakery } = useBakery();
  const blocked = useBlocked(bakery?.id);
  const refresh = useRefresh();
  const { logout, user } = useAuth();
  const [form, setForm] = useState(() => ({
    name: bakery.name,
    accepting_orders: bakery.accepting_orders !== false,
    weekly_capacity: String(bakery.weekly_capacity ?? 4),
    daily_capacity: String(bakery.daily_capacity ?? 2),
    lead_days: String(bakery.lead_days ?? 7),
    deposit_percent: String(bakery.deposit_percent ?? 50),
    quote_hold_hours: String(bakery.quote_hold_hours ?? 48),
    pickup_address: bakery.pickup_address || "",
    policies: bakery.policies || "",
    timezone: bakery.timezone || "America/Chicago",
    email_new_requests: bakery.email_new_requests !== false,
    notify_email: bakery.notify_email || "",
    payment_handles: bakery.payment_handles?.length ? bakery.payment_handles : [{ method: "venmo", handle: "" }],
  }));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [range, setRange] = useState({ date: "", end_date: "", reason: "" });
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setStatus(""); };
  const link = shopLink(bakery.slug);
  const today = todayIn(bakery.timezone);

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Your shop needs a name.");
    const weekly = num(form.weekly_capacity, 1);
    const daily = num(form.daily_capacity, 1);
    try {
      await base44.entities.Bakery.update(bakery.id, {
        name: form.name.trim(),
        accepting_orders: form.accepting_orders,
        weekly_capacity: weekly,
        daily_capacity: Math.min(daily, weekly),
        lead_days: num(form.lead_days),
        deposit_percent: Math.min(num(form.deposit_percent), 100),
        quote_hold_hours: num(form.quote_hold_hours, 1),
        pickup_address: form.pickup_address.trim(),
        policies: form.policies.trim(),
        timezone: form.timezone,
        email_new_requests: form.email_new_requests,
        notify_email: form.notify_email.trim(),
        payment_handles: form.payment_handles.filter((h) => h.handle.trim()).map((h) => ({ method: h.method, handle: h.handle.trim() })),
      });
      await refresh("bakery");
      setStatus("Saved");
    } catch (err) {
      setError(err?.message || "Couldn’t save your settings.");
    }
  }

  async function addRange() {
    if (!range.date) return;
    await base44.entities.BlockedDate.create({
      bakery_id: bakery.id,
      date: range.date,
      end_date: range.end_date && range.end_date > range.date ? range.end_date : undefined,
      reason: range.reason.trim() || "Day off",
    });
    setRange({ date: "", end_date: "", reason: "" });
    await refresh("blocked");
  }

  async function removeBlock(id) {
    await base44.entities.BlockedDate.delete(id);
    await refresh("blocked");
  }

  const upcomingBlocks = (blocked.data || []).filter((b) => (b.end_date || b.date) >= today);

  return (
    <Screen title="Shop settings" back="/" tabs={false}>
      <section className="card flex flex-col gap-2">
        <span className="lbl">Your order link</span>
        <p className="font-semibold break-all select-all">{link}</p>
        <p className="text-sm text-muted">Put this in your Instagram bio. Customers order here.</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn flex-1"
            onClick={async () => {
              try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a className="btn-ghost flex-1" href={link} target="_blank" rel="noreferrer">Preview</a>
        </div>
      </section>

      <Link to="/settings/menu" className="card flex justify-between items-center">
        <span><b>Menu & prices</b><br /><span className="text-sm text-muted">Sizes, starting prices, flavors and fillings</span></span>
        <span className="text-accent font-bold">›</span>
      </Link>

      <form onSubmit={save} className="card flex flex-col gap-4">
        <Field label="Shop name"><input id="s-name" className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <label className="flex justify-between items-center gap-3">
          <span><b>Taking orders</b><br /><span className="text-sm text-muted">Off shows customers a “closed for now” message</span></span>
          <input id="s-accepting" type="checkbox" className="w-6 h-6 accent-[rgb(var(--accent))]" checked={form.accepting_orders} onChange={(e) => set({ accepting_orders: e.target.checked })} />
        </label>
        <label className="flex justify-between items-center gap-3">
          <span><b>Email me new requests</b><br /><span className="text-sm text-muted">One email each time a customer sends the form</span></span>
          <input id="s-email-requests" type="checkbox" className="w-6 h-6 accent-[rgb(var(--accent))]" checked={form.email_new_requests} onChange={(e) => set({ email_new_requests: e.target.checked })} />
        </label>
        {form.email_new_requests && (
          <Field label="Send them to" hint="Leave empty to use the email you sign in with. Another address only works if it also has a Proofed account.">
            <input id="s-notify-email" type="email" className="input" placeholder={user?.email || "you@example.com"} value={form.notify_email} onChange={(e) => set({ notify_email: e.target.value })} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Spots per week" hint="Mon–Sun"><input id="s-weekly" className="input" inputMode="numeric" value={form.weekly_capacity} onChange={(e) => set({ weekly_capacity: e.target.value })} /></Field>
          <Field label="Spots per day"><input id="s-daily" className="input" inputMode="numeric" value={form.daily_capacity} onChange={(e) => set({ daily_capacity: e.target.value })} /></Field>
          <Field label="Days of notice"><input id="s-lead" className="input" inputMode="numeric" value={form.lead_days} onChange={(e) => set({ lead_days: e.target.value })} /></Field>
          <Field label="Deposit %"><input id="s-deposit" className="input" inputMode="numeric" value={form.deposit_percent} onChange={(e) => set({ deposit_percent: e.target.value })} /></Field>
          <Field label="Hold quotes for" hint="Hours before an unpaid quote expires"><input id="s-hold" className="input" inputMode="numeric" value={form.quote_hold_hours} onChange={(e) => set({ quote_hold_hours: e.target.value })} /></Field>
          <Field label="Time zone">
            <select id="s-tz" className="input" value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {[...new Set([form.timezone, ...ZONES])].map((z) => <option key={z} value={z}>{z.split("/")[1].replace("_", " ")}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <span className="lbl">How customers pay you</span>
          {form.payment_handles.map((h, i) => (
            <div key={i} className="flex gap-2">
              <select
                id={`s-method-${i}`}
                className="input w-32"
                value={h.method}
                aria-label="Payment app"
                onChange={(e) => set({ payment_handles: form.payment_handles.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)) })}
              >
                {HANDLE_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input
                id={`s-handle-${i}`}
                className="input flex-1 min-w-0"
                value={h.handle}
                placeholder="@yourname or email"
                aria-label="Handle"
                onChange={(e) => set({ payment_handles: form.payment_handles.map((x, j) => (j === i ? { ...x, handle: e.target.value } : x)) })}
              />
            </div>
          ))}
          <button type="button" className="btn-quiet self-start -ml-3" onClick={() => set({ payment_handles: [...form.payment_handles, { method: "zelle", handle: "" }] })}>+ Add another</button>
        </div>

        <Field label="Pickup address" hint="Customers see this only after their order is booked.">
          <textarea id="s-address" className="input min-h-[60px]" value={form.pickup_address} onChange={(e) => set({ pickup_address: e.target.value })} />
        </Field>
        <Field label="Policies" hint="Allergens, cancellations, how long cakes keep. Shown on the order form.">
          <textarea id="s-policies" className="input min-h-[90px]" value={form.policies} onChange={(e) => set({ policies: e.target.value })} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button className="btn">{status || "Save settings"}</button>
      </form>

      <section className="card flex flex-col gap-3">
        <span className="lbl">Days off & vacations</span>
        {upcomingBlocks.length === 0 && <p className="text-sm text-muted">None coming up. You can also block single days from the calendar.</p>}
        {upcomingBlocks.map((b) => (
          <div key={b.id} className="flex justify-between items-center text-[15px]">
            <span>{niceDate(b.date, "MMM d")}{b.end_date && b.end_date !== b.date ? `–${niceDate(b.end_date, "MMM d")}` : ""} <span className="text-muted">· {b.reason}</span></span>
            <button type="button" className="btn-quiet -mr-3" onClick={() => removeBlock(b.id)}>Remove</button>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <Field label="From"><input id="b-from" type="date" className="input" value={range.date} onChange={(e) => setRange({ ...range, date: e.target.value })} /></Field>
          <Field label="To"><input id="b-to" type="date" className="input" value={range.end_date} onChange={(e) => setRange({ ...range, end_date: e.target.value })} /></Field>
        </div>
        <input id="b-reason" className="input" placeholder="Reason (only you see it)" value={range.reason} onChange={(e) => setRange({ ...range, reason: e.target.value })} />
        <button type="button" className="btn-ghost" disabled={!range.date} onClick={addRange}>Block these days</button>
      </section>

      {user?.role === "admin" && (
        <Link to="/admin" className="card flex justify-between items-center">
          <span><b>Admin</b><br /><span className="text-sm text-muted">Every shop and order on Proofed</span></span>
          <span className="text-accent font-bold">›</span>
        </Link>
      )}

      <button type="button" className="btn-quiet" onClick={() => logout()}>Sign out</button>
    </Screen>
  );
}
