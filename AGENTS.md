# AGENTS.md

Proofed is a Base44 app: an order book for custom-order home bakers. Read `README.md` first.

- Customers never read entities directly; everything public goes through `base44/functions/publicShop/entry.ts`.
- Business rules live in `src/lib/rules.js`. The function carries a copy; change both and keep `src/lib/rules.test.js` passing.
- Money is integer cents. Dates are `YYYY-MM-DD` strings in the bakery's time zone.
- Before finishing: `npm run lint`, `npm test`, `npm run build`.
