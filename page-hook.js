// Runs in Discord's page so it can receive the notifications Discord tries to show.
(() => {
  if (window.__discordNotifierHooked) return;
  Object.defineProperty(window, '__discordNotifierHooked', { value: true });

  const Native = window.Notification;
  const live = new Map();
  let sequence = 0;

  const post = (message) => window.postMessage({ source: 'discord-notifier-page', ...message }, location.origin);

  class HookedNotification extends EventTarget {
    constructor(title, options = {}) {
      super();
      this.title = String(title);
      this.body = options.body || '';
      this.icon = options.icon || '';
      this.tag = options.tag || '';
      this.data = options.data ?? null;
      this.silent = Boolean(options.silent);
      this.onclick = this.onclose = this.onshow = this.onerror = null;
      this._id = `${Date.now()}-${++sequence}`;
      this._native = null;
      live.set(this._id, this);
      setTimeout(() => live.delete(this._id), 10 * 60 * 1000);
      post({ type: 'notify', id: this._id, title: this.title, body: this.body, icon: String(this.icon) });
    }

    close() {
      if (!live.delete(this._id)) return;
      this._native?.close();
      post({ type: 'close', id: this._id });
      this._fire('close');
    }

    _fire(type) {
      const event = new Event(type);
      this.dispatchEvent(event);
      if (typeof this[`on${type}`] === 'function') this[`on${type}`](event);
    }

    _fallback() {
      if (!Native || Native.permission !== 'granted') return this._fire('error');
      this._native = new Native(this.title, { body: this.body, icon: this.icon, tag: this.tag, silent: this.silent });
      this._native.onclick = () => { window.focus(); this._fire('click'); };
      this._fire('show');
    }

    static get permission() { return 'granted'; }
    static get maxActions() { return 0; }

    static requestPermission(callback) {
      if (Native && Native.permission === 'default') Native.requestPermission().catch(() => {});
      if (typeof callback === 'function') callback('granted');
      return Promise.resolve('granted');
    }
  }

  Object.defineProperty(window, 'Notification', { value: HookedNotification, writable: true, configurable: true });

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'discord-notifier-bridge') return;
    const notification = live.get(event.data.id);
    if (!notification) return;
    if (event.data.type === 'result') {
      if (event.data.ok) notification._fire('show');
      else notification._fallback();
    } else if (event.data.type === 'clicked') {
      notification._fire('click');
    }
  });
})();
