import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';

// The app owner's view across every shop. Bakers' rows are locked to their
// owners, so this reads them with the service role, and only for users whose
// Base44 role is "admin".
//
// Body: {} for the overview, or { action: "setAccepting", bakery_id, accepting }.

const DAY_MS = 86_400_000;

function isExpiredQuote(o, now) {
  return o.status === 'quoted' && o.quote_expires_at && new Date(o.quote_expires_at) < now;
}

export function summarize({ bakeries, orders, payments, users }, now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const sinceDay = since.slice(0, 10);
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));
  const shopById = Object.fromEntries(bakeries.map((b) => [b.id, b]));

  const stats = {};
  for (const b of bakeries) {
    stats[b.id] = { orders_total: 0, orders_30d: 0, open_requests: 0, last_order_date: null, payments_30d_cents: 0 };
  }
  for (const o of orders) {
    const s = stats[o.bakery_id];
    if (!s) continue;
    s.orders_total += 1;
    if (o.created_date >= since) s.orders_30d += 1;
    if (o.status === 'requested') s.open_requests += 1;
    if (!s.last_order_date || o.created_date > s.last_order_date) s.last_order_date = o.created_date;
  }
  for (const p of payments) {
    const s = stats[p.bakery_id];
    if (s && (p.received_on || '') >= sinceDay) s.payments_30d_cents += Number(p.cents) || 0;
  }

  const shops = bakeries
    .map((b) => {
      const owner = usersById[b.created_by_id];
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        accepting_orders: b.accepting_orders !== false,
        created_date: b.created_date,
        owner_email: owner?.email || '',
        owner_name: owner?.full_name || '',
        ...stats[b.id],
      };
    })
    .sort((a, b) => (b.last_order_date || b.created_date || '').localeCompare(a.last_order_date || a.created_date || ''));

  const recent_orders = [...orders]
    .sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''))
    .slice(0, 25)
    .map((o) => ({
      id: o.id,
      bakery_name: shopById[o.bakery_id]?.name || 'Deleted shop',
      customer_name: o.customer?.name || '',
      pickup_date: o.pickup_date,
      status: isExpiredQuote(o, now) ? 'expired' : o.status,
      total_cents: o.status === 'requested' ? null : o.total_cents ?? null,
      created_date: o.created_date,
    }));

  return {
    totals: {
      shops: bakeries.length,
      active_shops_30d: shops.filter((s) => s.orders_30d > 0).length,
      bakers: new Set(bakeries.map((b) => b.created_by_id)).size,
      users: users.length,
      orders_30d: orders.filter((o) => o.created_date >= since).length,
      open_requests: orders.filter((o) => o.status === 'requested').length,
      payments_30d_cents: shops.reduce((sum, s) => sum + s.payments_30d_cents, 0),
    },
    shops,
    recent_orders,
    generated_at: now.toISOString(),
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'This page is only for the app’s admins.' }, { status: 403 });

    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));

    if (body.action === 'setAccepting') {
      const id = String(body.bakery_id || '');
      if (!id) return Response.json({ error: 'Missing shop.' }, { status: 400 });
      await db.Bakery.update(id, { accepting_orders: !!body.accepting });
      return Response.json({ ok: true });
    }

    const [bakeries, orders, payments, users] = await Promise.all([
      db.Bakery.list('-created_date', 1000),
      db.Order.list('-created_date', 5000),
      db.Payment.list('-created_date', 5000),
      db.User.list('-created_date', 1000),
    ]);
    return Response.json(summarize({
      bakeries: bakeries || [],
      orders: orders || [],
      payments: payments || [],
      users: users || [],
    }));
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Couldn’t load the admin overview. Try again in a minute.' }, { status: 500 });
  }
}
