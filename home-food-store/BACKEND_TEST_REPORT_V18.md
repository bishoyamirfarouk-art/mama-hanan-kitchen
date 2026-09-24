# Backend Test Report — v1.8.0

## Completed in this build environment

- `node --check server/index.js` — PASS
- `node --check app.js` — PASS
- `node --check admin.js` — PASS
- Pure invoice logic tests — PASS (`LOGIC_TESTS_OK`)
  - fixed-value discount
  - percent discount
  - reject fixed discount above subtotal
  - reject percent above 100%
  - legacy `discount` compatibility
  - preserve historical price of an existing invoice line
  - derive current server price for a newly-added catalog item
  - recalculate lineTotal/subtotal/discount/total
  - allow zero items only for cancelled invoice
  - build date/search/status filters

## Not executable in this sandbox

Full integration tests against MongoDB/Cloudinary/Vercel were not run because this environment does not contain the project's npm dependencies or production secrets, and dependency installation could not complete here.

After deployment, run the checklist below against a test invoice before using in production:

1. Website `POST /api/orders`.
2. Admin login.
3. Edit invoice customer/notes.
4. Add current menu product and confirm server price wins.
5. Edit an old line and confirm historical unitPrice remains.
6. Delete one line.
7. Fixed discount.
8. Percentage discount.
9. Manual delivery fee.
10. Delete invoice.
11. Search by order number/name/phone.
12. Date filter.
13. `GET /api/orders?status=delivered`.
14. `GET /api/pos/sync`.
15. Backup then inspect new discount fields.
