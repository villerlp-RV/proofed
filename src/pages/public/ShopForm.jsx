import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { callShop } from "@/lib/data";
import { niceDate } from "@/lib/dates";
import { shrinkImage } from "@/lib/images";
import { formatCents } from "@/lib/money";
import { ErrorNote, Field, Spinner } from "@/components/ui";

const GROUP_LABELS = { flavor: "Flavor", filling: "Filling", frosting: "Frosting" };

function newItem(menu) {
  const m = menu[0];
  return { menu_item_id: m?.id || "", size_label: m?.sizes?.[0]?.label || "", choices: {}, qty: 1, design_notes: "" };
}

function DatePicker({ dates, value, onChange }) {
  const weeks = [];
  if (dates.length) {
    const firstDay = new Date(dates[0].date + "T00:00:00Z").getUTCDay();
    const pad = firstDay === 0 ? 6 : firstDay - 1;
    const cells = [...Array(pad).fill(null), ...dates];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  }
  const anyOpen = dates.some((d) => d.open);
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="lbl">{d}</span>)}
      </div>
      {weeks.map((w, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1 text-center">
          {w.map((d, i) =>
            d ? (
              <button
                key={d.date}
                type="button"
                disabled={!d.open}
                onClick={() => onChange(d.date)}
                aria-pressed={value === d.date}
                aria-label={`${niceDate(d.date, "EEEE MMM d")}${d.open ? "" : ", unavailable"}`}
                className={[
                  "rounded-lg border py-2 text-sm tabular",
                  value === d.date ? "bg-accent text-accent-ink border-accent font-bold" : d.open ? "bg-surface border-line" : "hatched border-transparent text-muted line-through",
                ].join(" ")}
              >
                {Number(d.date.slice(8))}
                {d.date.slice(8) === "01" || (wi === 0 && i === w.findIndex(Boolean)) ? (
                  <span className="block text-[9px] leading-none uppercase">{niceDate(d.date, "MMM")}</span>
                ) : null}
              </button>
            ) : (
              <span key={`pad-${i}`} />
            ),
          )}
        </div>
      ))}
      {!anyOpen && <p className="text-sm text-muted">No open dates in the next few weeks. Check back soon.</p>}
    </div>
  );
}

