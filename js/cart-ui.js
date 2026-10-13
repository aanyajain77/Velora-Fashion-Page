/*
 * Velora cart UI (every page).
 *
 *  - "Add to Bag" buttons on product cards and "Add to Cart" buttons inside
 *    quick-view modals add the product to the cart.
 *  - Products with sizes or colours open a small options picker first, so a
 *    variant can never be added without the required choices.
 *  - A toast confirms every add/remove with a link to the bag.
 *
 * All DOM is built with createElement/textContent; no HTML strings are
 * assembled from data.
 */
(function (global) {
  'use strict';

  const V = global.Velora;
  const doc = global.document;
  if (!V || !V.Products || !V.Cart || !V.util) return;
  if (V.CartUI) return; // already loaded

  const { Products, Cart, formatPrice, util } = V;
  const CART_URL = 'cart.html';

  // ---------------------------------------------------------------- helpers

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function variantLabel(product, size, color) {
    const parts = [];
    if (size) parts.push(`${Products.sizeLabel(product)} ${size}`);
    if (color) parts.push(color);
    return parts.join(' · ');
  }

  // ------------------------------------------------------------------ toast

  let toastHost = null;
  let toastTimer = 0;

  function toast(message, options = {}) {
    if (!toastHost) {
      toastHost = el('div', 'velora-toast-host');
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
      doc.body.appendChild(toastHost);
    }
    toastHost.textContent = '';
    const box = el('div', `velora-toast${options.tone ? ` is-${options.tone}` : ''}`);
    box.appendChild(el('span', 'velora-toast__msg', message));
    if (options.actionLabel) {
      const action = el('a', 'velora-toast__action', options.actionLabel);
      action.href = options.actionHref || '#';
      if (typeof options.onAction === 'function') {
        action.addEventListener('click', (e) => { e.preventDefault(); options.onAction(); hideToast(); });
      }
      box.appendChild(action);
    }
    const close = el('button', 'velora-toast__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', hideToast);
    box.appendChild(close);
    toastHost.appendChild(box);
    // next frame so the transition runs
    global.requestAnimationFrame(() => box.classList.add('is-visible'));
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(hideToast, options.duration || 3500);
  }

  function hideToast() {
    global.clearTimeout(toastTimer);
    if (!toastHost) return;
    const box = toastHost.firstElementChild;
    if (!box) return;
    box.classList.remove('is-visible');
    global.setTimeout(() => { if (box.parentNode) box.remove(); }, 250);
  }

  // ----------------------------------------------------------------- picker

  const picker = {
    root: null,
    refs: {},
    product: null,
    size: '',
    color: '',
    qty: 1,
    returnFocus: null,
  };

  function buildPicker() {
    const root = el('div', 'velora-modal');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Choose options');
    root.hidden = true;

    const box = el('div', 'velora-modal__box');
    const close = el('button', 'velora-modal__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');

    const grid = el('div', 'velora-picker');
    const media = el('div', 'velora-picker__media');
    const img = el('img', 'velora-picker__img');
    img.alt = '';
    media.appendChild(img);

    const body = el('div', 'velora-picker__body');
    const category = el('span', 'velora-picker__category');
    const name = el('h3', 'velora-picker__name');
    const priceRow = el('div', 'velora-picker__price-row');
    const price = el('span', 'velora-picker__price');
    const compare = el('span', 'velora-picker__compare');
    priceRow.append(price, compare);

    const sizeGroup = el('div', 'velora-picker__group');
    const sizeLabel = el('span', 'velora-picker__label');
    const sizeOptions = el('div', 'velora-picker__options');
    sizeOptions.setAttribute('role', 'radiogroup');
    sizeGroup.append(sizeLabel, sizeOptions);

    const colorGroup = el('div', 'velora-picker__group');
    const colorLabel = el('span', 'velora-picker__label');
    const colorOptions = el('div', 'velora-picker__options velora-picker__options--swatches');
    colorOptions.setAttribute('role', 'radiogroup');
    colorGroup.append(colorLabel, colorOptions);

    const qtyGroup = el('div', 'velora-picker__group');
    qtyGroup.appendChild(el('span', 'velora-picker__label', 'Quantity'));
    const stepper = el('div', 'velora-qty');
    const dec = el('button', 'velora-qty__btn', '−');
    dec.type = 'button'; dec.dataset.step = '-1'; dec.setAttribute('aria-label', 'Decrease quantity');
    const qtyValue = el('span', 'velora-qty__value', '1');
    qtyValue.setAttribute('aria-live', 'polite');
    const inc = el('button', 'velora-qty__btn', '+');
    inc.type = 'button'; inc.dataset.step = '1'; inc.setAttribute('aria-label', 'Increase quantity');
    stepper.append(dec, qtyValue, inc);
    qtyGroup.appendChild(stepper);

    const error = el('p', 'velora-picker__error');
    error.setAttribute('aria-live', 'assertive');
    const add = el('button', 'velora-picker__add', 'Add to Bag');
    add.type = 'button';

    body.append(category, name, priceRow, sizeGroup, colorGroup, qtyGroup, error, add);
    grid.append(media, body);
    box.append(close, grid);
    root.appendChild(box);
    doc.body.appendChild(root);

    picker.root = root;
    picker.refs = { img, category, name, price, compare, sizeGroup, sizeLabel, sizeOptions, colorGroup, colorLabel, colorOptions, qtyValue, dec, inc, error, add };

    close.addEventListener('click', closePicker);
    root.addEventListener('click', (e) => { if (e.target === root) closePicker(); });
    sizeOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-size]');
      if (btn) selectSize(btn.dataset.size);
    });
    colorOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-color]');
      if (btn) selectColor(btn.dataset.color);
    });
    stepper.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-step]');
      if (btn) setQty(picker.qty + Number(btn.dataset.step));
    });
    add.addEventListener('click', confirmPicker);
  }

  function renderOptionButtons(container, list, attr, selected, swatch) {
    container.textContent = '';
    list.forEach((item) => {
      const value = swatch ? item.name : item;
      const btn = el('button', swatch ? 'velora-swatch' : 'velora-option', swatch ? '' : value);
      btn.type = 'button';
      btn.dataset[attr] = value;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', value === selected ? 'true' : 'false');
      if (swatch) {
        btn.style.backgroundColor = item.hex;
        btn.title = item.name;
        btn.setAttribute('aria-label', item.name);
      }
      btn.classList.toggle('is-selected', value === selected);
      container.appendChild(btn);
    });
  }

  function selectSize(size) {
    picker.size = picker.product.sizes.includes(size) ? size : '';
    renderOptionButtons(picker.refs.sizeOptions, picker.product.sizes, 'size', picker.size, false);
    picker.refs.sizeLabel.textContent = `${Products.sizeLabel(picker.product)}${picker.size ? `: ${picker.size}` : ''}`;
    setError('');
  }

  function selectColor(color) {
    const names = picker.product.colors.map((c) => c.name);
    picker.color = names.includes(color) ? color : '';
    renderOptionButtons(picker.refs.colorOptions, picker.product.colors, 'color', picker.color, true);
    picker.refs.colorLabel.textContent = `Colour${picker.color ? `: ${picker.color}` : ''}`;
    setError('');
  }

  function setQty(q) {
    picker.qty = Math.min(10, Math.max(1, Math.floor(Number(q)) || 1));
    picker.refs.qtyValue.textContent = String(picker.qty);
    picker.refs.dec.disabled = picker.qty <= 1;
    picker.refs.inc.disabled = picker.qty >= 10;
  }

  function setError(message) {
    picker.refs.error.textContent = message;
    picker.refs.error.hidden = !message;
  }

  function openPicker(product, preset = {}) {
    if (!picker.root) buildPicker();
    const r = picker.refs;
    picker.product = product;
    picker.returnFocus = doc.activeElement;

    r.img.src = product.image;
    r.img.alt = product.alt || product.name;
    r.category.textContent = product.subcategory || '';
    r.name.textContent = product.name;
    r.price.textContent = formatPrice(product.price);
    r.compare.textContent = product.compareAtPrice ? formatPrice(product.compareAtPrice) : '';
    r.compare.hidden = !product.compareAtPrice;

    r.sizeGroup.hidden = product.sizes.length === 0;
    r.colorGroup.hidden = product.colors.length === 0;
    selectSize(preset.size || '');
    selectColor(preset.color || '');
    setQty(preset.qty || 1);
    setError('');

    picker.root.hidden = false;
    doc.body.classList.add('velora-modal-open');
    global.requestAnimationFrame(() => picker.root.classList.add('is-open'));
    const first = r.sizeOptions.querySelector('button') || r.colorOptions.querySelector('button') || r.add;
    first.focus();
  }

  function closePicker() {
    if (!picker.root || picker.root.hidden) return;
    picker.root.classList.remove('is-open');
    doc.body.classList.remove('velora-modal-open');
    global.setTimeout(() => { picker.root.hidden = true; }, 200);
    if (picker.returnFocus && typeof picker.returnFocus.focus === 'function') picker.returnFocus.focus();
    picker.product = null;
  }

  function confirmPicker() {
    const p = picker.product;
    if (!p) return;
    if (p.sizes.length && !picker.size) return setError(`Please select a ${Products.sizeLabel(p).toLowerCase()}.`);
    if (p.colors.length && !picker.color) return setError('Please select a colour.');
    addToCart(p, { size: picker.size, color: picker.color, qty: picker.qty });
    closePicker();
    return undefined;
  }

  // ---------------------------------------------------------- add flow

  function addToCart(product, options) {
    const line = Cart.add(product.id, options);
    if (!line) {
      toast('Sorry, this product is unavailable.', { tone: 'error' });
      return null;
    }
    const variant = variantLabel(product, line.size, line.color);
    toast(`Added to bag: ${product.name}${variant ? ` (${variant})` : ''}`, { actionLabel: 'View Bag', actionHref: CART_URL });
    return line;
  }

  /**
   * Entry point for every "add" button. Adds immediately when the product
   * has no options (or the preset already satisfies them), otherwise opens
   * the picker.
   */
  function requestAdd(product, preset = {}) {
    if (!product) {
      toast('Sorry, this product is no longer available.', { tone: 'error' });
      return;
    }
    const sizeOk = product.sizes.length === 0 || product.sizes.includes(preset.size);
    const colorOk = product.colors.length === 0 || product.colors.some((c) => c.name === preset.color);
    if (sizeOk && colorOk) addToCart(product, { size: preset.size, color: preset.color, qty: preset.qty || 1 });
    else openPicker(product, preset);
  }

  function closeQuickView(modal) {
    // Quick views are pure-CSS :target modals; follow their own close link.
    const closeLink = modal.querySelector('.modal-close');
    const href = closeLink ? closeLink.getAttribute('href') : '#';
    if (global.location.hash === `#${modal.id}`) global.location.hash = href === '#' ? '' : href;
  }

  // ----------------------------------------------------------- bindings

  // Product cards on home/men/women
  util.on('click', '.product-card .add-cart-btn', (event, btn) => {
    event.preventDefault();
    requestAdd(util.productFromElement(btn));
  });

  // Quick-view modals on accessories/footwear/sale
  util.on('click', '.modal-overlay[data-product-id] .btn-add-cart', (event, btn) => {
    event.preventDefault();
    const modal = btn.closest('.modal-overlay');
    const product = util.productFromElement(btn);
    const active = modal.querySelector('.size-btn.active');
    const preset = { size: active ? active.textContent.trim() : '' };
    closeQuickView(modal);
    requestAdd(product, preset);
  });

  // Size buttons inside quick views were static markup; make them selectable.
  util.on('click', '.modal-overlay[data-product-id] .size-btn', (event, btn) => {
    event.preventDefault();
    btn.parentElement.querySelectorAll('.size-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && picker.root && !picker.root.hidden) closePicker();
  });

  V.CartUI = Object.freeze({ toast, hideToast, requestAdd, openPicker, closePicker, variantLabel, CART_URL });
})(window);
