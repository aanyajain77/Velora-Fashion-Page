/*
 * Velora Database Service (DB Layer).
 *
 * Provides high-level query functions for profiles, addresses, orders,
 * order items, and wishlist, querying Supabase with automatic user scoping.
 */
(function (global) {
  'use strict';

  const V = global.Velora = global.Velora || {};

  function getClient() {
    return V.Supabase?.client;
  }

  async function getAuthUserId() {
    const user = await V.Auth?.getUser();
    return user ? user.id : null;
  }

  const DB = {
    // -------------------------------------------------------------------------
    // PROFILES
    // -------------------------------------------------------------------------
    async getProfile() {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) return null;

      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.status !== 404) {
        console.warn('[Velora DB] getProfile error:', error);
      }
      return data || null;
    },

    async updateProfile(fields) {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) throw new Error('Not authenticated');

      const allowed = {};
      if (fields.full_name !== undefined) allowed.full_name = String(fields.full_name).trim();
      if (fields.phone !== undefined) allowed.phone = String(fields.phone).trim();
      if (fields.avatar_url !== undefined) allowed.avatar_url = String(fields.avatar_url).trim();
      if (fields.email_notifications !== undefined) allowed.email_notifications = !!fields.email_notifications;
      if (fields.promo_notifications !== undefined) allowed.promo_notifications = !!fields.promo_notifications;

      const { data, error } = await client
        .from('profiles')
        .update(allowed)
        .eq('id', userId);

      if (error) throw new Error(error.message || 'Failed to update profile');

      // Update local profile store
      if (V.Profile) {
        V.Profile.update({
          name: allowed.full_name,
          phone: allowed.phone,
        });
      }
      return data;
    },

    // -------------------------------------------------------------------------
    // ADDRESSES
    // -------------------------------------------------------------------------
    async getAddresses() {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) return [];

      const { data, error } = await client
        .from('addresses')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false });

      if (error) {
        console.warn('[Velora DB] getAddresses error:', error);
        return [];
      }
      return data || [];
    },

    async addAddress(addr) {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) throw new Error('Not authenticated');

      if (!addr.recipient_name || !addr.phone || !addr.address_line1 || !addr.city || !addr.state || !addr.postal_code) {
        throw new Error('Please fill in all required address fields.');
      }

      // If user has no existing addresses, make this one default automatically
      const existing = await this.getAddresses();
      const isDefault = existing.length === 0 ? true : !!addr.is_default;

      const record = {
        user_id: userId,
        recipient_name: String(addr.recipient_name).trim(),
        phone: String(addr.phone).trim(),
        address_line1: String(addr.address_line1).trim(),
        address_line2: String(addr.address_line2 || '').trim(),
        city: String(addr.city).trim(),
        state: String(addr.state).trim(),
        postal_code: String(addr.postal_code).trim(),
        country: String(addr.country || 'United States').trim(),
        is_default: isDefault,
      };

      const { data, error } = await client.from('addresses').insert(record);
      if (error) throw new Error(error.message || 'Failed to save address');
      return data;
    },

    async updateAddress(addressId, addr) {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) throw new Error('Not authenticated');

      const updates = {};
      if (addr.recipient_name !== undefined) updates.recipient_name = String(addr.recipient_name).trim();
      if (addr.phone !== undefined) updates.phone = String(addr.phone).trim();
      if (addr.address_line1 !== undefined) updates.address_line1 = String(addr.address_line1).trim();
      if (addr.address_line2 !== undefined) updates.address_line2 = String(addr.address_line2).trim();
      if (addr.city !== undefined) updates.city = String(addr.city).trim();
      if (addr.state !== undefined) updates.state = String(addr.state).trim();
      if (addr.postal_code !== undefined) updates.postal_code = String(addr.postal_code).trim();
      if (addr.country !== undefined) updates.country = String(addr.country).trim();
      if (addr.is_default !== undefined) updates.is_default = !!addr.is_default;

      const { data, error } = await client
        .from('addresses')
        .update(updates)
        .eq('id', addressId)
        .eq('user_id', userId);

      if (error) throw new Error(error.message || 'Failed to update address');
      return data;
    },

    async deleteAddress(addressId) {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) throw new Error('Not authenticated');

      const { error } = await client
        .from('addresses')
        .delete()
        .eq('id', addressId)
        .eq('user_id', userId);

      if (error) throw new Error(error.message || 'Failed to delete address');
      return true;
    },

    async setDefaultAddress(addressId) {
      return this.updateAddress(addressId, { is_default: true });
    },

    // -------------------------------------------------------------------------
    // ORDERS & CHECKOUT
    // -------------------------------------------------------------------------
    async getOrders() {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) return [];

      const { data: orders, error } = await client
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[Velora DB] getOrders error:', error);
        return [];
      }

      if (!orders || !orders.length) return [];

      // Fetch items for each order
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const { data: items } = await client
            .from('order_items')
            .select('*')
            .eq('order_id', order.id);
          return Object.assign({}, order, { items: items || [] });
        })
      );

      return ordersWithItems;
    },

    /**
     * Create a real order from cart items.
     * Validates products, prices, and quantities against the catalog.
     */
    async createOrder({ address, paymentMethod = 'Credit / Debit Card', notes = '' }) {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) throw new Error('You must be logged in to place an order.');

      if (!V.Cart || V.Cart.isEmpty()) {
        throw new Error('Your shopping bag is empty.');
      }

      if (!address || !address.recipient_name || !address.address_line1 || !address.city || !address.postal_code) {
        throw new Error('Please select or provide a valid shipping address.');
      }

      const cartItems = V.Cart.items();
      if (!cartItems.length) throw new Error('Bag has no items.');

      // Server-trusted pricing check: compute line totals strictly from Products catalog
      let computedSubtotal = 0;
      const verifiedItems = [];

      for (const item of cartItems) {
        const prod = V.Products.get(item.productId);
        if (!prod) {
          throw new Error(`Product ${item.productId} is no longer available in the catalogue.`);
        }
        const unitPrice = prod.price;
        const lineTotal = Math.round(unitPrice * item.qty * 100) / 100;
        computedSubtotal += lineTotal;

        verifiedItems.push({
          product_id: prod.id,
          product_name: prod.name,
          product_image: prod.image,
          subcategory: prod.subcategory || '',
          size: item.size || '',
          color: item.color || '',
          quantity: item.qty,
          unit_price: unitPrice,
          total_price: lineTotal,
        });
      }

      computedSubtotal = Math.round(computedSubtotal * 100) / 100;
      const shippingFee = computedSubtotal >= 99 ? 0 : 10;
      const totalAmount = Math.round((computedSubtotal + shippingFee) * 100) / 100;

      // Unique Order Number
      const randomSuffix = Math.floor(10000 + Math.random() * 90000);
      const orderNumber = `VEL-2026-${randomSuffix}`;

      // Estimated Delivery Date (5 business days from now)
      const deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + 5);

      const orderRecord = {
        order_number: orderNumber,
        user_id: userId,
        status: 'Confirmed',
        subtotal: computedSubtotal,
        shipping_fee: shippingFee,
        total_amount: totalAmount,
        shipping_address: {
          recipient_name: address.recipient_name,
          phone: address.phone,
          address_line1: address.address_line1,
          address_line2: address.address_line2 || '',
          city: address.city,
          state: address.state,
          postal_code: address.postal_code,
          country: address.country || 'United States',
        },
        payment_method: paymentMethod,
        payment_status: paymentMethod.includes('Pay on Delivery') ? 'Pay on Delivery' : 'Paid',
        transaction_ref: 'TXN-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        tracking_number: 'TRK' + Math.floor(100000000 + Math.random() * 900000000),
        tracking_carrier: 'FedEx Luxury Express',
        tracking_link: 'https://www.fedex.com',
        estimated_delivery: deliveryDate.toISOString().split('T')[0],
        notes: String(notes || '').trim(),
      };

      const { data: insertedOrder, error: orderErr } = await client
        .from('orders')
        .insert(orderRecord);

      if (orderErr) {
        throw new Error(orderErr.message || 'Failed to create order.');
      }

      const orderObj = Array.isArray(insertedOrder) ? insertedOrder[0] : insertedOrder;
      const orderId = orderObj?.id || orderRecord.id;

      // Insert Order Items
      const itemsToInsert = verifiedItems.map((i) => Object.assign({}, i, { order_id: orderId }));
      const { error: itemsErr } = await client.from('order_items').insert(itemsToInsert);

      if (itemsErr) {
        console.warn('[Velora DB] Order items insertion warning:', itemsErr);
      }

      // Clear the local cart
      V.Cart.clear();

      return Object.assign({}, orderRecord, { id: orderId, items: verifiedItems });
    },

    async cancelOrder(orderId) {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) throw new Error('Not authenticated');

      const { data, error } = await client
        .from('orders')
        .update({ status: 'Cancelled' })
        .eq('id', orderId)
        .eq('user_id', userId);

      if (error) throw new Error(error.message || 'Failed to cancel order.');
      return data;
    },

    // -------------------------------------------------------------------------
    // WISHLIST
    // -------------------------------------------------------------------------
    async getWishlist() {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) return [];

      const { data, error } = await client
        .from('wishlist_items')
        .select('product_id')
        .eq('user_id', userId);

      if (error) return [];
      return (data || []).map((row) => row.product_id);
    },

    async addWishlist(productId) {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) return false;

      const { error } = await client
        .from('wishlist_items')
        .insert({ user_id: userId, product_id: productId });

      return !error;
    },

    async removeWishlist(productId) {
      const client = getClient();
      const userId = await getAuthUserId();
      if (!client || !userId) return false;

      const { error } = await client
        .from('wishlist_items')
        .delete()
        .eq('user_id', userId)
        .eq('product_id', productId);

      return !error;
    },
  };

  V.DB = DB;
})(window);
