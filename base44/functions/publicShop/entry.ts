import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';

// Everything a customer can do, without signing in: read a shop's menu, see
// which dates are open, send a request, and follow their own order by its
// secret link. Customers never touch entities directly, so they can't list
// other orders or see the pickup address before booking.
//
// Body: { action: "shop" | "availability" | "submit" | "order" | "markSent", ... }

// ---- Rules: keep in step with src/lib/rules.js (rules.test.js compares them) ----

export const SPOT_STATUSES = ['quoted', 'booked', 'ready'];

export function effectiveStatus(order, now = new Date()) {
  if (order.status === 'quoted' && order.quote_expires_at && new Date(order.quote_expires_at) < now) {
    return 'expired';
  }
  return order.status;
}

export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekStart(date) {
  const day = new Date(date + 'T00:00:00Z').getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function todayIn(timeZone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function usage(orders, now = new Date()) {
  const byDay = {};
  const byWeek = {};
  for (const o of orders) {
    if (!SPOT_STATUSES.includes(effectiveStatus(o, now)) || !o.pickup_date) continue;
    const spots = Number(o.spots) || 1;
    byDay[o.pickup_date] = (byDay[o.pickup_date] || 0) + spots;
    const w = weekStart(o.pickup_date);
    byWeek[w] = (byWeek[w] || 0) + spots;
  }
  return { byDay, byWeek };
}

function isBlocked(date, blocked) {
  return blocked.some((b) => date >= b.date && date <= (b.end_date || b.date));
}

export function checkDate({ bakery, orders, blocked = [], date, spots = 1, today, now = new Date() }) {
  const { byDay, byWeek } = usage(orders, now);
  if (bakery.accepting_orders === false) return 'closed';
  if (date < addDays(today, Number(bakery.lead_days) || 0)) return 'too_soon';
  if (isBlocked(date, blocked)) return 'blocked';
  const daily = Number(bakery.daily_capacity) || 1;
  const weekly = Number(bakery.weekly_capacity) || daily;
  if ((byDay[date] || 0) + spots > daily) return 'full';
  if ((byWeek[weekStart(date)] || 0) + spots > weekly) return 'full';
  return null;
}

export function availability({ bakery, orders, blocked = [], today, days = 56, now = new Date() }) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const reason = checkDate({ bakery, orders, blocked, date, spots: 1, today, now });
    out.push({ date, open: reason === null, reason });
  }
  return out;
}

// ---- Request handling ----

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 2_000_000;

