# v1.5.0 — Product save + Customer Reviews Moderation

- Fixed product creation on Mongoose 9 by removing the obsolete `next()` callback from `pre('save')`.
- Unexpected admin API errors now return a short actionable server message to the admin instead of only a generic toast.
- Customers can submit reviews from the homepage.
- Customer reviews are always `pending` and hidden from the public until an admin approves them.
- Admin can approve, hide/reject, edit, or permanently delete any review.
- Existing admin-created/public reviews remain compatible.
- Added a lightweight honeypot field to reduce simple review spam.
- Updated cache/assets versions.
