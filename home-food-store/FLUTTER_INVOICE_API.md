# Mama Hanan — Flutter Invoice API (v1.8.0)

Base URL (production):

`https://mama-hanan-kitchen.vercel.app`

All invoice management endpoints under `/api/admin/...` require the existing Admin JWT:

`Authorization: Bearer <JWT_TOKEN>`

Get the token using the existing endpoint:

## POST /api/auth/login

Request:

```json
{
  "username": "admin",
  "password": "YOUR_ADMIN_PASSWORD"
}
```

Response:

```json
{
  "token": "...",
  "user": {
    "username": "admin",
    "role": "owner",
    "permissions": ["all"]
  }
}
```

---

## Discount fields

Every Order now supports:

```json
{
  "discountType": "none",
  "discountValue": 0,
  "discountAmount": 0
}
```

Allowed `discountType` values:

- `none`
- `value`
- `percent`

The old `discount` field is retained as a compatibility mirror of `discountAmount` for old clients.

Server calculation:

```text
subtotal = sum(unitPrice × quantity)
discountAmount = fixed value OR subtotal × percent / 100
total = subtotal - discountAmount + deliveryFee
```

The server rejects a fixed discount larger than the subtotal and a percent greater than 100.

---

## GET /api/orders

Backward-compatible endpoint. Returns an ARRAY, newest first.

Optional filters:

```text
status
date=2026-09-24
from=2026-09-01
to=2026-09-24
search=MH-1234
q=Ahmed
customer=Ahmed
orderNumber=MH-1234
limit=250
page=1
```

Examples:

`GET /api/orders?status=delivered`

`GET /api/orders?date=2026-09-24`

`GET /api/orders?search=010`

Response item:

```json
{
  "_id": "...",
  "orderNumber": "MH-12345678-12",
  "customerName": "Ahmed",
  "customerPhone": "01000000000",
  "customerAddress": "Cairo",
  "area": "Nasr City",
  "fulfillment": "delivery",
  "items": [
    {
      "productId": "...",
      "title": "وجبة فراخ بيتي",
      "selectedVariant": "فرد",
      "unitPrice": 145,
      "quantity": 2,
      "lineTotal": 290,
      "notes": "بدون شطة"
    }
  ],
  "subtotal": 290,
  "discountType": "percent",
  "discountValue": 10,
  "discountAmount": 29,
  "discount": 29,
  "deliveryFee": 30,
  "total": 291,
  "notes": "اتصل قبل الوصول",
  "status": "delivered",
  "createdAt": "2026-09-24T10:00:00.000Z",
  "updatedAt": "2026-09-24T11:00:00.000Z"
}
```

---

## GET /api/admin/invoices

Preferred list endpoint for Flutter invoice management.

Filters:

```text
date
from
to
search
status
customer
orderNumber
limit
page
```

Example:

`GET /api/admin/invoices?status=delivered&from=2026-09-01&to=2026-09-24&page=1&limit=100`

Response:

```json
{
  "page": 1,
  "limit": 100,
  "total": 27,
  "pages": 1,
  "rows": []
}
```

---

## GET /api/admin/invoices/:id

Returns one full invoice with normalized discount fields.

---

## PUT /api/admin/orders/:id

Preferred endpoint for editing an existing invoice.

Request example:

```json
{
  "customerName": "Ahmed",
  "customerPhone": "01000000000",
  "customerAddress": "Cairo",
  "area": "Nasr City",
  "fulfillment": "delivery",
  "items": [
    {
      "productId": "PRODUCT_OBJECT_ID",
      "title": "وجبة فراخ بيتي",
      "selectedVariant": "فرد",
      "unitPrice": 145,
      "quantity": 2,
      "notes": "بدون شطة"
    }
  ],
  "notes": "اتصل قبل الوصول",
  "deliveryFee": 30,
  "discountType": "percent",
  "discountValue": 10,
  "status": "delivered"
}
```

Important behavior:

- `subtotal`, `lineTotal`, `discountAmount`, and `total` from Flutter are ignored.
- Existing invoice lines keep their historical `unitPrice`.
- New product lines use the current server-side Product/Variant price.
- Existing lines remain editable even if the Product is now hidden, unavailable, or deleted from the catalog.
- Removing an item from `items` removes it from the invoice.
- An invoice cannot be saved with zero items unless its status is `cancelled`.
- `createdAt` is never changed by invoice editing.
- `updatedAt` is refreshed automatically.

Successful response: the complete updated Order document.

---

## PUT /api/orders/:id

Kept for backward compatibility.

If only `status` is sent, it behaves exactly as the old endpoint:

```json
{
  "status": "delivered"
}
```

Older clients that already send full invoice fields are still accepted and use the same secure server-side recalculation logic.

---

## DELETE /api/admin/orders/:id

Preferred invoice deletion endpoint.

Response:

```json
{
  "ok": true,
  "orderNumber": "MH-12345678-12"
}
```

The old authenticated route `DELETE /api/orders/:id` is also retained for compatibility.

---

## POST /api/orders

Public website checkout remains compatible with the current website.

It still validates:

- Product ObjectId
- `isHidden = false`
- `isAvailable = true`
- Variant
- Delivery area
- Minimum order

Client discount values are ignored for public website checkout. New website orders start with:

```json
{
  "discountType": "none",
  "discountValue": 0,
  "discountAmount": 0
}
```

---

## GET /api/pos/sync

Existing POS sync endpoint is unchanged and continues to use:

`x-pos-key: <POS_API_KEY>`

or:

`Authorization: Bearer <POS_API_KEY>`

Example:

`GET /api/pos/sync?since=2026-09-24T00:00:00.000Z`

The returned Orders now always include normalized discount fields while keeping the same `_id` and `orderNumber`.

---

## PATCH /api/pos/orders/:id/status

Existing POS status endpoint is unchanged.

Request:

```json
{
  "status": "delivered"
}
```

---

## Reports

### GET /api/reports/summary

New revenue fields in `metrics`:

```json
{
  "subtotalRevenue": 10000,
  "totalDiscounts": 500,
  "deliveryRevenue": 700,
  "netRevenue": 10200,
  "revenue": 10200
}
```

`revenue` remains as a compatibility alias for `netRevenue`.
Cancelled invoices are excluded from revenue calculations.

### GET /api/reports/full

`summary` now includes:

```json
{
  "subtotalRevenue": 10000,
  "totalDiscounts": 500,
  "deliveryRevenue": 700,
  "netRevenue": 10200,
  "revenue": 10200,
  "subtotal": 10000,
  "deliveryFees": 700
}
```

The legacy names remain for the current Admin UI.

---

## ActivityLog

Invoice editing can record:

- `invoice_update`
- `invoice_delete`
- `invoice_discount_update`
- `invoice_items_update`
- `invoice_delivery_fee_update`
- existing `order_status`

The `orderNumber` is stored in details and the authenticated username is stored in `user`.

---

## Backup / Restore

Backup format version is now `6`.

The Order array in `/api/backup` is normalized so old invoices also export explicit discount fields.
No automatic destructive migration, collection drop, or Order reset is performed.