function clip(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(message, status = 400) {
  return Response.json({ error: message }, { status });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Turns the form's items into stored items plus the spots they use and a
// starting price the baker can edit when quoting. Unknown ids are dropped.
export function priceItems(formItems, menuItems, options) {
  const items = [];
  const lines = [];
  let spots = 0;
  for (const fi of (formItems || []).slice(0, 10)) {
    const menu = menuItems.find((m) => m.id === fi.menu_item_id && m.active !== false);
    if (!menu) continue;
    const size = (menu.sizes || []).find((s) => s.label === fi.size_label) || (menu.sizes || [])[0];
    const qty = Math.min(Math.max(Math.round(Number(fi.qty) || 1), 1), 20);
    const chosen = (fi.option_ids || [])
      .map((id) => options.find((o) => o.id === id && o.active !== false))
      .filter(Boolean);
    items.push({
      menu_item_id: menu.id,
      name: menu.name,
      size_label: size?.label || '',
      options: chosen.map((o) => o.name),
      qty,
      design_notes: clip(fi.design_notes, 1000),
    });
    spots += (Number(size?.spots) || 1) * qty;
    const label = [qty > 1 ? `${qty} ×` : '', size?.label, menu.name].filter(Boolean).join(' ');
    lines.push({ label, cents: (Number(size?.base_cents) || 0) * qty });
    for (const o of chosen) {
      if (o.upcharge_cents) lines.push({ label: o.name, cents: Number(o.upcharge_cents) * qty });
    }
  }
  return { items, lines, spots: Math.max(spots, 1) };
}

function niceDay(date) {
  const d = new Date(date + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function niceTime(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'pm' : 'am'}`;
}

// Plain-text email to the baker about a new request.
export function requestEmail({ bakery, customer, date, time, items, photoCount, link }) {
  const when = niceDay(date) + (niceTime(time) ? ` around ${niceTime(time)}` : '');
  const what = items.map((i) => {
    const head = [i.qty > 1 ? `${i.qty} ×` : '', i.size_label, i.name].filter(Boolean).join(' ');
    const opts = i.options?.length ? ` (${i.options.join(' / ')})` : '';
    const notes = i.design_notes ? `\n    "${i.design_notes}"` : '';
    return `  • ${head}${opts}${notes}`;
  });
  const contact = [customer.phone, customer.email].filter(Boolean).join(' · ');
  const lines = [
    `${customer.name} sent ${bakery.name} a new request for pickup ${when}.`,
    '',
    'What they want:',
    ...what,
    '',
    `Contact: ${contact}`,
  ];
  if (photoCount) lines.push(`Inspiration photos: ${photoCount} attached in the app`);
  lines.push('', link ? `Open it and send a quote: ${link}` : 'Open Proofed to send a quote.');
  lines.push('', 'Turn these emails off in Proofed → Shop settings.');
  return {
    subject: `New request: ${customer.name}, ${niceDay(date).replace(/^\w+, /, '')}`,
    body: lines.join('\n'),
  };
}

function maskEmail(address) {
  const [user, domain] = String(address).split('@');
  return domain ? `${user.slice(0, 2)}…@${domain}` : '(not an email)';
}

// Where to send the baker's alerts: the address they chose in settings, or
// the email on their account. Each lookup is tried in turn and logged, so a
// missing email shows up in `base44 logs` instead of failing silently.
export async function bakerEmail(db, bakery) {
  const chosen = clip(bakery.notify_email, 120);
  if (chosen) return chosen;
  const id = bakery.created_by_id;
  if (!id) return '';
  try {
    const user = await db.User.get(id);
    if (user?.email) return user.email;
  } catch (e) {
    console.warn('Looking up the baker by id failed', e?.message || e);
  }
  try {
    const found = await db.User.filter({ id });
    if (found?.[0]?.email) return found[0].email;
  } catch (e) {
    console.warn('Searching for the baker failed', e?.message || e);
  }
  // Older Base44 records also store the creator's email.
  return typeof bakery.created_by === 'string' && bakery.created_by.includes('@') ? bakery.created_by : '';
}

async function findBakery(db, slug) {
  const found = await db.Bakery.filter({ slug: clip(slug, 60).toLowerCase() });
  return found?.[0] || null;
}

async function openOrders(db, bakeryId) {
  const all = await db.Order.filter({ bakery_id: bakeryId });
  return (all || []).filter((o) => ['quoted', 'booked', 'ready'].includes(o.status));
}

async function uploadPhoto(base44, dataUrl, i) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(dataUrl));
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_PHOTO_BYTES) return null;
  const ext = m[1].split('/')[1];
  const file = new File([bytes], `inspiration-${i + 1}.${ext}`, { type: m[1] });
  const res = await base44.asServiceRole.integrations.Core.UploadFile({ file });
  return res?.file_url || null;
}

function publicOrder(order, bakery, paidCents) {
  const status = effectiveStatus(order);
  return {
    bakery_name: bakery.name,
    bakery_slug: bakery.slug,
    status,
    customer_name: order.customer?.name || '',
    pickup_date: order.pickup_date,
    pickup_time: order.pickup_time || '',
    items: order.items || [],
    quote_lines: status === 'requested' ? [] : order.quote_lines || [],
    quote_message: status === 'requested' ? '' : order.quote_message || '',
    total_cents: status === 'requested' ? null : order.total_cents ?? null,
    deposit_cents: status === 'requested' ? null : order.deposit_cents ?? null,
    quote_expires_at: order.quote_expires_at || null,
    paid_cents: paidCents,
    customer_says_paid: !!order.customer_says_paid,
    payment_handles: bakery.payment_handles || [],
    pickup_address: ['booked', 'ready'].includes(status) ? bakery.pickup_address || '' : '',
    policies: bakery.policies || '',
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'shop' || action === 'availability' || action === 'submit') {
      const bakery = await findBakery(db, body.slug);
      if (!bakery) return fail('We couldn’t find that shop. Check the link with the baker.', 404);
      const today = todayIn(bakery.timezone);

      if (action === 'shop') {
        const [menu, options] = await Promise.all([
          db.MenuItem.filter({ bakery_id: bakery.id }),
          db.MenuOption.filter({ bakery_id: bakery.id }),
        ]);
        return Response.json({
          name: bakery.name,
          slug: bakery.slug,
          accepting_orders: bakery.accepting_orders !== false,
          lead_days: Number(bakery.lead_days) || 0,
          policies: bakery.policies || '',
          today,
          menu: (menu || [])
            .filter((m) => m.active !== false)
            .sort((a, b) => (a.sort || 0) - (b.sort || 0))
            .map((m) => ({ id: m.id, kind: m.kind, name: m.name, sizes: m.sizes || [], option_groups: m.option_groups || [] })),
          options: (options || [])
            .filter((o) => o.active !== false)
            .map((o) => ({ id: o.id, group: o.group, name: o.name, upcharge_cents: o.upcharge_cents || 0 })),
        });
      }

      const [orders, blocked] = await Promise.all([
        openOrders(db, bakery.id),
        db.BlockedDate.filter({ bakery_id: bakery.id }),
      ]);

      if (action === 'availability') {
        const days = Math.min(Math.max(Number(body.days) || 56, 7), 120);
        return Response.json({ today, dates: availability({ bakery, orders, blocked: blocked || [], today, days }) });
      }

      // submit
      const form = body.form || {};
      const name = clip(form.customer?.name, 80);
      const phone = clip(form.customer?.phone, 30);
      const email = clip(form.customer?.email, 120);
      if (!name) return fail('Add your name so the baker knows who the order is for.');
      if (!phone && !email) return fail('Add a phone number or email so the baker can reach you.');
      const date = clip(form.pickup_date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Pick a pickup date.');

      const [menu, options] = await Promise.all([
        db.MenuItem.filter({ bakery_id: bakery.id }),
        db.MenuOption.filter({ bakery_id: bakery.id }),
      ]);
      const { items, lines, spots } = priceItems(form.items, menu || [], options || []);
      if (items.length === 0) return fail('Choose at least one item.');

      const reason = checkDate({ bakery, orders, blocked: blocked || [], date, spots, today });
      if (reason === 'closed') return fail('This shop isn’t taking orders right now.');
      if (reason === 'too_soon') return fail(`This baker needs at least ${bakery.lead_days} days’ notice. Pick a later date.`);
      if (reason) return fail('That date just filled up. Pick another date.', 409);

      const photo_urls = [];
      const photos = Array.isArray(form.photos) ? form.photos.slice(0, MAX_PHOTOS) : [];
      for (let i = 0; i < photos.length; i++) {
        try {
          const url = await uploadPhoto(base44, photos[i], i);
          if (url) photo_urls.push(url);
        } catch (e) {
          console.error('Photo upload failed', e);
        }
      }

      const public_token = randomToken();
      const created = await db.Order.create({
        bakery_id: bakery.id,
        owner_id: bakery.created_by_id,
        status: 'requested',
        customer: { name, phone, email, instagram: clip(form.customer?.instagram, 60) },
        pickup_date: date,
        pickup_time: clip(form.pickup_time, 5),
        bake_date: addDays(date, -1),
        items,
        photo_urls,
        spots,
        quote_lines: lines,
        total_cents: lines.reduce((s, l) => s + l.cents, 0),
        public_token,
        source: 'link',
      });

      // The request is saved; a failed email must not fail the customer's submit.
      if (bakery.email_new_requests === false) {
        console.log('New-request email off for this shop', bakery.id);
      } else {
        try {
          const to = await bakerEmail(db, bakery);
          if (!to) {
            console.warn('New-request email skipped: no address found for the baker', bakery.created_by_id);
          } else {
            const origin = req.headers.get('origin') || '';
            const link = origin && created?.id ? `${origin}/orders/${created.id}` : '';
            await base44.asServiceRole.integrations.Core.SendEmail({
              to,
              from_name: 'Proofed',
              ...requestEmail({ bakery, customer: { name, phone, email }, date, time: clip(form.pickup_time, 5), items, photoCount: photo_urls.length, link }),
            });
            console.log('New-request email sent to', maskEmail(to));
          }
        } catch (e) {
          console.error('New-request email failed', e?.message || e, e?.response?.data || '');
        }
      }
      return Response.json({ token: public_token, photos_saved: photo_urls.length, photos_sent: photos.length });
    }

    if (action === 'order' || action === 'markSent') {
      const token = clip(body.token, 64);
      if (token.length < 16) return fail('This order link isn’t complete.', 404);
      const found = await db.Order.filter({ public_token: token });
      const order = found?.[0];
      if (!order) return fail('We couldn’t find this order. Ask the baker for a new link.', 404);
      const bakery = await db.Bakery.get(order.bakery_id);

      if (action === 'markSent') {
        if (effectiveStatus(order) !== 'quoted') return fail('This order isn’t waiting on a deposit.');
        await db.Order.update(order.id, { customer_says_paid: true });
        order.customer_says_paid = true;
      }
      const payments = await db.Payment.filter({ order_id: order.id });
      const paid = (payments || []).reduce((s, p) => s + (Number(p.cents) || 0), 0);
      return Response.json(publicOrder(order, bakery, paid));
    }

    return fail('Unknown action');
  } catch (error) {
    console.error(error);
    return fail('Something went wrong on our side. Try again in a minute.', 500);
  }
}
