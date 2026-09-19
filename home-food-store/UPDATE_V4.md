# Update v1.2

- Fixed Vercel `/menu` 404 using explicit rewrites instead of relying on cleanUrls.
- Added a visible floating WhatsApp button. It uses the order WhatsApp number when configured, otherwise the WhatsApp group link.
- Added a clear WhatsApp icon in the footer/social links.
- Added six temporary food photographs for grills, mahshi, tajin, chicken meals, feteer, and desserts.
- Existing MongoDB records are migrated only when they still use the original local SVG placeholder paths; Cloudinary/admin images are never overwritten.
- Bumped Service Worker cache to v5.
