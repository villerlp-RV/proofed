import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useBakery, useMenu, useOptions, useRefresh } from "@/lib/data";
import { centsToInput, formatCents, parseDollars } from "@/lib/money";
import { ErrorNote, Field, Screen, Spinner } from "@/components/ui";

const GROUPS = [
  ["flavor", "Flavors"],
  ["filling", "Fillings"],
  ["frosting", "Frostings"],
];
const KINDS = [["cake", "Cake"], ["cupcakes", "Cupcakes"], ["cookies", "Cookies"], ["other", "Other"]];

function toForm(item) {
  return {
    name: item.name || "",
    kind: item.kind || "cake",
    active: item.active !== false,
    option_groups: item.option_groups || [],
    sizes: (item.sizes?.length ? item.sizes : [{ label: "", serves: "", base_cents: 0, spots: 1 }]).map((s) => ({
      label: s.label || "",
      serves: s.serves ? String(s.serves) : "",
      price: centsToInput(s.base_cents),
      spots: String(s.spots ?? 1),
    })),
  };
}

function ItemEditor({ item, bakeryId, sort, onDone }) {
  const [f, setF] = useState(() => toForm(item || {}));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setSize = (i, patch) => setF((x) => ({ ...x, sizes: x.sizes.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  async function save() {
    setError("");
    if (!f.name.trim()) return setError("Give this item a name.");
    const sizes = f.sizes
      .filter((s) => s.label.trim())
      .map((s) => ({ label: s.label.trim(), serves: Number(s.serves) || undefined, base_cents: parseDollars(s.price), spots: Math.max(1, Math.round(Number(s.spots) || 1)) }));
    if (sizes.length === 0) return setError("Add at least one size.");
    if (sizes.some((s) => s.base_cents === null)) return setError("Each size needs a starting price.");
    setBusy(true);
    try {
      const data = { name: f.name.trim(), kind: f.kind, active: f.active, option_groups: f.option_groups, sizes };
      if (item) await base44.entities.MenuItem.update(item.id, data);
      else await base44.entities.MenuItem.create({ ...data, bakery_id: bakeryId, sort });
      await onDone();
    } catch (e) {
      setError(e?.message || "Couldn’t save.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await base44.entities.MenuItem.delete(item.id);
    await onDone();
  }

  return (
    <div className="card flex flex-col gap-3 border-accent">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Name"><input id="m-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Round cake" /></Field>
        <Field label="Type">
          <select id="m-kind" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_4rem_5rem_3.5rem_1.5rem] gap-1.5 lbl"><span>Size</span><span>Serves</span><span>From $</span><span>Spots</span><span /></div>
        {f.sizes.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_4rem_5rem_3.5rem_1.5rem] gap-1.5 items-center">
            <input id={`sz-label-${i}`} aria-label="Size" className="input px-2" value={s.label} onChange={(e) => setSize(i, { label: e.target.value })} placeholder='8"' />
            <input id={`sz-serves-${i}`} aria-label="Serves" className="input px-2" inputMode="numeric" value={s.serves} onChange={(e) => setSize(i, { serves: e.target.value })} />
            <input id={`sz-price-${i}`} aria-label="Starting price" className="input px-2 tabular" inputMode="decimal" value={s.price} onChange={(e) => setSize(i, { price: e.target.value })} />
            <input id={`sz-spots-${i}`} aria-label="Spots used" className="input px-2" inputMode="numeric" value={s.spots} onChange={(e) => setSize(i, { spots: e.target.value })} />
            <button type="button" aria-label="Remove size" className="text-muted text-lg" onClick={() => setF({ ...f, sizes: f.sizes.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <button type="button" className="btn-quiet self-start -ml-3" onClick={() => setF({ ...f, sizes: [...f.sizes, { label: "", serves: "", price: "", spots: "1" }] })}>+ Add size</button>
        <p className="text-xs text-muted">Spots = how much of your daily and weekly limit one of these uses.</p>
      </div>
      <div className="flex flex-col gap-1">
        <span className="lbl">Customers choose</span>
        <div className="flex gap-3 flex-wrap">
          {GROUPS.map(([g, label]) => (
            <label key={g} className="flex items-center gap-1.5 text-[15px]">
              <input
                type="checkbox"
                checked={f.option_groups.includes(g)}
                onChange={(e) => setF({ ...f, option_groups: e.target.checked ? [...f.option_groups, g] : f.option_groups.filter((x) => x !== g) })}
              />
              {label.toLowerCase()}
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-[15px]">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Show on the order form
      </label>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        {item && <button type="button" className="btn-quiet text-warn" disabled={busy} onClick={remove}>Delete</button>}
        <button type="button" className="btn-ghost flex-1" disabled={busy} onClick={() => onDone(false)}>Cancel</button>
        <button type="button" className="btn flex-1" disabled={busy} onClick={save}>Save</button>
      </div>
    </div>
  );
}

function OptionGroup({ group, label, options, bakeryId, onChange }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  async function add() {
    if (!name.trim()) return;
    await base44.entities.MenuOption.create({ bakery_id: bakeryId, group, name: name.trim(), upcharge_cents: parseDollars(price) || 0, active: true });
    setName("");
    setPrice("");
    await onChange();
  }
  async function remove(id) {
    await base44.entities.MenuOption.delete(id);
    await onChange();
  }
  return (
    <section className="card flex flex-col gap-2">
      <span className="lbl">{label}</span>
      {options.length === 0 && <p className="text-sm text-muted">None yet.</p>}
      {options.map((o) => (
        <div key={o.id} className="flex justify-between items-center text-[15px]">
          <span>{o.name}{o.upcharge_cents ? <span className="text-muted"> · +{formatCents(o.upcharge_cents)}</span> : null}</span>
          <button type="button" className="text-muted text-lg px-1" aria-label={`Remove ${o.name}`} onClick={() => remove(o.id)}>×</button>
        </div>
      ))}
      <div className="flex gap-2">
        <input id={`opt-${group}-name`} className="input flex-1 min-w-0" placeholder={`Add a ${group}`} value={name} onChange={(e) => setName(e.target.value)} />
        <input id={`opt-${group}-price`} className="input w-20" placeholder="+$0" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Extra charge" />
        <button type="button" className="btn px-3" onClick={add}>Add</button>
      </div>
    </section>
  );
}

export default function Menu() {
  const { data: bakery } = useBakery();
  const menu = useMenu(bakery?.id);
  const options = useOptions(bakery?.id);
  const refresh = useRefresh();
  const [editing, setEditing] = useState(null); // item id, "new", or null
  if (menu.isLoading || options.isLoading) return <Screen title="Menu" back="/settings" tabs={false}><Spinner /></Screen>;

  const done = async (changed = true) => {
    if (changed) await refresh("menu");
    setEditing(null);
  };

  return (
    <Screen title="Menu & prices" back="/settings" tabs={false}>
      <p className="text-sm text-muted">Prices here are starting points. You set the final price on each quote.</p>
      {(menu.data || []).map((item) =>
        editing === item.id ? (
          <ItemEditor key={item.id} item={item} bakeryId={bakery.id} onDone={done} />
        ) : (
          <button key={item.id} type="button" className="card text-left flex flex-col gap-1" onClick={() => setEditing(item.id)}>
            <div className="flex justify-between gap-2">
              <b>{item.name}</b>
              {item.active === false ? <span className="text-sm text-muted">Hidden</span> : <span className="text-accent font-semibold text-sm">Edit</span>}
            </div>
            <span className="text-sm text-muted">
              {(item.sizes || []).map((s) => `${s.label} ${formatCents(s.base_cents)}`).join(" · ")}
            </span>
          </button>
        ),
      )}
      {editing === "new" ? (
        <ItemEditor bakeryId={bakery.id} sort={(menu.data || []).length} onDone={done} />
      ) : (
        <button type="button" className="btn-ghost" onClick={() => setEditing("new")}>+ Add menu item</button>
      )}
      {GROUPS.map(([g, label]) => (
        <OptionGroup key={g} group={g} label={label} bakeryId={bakery.id} options={(options.data || []).filter((o) => o.group === g)} onChange={() => refresh("options")} />
      ))}
    </Screen>
  );
}
