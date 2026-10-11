# Proofed

Custom cake and cookie orders, without the DMs. Home bakers share one link in their Instagram bio; customers request through it; the baker quotes, books, bakes and gets paid from one phone app.

Built on Base44 (entities + one backend function) with a React/Vite front end.

## First-time setup

```bash
npm install
npm install -g base44@latest   # local dev also needs Deno: https://docs.deno.com
base44 login
base44 link        # choose "create new" to make the Proofed app in your Base44 account
base44 deploy      # pushes entities, the publicShop function and the site
```

Then open the app, sign in, and the setup screen creates your shop with a starter menu.

In the Base44 dashboard, make sure the app **doesn't require sign-in for every page**. Customers open `/b/<your-link>` and `/o/<order-token>` without an account; only the baker screens ask for one.

## Day to day

```bash
base44 dev      # local backend + frontend (data is in-memory and resets on restart)
npm test        # business rules
npm run lint
npm run build
```

## How it fits together

| Part | Where |
| --- | --- |
| Tables | `base44/entities/`: Bakery, MenuItem, MenuOption, Order, Payment, BlockedDate |
| Everything customers can do | `base44/functions/publicShop/entry.ts` (shop, availability, submit, order, markSent) |
| Capacity, dates, expiry rules | `src/lib/rules.js` (the function keeps a copy; `rules.test.js` checks they match) |
| Baker screens | `src/pages/`: Today, Requests, OrderDetail, Calendar, Earnings, Settings, Menu, Setup |
| Customer pages | `src/pages/public/`: ShopForm (`/b/:slug`), OrderStatus (`/o/:token`) |
| Admin page | `src/pages/Admin.jsx` (`/admin`) and `base44/functions/adminOverview/entry.ts`: every shop and order, for users with the Base44 **admin** role |

**Spots, not cakes.** Each menu size uses a number of spots (a 2-tier cake might be 2). The daily and weekly limits are in spots. Quoted, booked and ready orders use spots; new requests don't. A quote holds its spots until `quote_expires_at`, then counts as expired automatically.

**Money** is whole cents everywhere. Payments are recorded by the baker (Venmo, Zelle, Cash App, cash). Recording a deposit books the order.

## Check after the first deploy

These depend on Base44 behavior that couldn't be tested before the app existed:

- **Order access rule.** `Order.jsonc` limits rows to `data.owner_id == user.id`, because customers' orders are created by the function, not the baker. Confirm the baker sees new requests.
- **Photo uploads.** The function uploads customers' inspiration photos with the service role's `UploadFile`. If photos don't appear on requests, check `base44 logs`.
