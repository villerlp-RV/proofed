import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { callShop } from "@/lib/data";
import { niceDate, niceDateTime, niceTime } from "@/lib/dates";
import { methodLabel } from "@/lib/labels";
import { formatCents } from "@/lib/money";
import { ErrorNote, Spinner } from "@/components/ui";

const STEPS = [
  ["requested", "Request sent"],
  ["quoted", "Quote"],
  ["booked", "Booked"],
  ["ready", "Ready for pickup"],
];
const ORDER = ["requested", "quoted", "booked", "ready", "picked_up"];

function Steps({ status, children }) {
  const at = ORDER.indexOf(status);
  return (
    <ol className="flex flex-col gap-3">
      {STEPS.map(([key, label], i) => {
        const done = at > i || status === "picked_up";
        const now = at === i;
        return (
          <li key={key} className="flex gap-3 items-start">
            <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-none ${done ? "bg-ok border-ok" : now ? "border-accent bg-accent-soft" : "border-line"}`} />
            <div className="flex flex-col gap-1 min-w-0">
              <span className={now ? "font-bold" : done ? "" : "text-muted"}>{label}</span>
              {now && children}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderStatus() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    callShop("order", { token }).then(setOrder, (e) => setError(e.message));
  }, [token]);

  if (error && !order) {
    return (
      <div className="min-h-full grid place-items-center px-4 py-16 text-center">
        <div className="max-w-sm flex flex-col gap-2"><h1 className="text-2xl font-extrabold">Order not found</h1><p className="text-muted">{error}</p></div>
      </div>
    );
  }
  if (!order) return <Spinner />;

  const s = order.status;
  const owed = order.total_cents != null ? Math.max(order.total_cents - order.paid_cents, 0) : null;
  const closed = ["declined", "expired", "cancelled"].includes(s);

  async function markSent() {
    setBusy(true);
    setError("");
    try {
      setOrder(await callShop("markSent", { token }));
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="min-h-full px-4 py-8">
      <div className="mx-auto max-w-lg flex flex-col gap-4">
        {params.get("sent") && s === "requested" && (
          <div className="card bg-ok-soft border-ok/30 text-ok">
            <b>Request sent.</b> {order.bakery_name} will reply with a quote. Bookmark this page to check on your order.
            {params.get("photos") === "failed" && <span className="block text-sm mt-1">Some photos didn’t upload. You can send them to the baker directly.</span>}
          </div>
        )}
        <header className="flex flex-col gap-1">
          <span className="lbl text-accent">{order.bakery_name}</span>
          <h1 className="text-3xl font-extrabold">Your order</h1>
          <p className="text-muted">
            Pickup {niceDate(order.pickup_date, "EEEE, MMM d")}{order.pickup_time ? ` around ${niceTime(order.pickup_time)}` : ""}
          </p>
        </header>

        <section className="card flex flex-col gap-1">
          {order.items.map((it, i) => (
            <div key={i}>
              <b>{it.qty > 1 ? `${it.qty} × ` : ""}{it.size_label} {it.name}</b>
              {it.options?.length > 0 && <span className="block text-sm text-muted">{it.options.join(" / ")}</span>}
              {it.design_notes && <span className="block text-sm text-muted">“{it.design_notes}”</span>}
            </div>
          ))}
        </section>

        {closed ? (
          <section className="card flex flex-col gap-1">
            <b>{s === "declined" ? "The baker can’t take this order." : s === "expired" ? "This quote expired." : "This order was cancelled."}</b>
            <p className="text-sm text-muted">{s === "expired" ? "The deposit didn’t arrive in time, so the date was released. Contact the baker if you still want it." : "Contact the baker with any questions."}</p>
          </section>
        ) : (
          <section className="card">
            <Steps status={s}>
              {s === "requested" && <p className="text-sm text-muted">The baker is looking at your request.</p>}
              {s === "quoted" && (
                <div className="flex flex-col gap-2">
                  {order.quote_message && <p className="text-sm">“{order.quote_message}”</p>}
                  <div className="flex flex-col gap-1 text-[15px] tabular">
                    {order.quote_lines.map((l, i) => <div key={i} className="flex justify-between gap-3"><span>{l.label}</span><span>{formatCents(l.cents)}</span></div>)}
                    <div className="flex justify-between font-bold border-t border-line pt-1"><span>Total</span><span>{formatCents(order.total_cents)}</span></div>
                  </div>
                  <p className="text-sm">
                    Pay the <b>{formatCents(order.deposit_cents)}</b> deposit
                    {order.quote_expires_at ? <> by <b>{niceDateTime(order.quote_expires_at)}</b></> : null} to hold your date.
                  </p>
                </div>
              )}
              {s === "booked" && <p className="text-sm text-muted">Your date is held. {owed > 0 ? `${formatCents(owed)} is due at pickup.` : "You’re all paid up."}</p>}
              {s === "ready" && <p className="text-sm text-muted">Come pick it up! {owed > 0 ? `${formatCents(owed)} is due at pickup.` : ""}</p>}
            </Steps>
            {s === "picked_up" && <p className="mt-3 font-semibold">Picked up. Enjoy!</p>}
          </section>
        )}

        {s === "quoted" && (
          <section className="card flex flex-col gap-2">
            <span className="lbl">Pay with</span>
            {order.payment_handles.length === 0 && <p className="text-sm text-muted">The baker will tell you how to pay.</p>}
            {order.payment_handles.map((h, i) => (
              <div key={i} className="flex justify-between gap-3 text-[15px]"><span>{methodLabel(h.method)}</span><span className="font-semibold select-all break-all text-right">{h.handle}</span></div>
            ))}
            <p className="text-sm text-muted">Put your name and pickup date in the payment note.</p>
            <ErrorNote>{error}</ErrorNote>
            {order.customer_says_paid ? (
              <p className="text-sm font-semibold text-ok">Thanks! The baker will confirm once they see it.</p>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={markSent}>I’ve sent the deposit</button>
            )}
          </section>
        )}

        {order.pickup_address && (
          <section className="card flex flex-col gap-1">
            <span className="lbl">Pickup address</span>
            <p className="whitespace-pre-line select-all">{order.pickup_address}</p>
          </section>
        )}

        {order.policies && (
          <section className="flex flex-col gap-1">
            <span className="lbl">Good to know</span>
            <p className="text-sm text-muted whitespace-pre-line">{order.policies}</p>
          </section>
        )}
      </div>
    </div>
  );
}
