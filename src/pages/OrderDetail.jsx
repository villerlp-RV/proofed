import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useBakery, useOrders, usePayments, useRefresh, statusLink } from "@/lib/data";
import { checkDate, depositFor, effectiveStatus, sumCents, todayIn } from "@/lib/rules";
import { niceDate, niceDateTime, niceTime } from "@/lib/dates";
import { PAYMENT_METHODS, methodLabel } from "@/lib/labels";
import { centsToInput, formatCents, parseDollars } from "@/lib/money";
import { Empty, ErrorNote, Field, Screen, Spinner, StatusChip } from "@/components/ui";

function Section({ title, children, action }) {
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <span className="lbl">{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

function smsHref(phone, text) {
  return `sms:${(phone || "").replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ShareLink({ order, bakery, status }) {
  const [copied, setCopied] = useState(false);
  const link = statusLink(order.public_token);
  const first = order.customer?.name?.split(" ")[0] || "there";
  const text =
    status === "quoted"
      ? `Hi ${first}! Your quote from ${bakery.name} is ready: ${formatCents(order.total_cents)}. Pay the ${formatCents(order.deposit_cents)} deposit to hold your date: ${link}`
      : status === "ready"
        ? `Hi ${first}! Your order from ${bakery.name} is ready for pickup. Details: ${link}`
        : `Hi ${first}! Here’s your order with ${bakery.name}: ${link}`;
  return (
    <div className="flex gap-2">
      {order.customer?.phone && <a className="btn flex-1" href={smsHref(order.customer.phone, text)}>Text customer</a>}
      <button
        type="button"
        className="btn-ghost flex-1"
        onClick={async () => setCopied(await copy(order.customer?.phone ? link : text))}
      >
        {copied ? "Copied" : order.customer?.phone ? "Copy link" : "Copy message"}
      </button>
    </div>
  );
}

function QuoteEditor({ order, bakery, allOrders, onSaved }) {
  const [lines, setLines] = useState(() =>
    (order.quote_lines?.length ? order.quote_lines : [{ label: "", cents: 0 }]).map((l) => ({ label: l.label, price: centsToInput(l.cents) })),
  );
  const [depositInput, setDepositInput] = useState(order.deposit_cents != null ? centsToInput(order.deposit_cents) : "");
  const [message, setMessage] = useState(order.quote_message || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsed = lines.map((l) => ({ label: l.label.trim(), cents: parseDollars(l.price) }));
  const total = sumCents(parsed.filter((l) => l.cents !== null));
  const autoDeposit = depositFor(total, bakery.deposit_percent);
  const deposit = depositInput === "" ? autoDeposit : parseDollars(depositInput);

  const others = allOrders.filter((o) => o.id !== order.id);
  const conflict = checkDate({
    bakery: { ...bakery, accepting_orders: true, lead_days: 0 },
    orders: others,
    date: order.pickup_date,
    spots: order.spots || 1,
    today: todayIn(bakery.timezone),
  });

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function send() {
    setError("");
    if (parsed.some((l) => l.label && l.cents === null)) return setError("One of the prices isn’t a number.");
    const clean = parsed.filter((l) => l.label && l.cents !== null);
    if (clean.length === 0 || total <= 0) return setError("Add at least one priced line.");
    if (deposit === null || deposit < 0 || deposit > total) return setError("The deposit has to be between $0 and the total.");
    setBusy(true);
    try {
      const hold = Number(bakery.quote_hold_hours) || 48;
      await base44.entities.Order.update(order.id, {
        status: "quoted",
        quote_lines: clean,
        total_cents: total,
        deposit_cents: deposit,
        quote_message: message.trim(),
        quote_expires_at: new Date(Date.now() + hold * 3600_000).toISOString(),
        customer_says_paid: false,
      });
      await onSaved();
    } catch (e) {
      setError(e?.message || "Couldn’t save the quote.");
    }
    setBusy(false);
  }

  async function decline() {
    setBusy(true);
    try {
      await base44.entities.Order.update(order.id, { status: "declined" });
      await onSaved();
    } catch (e) {
      setError(e?.message || "Couldn’t decline.");
    }
    setBusy(false);
  }

  return (
    <Section title={order.status === "requested" ? "Quote" : "Update quote"}>
      <p className="text-xs text-muted">Starting prices come from your menu. Add anything extra, like fondant or toppers.</p>
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            id={`line-label-${i}`}
            className="input flex-1 min-w-0"
            value={l.label}
            placeholder="What it’s for"
            aria-label="Line description"
            onChange={(e) => setLine(i, { label: e.target.value })}
          />
          <input
            id={`line-price-${i}`}
            className="input w-24 text-right tabular"
            value={l.price}
            inputMode="decimal"
            placeholder="$0"
            aria-label="Price"
            onChange={(e) => setLine(i, { price: e.target.value })}
          />
          <button type="button" className="text-muted px-1 text-lg" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button type="button" className="btn-quiet self-start -ml-3" onClick={() => setLines((ls) => [...ls, { label: "", price: "" }])}>+ Add line</button>
      <div className="flex justify-between font-bold tabular border-t border-line pt-2"><span>Total</span><span>{formatCents(total)}</span></div>
      <Field label={`Deposit (${bakery.deposit_percent}% is ${formatCents(autoDeposit)})`}>
        <input id="deposit" className="input tabular" inputMode="decimal" value={depositInput} placeholder={centsToInput(autoDeposit)} onChange={(e) => setDepositInput(e.target.value)} />
      </Field>
      <Field label="Note to customer">
        <textarea id="quote-message" className="input min-h-[70px]" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Love this idea! Gold horn included." />
      </Field>
      <p className="text-sm text-muted">Sending holds {order.spots || 1} spot{(order.spots || 1) === 1 ? "" : "s"} for {bakery.quote_hold_hours || 48} hours while you wait for the deposit.</p>
      {conflict === "full" && <ErrorNote>{niceDate(order.pickup_date)} is already at your limit. You can still send this quote, but you’ll be over.</ErrorNote>}
      {conflict === "blocked" && <ErrorNote>You blocked {niceDate(order.pickup_date)} as a day off.</ErrorNote>}
      <ErrorNote>{error}</ErrorNote>
      <div className="grid grid-cols-2 gap-2">
        {order.status === "requested" ? (
          <button type="button" className="btn-ghost" disabled={busy} onClick={decline}>Decline</button>
        ) : (
          <span />
        )}
        <button type="button" className="btn" disabled={busy} onClick={send}>{order.status === "requested" ? "Send quote" : "Save quote"}</button>
      </div>
    </Section>
  );
}

function PaymentForm({ order, bakery, owed, status, onSaved }) {
  const firstPayment = status === "quoted" || status === "expired" || status === "requested";
  const [kind, setKind] = useState(firstPayment ? "deposit" : "balance");
  const [amount, setAmount] = useState(centsToInput(firstPayment ? order.deposit_cents ?? owed : owed));
  const [method, setMethod] = useState(bakery.payment_handles?.[0]?.method || "venmo");
  const [date, setDate] = useState(todayIn(bakery.timezone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    const cents = parseDollars(amount);
    if (!cents) return setError("Enter the amount you received.");
    setBusy(true);
    setError("");
    try {
      await base44.entities.Payment.create({
        bakery_id: bakery.id,
        order_id: order.id,
        kind,
        cents: kind === "refund" ? -Math.abs(cents) : cents,
        method,
        received_on: date,
      });
      if (firstPayment && kind !== "refund") {
        await base44.entities.Order.update(order.id, { status: "booked", quote_expires_at: null, customer_says_paid: false });
      }
      await onSaved();
    } catch (err) {
      setError(err?.message || "Couldn’t record the payment.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 border-t border-line pt-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="For">
          <select id="pay-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="deposit">Deposit</option>
            <option value="balance">Balance</option>
            <option value="tip">Tip</option>
            <option value="refund">Refund</option>
          </select>
        </Field>
        <Field label="Amount">
          <input id="pay-amount" className="input tabular" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="How">
          <select id="pay-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Received">
          <input id="pay-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {firstPayment && <p className="text-sm text-muted">Recording the deposit books the order.</p>}
      <ErrorNote>{error}</ErrorNote>
      <button className="btn" disabled={busy}>Record payment</button>
    </form>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { data: bakery } = useBakery();
  const orders = useOrders(bakery?.id);
  const payments = usePayments(bakery?.id);
  const refresh = useRefresh();
  const [showPay, setShowPay] = useState(false);
  const [notes, setNotes] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [error, setError] = useState("");

  const order = (orders.data || []).find((o) => o.id === id);
  useEffect(() => {
    if (order && notes === null) setNotes(order.private_notes || "");
    if (order && pickup === null) setPickup({ date: order.pickup_date, time: order.pickup_time || "" });
  }, [order, notes, pickup]);

  if (orders.isLoading || payments.isLoading) return <Screen back="/requests" tabs={false}><Spinner /></Screen>;
  if (!order) return <Screen back="/requests" tabs={false}><Empty title="Order not found">It may have been deleted.</Empty></Screen>;

  const status = effectiveStatus(order);
  const orderPayments = (payments.data || []).filter((p) => p.order_id === order.id);
  const paid = orderPayments.reduce((s, p) => s + (Number(p.cents) || 0), 0);
  const owed = Math.max((order.total_cents || 0) - paid, 0);
  const priced = ["booked", "ready", "picked_up", "cancelled"].includes(status);
  const canQuote = ["requested", "quoted", "expired"].includes(status);
  const saved = async () => {
    setShowPay(false);
    await refresh("orders", "payments");
  };

  async function update(patch) {
    setError("");
    try {
      await base44.entities.Order.update(order.id, patch);
      await refresh("orders");
    } catch (e) {
      setError(e?.message || "Couldn’t save.");
    }
  }

  const pickupChanged = pickup && (pickup.date !== order.pickup_date || pickup.time !== (order.pickup_time || ""));

  return (
    <Screen back="/requests" tabs={false} action={<StatusChip status={status} />}>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">{order.customer?.name || "Order"}</h1>
        <p className="text-muted">
          Pickup {niceDate(order.pickup_date, "EEEE, MMM d")}{order.pickup_time ? ` at ${niceTime(order.pickup_time)}` : ""}
        </p>
        {status === "quoted" && order.quote_expires_at && (
          <p className="text-sm text-accent font-semibold">Holding the date until {niceDateTime(order.quote_expires_at)}</p>
        )}
        {status === "quoted" && order.customer_says_paid && (
          <p className="text-sm font-semibold text-warn">Customer says they sent the deposit. Check your app, then record it below.</p>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>

      <Section title="What they want">
        {(order.items || []).map((it, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <b>{it.qty > 1 ? `${it.qty} × ` : ""}{it.size_label} {it.name}</b>
            {it.options?.length > 0 && <span className="text-sm text-muted">{it.options.join(" / ")}</span>}
            {it.design_notes && <span className="text-sm">“{it.design_notes}”</span>}
          </div>
        ))}
        {order.photo_urls?.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {order.photo_urls.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Inspiration" className="h-28 rounded-xl object-cover" /></a>
            ))}
          </div>
        )}
      </Section>

      <Section title="Contact">
        <div className="flex flex-col gap-1 text-[15px]">
          {order.customer?.phone && <span>📞 <a className="text-accent font-semibold" href={`tel:${order.customer.phone}`}>{order.customer.phone}</a></span>}
          {order.customer?.email && <span>✉️ <span className="select-all">{order.customer.email}</span></span>}
          {order.customer?.instagram && <span>@{order.customer.instagram.replace(/^@/, "")}</span>}
        </div>
        {order.public_token && status !== "requested" && <ShareLink order={order} bakery={bakery} status={status} />}
      </Section>

      {canQuote && <QuoteEditor key={order.updated_date} order={order} bakery={bakery} allOrders={orders.data || []} onSaved={saved} />}

      {priced && (
        <Section title="Price">
          {(order.quote_lines || []).map((l, i) => (
            <div key={i} className="flex justify-between tabular text-[15px]"><span>{l.label}</span><span>{formatCents(l.cents)}</span></div>
          ))}
          <div className="flex justify-between font-bold tabular border-t border-line pt-2"><span>Total</span><span>{formatCents(order.total_cents)}</span></div>
        </Section>
      )}

      {status !== "requested" && status !== "declined" && (
        <Section
          title="Payments"
          action={!showPay && <button type="button" className="btn-quiet -mr-3" onClick={() => setShowPay(true)}>+ Record</button>}
        >
          {orderPayments.length === 0 && <p className="text-sm text-muted">Nothing received yet.</p>}
          {orderPayments.map((p) => (
            <div key={p.id} className="flex justify-between text-[15px] tabular">
              <span className="capitalize">{p.kind} · {methodLabel(p.method)} · {niceDate(p.received_on, "MMM d")}</span>
              <span>{formatCents(p.cents)}</span>
            </div>
          ))}
          {order.total_cents > 0 && (
            <div className="flex justify-between font-bold tabular border-t border-line pt-2">
              <span>Still owed</span><span>{formatCents(owed)}</span>
            </div>
          )}
          {showPay && <PaymentForm order={order} bakery={bakery} owed={owed} status={status} onSaved={saved} />}
        </Section>
      )}

      {pickup && !["picked_up", "declined", "cancelled"].includes(status) && (
        <Section title="Pickup">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date"><input id="pickup-date" type="date" className="input" value={pickup.date} onChange={(e) => setPickup({ ...pickup, date: e.target.value })} /></Field>
            <Field label="Time"><input id="pickup-time" type="time" className="input" value={pickup.time} onChange={(e) => setPickup({ ...pickup, time: e.target.value })} /></Field>
          </div>
          {pickupChanged && <button type="button" className="btn" onClick={() => update({ pickup_date: pickup.date, pickup_time: pickup.time })}>Save pickup</button>}
        </Section>
      )}

      <Section title="Private notes">
        <textarea
          id="private-notes"
          className="input min-h-[70px]"
          value={notes ?? ""}
          placeholder="Only you see this"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (order.private_notes || "") && update({ private_notes: notes })}
        />
      </Section>

      <div className="flex flex-col gap-2">
        {status === "booked" && <button type="button" className="btn" onClick={() => update({ status: "ready" })}>Mark ready for pickup</button>}
        {status === "ready" && <button type="button" className="btn" onClick={() => update({ status: "picked_up" })}>Mark picked up</button>}
        {["quoted", "booked", "ready"].includes(status) && (
          <button type="button" className="btn-quiet text-warn" onClick={() => update({ status: "cancelled" })}>Cancel order</button>
        )}
        {["declined", "cancelled", "expired"].includes(status) && (
          <button type="button" className="btn-quiet" onClick={() => update({ status: "requested", quote_expires_at: null })}>Move back to New</button>
        )}
      </div>
    </Screen>
  );
}
