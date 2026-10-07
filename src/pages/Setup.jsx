import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { callShop } from "@/lib/data";
import { slugify } from "@/lib/labels";
import { Field, ErrorNote } from "@/components/ui";

// A starter menu so the order form works on day one. Bakers edit it later.
const STARTER_MENU = [
  { kind: "cake", name: "Round cake", option_groups: ["flavor", "filling", "frosting"], sizes: [
    { label: '6"', serves: 10, base_cents: 6000, spots: 1 },
    { label: '8"', serves: 20, base_cents: 8500, spots: 1 },
    { label: "2-tier", serves: 40, base_cents: 16000, spots: 2 },
  ] },
  { kind: "cupcakes", name: "Cupcakes", option_groups: ["flavor", "frosting"], sizes: [
    { label: "1 dozen", serves: 12, base_cents: 3600, spots: 1 },
  ] },
  { kind: "cookies", name: "Decorated sugar cookies", option_groups: [], sizes: [
    { label: "1 dozen", serves: 12, base_cents: 4200, spots: 1 },
  ] },
];
const STARTER_OPTIONS = [
  ["flavor", "Vanilla", 0], ["flavor", "Chocolate", 0], ["flavor", "Lemon", 0], ["flavor", "Red velvet", 500],
  ["filling", "Strawberry", 500], ["filling", "Raspberry", 500], ["filling", "Chocolate ganache", 500],
  ["frosting", "Vanilla buttercream", 0], ["frosting", "Cream cheese", 0],
];

export default function Setup() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [weekly, setWeekly] = useState("4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finalSlug = slugTouched ? slugify(slug) : slugify(name);

  async function create(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Give your shop a name.");
    if (finalSlug.length < 3) return setError("Your link needs at least 3 letters or numbers.");
    setBusy(true);
    try {
      const taken = await callShop("shop", { slug: finalSlug }).then(() => true, () => false);
      if (taken) {
        setBusy(false);
        return setError(`The link /b/${finalSlug} is taken. Try another.`);
      }
      const weeklyN = Math.max(1, Number(weekly) || 4);
      const bakery = await base44.entities.Bakery.create({
        name: name.trim(),
        slug: finalSlug,
        accepting_orders: true,
        weekly_capacity: weeklyN,
        daily_capacity: Math.min(weeklyN, 2),
        lead_days: 7,
        deposit_percent: 50,
        quote_hold_hours: 48,
        payment_handles: [],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago",
      });
      await Promise.all([
        ...STARTER_MENU.map((m, i) => base44.entities.MenuItem.create({ ...m, bakery_id: bakery.id, active: true, sort: i })),
        ...STARTER_OPTIONS.map(([group, n, up]) => base44.entities.MenuOption.create({ bakery_id: bakery.id, group, name: n, upcharge_cents: up, active: true })),
      ]);
      await qc.invalidateQueries({ queryKey: ["bakery"] });
    } catch (err) {
      setError(err?.message || "Couldn’t create your shop. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full px-4 py-10">
      <form onSubmit={create} className="mx-auto max-w-md flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="lbl text-accent">Welcome to Proofed</span>
          <h1 className="text-4xl font-extrabold">Set up your shop</h1>
          <p className="text-muted">You’ll get a link for your Instagram bio. Customers order through it instead of DMs.</p>
        </div>
        <Field label="Shop name">
          <input id="setup-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lila’s Cake Studio" />
        </Field>
        <Field label="Your link" hint={`Customers will open /b/${finalSlug || "your-shop"}`}>
          <input
            id="setup-slug"
            className="input"
            value={slugTouched ? slug : finalSlug}
            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
            placeholder="lilascakes"
          />
        </Field>
        <Field label="Most orders you take per week" hint="A 2-tier cake counts as 2. You can change this any time.">
          <input id="setup-weekly" className="input" inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
        </Field>
        <p className="text-sm text-muted">We’ll add a starter menu (round cakes, cupcakes, cookies) with common flavors. Edit prices in Shop settings.</p>
        <ErrorNote>{error}</ErrorNote>
        <button className="btn" disabled={busy}>{busy ? "Creating…" : "Create my shop"}</button>
      </form>
    </div>
  );
}
