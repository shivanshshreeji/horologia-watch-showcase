/* HOROLOGIA – JavaScript enhancements.
   The page already works with HTML + CSS alone; this script adds:
   1. a search box and either/or filters   2. a shortlist and notes saved in the browser
   3. mouse-wheel zoom and drag-to-pan     4. keyboard shortcuts (Esc, arrow keys)  5. a cart and demo checkout */
(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: keep working */ } }
  };
  const rupees = n => '₹' + n.toLocaleString('en-IN');

  /* ---------- 1. search + either/or filters ---------- */
  const form = $('#showcase');
  const cards = $$('.card');
  const search = $('#search');
  const picked = name => ($(`input[name=${name}]:checked`) || { id: 'x-all' }).id.split('-').pop();
  const ticked = prefix => $$(`input[id^="${prefix}"]:checked`).map(i => i.id.slice(prefix.length));

  function applyFilters() {
    const brand = picked('brand'), mat = picked('mat');
    const mv = ticked('m-'), comp = ticked('c-');
    const fullOnly = $('#fullset').checked;
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    cards.forEach(card => {
      const d = card.dataset;
      const ok = (brand === 'all' || d.b === brand)
        && (mat === 'all' || d.mat === mat)
        && (!mv.length || mv.some(m => d.mv.split(' ').includes(m)))
        && (!comp.length || comp.some(c => d.comp.split(' ').includes(c)))
        && (!fullOnly || d.full === '1')
        && words.every(w => d.q.includes(w));
      card.hidden = !ok;
      if (ok) shown++;
    });
    $('#empty').hidden = shown > 0;
  }
  form.addEventListener('change', applyFilters);
  search.addEventListener('input', applyFilters);

  /* ---------- 2. shortlist + notes saved in the browser ---------- */
  const favs = $$('.fav');
  function saveFavs() {
    const ids = favs.filter(f => f.checked).map(f => f.id.slice(4));
    store.set('horologia.favs', ids);
    const total = ids.reduce((sum, id) => sum + Number($(`.card a[href="#w-${id}"]`).closest('.card').dataset.price), 0);
    $('#slCount').textContent = ids.length + (ids.length === 1 ? ' watch' : ' watches');
    $('#slTotal').textContent = rupees(total);
  }
  function restoreFavs() {
    const saved = store.get('horologia.favs', []);
    favs.forEach(f => { f.checked = saved.includes(f.id.slice(4)); });
    saveFavs();
  }
  favs.forEach(f => f.addEventListener('change', saveFavs));
  // "Reset all" clears the filters; the shortlist is kept
  form.addEventListener('reset', () => setTimeout(() => { search.value = ''; restoreFavs(); applyFilters(); }, 0));
  restoreFavs();

  const notes = store.get('horologia.notes', {});
  $$('textarea[data-note]').forEach(t => {
    t.value = notes[t.dataset.note] || '';
    t.addEventListener('input', () => { notes[t.dataset.note] = t.value; store.set('horologia.notes', notes); });
  });

  /* ---------- 3. gallery: wheel zoom at the cursor, drag to pan, double-click ---------- */
  $$('.dossier').forEach(dossier => {
    const zoomRadios = $$('.zr', dossier);
    const frames = $$('.frame', dossier).filter(f => f.querySelector('img'));
    frames.forEach(frame => {
      const img = frame.querySelector('img');
      let scale = 1, drag = null;
      frame.setScale = (next, px, py) => {
        next = Math.min(4, Math.max(1, next));
        const box = frame.getBoundingClientRect();
        px = px ?? box.width / 2; py = py ?? box.height / 2;
        const k = next / scale, sx = frame.scrollLeft, sy = frame.scrollTop;
        img.style.width = next * 100 + '%';
        frame.scrollLeft = (sx + px) * k - px;   // keep the point under the cursor still
        frame.scrollTop = (sy + py) * k - py;
        scale = next;
        const nearest = zoomRadios.find(z => z.id.endsWith('-z' + Math.round(next)));
        if (nearest) nearest.checked = true;
      };
      frame.addEventListener('wheel', e => {
        e.preventDefault();
        const box = frame.getBoundingClientRect();
        frame.setScale(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX - box.left, e.clientY - box.top);
      }, { passive: false });
      frame.addEventListener('dblclick', e => {
        const box = frame.getBoundingClientRect();
        frame.setScale(scale > 1.5 ? 1 : 3, e.clientX - box.left, e.clientY - box.top);
      });
      frame.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') return;          // touch screens pan natively
        drag = { x: e.clientX, y: e.clientY, sx: frame.scrollLeft, sy: frame.scrollTop };
        frame.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      frame.addEventListener('pointermove', e => {
        if (!drag) return;
        frame.scrollLeft = drag.sx - (e.clientX - drag.x);
        frame.scrollTop = drag.sy - (e.clientY - drag.y);
      });
      const end = () => { drag = null; };
      frame.addEventListener('pointerup', end);
      frame.addEventListener('pointercancel', end);
    });
    // the 1x-4x buttons still work, now through the same function
    zoomRadios.forEach(z => z.addEventListener('change', () => {
      const n = Number(z.id.split('-z').pop());
      frames.forEach(f => f.setScale(n));
    }));
  });


  /* ---------- 5. cart and checkout (demo: no payment is taken) ---------- */
  const cartEl = $('#cart'), overlay = $('#overlay'), checkout = $('#checkout');
  let cart = store.get('horologia.cart', []);
  let orders = store.get('horologia.orders', []);
  const reservedIds = () => orders.flatMap(o => o.items);
  const cardOf = id => $(`.card a[href="#w-${id}"]`).closest('.card');
  const item = id => {
    const c = cardOf(id);
    return { id, brand: $('.brand-line', c).textContent, name: $('.card-title', c).textContent,
             price: Number(c.dataset.price), img: $('.card-art img', c).getAttribute('src') };
  };
  const orderOf = id => orders.find(o => o.items.includes(id));

  function renderCart() {
    cart = cart.filter(id => !reservedIds().includes(id));
    store.set('horologia.cart', cart);
    $('#cartCount').textContent = cart.length;
    const total = cart.reduce((s, id) => s + item(id).price, 0);
    $('#cartBody').innerHTML = cart.length ? `
      ${cart.map(id => { const it = item(id); return `<div class="cart-row"><img src="${it.img}" alt="">
        <div><p class="brand-line">${it.brand}</p><strong>${it.name}</strong><p class="muted small">${rupees(it.price)}</p>
        <button class="linkish" type="button" data-remove="${id}">Remove</button></div></div>`; }).join('')}
      <div class="cart-sum"><span>Insured shipping</span><span>Free</span></div>
      <div class="sl-total cart-total"><span>Total (${cart.length} ${cart.length === 1 ? 'watch' : 'watches'})</span><strong>${rupees(total)}</strong></div>
      <button class="btn btn-gold wide" type="button" data-checkout>Proceed to checkout</button>
      <p class="muted small">Each pre-owned watch is one of a kind, so it can be added once.</p>`
      : '<p class="muted pad">Your cart is empty. Open a watch and choose Buy now or Add to cart.</p>';
    // reflect reserved / in-cart state everywhere
    const reserved = reservedIds();
    cards.forEach(c => {
      const id = c.querySelector('.card-link').getAttribute('href').slice(3);
      c.classList.toggle('reserved', reserved.includes(id));
    });
    $$('[data-buyrow]').forEach(row => {
      const id = row.dataset.buyrow, o = orderOf(id);
      row.hidden = !!o;
      const note = $(`[data-reserved="${id}"]`);
      note.hidden = !o;
      if (o) note.innerHTML = `Reserved for you · order ${o.no} <button class="cancel-order" type="button" data-cancel="${o.no}">Cancel order</button>`;
      const add = $('[data-add]', row);
      add.textContent = cart.includes(id) ? 'In cart ✓' : 'Add to cart';
    });
    $$('.cart-mini').forEach(b => { b.classList.toggle('in', cart.includes(b.dataset.add)); });
  }
  function openPanel(el) { el.hidden = false; overlay.hidden = false; document.body.classList.add('lock'); }
  function closePanels() {
    cartEl.hidden = true; checkout.hidden = true; overlay.hidden = true;
    if (!$('.dossier:target')) document.body.classList.remove('lock');
  }
  function addToCart(id) {
    if (!reservedIds().includes(id) && !cart.includes(id)) cart.push(id);
    renderCart();
  }
  function openCheckout(ids) {
    if (!ids.length) return;
    checkout.dataset.items = ids.join(' ');
    const total = ids.reduce((s, id) => s + item(id).price, 0);
    $('#coItems').innerHTML = ids.map(id => { const it = item(id); return `<div class="co-item"><img src="${it.img}" alt=""><div><p class="brand-line">${it.brand}</p><strong>${it.name}</strong></div><span>${rupees(it.price)}</span></div>`; }).join('')
      + `<div class="cart-sum"><span>Insured shipping</span><span>Free</span></div><div class="sl-total cart-total"><span>Total</span><strong>${rupees(total)}</strong></div>`;
    $('#coForm').hidden = false; $('#coDone').hidden = true; $('#formError').hidden = true;
    cartEl.hidden = true;
    openPanel(checkout);
    $('#orderForm input[name=name]').focus();
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-cancel],[data-add],[data-buy],[data-remove],[data-checkout],[data-close-cart],[data-close-co],#cartBtn,#overlay');
    if (!t) return;
    if (t.dataset.cancel) { orders = orders.filter(o => o.no !== t.dataset.cancel); store.set('horologia.orders', orders); renderCart(); }
    else if (t.dataset.add) { e.preventDefault(); addToCart(t.dataset.add); openPanel(cartEl); }
    else if (t.dataset.buy) { addToCart(t.dataset.buy); openCheckout([t.dataset.buy]); }
    else if (t.dataset.remove) { cart = cart.filter(id => id !== t.dataset.remove); renderCart(); }
    else if (t.hasAttribute('data-checkout')) openCheckout(cart.slice());
    else if (t.id === 'cartBtn') { renderCart(); openPanel(cartEl); }
    else closePanels();
  });
  // pickup needs no address
  const orderForm = $('#orderForm');
  orderForm.addEventListener('change', () => {
    const pickup = orderForm.delivery.value === 'Showroom pickup';
    $('.addr', orderForm).hidden = pickup;
    $$('.addr input, .addr textarea', orderForm).forEach(f => { f.required = !pickup; });
  });
  orderForm.addEventListener('submit', e => {
    e.preventDefault();
    orderForm.classList.add('checked');
    if (!orderForm.checkValidity()) { $('#formError').hidden = false; orderForm.querySelector('input:invalid, textarea:invalid').focus(); return; }
    const ids = checkout.dataset.items.split(' ');
    const total = ids.reduce((s, id) => s + item(id).price, 0);
    const no = 'HRG-' + Date.now().toString(36).toUpperCase().slice(-6);
    const d = Object.fromEntries(new FormData(orderForm));
    orders.push({ no, items: ids, total, at: new Date().toISOString() });
    store.set('horologia.orders', orders);
    cart = cart.filter(id => !ids.includes(id));
    renderCart();
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    $('#coDone').innerHTML = `<div class="done"><span class="tick">✓</span><p class="eyebrow">Order confirmed</p>
      <h2>Thank you, ${esc(d.name.split(' ')[0])}!</h2>
      <p>Your order <b>${no}</b> for ${ids.map(id => esc(item(id).name)).join(', ')} is reserved.</p>
      <dl class="specs"><div><dt>Total</dt><dd>${rupees(total)}</dd></div><div><dt>Delivery</dt><dd>${esc(d.delivery)}</dd></div>
      <div><dt>Payment</dt><dd>${esc(d.payment)}</dd></div><div><dt>Confirmation to</dt><dd>${esc(d.email)}</dd></div></dl>
      <p class="demo-note">Demo store: no payment was taken and no real order was placed.</p>
      <button class="btn btn-gold" type="button" data-close-co>Continue browsing</button></div>`;
    $('#coForm').hidden = true; $('#coDone').hidden = false;
    orderForm.reset(); orderForm.classList.remove('checked'); $('.addr', orderForm).hidden = false;
  });
  renderCart();

  /* ---------- 4. keyboard: Esc closes, arrow keys change gallery photo ---------- */
  document.addEventListener('keydown', e => {
    const open = $('.dossier:target');
    if (e.key === 'Escape') {
      if (!checkout.hidden || !cartEl.hidden) closePanels();
      else if ($('#slopen').checked) $('#slopen').checked = false;
      else if (open) location.hash = 'showcase';
      else if ($('#ftoggle').checked) $('#ftoggle').checked = false;
      return;
    }
    const el = document.activeElement;
    if (open && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && $('.t-ga', open).checked
        && !/INPUT|TEXTAREA/.test(el.tagName)) {
      e.preventDefault();
      const views = $$('.vr', open), i = views.findIndex(v => v.checked);
      views[(i + (e.key === 'ArrowRight' ? 1 : -1) + views.length) % views.length].checked = true;
    }
  });

  applyFilters();
})();
