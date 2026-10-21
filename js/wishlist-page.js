/*
 * Velora wishlist page (wishlist.html only).
 *
 * Renders saved products as standard Velora product cards (same classes the
 * home page uses) with the product's options, a remove button, and an
 * "Add to Bag" button that goes through the shared cart flow, so size and
 * colour are requested when needed. Adding to the bag never removes the item
 * from the wishlist; the user decides.
 */
(function (global) {
  'use strict';

  const V = global.Velora;
  const doc = global.document;
  if (!V || !V.Wishlist || !V.CartUI) return;

  const { Products, Wishlist, Cart, CartUI, formatPrice, util } = V;
  const refs = {};

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function buildCard(product) {
    const card = el('div', 'product-card wishlist-card');
    card.dataset.productId = product.id;

    const box = el('div', 'product-image-box');
    if (product.badge) box.appendChild(el('span', 'product-badge', product.badge));
    const link = el('a', 'wishlist-card__link');
    link.href = Products.url(product);
    const img = el('img');
    img.src = product.image;
    img.alt = product.alt || product.name;
    img.loading = 'lazy';
    link.appendChild(img);
    box.appendChild(link);

    const remove = el('button', 'wishlist-btn active wishlist-btn--remove');
    remove.type = 'button';
    remove.dataset.action = 'remove';
    remove.setAttribute('aria-label', `Remove ${product.name} from wishlist`);
    remove.title = 'Remove from wishlist';
    const removeIcon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    removeIcon.setAttribute('viewBox', '0 0 12 12');
    removeIcon.setAttribute('fill', 'none');
    removeIcon.setAttribute('stroke', 'currentColor');
    removeIcon.setAttribute('stroke-width', '1.8');
    removeIcon.setAttribute('stroke-linecap', 'round');
    removeIcon.setAttribute('aria-hidden', 'true');
    const removePath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    removePath.setAttribute('d', 'M3 3l6 6M9 3L3 9');
    removeIcon.appendChild(removePath);
    remove.appendChild(removeIcon);
    box.appendChild(remove);

    const content = el('div', 'product-content');
    if (product.subcategory) content.appendChild(el('span', 'product-category', product.subcategory));
    const name = el('h3', 'product-name');
    const nameLink = el('a', null, product.name);
    nameLink.href = Products.url(product);
    name.appendChild(nameLink);
    content.appendChild(name);

    const price = el('div', 'product-price', formatPrice(product.price));
    if (product.compareAtPrice && product.compareAtPrice > product.price) {
      price.appendChild(el('span', 'wishlist-card__compare', formatPrice(product.compareAtPrice)));
    }
    content.appendChild(price);

    const options = el('div', 'wishlist-card__options');
    if (product.sizes.length) {
      options.appendChild(el('span', 'wishlist-card__option', `${Products.sizeLabel(product)}s: ${product.sizes.join(', ')}`));
    }
    if (product.colors.length) {
      const row = el('span', 'wishlist-card__option wishlist-card__colors');
      row.appendChild(el('span', null, 'Colours: '));
      product.colors.forEach((c) => {
        const dot = el('span', 'wishlist-card__swatch');
        dot.style.backgroundColor = c.hex;
        dot.title = c.name;
        dot.setAttribute('aria-label', c.name);
        row.appendChild(dot);
      });
      options.appendChild(row);
    }
    if (!product.sizes.length && !product.colors.length) {
      options.appendChild(el('span', 'wishlist-card__option', 'One size'));
    }
    content.appendChild(options);

    const add = el('button', 'add-cart-btn', Cart.has(product.id) ? 'Add Another to Bag' : 'Add to Bag');
    add.type = 'button';
    add.dataset.action = 'add';
    content.appendChild(add);

    const removeText = el('button', 'wishlist-card__remove', 'Remove');
    removeText.type = 'button';
    removeText.dataset.action = 'remove';
    content.appendChild(removeText);

    card.append(box, content);
    return card;
  }

  function render() {
    const items = Wishlist.items();
    refs.empty.hidden = items.length > 0;
    refs.grid.hidden = items.length === 0;
    refs.countLabel.textContent = items.length === 1 ? '1 item' : `${items.length} items`;
    refs.grid.textContent = '';
    items.forEach((p) => refs.grid.appendChild(buildCard(p)));
    doc.title = items.length ? `Wishlist (${items.length}) | Velora` : 'Wishlist | Velora';
  }

  function bind() {
    util.on('click', '.wishlist-card [data-action="remove"]', (event, btn) => {
      event.preventDefault();
      const product = util.productFromElement(btn);
      if (!product || !Wishlist.remove(product.id)) return;
      CartUI.toast(`Removed from wishlist: ${product.name}`, { actionLabel: 'Undo', onAction: () => Wishlist.add(product.id) });
    });

    util.on('click', '.wishlist-card [data-action="add"]', (event, btn) => {
      event.preventDefault();
      CartUI.requestAdd(util.productFromElement(btn));
    });

    doc.addEventListener('velora:change', (event) => {
      const store = event.detail && event.detail.store;
      if (!store || store === 'wishlist' || store === 'cart') render();
    });
  }

  function init() {
    refs.empty = doc.getElementById('wishlist-empty');
    refs.grid = doc.getElementById('wishlist-grid');
    refs.countLabel = doc.getElementById('wishlist-count-label');
    if (!refs.empty || !refs.grid) return;
    bind();
    render();
  }

  if (V.__booted) init();
  else doc.addEventListener('velora:ready', init, { once: true });
})(window);
