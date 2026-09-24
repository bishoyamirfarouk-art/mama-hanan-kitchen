# v1.8.0 — Flutter Invoice Management Backend

Backend-only release. The customer-facing frontend was intentionally left unchanged.

## Added
- `discountType`, `discountValue`, `discountAmount` on Orders.
- Legacy `discount` retained as a compatibility mirror.
- Secure server-side invoice recalculation.
- Full invoice editing: `PUT /api/admin/orders/:id`.
- Invoice delete: `DELETE /api/admin/orders/:id`.
- Paginated/filterable invoice list: `GET /api/admin/invoices`.
- Invoice detail: `GET /api/admin/invoices/:id`.
- Enhanced filters on the existing `GET /api/orders` without changing its array response.
- Activity logs for invoice/items/discount/delivery-fee changes.
- Report metrics: subtotalRevenue, totalDiscounts, deliveryRevenue, netRevenue.
- Normalized discount fields in POS sync and backups.

## Compatibility
- Existing `POST /api/orders` website checkout is preserved and still validates catalog availability, variant, delivery area, and minimum order.
- Existing `PUT /api/orders/:id` status update remains compatible.
- Existing `DELETE /api/orders/:id` remains available and authenticated.
- Existing POS endpoints remain unchanged.
- No database reset or automatic destructive migration.
- Existing Orders keep `_id`, `orderNumber`, and `createdAt`.
