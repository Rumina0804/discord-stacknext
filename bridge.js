// Connects the page hook to the extension, and alerts on unread growth if Discord raises nothing.
(() => {
  const FALLBACK_DELAY_MS = 2500;
  let lastNotifyAt = 0;
  let lastUnread = null;
  let fallbackTimer = null;
  let fallbackSequence = 0;

  const toPage = (message) => window.postMessage({ source: 'discord-notifier-bridge', ...message }, location.origin);

  function send(message, callback) {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const failed = chrome.runtime.lastError;
        callback?.(failed ? null : response);
      });
    } catch {
      callback?.(null); // Extension was reloaded; this tab needs a refresh.
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'discord-notifier-page') return;
    const { type, id, title, body, icon } = event.data;
    if (type === 'notify') {
      lastNotifyAt = Date.now();
      send({ type, id, title, body, icon }, (response) => toPage({ type: 'result', id, ok: Boolean(response?.ok) }));
    } else if (type === 'close') {
      send({ type, id });
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'clicked') toPage({ type: 'clicked', id: message.id });
  });

  function checkUnread() {
    const match = document.title.match(/^\((\d+)\)/);
    const unread = match ? Number(match[1]) : 0;
    const previous = lastUnread;
    lastUnread = unread;
    if (previous === null || unread <= previous || document.hasFocus()) return;

    const changedAt = Date.now();
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
      if (lastNotifyAt >= changedAt - 1000) return;
      const count = lastUnread;
      if (!count) return;
      const body = `You have ${count} unread ${count === 1 ? 'mention or message' : 'mentions or messages'}.`;
      send({ type: 'notify', id: `unread-${++fallbackSequence}`, title: 'Discord', body }, (response) => {
        // This isolated world still has the browser's real Notification class.
        if (!response?.ok && Notification.permission === 'granted') new Notification('Discord', { body });
      });
    }, FALLBACK_DELAY_MS);
  }

  function watchTitle() {
    const title = document.querySelector('title');
    if (!title) return setTimeout(watchTitle, 300);
    new MutationObserver(checkUnread).observe(title, { childList: true, characterData: true, subtree: true });
    checkUnread();
  }

  watchTitle();
  send({ type: 'hello' });
})();
