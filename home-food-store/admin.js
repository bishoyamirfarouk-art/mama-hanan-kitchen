(() => {
  'use strict';
  const CFG = window.FOOD_STORE_CONFIG || { apiBase:'/api', storagePrefix:'mama_hanan_kitchen_v2' };
  const API = CFG.apiBase || '/api';
  const tokenKey = `${CFG.storagePrefix || 'mama_hanan_kitchen_v2'}_admin_token`;
  const state = { token: localStorage.getItem(tokenKey) || '', me:null, products:[], categories:[], gallery:[], orders:[], settings:null };
  const titles = { dashboard:'الرئيسية', products:'المنيو والوجبات', categories:'الأقسام', gallery:'معرض الصور', orders:'الطلبات', settings:'إعدادات المتجر', backup:'النسخ الاحتياطي' };
  const statusLabel = { new:'جديد', contacted:'تم التواصل', preparing:'جاري التحضير', out_for_delivery:'خرج للتوصيل', delivered:'تم التسليم', cancelled:'ملغي' };
  const $=(s,e=document)=>e.querySelector(s); const $$=(s,e=document)=>[...e.querySelectorAll(s)];
  const esc=(v='')=>{const d=document.createElement('div');d.textContent=String(v);return d.innerHTML;};
  const money=v=>`${Number(v||0).toLocaleString('ar-EG')} ${state.settings?.currency||'ج.م'}`;

  async function api(path, options={}) {
    const headers = { ...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(options.headers||{}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(`${API}${path}`, { ...options, headers });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) {
      if (res.status===401) logout(false);
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }
  function toast(msg,type='success'){const wrap=$('#toastWrap');const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;wrap.appendChild(el);setTimeout(()=>el.remove(),3200);}
  function openModal(id){$(`#${id}`)?.classList.add('show');document.body.classList.add('modal-open');}
  function closeModal(id){$(`#${id}`)?.classList.remove('show');if(!$$('.modal.show').length)document.body.classList.remove('modal-open');}

  async function login(e){
    e.preventDefault(); const btn=e.submitter; const msg=$('#loginMessage'); if(btn){btn.disabled=true;btn.textContent='جاري الدخول...';}
    const body=Object.fromEntries(new FormData(e.currentTarget).entries());
    try{const data=await api('/auth/login',{method:'POST',body:JSON.stringify(body)});state.token=data.token;state.me=data.user;localStorage.setItem(tokenKey,state.token);await enterAdmin();}
    catch(err){msg.textContent=err.message;msg.style.color='#fca5a5';}
    finally{if(btn){btn.disabled=false;btn.textContent='دخول';}}
  }
  function logout(reload=true){state.token='';state.me=null;localStorage.removeItem(tokenKey);if(reload)location.reload();}
  async function verifySession(){if(!state.token)return false;try{state.me=await api('/auth/me');return true;}catch(_){return false;}}
  async function enterAdmin(){
    $('#loginView').classList.add('hide');$('#adminView').classList.remove('hide');$('#adminUserLine').textContent=`${state.me.username} — ${state.me.role}`;
    await Promise.all([loadSettings(),loadDashboard()]);
  }

  function switchSection(name){
    $$('[data-admin-section]').forEach(s=>s.classList.toggle('hide',s.dataset.adminSection!==name));
    $$('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===name));
    $('#sectionTitle').textContent=titles[name]||''; $('#adminSidebar').classList.remove('show');
    if(name==='products')loadProducts(); if(name==='categories')loadCategories(); if(name==='gallery')loadGallery(); if(name==='orders')loadOrders(); if(name==='settings')renderSettings();
  }

  async function loadDashboard(){
    try{
      const d=await api('/admin/dashboard');
      $('#statsGrid').innerHTML=[['الوجبات',d.products,'🍽️'],['الأقسام',d.categories,'🗂️'],['صور المعرض',d.gallery,'📸'],['الطلبات',d.orders,'🧾']].map(x=>`<div class="stat"><small>${x[2]} ${x[0]}</small><strong>${x[1]}</strong></div>`).join('');
      $('#newOrdersBadge').textContent=d.newOrders?`(${d.newOrders})`:'';
      $('#cloudStatus').innerHTML=`<div class="cloud-box"><span class="cloud-dot ${d.cloud.database==='connected'?'ok':''}"></span><strong>MongoDB</strong><div class="muted">${d.cloud.database}</div></div><div class="cloud-box"><span class="cloud-dot ${d.cloud.cloudinary==='configured'?'ok':''}"></span><strong>Cloudinary</strong><div class="muted">${d.cloud.cloudinary}</div></div><div class="cloud-box"><span class="cloud-dot ok"></span><strong>Environment</strong><div class="muted">${d.cloud.environment}</div></div>`;
      $('#latestOrderBox').innerHTML=d.latestOrder?`<strong>${esc(d.latestOrder.orderNumber)}</strong> — ${esc(d.latestOrder.customerName)} — ${money(d.latestOrder.total)} — <span class="status ${d.latestOrder.status}">${statusLabel[d.latestOrder.status]||d.latestOrder.status}</span>`:'لا يوجد طلبات بعد.';
    }catch(err){toast(err.message,'error');}
  }

  async function loadSettings(){
    try{state.settings=await api('/settings');renderSettings();}catch(err){toast(err.message,'error');}
  }
  function settingsField(label,name,type='text',span=false){const value=state.settings?.[name]??'';if(type==='checkbox')return `<label class="checkbox"><input type="checkbox" name="${name}" ${value?'checked':''}> ${label}</label>`;return `<div class="form-group" ${span?'style="grid-column:1/-1"':''}><label>${label}</label><input class="input" type="${type}" name="${name}" value="${esc(value)}"></div>`;}
  function renderSettings(){
    const form=$('#settingsForm'); if(!form||!state.settings)return;
    const heroValue=esc(state.settings?.heroImage||'/assets/brand/hero-home.webp');
    const logoValue=esc(state.settings?.storeLogo||'/assets/brand/logo-horizontal.png');
    form.innerHTML=settingsField('اسم المتجر','storeName')+settingsField('الشعار النصي','tagline')+settingsField('عنوان الهيرو','heroTitle', 'text',true)+settingsField('وصف الهيرو','heroSubtitle','text',true)+
      `<div class="form-group" style="grid-column:1/-1"><label>صورة الهيرو</label><div style="display:flex;gap:8px"><input class="input" id="settingsHeroImageUrl" name="heroImage" value="${heroValue}"><label class="btn btn-ghost" style="white-space:nowrap">رفع صورة<input type="file" id="settingsHeroImageFile" accept="image/*" hidden></label></div><small class="muted">الصورة الحالية الافتراضية ضمن هوية مطبخ ماما حنان، ويمكن استبدالها من هنا.</small></div>`+
      `<div class="form-group" style="grid-column:1/-1"><label>لوجو الموقع</label><div style="display:flex;gap:8px"><input class="input" id="settingsLogoUrl" name="storeLogo" value="${logoValue}"><label class="btn btn-ghost" style="white-space:nowrap">رفع لوجو<input type="file" id="settingsLogoFile" accept="image/*" hidden></label></div></div>`+
      settingsField('واتساب','whatsappNumber')+settingsField('الهاتف','phoneNumber')+settingsField('العنوان','address','text',true)+settingsField('Google Maps URL','googleMapsUrl','url',true)+settingsField('مواعيد العمل','openingHours')+settingsField('العملة','currency')+settingsField('رسوم التوصيل','deliveryFee','number')+settingsField('الحد الأدنى للطلب','minimumOrder','number')+settingsField('Facebook','facebookUrl','url')+settingsField('Instagram','instagramUrl','url')+settingsField('TikTok','tiktokUrl','url')+settingsField('التوصيل متاح','deliveryEnabled','checkbox')+settingsField('الاستلام متاح','pickupEnabled','checkbox')+'<button class="btn btn-primary" style="grid-column:1/-1" type="submit">حفظ الإعدادات</button>';
    form.onsubmit=saveSettings;
    $('#settingsHeroImageFile').onchange=()=>uploadImage($('#settingsHeroImageFile'),$('#settingsHeroImageUrl'),null,'mama-hanan-kitchen/banners');
    $('#settingsLogoFile').onchange=()=>uploadImage($('#settingsLogoFile'),$('#settingsLogoUrl'),null,'mama-hanan-kitchen/branding');
  }
  async function saveSettings(e){e.preventDefault();const fd=new FormData(e.currentTarget);const body={};for(const [k,v] of fd.entries())body[k]=v;['deliveryFee','minimumOrder'].forEach(k=>body[k]=Number(body[k]||0));body.deliveryEnabled=e.currentTarget.deliveryEnabled.checked;body.pickupEnabled=e.currentTarget.pickupEnabled.checked;try{state.settings=await api('/settings',{method:'PUT',body:JSON.stringify(body)});toast('تم حفظ الإعدادات');}catch(err){toast(err.message,'error');}}

  async function loadProducts(){try{state.products=await api('/admin/products');renderProducts();}catch(err){toast(err.message,'error');}}
  function renderProducts(){
    const tb=$('#productsTable');tb.innerHTML=state.products.length?state.products.map(p=>`<tr><td><img class="thumb" src="${esc(p.mainImage)}"></td><td><strong>${esc(p.title)}</strong><div class="muted">${esc(p.shortDescription||'')}</div></td><td>${esc(p.category)}</td><td>${money((p.variants?.[0]?.price??p.price))}</td><td>${p.availableToday?'✅':'—'}</td><td><div class="actions"><button class="btn btn-sm btn-ghost" data-edit-product="${p._id}">تعديل</button><button class="btn btn-sm btn-danger" data-delete-product="${p._id}">حذف</button></div></td></tr>`).join(''):'<tr><td colspan="6" class="muted">لا توجد وجبات بعد.</td></tr>';
    $$('[data-edit-product]',tb).forEach(b=>b.onclick=()=>openProductForm(b.dataset.editProduct));$$('[data-delete-product]',tb).forEach(b=>b.onclick=()=>deleteProduct(b.dataset.deleteProduct));
  }
  function variantRow(v={name:'',price:''}){return `<div class="variant-row"><input class="input" data-vname placeholder="اسم الحجم" value="${esc(v.name)}"><input class="input" data-vprice type="number" min="0" step="0.01" placeholder="السعر" value="${esc(v.price)}"><button class="btn btn-danger" type="button" data-remove-variant>✕</button></div>`;}
  function addVariant(v){$('#variantRows').insertAdjacentHTML('beforeend',variantRow(v));bindVariantRemove();}
  function bindVariantRemove(){$$('[data-remove-variant]',$('#variantRows')).forEach(b=>b.onclick=()=>b.closest('.variant-row').remove());}
  async function ensureCategories(){if(!state.categories.length)await loadCategories();$('#productCategory').innerHTML=state.categories.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');}
  async function openProductForm(id=''){
    await ensureCategories();const f=$('#productForm');f.reset();f.id.value='';f.isAvailable.checked=true;f.availableToday.checked=true;$('#variantRows').innerHTML='';
    if(id){const p=state.products.find(x=>x._id===id);if(!p)return;f.id.value=p._id;f.title.value=p.title||'';f.category.value=p.category||'';f.shortDescription.value=p.shortDescription||'';f.description.value=p.description||'';f.price.value=p.price||0;f.oldPrice.value=p.oldPrice||'';f.preparationTime.value=p.preparationTime||'';f.serves.value=p.serves||'';f.offerLabel.value=p.offerLabel||'';f.mainImage.value=p.mainImage||'';f.mainImagePublicId.value=p.mainImagePublicId||'';f.isAvailable.checked=p.isAvailable!==false;f.availableToday.checked=p.availableToday!==false;f.featured.checked=!!p.featured;f.isHidden.checked=!!p.isHidden;(p.variants||[]).forEach(addVariant);$('#productModalTitle').textContent='تعديل وجبة';}else{$('#productModalTitle').textContent='إضافة وجبة';addVariant();}
    openModal('productAdminModal');
  }
  async function saveProduct(e){
    e.preventDefault();const f=e.currentTarget;const variants=$$('.variant-row',$('#variantRows')).map(r=>({name:$('[data-vname]',r).value.trim(),price:Number($('[data-vprice]',r).value||0)})).filter(v=>v.name);const body={title:f.title.value.trim(),category:f.category.value,shortDescription:f.shortDescription.value.trim(),description:f.description.value.trim(),price:Number(f.price.value||0),oldPrice:f.oldPrice.value?Number(f.oldPrice.value):null,preparationTime:f.preparationTime.value.trim(),serves:f.serves.value.trim(),offerLabel:f.offerLabel.value.trim(),mainImage:f.mainImage.value.trim(),mainImagePublicId:f.mainImagePublicId.value.trim(),variants,isAvailable:f.isAvailable.checked,availableToday:f.availableToday.checked,featured:f.featured.checked,isHidden:f.isHidden.checked};
    try{if(f.id.value)await api(`/products/${f.id.value}`,{method:'PUT',body:JSON.stringify(body)});else await api('/products',{method:'POST',body:JSON.stringify(body)});toast('تم حفظ الوجبة');closeModal('productAdminModal');await loadProducts();await loadDashboard();}catch(err){toast(err.message,'error');}
  }
  async function deleteProduct(id){if(!confirm('حذف الوجبة نهائيًا؟'))return;try{await api(`/products/${id}`,{method:'DELETE'});toast('تم الحذف');await loadProducts();await loadDashboard();}catch(err){toast(err.message,'error');}}

  async function loadCategories(){try{state.categories=await api('/admin/categories');renderCategories();}catch(err){toast(err.message,'error');}}
  function renderCategories(){const tb=$('#categoriesTable');if(!tb)return;tb.innerHTML=state.categories.length?state.categories.map(c=>`<tr><td><img class="thumb" src="${esc(c.image||'/assets/food/meal.svg')}"></td><td>${esc(c.name)}</td><td>${Number(c.sortOrder||0)}</td><td>${c.isActive?'نشط':'مخفي'}</td><td><div class="actions"><button class="btn btn-sm btn-ghost" data-edit-cat="${c._id}">تعديل</button><button class="btn btn-sm btn-danger" data-del-cat="${c._id}">حذف</button></div></td></tr>`).join(''):'<tr><td colspan="5" class="muted">لا توجد أقسام.</td></tr>';$$('[data-edit-cat]',tb).forEach(b=>b.onclick=()=>openCategoryForm(b.dataset.editCat));$$('[data-del-cat]',tb).forEach(b=>b.onclick=()=>deleteCategory(b.dataset.delCat));}
  function openCategoryForm(id=''){const f=$('#categoryForm');f.reset();f.id.value='';f.isActive.checked=true;if(id){const c=state.categories.find(x=>x._id===id);f.id.value=c._id;f.name.value=c.name;f.sortOrder.value=c.sortOrder||0;f.image.value=c.image||'';f.isActive.checked=c.isActive!==false;}openModal('categoryAdminModal');}
  async function saveCategory(e){e.preventDefault();const f=e.currentTarget;const body={name:f.name.value.trim(),sortOrder:Number(f.sortOrder.value||0),image:f.image.value.trim(),isActive:f.isActive.checked};try{if(f.id.value)await api(`/categories/${f.id.value}`,{method:'PUT',body:JSON.stringify(body)});else await api('/categories',{method:'POST',body:JSON.stringify(body)});toast('تم حفظ القسم');closeModal('categoryAdminModal');await loadCategories();await loadDashboard();}catch(err){toast(err.message,'error');}}
  async function deleteCategory(id){if(!confirm('حذف القسم؟ تأكد أن مفيش وجبات معتمدة عليه.'))return;try{await api(`/categories/${id}`,{method:'DELETE'});toast('تم الحذف');await loadCategories();}catch(err){toast(err.message,'error');}}

  async function loadGallery(){try{state.gallery=await api('/admin/gallery');renderGallery();}catch(err){toast(err.message,'error');}}
  function renderGallery(){const host=$('#adminGalleryGrid');if(!host)return;host.innerHTML=state.gallery.length?state.gallery.map(g=>`<figure class="gallery-item"><img src="${esc(g.image)}"><figcaption style="padding:12px"><strong>${esc(g.title||'بدون عنوان')}</strong><div class="muted">${esc(g.category||'')}</div><div class="actions" style="margin-top:8px"><button class="btn btn-sm btn-ghost" data-edit-gallery="${g._id}">تعديل</button><button class="btn btn-sm btn-danger" data-del-gallery="${g._id}">حذف</button></div></figcaption></figure>`).join(''):'<div class="muted">لا توجد صور.</div>';$$('[data-edit-gallery]',host).forEach(b=>b.onclick=()=>openGalleryForm(b.dataset.editGallery));$$('[data-del-gallery]',host).forEach(b=>b.onclick=()=>deleteGallery(b.dataset.delGallery));}
  function openGalleryForm(id=''){const f=$('#galleryForm');f.reset();f.id.value='';f.isActive.checked=true;if(id){const g=state.gallery.find(x=>x._id===id);f.id.value=g._id;f.image.value=g.image||'';f.cloudinaryPublicId.value=g.cloudinaryPublicId||'';f.title.value=g.title||'';f.category.value=g.category||'';f.sortOrder.value=g.sortOrder||0;f.isActive.checked=g.isActive!==false;}openModal('galleryAdminModal');}
  async function saveGallery(e){e.preventDefault();const f=e.currentTarget;const body={image:f.image.value.trim(),cloudinaryPublicId:f.cloudinaryPublicId.value.trim(),title:f.title.value.trim(),category:f.category.value.trim()||'الكل',sortOrder:Number(f.sortOrder.value||0),isActive:f.isActive.checked};try{if(f.id.value)await api(`/gallery/${f.id.value}`,{method:'PUT',body:JSON.stringify(body)});else await api('/gallery',{method:'POST',body:JSON.stringify(body)});toast('تم حفظ الصورة');closeModal('galleryAdminModal');await loadGallery();await loadDashboard();}catch(err){toast(err.message,'error');}}
  async function deleteGallery(id){if(!confirm('حذف الصورة من المعرض؟'))return;try{await api(`/gallery/${id}`,{method:'DELETE'});toast('تم الحذف');await loadGallery();await loadDashboard();}catch(err){toast(err.message,'error');}}

  async function uploadImage(input,urlInput,publicIdInput,folder){const file=input.files?.[0];if(!file)return;const fd=new FormData();fd.append('image',file);fd.append('folder',folder);try{toast('جاري رفع الصورة...');const data=await api('/upload',{method:'POST',body:fd});urlInput.value=data.url;if(publicIdInput)publicIdInput.value=data.publicId||'';toast('تم رفع الصورة');}catch(err){toast(err.message,'error');}finally{input.value='';}}

  async function loadOrders(){try{const st=$('#orderStatusFilter').value;state.orders=await api(`/orders${st?`?status=${encodeURIComponent(st)}`:''}`);renderOrders();}catch(err){toast(err.message,'error');}}
  function renderOrders(){const tb=$('#ordersTable');tb.innerHTML=state.orders.length?state.orders.map(o=>`<tr><td><strong>${esc(o.orderNumber)}</strong><div class="muted">${(o.items||[]).length} صنف</div></td><td>${esc(o.customerName)}<div class="muted">${esc(o.customerPhone)}</div></td><td>${new Date(o.createdAt).toLocaleString('ar-EG')}</td><td>${money(o.total)}</td><td>${o.fulfillment==='pickup'?'استلام':'توصيل'}</td><td><select class="select" data-order-status="${o._id}" style="min-width:150px">${Object.entries(statusLabel).map(([k,v])=>`<option value="${k}" ${o.status===k?'selected':''}>${v}</option>`).join('')}</select></td></tr>`).join(''):'<tr><td colspan="6" class="muted">لا توجد طلبات.</td></tr>';$$('[data-order-status]',tb).forEach(s=>s.onchange=()=>updateOrderStatus(s.dataset.orderStatus,s.value));}
  async function updateOrderStatus(id,status){try{await api(`/orders/${id}`,{method:'PUT',body:JSON.stringify({status})});toast('تم تحديث حالة الطلب');await loadDashboard();}catch(err){toast(err.message,'error');}}

  async function downloadBackup(){try{const data=await api('/backup');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mama-hanan-kitchen-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('تم تجهيز النسخة الاحتياطية');}catch(err){toast(err.message,'error');}}
  async function restoreBackup(){const file=$('#restoreFile').files?.[0];if(!file)return toast('اختر ملف Backup أولًا','error');if(!confirm('سيتم استبدال بيانات المتجر الحالية بالنسخة المختارة. هل تريد المتابعة؟'))return;try{const payload=JSON.parse(await file.text());await api('/restore',{method:'POST',body:JSON.stringify(payload)});toast('تمت استعادة البيانات');await Promise.all([loadSettings(),loadDashboard(),loadProducts(),loadCategories(),loadGallery(),loadOrders()]);}catch(err){toast(err.message||'تعذر استعادة النسخة','error');}}

  function bind(){
    $('#loginForm').onsubmit=login;$('#logoutBtn').onclick=()=>logout();$('#adminMenuBtn').onclick=()=>$('#adminSidebar').classList.toggle('show');$$('[data-section]').forEach(b=>b.onclick=()=>switchSection(b.dataset.section));$('#refreshDashboard').onclick=loadDashboard;$('#newProductBtn').onclick=()=>openProductForm();$('#productForm').onsubmit=saveProduct;$('#addVariantBtn').onclick=()=>addVariant();$('#newCategoryBtn').onclick=()=>openCategoryForm();$('#categoryForm').onsubmit=saveCategory;$('#newGalleryBtn').onclick=()=>openGalleryForm();$('#galleryForm').onsubmit=saveGallery;$('#orderStatusFilter').onchange=loadOrders;$('#downloadBackupBtn').onclick=downloadBackup;$('#restoreBackupBtn').onclick=restoreBackup;$$('[data-close-admin]').forEach(b=>b.onclick=()=>closeModal(b.dataset.closeAdmin));$$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
    $('#productImageFile').onchange=()=>uploadImage($('#productImageFile'),$('#productImageUrl'),$('#productForm').mainImagePublicId,'mama-hanan-kitchen/products');
    $('#categoryImageFile').onchange=()=>uploadImage($('#categoryImageFile'),$('#categoryImageUrl'),null,'mama-hanan-kitchen/categories');
    $('#galleryImageFile').onchange=()=>uploadImage($('#galleryImageFile'),$('#galleryImageUrl'),$('#galleryForm').cloudinaryPublicId,'mama-hanan-kitchen/gallery');
  }
  async function init(){bind();if(await verifySession())await enterAdmin();}
  document.addEventListener('DOMContentLoaded',init);
})();
