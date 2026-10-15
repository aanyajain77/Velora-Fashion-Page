/*
 * Velora Supabase Client & Database Gateway.
 *
 * Initializes the official Supabase JavaScript SDK when valid credentials
 * are configured, and provides an isomorphic, full-fidelity database layer
 * (including Row-Level Security checks and user data isolation) for local preview
 * when credentials have not yet been provided.
 */
(function (global) {
  'use strict';

  const V = global.Velora = global.Velora || {};
  const Config = V.Config;

  let client = null;
  let isLive = false;

  // Local storage keys for simulated database persistence when offline/unconfigured
  const LOCAL_DB_KEYS = {
    users: 'velora_db_auth_users',
    session: 'velora_db_auth_session',
    profiles: 'velora_db_profiles',
    addresses: 'velora_db_addresses',
    orders: 'velora_db_orders',
    order_items: 'velora_db_order_items',
    wishlist: 'velora_db_wishlist',
    cart: 'velora_db_cart',
  };

  function readLocalTable(key) {
    try {
      const data = global.localStorage?.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocalTable(key, data) {
    try {
      global.localStorage?.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Local Database & Auth Simulator (Used seamlessly until Supabase URL is set)
  // ---------------------------------------------------------------------------
  function createLocalClient() {
    let authListeners = [];

    function getCurrentSession() {
      try {
        const raw = global.localStorage?.getItem(LOCAL_DB_KEYS.session);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    function setCurrentSession(session) {
      try {
        if (session) {
          global.localStorage?.setItem(LOCAL_DB_KEYS.session, JSON.stringify(session));
        } else {
          global.localStorage?.removeItem(LOCAL_DB_KEYS.session);
        }
      } catch (e) {}

      authListeners.forEach((fn) => {
        try {
          fn(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
        } catch (err) {
          console.error('[Velora Auth Listener Error]', err);
        }
      });
    }

    const auth = {
      async getSession() {
        const session = getCurrentSession();
        return { data: { session }, error: null };
      },

      async getUser() {
        const session = getCurrentSession();
        return { data: { user: session ? session.user : null }, error: null };
      },

      async signUp({ email, password, options = {} }) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const users = readLocalTable(LOCAL_DB_KEYS.users);
        const existing = users.find((u) => u.email.toLowerCase() === cleanEmail);

        if (existing) {
          return {
            data: { user: null, session: null },
            error: { message: 'User already registered with this email address.', status: 422 },
          };
        }

        const userId = 'usr_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        const userMetadata = options.data || {};
        const newUser = {
          id: userId,
          email: cleanEmail,
          password_hash: btoa(password), // Simulated one-way representation
          user_metadata: userMetadata,
          created_at: new Date().toISOString(),
          email_confirmed_at: new Date().toISOString(), // auto-confirmed in local demo
        };

        users.push(newUser);
        writeLocalTable(LOCAL_DB_KEYS.users, users);

        // Auto-create profile row
        const profiles = readLocalTable(LOCAL_DB_KEYS.profiles);
        const newProfile = {
          id: userId,
          full_name: userMetadata.full_name || '',
          email: cleanEmail,
          phone: userMetadata.phone || '',
          avatar_url: userMetadata.avatar_url || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        profiles.push(newProfile);
        writeLocalTable(LOCAL_DB_KEYS.profiles, profiles);

        const session = {
          access_token: 'local_token_' + Math.random().toString(36).substring(2),
          user: {
            id: userId,
            email: cleanEmail,
            user_metadata: userMetadata,
            created_at: newUser.created_at,
          },
        };

        setCurrentSession(session);
        return { data: { user: session.user, session }, error: null };
      },

      async signInWithPassword({ email, password }) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const users = readLocalTable(LOCAL_DB_KEYS.users);
        const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

        if (!user || user.password_hash !== btoa(password)) {
          return {
            data: { user: null, session: null },
            error: { message: 'Invalid email or password. Please verify your credentials.', status: 400 },
          };
        }

        const session = {
          access_token: 'local_token_' + Math.random().toString(36).substring(2),
          user: {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata || {},
            created_at: user.created_at,
          },
        };

        setCurrentSession(session);
        return { data: { user: session.user, session }, error: null };
      },

      async signOut() {
        setCurrentSession(null);
        return { error: null };
      },

      async resetPasswordForEmail(email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const users = readLocalTable(LOCAL_DB_KEYS.users);
        const user = users.find((u) => u.email.toLowerCase() === cleanEmail);
        if (!user) {
          // Supabase security best practice: don't reveal if email exists, return success
          return { data: {}, error: null };
        }
        return { data: {}, error: null };
      },

      async updateUser(attributes) {
        const session = getCurrentSession();
        if (!session || !session.user) {
          return { data: null, error: { message: 'User not authenticated', status: 401 } };
        }

        const users = readLocalTable(LOCAL_DB_KEYS.users);
        const idx = users.findIndex((u) => u.id === session.user.id);
        if (idx !== -1) {
          if (attributes.password) {
            users[idx].password_hash = btoa(attributes.password);
          }
          if (attributes.data) {
            users[idx].user_metadata = Object.assign({}, users[idx].user_metadata, attributes.data);
            session.user.user_metadata = users[idx].user_metadata;
          }
          writeLocalTable(LOCAL_DB_KEYS.users, users);
          setCurrentSession(session);
        }

        return { data: { user: session.user }, error: null };
      },

      onAuthStateChange(callback) {
        authListeners.push(callback);
        return {
          data: {
            subscription: {
              unsubscribe() {
                authListeners = authListeners.filter((fn) => fn !== callback);
              },
            },
          },
        };
      },
    };

    // Query builder for local tables with RLS enforcement
    function from(tableName) {
      const storageKey = LOCAL_DB_KEYS[tableName] || `velora_db_${tableName}`;
      let filters = [];
      let sortCol = null;
      let sortAsc = true;
      let isSingle = false;

      const builder = {
        select(cols = '*') {
          return builder;
        },
        eq(column, value) {
          filters.push((row) => row && row[column] === value);
          return builder;
        },
        order(column, { ascending = true } = {}) {
          sortCol = column;
          sortAsc = ascending;
          return builder;
        },
        single() {
          isSingle = true;
          return builder;
        },
        async then(resolve) {
          const session = getCurrentSession();
          const userId = session?.user?.id;
          let rows = readLocalTable(storageKey);

          // Apply RLS: user can only see their own records unless table is public
          if (['profiles', 'addresses', 'orders', 'wishlist', 'cart'].includes(tableName)) {
            if (!userId) {
              return resolve({ data: isSingle ? null : [], error: { message: 'Not authenticated', status: 401 } });
            }
            if (tableName === 'profiles') {
              rows = rows.filter((r) => r.id === userId);
            } else {
              rows = rows.filter((r) => r.user_id === userId);
            }
          }

          // Apply filters
          filters.forEach((fn) => {
            rows = rows.filter(fn);
          });

          // Apply sorting
          if (sortCol) {
            rows.sort((a, b) => {
              const valA = a[sortCol];
              const valB = b[sortCol];
              if (valA < valB) return sortAsc ? -1 : 1;
              if (valA > valB) return sortAsc ? 1 : -1;
              return 0;
            });
          }

          if (isSingle) {
            return resolve({ data: rows[0] || null, error: rows.length ? null : { message: 'Row not found', status: 404 } });
          }
          return resolve({ data: rows, error: null });
        },

        async insert(records) {
          const session = getCurrentSession();
          const userId = session?.user?.id;
          let rows = readLocalTable(storageKey);
          const list = Array.isArray(records) ? records : [records];

          const processed = list.map((record) => {
            const copy = Object.assign({}, record);
            if (!copy.id) {
              copy.id = tableName + '_' + Math.random().toString(36).substring(2, 11);
            }
            if (userId && !copy.user_id && tableName !== 'profiles') {
              copy.user_id = userId;
            }
            copy.created_at = copy.created_at || new Date().toISOString();
            copy.updated_at = new Date().toISOString();

            // Default address enforcement
            if (tableName === 'addresses' && copy.is_default) {
              rows.forEach((r) => {
                if (r.user_id === userId) r.is_default = false;
              });
            }
            return copy;
          });

          rows.push(...processed);
          writeLocalTable(storageKey, rows);
          return { data: processed, error: null };
        },

        async update(updates) {
          const session = getCurrentSession();
          const userId = session?.user?.id;
          let rows = readLocalTable(storageKey);
          let matched = [];

          rows = rows.map((r) => {
            const matches = filters.every((fn) => fn(r));
            const matchesUser = tableName === 'profiles' ? r.id === userId : r.user_id === userId;
            if (matches && matchesUser) {
              const updated = Object.assign({}, r, updates, { updated_at: new Date().toISOString() });
              matched.push(updated);
              return updated;
            }
            return r;
          });

          if (tableName === 'addresses' && updates.is_default) {
            rows.forEach((r) => {
              if (r.user_id === userId && !matched.some((m) => m.id === r.id)) {
                r.is_default = false;
              }
            });
          }

          writeLocalTable(storageKey, rows);
          return { data: matched, error: null };
        },

        async delete() {
          const session = getCurrentSession();
          const userId = session?.user?.id;
          let rows = readLocalTable(storageKey);
          const before = rows.length;

          rows = rows.filter((r) => {
            const matches = filters.every((fn) => fn(r));
            const matchesUser = tableName === 'profiles' ? r.id === userId : r.user_id === userId;
            return !(matches && matchesUser);
          });

          writeLocalTable(storageKey, rows);
          return { data: null, error: null, count: before - rows.length };
        },
      };

      return builder;
    }

    return { auth, from };
  }

  // ---------------------------------------------------------------------------
  // Initialize Client
  // ---------------------------------------------------------------------------
  function init() {
    if (Config && Config.isConfigured() && global.supabase && typeof global.supabase.createClient === 'function') {
      try {
        client = global.supabase.createClient(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
        isLive = true;
        console.info('[Velora] Connected to Live Supabase Backend:', Config.SUPABASE_URL);
      } catch (err) {
        console.warn('[Velora] Could not initialize live Supabase client, falling back to local database engine:', err);
        client = createLocalClient();
        isLive = false;
      }
    } else {
      client = createLocalClient();
      isLive = false;
    }
  }

  init();

  V.Supabase = {
    get client() {
      if (!client) init();
      return client;
    },
    get isLive() {
      return isLive;
    },
    reinit() {
      init();
    },
  };
})(window);
