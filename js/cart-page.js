/*
 * Velora cart page (cart.html only).
 *
 * Renders the bag from Velora.Cart, handles quantity changes and removals,
 * and keeps itself in sync with changes made elsewhere (other tabs included)
 * through the "velora:change" event. All content is built with DOM APIs.
 */
(function (global) {
  'use strict';

  const V = global.Velora;
  const doc = global.document;
  if (!V || !V.Cart || !V.CartUI) return;

  const { Products, Cart, CartUI, formatPrice, util } = V;

  const FREE_SHIPPING_FROM = 99;   // matches the site's "Free shipping above $99" banner
  const SHIPPING_FEE = 10;

  const refs = {};

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function query(id) {
    return doc.getElementById(id);
  }

  function shippingFor(subtotal) {
    if (subtotal <= 0) return 0;
    return subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  }

  function buildLine(item) {
    const { product } = item;
    const row = el('li', 'cart-line');
    row.dataset.key = item.key;

    const media = el('a', 'cart-line__media');
    media.href = Products.url(product);
    const img = el('img');
    img.src = product.image;
    img.alt = product.alt || product.name;
    img.loading = 'lazy';
    media.appendChild(img);

    const info = el('div', 'cart-line__info');
    info.appendChild(el('span', 'cart-line__category', product.subcategory || ''));
    const nameLink = el('a', 'cart-line__name', product.name);
    nameLink.href = Products.url(product);
    info.appendChild(nameLink);
    const variant = CartUI.variantLabel(product, item.size, item.color);
    if (variant) info.appendChild(el('span', 'cart-line__variant', variant));
    const priceRow = el('div', 'cart-line__price');
    priceRow.appendChild(el('span', 'cart-line__unit', formatPrice(item.unitPrice)));
    if (product.compareAtPrice && product.compareAtPrice > item.unitPrice) {
      priceRow.appendChild(el('span', 'cart-line__compare', formatPrice(product.compareAtPrice)));
    }
    info.appendChild(priceRow);

    const remove = el('button', 'cart-line__remove', 'Remove');
    remove.type = 'button';
    remove.dataset.action = 'remove';
    remove.setAttribute('aria-label', `Remove ${product.name} from bag`);
    info.appendChild(remove);

    const qty = el('div', 'velora-qty cart-line__qty');
    const dec = el('button', 'velora-qty__btn', '−');
    dec.type = 'button'; dec.dataset.action = 'dec'; dec.disabled = item.qty <= 1;
    dec.setAttribute('aria-label', `Decrease quantity of ${product.name}`);
    const input = el('input', 'velora-qty__input');
    input.type = 'number'; input.min = '1'; input.max = '10'; input.value = String(item.qty);
    input.dataset.action = 'input';
    input.setAttribute('aria-label', `Quantity of ${product.name}`);
    const inc = el('button', 'velora-qty__btn', '+');
    inc.type = 'button'; inc.dataset.action = 'inc'; inc.disabled = item.qty >= 10;
    inc.setAttribute('aria-label', `Increase quantity of ${product.name}`);
    qty.append(dec, input, inc);

    const total = el('div', 'cart-line__total', formatPrice(item.lineTotal));

    row.append(media, info, qty, total);
    return row;
  }

  function render() {
    const items = Cart.items();
    const count = Cart.count();
    const subtotal = Cart.subtotal();
    const shipping = shippingFor(subtotal);
    const total = Math.round((subtotal + shipping) * 100) / 100;

    refs.empty.hidden = items.length > 0;
    refs.layout.hidden = items.length === 0;
    refs.countLabel.textContent = count === 1 ? '1 item' : `${count} items`;

    refs.list.textContent = '';
    items.forEach((item) => refs.list.appendChild(buildLine(item)));

    refs.sumItems.textContent = count === 1 ? '1 item' : `${count} items`;
    refs.sumSubtotal.textContent = formatPrice(subtotal);
    refs.sumShipping.textContent = shipping === 0 ? 'Free' : formatPrice(shipping);
    refs.sumTotal.textContent = formatPrice(total);
    if (shipping > 0) {
      const remaining = Math.round((FREE_SHIPPING_FROM - subtotal) * 100) / 100;
      refs.shipNote.textContent = `Add ${formatPrice(remaining)} more for free shipping.`;
    } else {
      refs.shipNote.textContent = items.length ? 'You qualify for free shipping.' : '';
    }
    doc.title = count ? `Your Bag (${count}) | Velora` : 'Your Bag | Velora';
  }

  function lineFrom(target) {
    const row = target.closest('.cart-line');
    return row ? Cart.getLine(row.dataset.key) : null;
  }

  function removeLine(line) {
    const product = Products.get(line.productId);
    const snapshot = { size: line.size, color: line.color, qty: line.qty };
    if (!Cart.remove(line.key)) return;
    CartUI.toast(`Removed ${product ? product.name : 'item'} from your bag.`, {
      actionLabel: 'Undo',
      onAction: () => { Cart.add(line.productId, snapshot); },
    });
  }

  function bind() {
    util.on('click', '.cart-line [data-action]', (event, btn) => {
      const line = lineFrom(btn);
      if (!line) return;
      const action = btn.dataset.action;
      if (action === 'inc') Cart.setQty(line.key, line.qty + 1);
      else if (action === 'dec') Cart.setQty(line.key, line.qty - 1);
      else if (action === 'remove') removeLine(line);
    });

    util.on('change', '.cart-line input[data-action="input"]', (event, input) => {
      const line = lineFrom(input);
      if (!line) return;
      const q = Math.floor(Number(input.value));
      if (!Number.isFinite(q) || q < 1) {
        input.value = String(line.qty); // reject invalid input, keep the line
        return;
      }
      Cart.setQty(line.key, Math.min(q, 10));
    });

    util.on('click', '#cart-clear', (event) => {
      event.preventDefault();
      if (Cart.isEmpty()) return;
      if (global.confirm('Remove every item from your bag?')) {
        Cart.clear();
        CartUI.toast('Your bag is now empty.');
      }
    });

    util.on('click', '#cart-checkout', (event) => {
      event.preventDefault();
      if (Cart.isEmpty()) return;
      if (V.Profile && !V.Profile.isLoggedIn()) {
        CartUI.toast('Please log in to check out.', { actionLabel: 'Log in', actionHref: '#login-modal' });
        return;
      }
      CartUI.toast('Checkout is not available in this demo yet.');
    });

    doc.addEventListener('velora:change', (event) => {
      if (!event.detail || event.detail.store === 'cart') render();
    });
  }

  function init() {
    refs.empty = query('cart-empty');
    refs.layout = query('cart-layout');
    refs.list = query('cart-items');
    refs.countLabel = query('cart-count-label');
    refs.sumItems = query('sum-items');
    refs.sumSubtotal = query('sum-subtotal');
    refs.sumShipping = query('sum-shipping');
    refs.sumTotal = query('sum-total');
    refs.shipNote = query('sum-ship-note');
    if (!refs.list || !refs.empty || !refs.layout) return;
    bind();
    render();
  }

  if (V.__booted) init();
  else doc.addEventListener('velora:ready', init, { once: true });
})(window);