export default function ShopForm() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState(null);
  const [dates, setDates] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [photos, setPhotos] = useState([]);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", instagram: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([callShop("shop", { slug }), callShop("availability", { slug, days: 63 })])
      .then(([s, a]) => {
        if (!live) return;
        setShop(s);
        setDates(a.dates);
        setItems(s.menu.length ? [newItem(s.menu)] : []);
        document.title = `Order from ${s.name}`;
      })
      .catch((e) => live && setLoadError(e.message));
    return () => { live = false; };
  }, [slug]);

  const estimate = useMemo(() => {
    if (!shop) return 0;
    return items.reduce((sum, it) => {
      const m = shop.menu.find((x) => x.id === it.menu_item_id);
      const size = m?.sizes.find((s) => s.label === it.size_label);
      const ups = Object.values(it.choices).reduce((s, id) => s + (shop.options.find((o) => o.id === id)?.upcharge_cents || 0), 0);
      return sum + ((size?.base_cents || 0) + ups) * (it.qty || 1);
    }, 0);
  }, [shop, items]);

  if (loadError) {
    return (
      <div className="min-h-full grid place-items-center px-4 py-16 text-center">
        <div className="max-w-sm flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold">Shop not found</h1>
          <p className="text-muted">{loadError}</p>
        </div>
      </div>
    );
  }
  if (!shop) return <Spinner />;

  const setItem = (i, patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function addPhotos(files) {
    setError("");
    const room = 3 - photos.length;
    try {
      const shrunk = await Promise.all(Array.from(files).slice(0, room).map((f) => shrinkImage(f)));
      setPhotos((p) => [...p, ...shrunk]);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!date) return setError("Pick a pickup date.");
    if (!customer.name.trim()) return setError("Add your name.");
    if (!customer.phone.trim() && !customer.email.trim()) return setError("Add a phone number or email so the baker can reach you.");
    setBusy(true);
    try {
      const res = await callShop("submit", {
        slug,
        form: {
          pickup_date: date,
          pickup_time: time,
          customer,
          photos,
          items: items.map((it) => ({
            menu_item_id: it.menu_item_id,
            size_label: it.size_label,
            option_ids: Object.values(it.choices).filter(Boolean),
            qty: it.qty,
            design_notes: it.design_notes,
          })),
        },
      });
      navigate(`/o/${res.token}?sent=1${res.photos_saved < res.photos_sent ? "&photos=failed" : ""}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
      if (/date/i.test(err.message)) callShop("availability", { slug, days: 63 }).then((a) => setDates(a.dates)).catch(() => {});
    }
  }

  if (!shop.accepting_orders || shop.menu.length === 0) {
    return (
      <div className="min-h-full grid place-items-center px-4 py-16 text-center">
        <div className="max-w-sm flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold">{shop.name}</h1>
          <p className="text-muted">Not taking new orders right now. Check back soon.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="min-h-full px-4 py-8">
      <div className="mx-auto max-w-lg flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <span className="lbl text-accent">Custom order request</span>
          <h1 className="text-4xl font-extrabold">{shop.name}</h1>
          <p className="text-muted">Tell us what you’d like. You’ll get a quote, then pay a deposit to hold your date.</p>
        </header>

        {items.map((it, i) => {
          const m = shop.menu.find((x) => x.id === it.menu_item_id) || shop.menu[0];
          return (
            <section key={i} className="card flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="lbl">{items.length > 1 ? `Item ${i + 1}` : "What would you like?"}</span>
                {items.length > 1 && <button type="button" className="btn-quiet -mr-3 text-sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {shop.menu.map((mi) => (
                  <button
                    key={mi.id}
                    type="button"
                    aria-pressed={mi.id === m.id}
                    onClick={() => setItem(i, { menu_item_id: mi.id, size_label: mi.sizes[0]?.label || "", choices: {} })}
                    className={`rounded-xl px-3 py-2 text-sm border ${mi.id === m.id ? "border-accent bg-accent-soft text-accent font-bold" : "border-line bg-surface"}`}
                  >
                    {mi.name}
                  </button>
                ))}
              </div>
              {m.sizes.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="lbl">Size</span>
                  <div className="flex gap-2 flex-wrap">
                    {m.sizes.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        aria-pressed={it.size_label === s.label}
                        onClick={() => setItem(i, { size_label: s.label })}
                        className={`rounded-xl px-3 py-2 text-sm border text-left ${it.size_label === s.label ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface"}`}
                      >
                        <b>{s.label}</b>
                        <span className="block text-xs">{s.serves ? `serves ${s.serves} · ` : ""}from {formatCents(s.base_cents)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {m.option_groups.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {m.option_groups.map((g) => {
                    const opts = shop.options.filter((o) => o.group === g);
                    if (!opts.length) return null;
                    return (
                      <Field key={g} label={GROUP_LABELS[g]}>
                        <select
                          id={`item-${i}-${g}`}
                          className="input"
                          value={it.choices[g] || ""}
                          onChange={(e) => setItem(i, { choices: { ...it.choices, [g]: e.target.value } })}
                        >
                          <option value="">Choose…</option>
                          {opts.map((o) => (
                            <option key={o.id} value={o.id}>{o.name}{o.upcharge_cents ? ` (+${formatCents(o.upcharge_cents)})` : ""}</option>
                          ))}
                        </select>
                      </Field>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-[5rem_1fr] gap-2">
                <Field label="How many">
                  <input id={`item-${i}-qty`} className="input" inputMode="numeric" value={it.qty} onChange={(e) => setItem(i, { qty: Math.max(1, Math.min(20, Number(e.target.value.replace(/\D/g, "")) || 1)) })} />
                </Field>
                <Field label="Design ideas">
                  <textarea id={`item-${i}-notes`} className="input min-h-[44px]" value={it.design_notes} placeholder="Colors, theme, message on top" onChange={(e) => setItem(i, { design_notes: e.target.value })} />
                </Field>
              </div>
            </section>
          );
        })}
        <button type="button" className="btn-quiet self-start -ml-3" onClick={() => setItems([...items, newItem(shop.menu)])}>+ Add another item</button>

        <section className="card flex flex-col gap-3">
          <span className="lbl">Inspiration photos (up to 3)</span>
          <div className="flex gap-2 flex-wrap">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img src={p} alt={`Inspiration ${i + 1}`} className="w-20 h-20 rounded-xl object-cover" />
                <button type="button" aria-label="Remove photo" className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-ink text-bg text-sm" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            {photos.length < 3 && (
              <label className="w-20 h-20 rounded-xl border-2 border-dashed border-line grid place-items-center text-muted text-sm cursor-pointer text-center">
                + Add
                <input id="photos" type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </section>

        <section className="card flex flex-col gap-3">
          <span className="lbl">Pickup date</span>
          <DatePicker dates={dates} value={date} onChange={setDate} />
          <p className="text-xs text-muted">Crossed-out days are booked or need more notice{shop.lead_days ? ` (at least ${shop.lead_days} days)` : ""}.</p>
          <Field label="Preferred pickup time (optional)">
            <input id="pickup-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </section>

        <section className="card flex flex-col gap-3">
          <span className="lbl">Your details</span>
          <Field label="Name"><input id="c-name" className="input" autoComplete="name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone"><input id="c-phone" className="input" type="tel" autoComplete="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></Field>
            <Field label="Instagram"><input id="c-ig" className="input" placeholder="@" value={customer.instagram} onChange={(e) => setCustomer({ ...customer, instagram: e.target.value })} /></Field>
          </div>
          <Field label="Email"><input id="c-email" className="input" type="email" autoComplete="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></Field>
        </section>

        {shop.policies && (
          <section className="flex flex-col gap-1">
            <span className="lbl">Before you order</span>
            <p className="text-sm text-muted whitespace-pre-line">{shop.policies}</p>
          </section>
        )}

        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-col gap-1">
          {estimate > 0 && <p className="text-sm text-muted">Starting at about <b className="text-ink">{formatCents(estimate)}</b>. The baker confirms the final price in your quote.</p>}
          <button className="btn" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
        </div>
      </div>
    </form>
  );
}
