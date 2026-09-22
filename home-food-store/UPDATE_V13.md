# v1.7.0 Performance Final

- Responsive LCP hero variants: 640/768/960/1280/1600 WebP.
- Explicit hero preload, high fetch priority and dimensions.
- Google Fonts stylesheet is loaded asynchronously and fewer weights are requested.
- Page-specific API loading; delivery areas are fetched only when checkout opens.
- Home below-fold API calls are deferred until browser idle time.
- Local food cards use 360/640px WebP derivatives automatically.
- Cloudinary images continue to use f_auto + q_auto:eco + requested width.
- Long immutable browser caching for static assets; release URLs are version-bumped.
- PWA icons were losslessly/visually optimized and a 180px Apple touch icon was added.
- content-visibility is enabled for below-fold sections and mobile header blur is disabled.
- Service worker cache bumped to v17.

No business functionality, Admin, reports, reviews, services, orders, MongoDB, Cloudinary or POS APIs were removed.
