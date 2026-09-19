(() => {
  'use strict';

  const CFG = window.FOOD_STORE_CONFIG || { apiBase: '/api', storagePrefix: 'home_food_store_v1', currency: 'ج.م', enableDemoFallback: true };
  const API = CFG.apiBase || '/api';
  const storageKey = `${CFG.storagePrefix || 'home_food_store_v1'}_cart`;

  const demo = {
    settings: {
      storeName: 'بيت ومشويات', tagline: 'طعم البيت... معمول بحب', heroTitle: 'طعم البيت... معمول بحب ❤️',
      heroSubtitle: 'أكل بيتي طازة يوميًا، مشويات، محاشي، طواجن وعزومات تتعمل مخصوص ليك.',
      heroImage: '/assets/food/meal.svg', storeLogo: '/assets/food/logo.svg', whatsappNumber: '', phoneNumber: '', address: 'العنوان يضاف من لوحة التحكم', openingHours: 'مواعيد العمل تضاف من لوحة التحكم', currency: 'ج.م', deliveryFee: 0, deliveryEnabled: true, pickupEnabled: true
    },
    categories: [
      { _id:'c1', name:'مشويات', slug:'grills', image:'/assets/food/grill.svg' },
      { _id:'c2', name:'محاشي', slug:'mahshi', image:'/assets/food/mahshi.svg' },
      { _id:'c3', name:'طواجن', slug:'tajin', image:'/assets/food/tajin.svg' },
      { _id:'c4', name:'أكل بيتي', slug:'home-food', image:'/assets/food/home.svg' },
      { _id:'c5', name:'مخبوزات', slug:'bakery', image:'/assets/food/bakery.svg' },
      { _id:'c6', name:'حلويات', slug:'dessert', image:'/assets/food/dessert.svg' }
    ],
    products: [
      { _id:'p1', title:'مشويات مشكلة', category:'مشويات', shortDescription:'تشكيلة مشويات بطعم الفحم مع إضافات البيت.', mainImage:'/assets/food/grill.svg', price:220, oldPrice:250, offerLabel:'عرض اليوم', variants:[{name:'نصف كيلو',price:220},{name:'كيلو',price:420}], availableToday:true, featured:true, isAvailable:true, preparationTime:'45-60 دقيقة', serves:'2-4 أفراد' },
      { _id:'p2', title:'محشي مشكل', category:'محاشي', shortDescription:'ورق عنب وكوسة وفلفل بخلطة بيتي مميزة.', mainImage:'/assets/food/mahshi.svg', price:160, variants:[{name:'نصف كيلو',price:160},{name:'كيلو',price:300}], availableToday:true, featured:true, isAvailable:true, preparationTime:'60 دقيقة', serves:'2-3 أفراد' },
      { _id:'p3', title:'طاجن لحمة بالخضار', category:'طواجن', shortDescription:'طاجن ساخن بصوص غني وخضار طازة.', mainImage:'/assets/food/tajin.svg', price:180, variants:[{name:'فرد',price:180},{name:'صينية كبيرة',price:520}], availableToday:true, featured:true, isAvailable:true, preparationTime:'50 دقيقة', serves:'1-4 أفراد' },
      { _id:'p4', title:'وجبة فراخ بيتي', category:'أكل بيتي', shortDescription:'وجبة كاملة بفراخ وتتبيلة البيت وإضافات اليوم.', mainImage:'/assets/food/home.svg', price:145, variants:[{name:'فرد',price:145},{name:'وجبة عائلية',price:480}], availableToday:true, featured:true, isAvailable:true, preparationTime:'35-45 دقيقة', serves:'1-4 أفراد' },
      { _id:'p5', title:'فطير بيتي', category:'مخبوزات', shortDescription:'فطير طازة مناسب للفطار أو العزومات.', mainImage:'/assets/food/bakery.svg', price:120, variants:[{name:'قطعة',price:120}], availableToday:true, featured:false, isAvailable:true, preparationTime:'30 دقيقة', serves:'2 أفراد' },
      { _id:'p6', title:'حلو اليوم', category:'حلويات', shortDescription:'اختيار يومي من الحلويات البيتي.', mainImage:'/assets/food/dessert.svg', price:90, variants:[{name:'علبة',price:90},{name:'علبة كبيرة',price:160}], availableToday:true, featured:false, isAvailable:true, preparationTime:'حسب المتاح', serves:'' }
    ],
    gallery: [
      { _id:'g1', image:'/assets/food/gallery1.svg', title:'سفرة اليوم', category:'أكل بيتي' },
      { _id:'g2', image:'/assets/food/grill.svg', title:'مشويات', category:'مشويات' },
      { _id:'g3', image:'/assets/food/mahshi.svg', title:'محاشي', category:'محاشي' },
      { _id:'g4', image:'/assets/food/tajin.svg', title:'طواجن', category:'طواجن' },
      { _id:'g5', image:'/assets/food/gallery2.svg', title:'عزومات', category:'عزومات' },
      { _id:'g6', image:'/assets/food/dessert.svg', title:'حلويات', category:'حلويات' }
    ],
    reviews: [
      { _id:'r1', name:'عميلة المتجر', text:'الأكل وصل مرتب وساخن والطعم بيتي فعلًا.', rating:5 },
      { _id:'r2', name:'طلب عزومة', text:'الكميات كانت مناسبة والتجهيز منظم جدًا.', rating:5 },
      { _id:'r3', name:'عميل متكرر', text:'أحلى حاجة سهولة الطلب وتغيير منيو اليوم.', rating:5 }
    ]
  };

  const state = { settings: demo.settings, categories: [], products: [], gallery: [], reviews: [], cart: loadCart(), lightboxIndex: 0, galleryVisible: [] };

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (_) { return []; }
  }
  function saveCart() { localStorage.setItem(storageKey, JSON.stringify(state.cart)); updateCartCount(); renderCart(); }
  function money(v) { return `${Number(v || 0).toLocaleString('ar-EG')} ${state.settings.currency || CFG.currency || 'ج.م'}`; }
  function qs(s, el=document){ return el.querySelector(s); }
  function qsa(s, el=document){ return [...el.querySelectorAll(s)]; }
  function esc(v='') { const d=document.createElement('div'); d.textContent=String(v); return d.innerHTML; }

  async function fetchJson(url, options={}) {
    const res = await fetch(url, { headers:{ 'Content-Type':'application/json', ...(options.headers||{}) }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  async function safeApi(path, fallback) {
    try { return await fetchJson(`${API}${path}`); }
    catch (err) { console.info(`Using preview fallback for ${path}:`, err.message); return CFG.enableDemoFallback === false ? [] : fallback; }
  }

  function toast(message, type='success') {
    const wrap = qs('#toastWrap'); if (!wrap) return;
    const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = message; wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function setupSharedUI() {
    const host = qs('#sharedUI'); if (!host) return;
    host.innerHTML = `
      <div class="drawer-backdrop" id="drawerBackdrop"></div>
      <aside class="cart-drawer" id="cartDrawer" aria-label="سلة الطلب">
        <div class="drawer-head"><h3>طلبك</h3><button class="close-btn" data-cart-close>✕</button></div>
        <div class="drawer-body" id="cartItems"></div>
        <div class="drawer-foot"><div class="total-row"><strong>الإجمالي المبدئي</strong><strong id="cartSubtotal">0</strong></div><button class="btn btn-primary btn-block" id="checkoutBtn">تأكيد بيانات الطلب</button></div>
      </aside>
      <div class="modal" id="productModal"><div class="modal-card"><div class="modal-head"><h3>تفاصيل الوجبة</h3><button class="close-btn" data-modal-close="productModal">✕</button></div><div class="modal-body" id="productModalBody"></div></div></div>
      <div class="modal" id="checkoutModal"><div class="modal-card"><div class="modal-head"><h3>تأكيد الطلب</h3><button class="close-btn" data-modal-close="checkoutModal">✕</button></div><div class="modal-body">
        <form id="checkoutForm" class="form-grid">
          <div class="form-group"><label>الاسم *</label><input class="input" name="customerName" required></div>
          <div class="form-group"><label>رقم الهاتف *</label><input class="input" name="customerPhone" inputmode="tel" required></div>
          <div class="form-group"><label>طريقة الاستلام</label><select class="select" name="fulfillment" id="fulfillmentSelect"><option value="delivery">توصيل</option><option value="pickup">استلام من المكان</option></select></div>
          <div class="form-group"><label>المنطقة</label><input class="input" name="area"></div>
          <div class="form-group" id="addressField" style="grid-column:1/-1"><label>العنوان</label><input class="input" name="customerAddress"></div>
          <div class="form-group" style="grid-column:1/-1"><label>ملاحظات</label><textarea class="input" name="notes" placeholder="أي تفاصيل مهمة للطلب..."></textarea></div>
          <div style="grid-column:1/-1;background:var(--surface-2);border-radius:14px;padding:14px" id="checkoutSummary"></div>
          <button class="btn btn-primary" style="grid-column:1/-1" type="submit">تسجيل الطلب وفتحه على واتساب</button>
        </form>
      </div></div></div>
      <div class="modal" id="lightboxModal"><div class="lightbox-card"><button class="close-btn lb-close" data-modal-close="lightboxModal">✕</button><button class="lb-btn lb-prev" id="lbPrev">›</button><img id="lbImage" alt="صورة من المعرض"><button class="lb-btn lb-next" id="lbNext">‹</button></div></div>`;

    qsa('[data-cart-open]').forEach(b => b.addEventListener('click', openCart));
    qs('[data-cart-close]')?.addEventListener('click', closeCart);
    qs('#drawerBackdrop')?.addEventListener('click', closeCart);
    qsa('[data-modal-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.modalClose)));
    qsa('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));
    qs('#checkoutBtn')?.addEventListener('click', openCheckout);
    qs('#checkoutForm')?.addEventListener('submit', submitOrder);
    qs('#fulfillmentSelect')?.addEventListener('change', toggleAddress);
    qs('#lbPrev')?.addEventListener('click', () => moveLightbox(-1));
    qs('#lbNext')?.addEventListener('click', () => moveLightbox(1));
    let touchX=0; qs('#lightboxModal')?.addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX},{passive:true}); qs('#lightboxModal')?.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>45)moveLightbox(dx>0?-1:1)},{passive:true});
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') qsa('.modal.show').forEach(m => closeModal(m.id));
      if (qs('#lightboxModal.show')) { if (e.key === 'ArrowLeft') moveLightbox(1); if (e.key === 'ArrowRight') moveLightbox(-1); }
    });
    renderCart();
  }

  function openCart(){ qs('#cartDrawer')?.classList.add('show'); qs('#drawerBackdrop')?.classList.add('show'); }
  function closeCart(){ qs('#cartDrawer')?.classList.remove('show'); qs('#drawerBackdrop')?.classList.remove('show'); }
  function openModal(id){ qs(`#${id}`)?.classList.add('show'); document.body.classList.add('modal-open'); }
  function closeModal(id){ qs(`#${id}`)?.classList.remove('show'); if (!qsa('.modal.show').length) document.body.classList.remove('modal-open'); }

  function updateCartCount() {
    const count = state.cart.reduce((s,i)=>s+Number(i.quantity||0),0);
    qsa('[data-cart-count]').forEach(el => el.textContent = count);
  }

  function renderCart() {
    const host = qs('#cartItems'); if (!host) return;
    if (!state.cart.length) {
      host.innerHTML = '<div class="empty"><div style="font-size:3rem">🛒</div><p>طلبك فاضي حاليًا.</p><a class="btn btn-ghost" href="/menu">تصفح المنيو</a></div>';
    } else {
      host.innerHTML = state.cart.map((item,idx)=>`
        <div class="cart-item">
          <img src="${esc(item.image)}" alt="${esc(item.title)}">
          <div><h4>${esc(item.title)}</h4><div class="muted" style="font-size:.75rem">${esc(item.selectedVariant || '')}</div><div class="qty"><button data-qty-dec="${idx}">−</button><b>${item.quantity}</b><button data-qty-inc="${idx}">+</button></div></div>
          <div style="text-align:left"><strong>${money(item.unitPrice*item.quantity)}</strong><button class="btn btn-sm btn-ghost" data-remove="${idx}" style="display:block;margin-top:8px">حذف</button></div>
        </div>`).join('');
      qsa('[data-qty-dec]',host).forEach(b=>b.onclick=()=>changeQty(Number(b.dataset.qtyDec),-1));
      qsa('[data-qty-inc]',host).forEach(b=>b.onclick=()=>changeQty(Number(b.dataset.qtyInc),1));
      qsa('[data-remove]',host).forEach(b=>b.onclick=()=>{state.cart.splice(Number(b.dataset.remove),1);saveCart();});
    }
    const subtotal = state.cart.reduce((s,i)=>s+i.unitPrice*i.quantity,0);
    if (qs('#cartSubtotal')) qs('#cartSubtotal').textContent = money(subtotal);
    updateCartCount();
  }
  function changeQty(i, delta) { if (!state.cart[i]) return; state.cart[i].quantity = Math.max(1,state.cart[i].quantity+delta); saveCart(); }

  function addToCart(product, variantName) {
    if (!product.isAvailable) return toast('الوجبة غير متاحة حاليًا','error');
    const variant = (product.variants||[]).find(v=>v.name===variantName) || (product.variants||[])[0];
    const unitPrice = Number(variant?.price ?? product.price ?? 0);
    const selectedVariant = variant?.name || '';
    const found = state.cart.find(i=>String(i.productId)===String(product._id) && i.selectedVariant===selectedVariant);
    if (found) found.quantity += 1;
    else state.cart.push({ productId:product._id,title:product.title,image:product.mainImage,selectedVariant,unitPrice,quantity:1 });
    saveCart(); toast('اتضاف للطلب');
    track('cart_add', product.title);
  }

  function productCard(p) {
    const variants = p.variants || [];
    const minPrice = variants.length ? Math.min(...variants.map(v=>Number(v.price))) : Number(p.price||0);
    const select = variants.length > 1 ? `<select class="select" data-variant-for="${esc(p._id)}">${variants.map(v=>`<option value="${esc(v.name)}">${esc(v.name)} — ${money(v.price)}</option>`).join('')}</select>` : variants.length===1 ? `<div class="muted" style="font-size:.8rem">${esc(variants[0].name)}</div>` : '';
    return `<article class="product-card reveal">
      <div class="product-image"><img loading="lazy" src="${esc(p.mainImage||'/assets/food/meal.svg')}" alt="${esc(p.title)}">${p.offerLabel?`<span class="badge">${esc(p.offerLabel)}</span>`:''}${p.availableToday?'<span class="badge badge-left">متاح اليوم</span>':''}</div>
      <div class="product-body"><h3>${esc(p.title)}</h3><div class="product-desc">${esc(p.shortDescription||'')}</div><div class="price-row"><span class="price">${variants.length>1?'يبدأ من ':''}${money(minPrice)}</span>${p.oldPrice?`<span class="old-price">${money(p.oldPrice)}</span>`:''}</div>${select}<div class="product-meta">${p.preparationTime?`<span>⏱️ ${esc(p.preparationTime)}</span>`:''}${p.serves?`<span>👥 ${esc(p.serves)}</span>`:''}</div><div class="product-actions"><button class="btn btn-primary" data-add="${esc(p._id)}" ${!p.isAvailable?'disabled':''}>${p.isAvailable?'أضف للطلب':'غير متاح'}</button><button class="btn btn-ghost" data-details="${esc(p._id)}">التفاصيل</button></div></div>
    </article>`;
  }
  function bindProductCards(host) {
    qsa('[data-add]',host).forEach(btn => btn.onclick = () => {
      const p = state.products.find(x=>String(x._id)===btn.dataset.add); if (!p) return;
      const select = qs(`[data-variant-for="${CSS.escape(String(p._id))}"]`, host);
      addToCart(p, select?.value || p.variants?.[0]?.name || '');
    });
    qsa('[data-details]',host).forEach(btn => btn.onclick=()=>openProduct(btn.dataset.details));
    observeReveal();
  }
  function openProduct(id) {
    const p = state.products.find(x=>String(x._id)===String(id)); if (!p) return;
    track('product_view', p.title);
    const variants=(p.variants||[]);
    qs('#productModalBody').innerHTML = `<div class="product-modal-grid"><img src="${esc(p.mainImage)}" alt="${esc(p.title)}"><div><span class="eyebrow">${esc(p.category)}</span><h2>${esc(p.title)}</h2><p class="muted">${esc(p.description||p.shortDescription||'')}</p>${variants.length?`<div class="form-group"><label>اختر الحجم</label><select class="select" id="modalVariant">${variants.map(v=>`<option value="${esc(v.name)}">${esc(v.name)} — ${money(v.price)}</option>`).join('')}</select></div>`:`<div class="price" style="margin:14px 0">${money(p.price)}</div>`}<div class="product-meta" style="margin:14px 0">${p.preparationTime?`<span>⏱️ ${esc(p.preparationTime)}</span>`:''}${p.serves?`<span>👥 ${esc(p.serves)}</span>`:''}</div><button class="btn btn-primary btn-block" id="modalAdd" ${!p.isAvailable?'disabled':''}>${p.isAvailable?'أضف للطلب':'غير متاح حاليًا'}</button></div></div>`;
    qs('#modalAdd')?.addEventListener('click',()=>{addToCart(p,qs('#modalVariant')?.value||variants[0]?.name||'');closeModal('productModal');});
    openModal('productModal');
  }

  function openCheckout() {
    if (!state.cart.length) return toast('أضف وجبة واحدة على الأقل','error');
    closeCart(); renderCheckoutSummary(); toggleAddress(); openModal('checkoutModal'); track('order_start');
  }
  function toggleAddress() {
    const delivery = qs('#fulfillmentSelect')?.value !== 'pickup';
    if (qs('#addressField')) qs('#addressField').style.display = delivery ? 'grid' : 'none';
  }
  function renderCheckoutSummary() {
    const subtotal=state.cart.reduce((s,i)=>s+i.unitPrice*i.quantity,0);
    qs('#checkoutSummary').innerHTML = `<div class="total-row"><span>الأصناف</span><b>${money(subtotal)}</b></div><div class="muted" style="font-size:.8rem">رسوم التوصيل تُحسب من إعدادات المتجر عند تسجيل الطلب.</div>`;
  }
  function buildWhatsappMessage(order, form) {
    const lines = state.cart.map(i=>`${i.quantity} × ${i.title}${i.selectedVariant?` - ${i.selectedVariant}`:''} = ${money(i.unitPrice*i.quantity)}`);
    return `طلب جديد - ${state.settings.storeName}\n\nرقم الطلب: ${order.orderNumber}\nالعميل: ${form.customerName}\nالهاتف: ${form.customerPhone}\n\n${lines.join('\n')}\n\nالإجمالي النهائي: ${money(order.total)}\nطريقة الاستلام: ${form.fulfillment==='pickup'?'استلام':'توصيل'}${form.customerAddress?`\nالعنوان: ${form.customerAddress}`:''}${form.area?`\nالمنطقة: ${form.area}`:''}${form.notes?`\nملاحظات: ${form.notes}`:''}`;
  }
  async function submitOrder(e) {
    e.preventDefault();
    const btn=e.submitter; if(btn){btn.disabled=true;btn.textContent='جاري تسجيل الطلب...';}
    const data=Object.fromEntries(new FormData(e.currentTarget).entries());
    data.items=state.cart.map(i=>({productId:i.productId,selectedVariant:i.selectedVariant,quantity:i.quantity,notes:''}));
    try {
      const order=await fetchJson(`${API}/orders`,{method:'POST',body:JSON.stringify(data)});
      const message=buildWhatsappMessage(order,data);
      const phone=String(order.whatsappNumber||state.settings.whatsappNumber||'').replace(/\D/g,'');
      state.cart=[]; saveCart(); closeModal('checkoutModal'); toast(`تم تسجيل الطلب ${order.orderNumber}`);
      if(phone){ track('whatsapp_open'); window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank','noopener'); }
      else { navigator.clipboard?.writeText(message); toast('الطلب اتسجل. أضف رقم واتساب من لوحة التحكم.'); }
    } catch(err) { toast(err.message || 'تعذر تسجيل الطلب','error'); }
    finally { if(btn){btn.disabled=false;btn.textContent='تسجيل الطلب وفتحه على واتساب';} }
  }

  function galleryCard(item, index) { return `<figure class="gallery-item reveal" data-gallery-index="${index}"><img loading="lazy" src="${esc(item.image)}" alt="${esc(item.title||'صورة وجبة')}"><figcaption class="gallery-caption">${esc(item.title||item.category||'')}</figcaption></figure>`; }
  function bindGallery(host, items) {
    state.galleryVisible = items;
    qsa('[data-gallery-index]',host).forEach(el => el.onclick=()=>openLightbox(Number(el.dataset.galleryIndex)));
    observeReveal();
  }
  function openLightbox(index){ state.lightboxIndex=index; updateLightbox(); openModal('lightboxModal'); }
  function updateLightbox(){ const item=state.galleryVisible[state.lightboxIndex]; if(item) qs('#lbImage').src=item.image; }
  function moveLightbox(delta){ if(!state.galleryVisible.length)return; state.lightboxIndex=(state.lightboxIndex+delta+state.galleryVisible.length)%state.galleryVisible.length;updateLightbox(); }

  function applySettings() {
    const s=state.settings;
    qsa('[data-store-name]').forEach(el=>el.textContent=s.storeName||CFG.fallbackStoreName||'بيت ومشويات');
    qsa('[data-store-logo]').forEach(el=>el.src=s.storeLogo||'/assets/food/logo.svg');
    qsa('[data-tagline]').forEach(el=>el.textContent=s.tagline||'طعم البيت... معمول بحب');
    qsa('[data-address]').forEach(el=>el.textContent=s.address||'العنوان يضاف من لوحة التحكم');
    qsa('[data-phone]').forEach(el=>el.textContent=s.phoneNumber||'رقم الهاتف يضاف من لوحة التحكم');
    qsa('[data-hours]').forEach(el=>el.textContent=s.openingHours||'مواعيد العمل تضاف من لوحة التحكم');
    qsa('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
    if(qs('[data-hero-title]')) qs('[data-hero-title]').innerHTML=esc(s.heroTitle||'طعم البيت... معمول بحب ❤️');
    if(qs('[data-hero-subtitle]')) qs('[data-hero-subtitle]').textContent=s.heroSubtitle||'';
    if(qs('[data-hero-bg]') && s.heroImage) qs('[data-hero-bg]').style.backgroundImage=`linear-gradient(90deg,rgba(23,19,17,.98) 12%,rgba(23,19,17,.83) 48%,rgba(23,19,17,.36) 100%),url("${s.heroImage.replace(/"/g,'')}")`;
    const phone=String(s.whatsappNumber||'').replace(/\D/g,'');
    qsa('[data-whatsapp-link]').forEach(a=>{a.href=phone?`https://wa.me/${phone}`:'#';a.target=phone?'_blank':'_self';if(!phone)a.onclick=(e)=>{e.preventDefault();toast('رقم واتساب لسه ما اتضافش من لوحة التحكم','error');};});
    const socials=qs('#socialLinks'); if(socials){ socials.innerHTML=[['f',s.facebookUrl],['◎',s.instagramUrl],['♪',s.tiktokUrl]].filter(x=>x[1]).map(x=>`<a href="${esc(x[1])}" target="_blank" rel="noopener">${x[0]}</a>`).join(''); }
    document.title=document.title.replace('بيت ومشويات',s.storeName||'بيت ومشويات');
    let ld=qs('#storeStructuredData'); if(!ld){ld=document.createElement('script');ld.id='storeStructuredData';ld.type='application/ld+json';document.head.appendChild(ld);} ld.textContent=JSON.stringify({'@context':'https://schema.org','@type':'FoodEstablishment',name:s.storeName||'بيت ومشويات',telephone:s.phoneNumber||undefined,address:s.address||undefined,openingHours:s.openingHours||undefined,url:location.origin,image:s.heroImage?new URL(s.heroImage,location.origin).href:undefined});
  }

  function renderHome() {
    const catHost=qs('#homeCategories');
    if(catHost) catHost.innerHTML=state.categories.slice(0,8).map(c=>`<a class="category-card reveal" href="/menu?category=${encodeURIComponent(c.name)}"><img loading="lazy" src="${esc(c.image||'/assets/food/meal.svg')}" alt="${esc(c.name)}"><div class="category-content"><h3>${esc(c.name)}</h3><span>شوف الأصناف ←</span></div></a>`).join('');
    const feat=state.products.filter(p=>p.featured&&p.availableToday&&!p.isHidden).slice(0,8);
    const pHost=qs('#featuredProducts'); if(pHost){pHost.innerHTML=(feat.length?feat:state.products.slice(0,4)).map(productCard).join('');bindProductCards(pHost);}
    const gHost=qs('#homeGallery'); if(gHost){const items=state.gallery.slice(0,8);gHost.innerHTML=items.map((g,i)=>galleryCard(g,i)).join('');bindGallery(gHost,items);}
    const rHost=qs('#reviewsGrid'); if(rHost){const reviews=state.reviews.length?state.reviews:demo.reviews;rHost.innerHTML=reviews.slice(0,6).map(r=>`<article class="review-card reveal"><div class="stars">${'★'.repeat(Number(r.rating||5))}</div><p>“${esc(r.text)}”</p><div class="review-author">${esc(r.name)}</div></article>`).join('');}
    observeReveal();
  }

  function renderMenu() {
    const filterHost=qs('#menuFilters'); if(!filterHost)return;
    let current=new URLSearchParams(location.search).get('category')||'الكل';
    const categories=['الكل',...new Set(state.categories.map(c=>c.name))];
    filterHost.innerHTML=categories.map(c=>`<button class="filter-btn ${c===current?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    const draw=()=>{
      let list=[...state.products].filter(p=>!p.isHidden);
      const q=(qs('#menuSearch')?.value||'').trim().toLowerCase(); const sort=qs('#menuSort')?.value||'default';
      if(current!=='الكل')list=list.filter(p=>p.category===current);
      if(q)list=list.filter(p=>`${p.title} ${p.shortDescription||''}`.toLowerCase().includes(q));
      if(sort==='priceAsc')list.sort((a,b)=>Number(a.price)-Number(b.price));if(sort==='priceDesc')list.sort((a,b)=>Number(b.price)-Number(a.price));if(sort==='name')list.sort((a,b)=>a.title.localeCompare(b.title,'ar'));
      const host=qs('#menuProducts');host.innerHTML=list.length?list.map(productCard).join(''):'<div class="empty" style="grid-column:1/-1">مفيش أصناف مطابقة للبحث.</div>';bindProductCards(host);
    };
    qsa('[data-cat]',filterHost).forEach(b=>b.onclick=()=>{current=b.dataset.cat;qsa('[data-cat]',filterHost).forEach(x=>x.classList.toggle('active',x===b));draw();});
    qs('#menuSearch')?.addEventListener('input',draw);qs('#menuSort')?.addEventListener('change',draw);draw();
  }

  function renderGalleryPage() {
    const host=qs('#galleryGrid'),filters=qs('#galleryFilters');if(!host||!filters)return;
    let current='الكل'; const cats=['الكل',...new Set(state.gallery.map(g=>g.category).filter(Boolean))];
    filters.innerHTML=cats.map(c=>`<button class="filter-btn ${c==='الكل'?'active':''}" data-gcat="${esc(c)}">${esc(c)}</button>`).join('');
    const draw=()=>{const list=current==='الكل'?state.gallery:state.gallery.filter(g=>g.category===current);host.innerHTML=list.length?list.map((g,i)=>galleryCard(g,i)).join(''):'<div class="empty">لا توجد صور في القسم.</div>';bindGallery(host,list);};
    qsa('[data-gcat]',filters).forEach(b=>b.onclick=()=>{current=b.dataset.gcat;qsa('[data-gcat]',filters).forEach(x=>x.classList.toggle('active',x===b));draw();});draw();
  }

  function observeReveal() {
    const els=qsa('.reveal:not(.visible)'); if(!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('visible'));return;}
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target);}}),{threshold:.08});els.forEach(e=>io.observe(e));
  }
  function setupNav(){qs('#menuToggle')?.addEventListener('click',()=>qs('#mainNav')?.classList.toggle('show'));}
  function track(type,key=''){fetch(`${API}/analytics/track`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,key})}).catch(()=>{});}
  function setupPwa(){if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}

  async function init() {
    setupSharedUI(); setupNav(); setupPwa(); updateCartCount();
    const [settings,categories,products,gallery,reviews]=await Promise.all([
      safeApi('/settings',demo.settings),safeApi('/categories',demo.categories),safeApi('/products',demo.products),safeApi('/gallery',demo.gallery),safeApi('/reviews',demo.reviews)
    ]);
    state.settings=settings&&settings.storeName?settings:demo.settings;state.categories=Array.isArray(categories)?categories:demo.categories;state.products=Array.isArray(products)?products:demo.products;state.gallery=Array.isArray(gallery)?gallery:demo.gallery;state.reviews=Array.isArray(reviews)?reviews:demo.reviews;
    applySettings();
    const page=document.body.dataset.page;
    if(page==='home')renderHome();if(page==='menu')renderMenu();if(page==='gallery')renderGalleryPage();
    observeReveal();track('visit',page||'page');
  }
  document.addEventListener('DOMContentLoaded',init);
})();
