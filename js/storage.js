/*
 * Velora storage layer.
 *
 * A small, safe wrapper around localStorage that every other module uses.
 * It never throws: a missing or blocked localStorage (private mode, blocked
 * cookies, file:// quirks), corrupted JSON, or an unexpected value shape all
 * fall back to a default instead of crashing the page.
 *
 *   Velora.Storage.get(key, fallback, validate?)  -> stored value or fallback
 *   Velora.Storage.set(key, value)                -> true on success
 *   Velora.Storage.remove(key)
 *   Velora.Storage.clearAll()                      -> removes every Velora key
 *   Velora.Storage.onChange(fn)                    -> cross-tab change listener
 *
 * Keys are namespaced ("velora:v1:cart") so they cannot collide with anything
 * else on the origin, and so the schema can be bumped later.
 */
(function (global) {
  'use strict';

  const NAMESPACE = 'velora';
  const VERSION = 'v1';
  const PREFIX = `${NAMESPACE}:${VERSION}:`;

  /** In-memory fallback used when localStorage is unavailable. */
  const memory = new Map();

  /** Detect a usable localStorage once. Access can throw (SecurityError). */
  const backend = (() => {
    try {
      const ls = global.localStorage;
      if (!ls) return null;
      const probe = `${PREFIX}__probe__`;
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (err) {
      return null;
    }
  })();

  const fullKey = (key) => (key.startsWith(PREFIX) ? key : PREFIX + key);

  function warn(message, err) {
    if (global.console && typeof global.console.warn === 'function') {
      global.console.warn(`[Velora storage] ${message}`, err || '');
    }
  }

  function rawRead(key) {
    if (!backend) return memory.has(key) ? memory.get(key) : null;
    try {
      return backend.getItem(key);
    } catch (err) {
      warn(`could not read "${key}"`, err);
      return null;
    }
  }

  function rawWrite(key, serialised) {
    if (!backend) {
      memory.set(key, serialised);
      return true;
    }
    try {
      backend.setItem(key, serialised);
      return true;
    } catch (err) {
      // QuotaExceededError or a storage that went read-only mid-session.
      warn(`could not write "${key}" (storage full or unavailable)`, err);
      memory.set(key, serialised);
      return false;
    }
  }

  function rawRemove(key) {
    memory.delete(key);
    if (!backend) return;
    try {
      backend.removeItem(key);
    } catch (err) {
      warn(`could not remove "${key}"`, err);
    }
  }

  /**
   * Read a value. If the stored JSON is corrupt, or `validate` rejects the
   * parsed value, the bad entry is removed and `fallback` is returned.
   * `fallback` is deep-cloned so callers can mutate it safely.
   */
  function get(key, fallback = null, validate) {
    const k = fullKey(key);
    const raw = rawRead(k);
    if (raw === null || raw === undefined) return clone(fallback);
    let value;
    try {
      value = JSON.parse(raw);
    } catch (err) {
      warn(`corrupt data in "${key}" was discarded`, err);
      rawRemove(k);
      return clone(fallback);
    }
    if (typeof validate === 'function') {
      let ok = false;
      try {
        ok = validate(value) === true;
      } catch (err) {
        ok = false;
      }
      if (!ok) {
        warn(`unexpected data shape in "${key}" was discarded`);
        rawRemove(k);
        return clone(fallback);
      }
    }
    return value;
  }

  /** Persist a JSON-serialisable value. Returns true when written to disk. */
  function set(key, value) {
    if (value === undefined) {
      remove(key);
      return true;
    }
    let serialised;
    try {
      serialised = JSON.stringify(value);
    } catch (err) {
      warn(`value for "${key}" is not serialisable`, err);
      return false;
    }
    return rawWrite(fullKey(key), serialised);
  }

  function remove(key) {
    rawRemove(fullKey(key));
  }

  /** Remove every Velora key (all versions) from storage. */
  function clearAll() {
    memory.clear();
    if (!backend) return;
    try {
      const doomed = [];
      for (let i = 0; i < backend.length; i += 1) {
        const k = backend.key(i);
        if (k && k.startsWith(`${NAMESPACE}:`)) doomed.push(k);
      }
      doomed.forEach((k) => backend.removeItem(k));
    } catch (err) {
      warn('could not clear storage', err);
    }
  }

  /**
   * Listen for changes made in *other* tabs/windows. The callback receives
   * the short key (e.g. "cart"). Returns an unsubscribe function.
   */
  function onChange(fn) {
    if (typeof fn !== 'function' || typeof global.addEventListener !== 'function') return () => {};
    const handler = (event) => {
      if (!event || typeof event.key !== 'string' || !event.key.startsWith(PREFIX)) return;
      fn(event.key.slice(PREFIX.length), event);
    };
    global.addEventListener('storage', handler);
    return () => global.removeEventListener('storage', handler);
  }

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      return value;
    }
  }

  const Storage = Object.freeze({
    get,
    set,
    remove,
    clearAll,
    onChange,
    /** true when real localStorage is being used (false = memory only). */
    get persistent() {
      return backend !== null;
    },
    prefix: PREFIX,
  });

  global.Velora = global.Velora || {};
  global.Velora.Storage = Storage;
})(window);
