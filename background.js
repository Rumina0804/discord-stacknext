const DISCORD_URLS = ['https://discord.com/*', 'https://ptb.discord.com/*', 'https://canary.discord.com/*'];
const DEDUPE_MS = 4000;
const FALLBACK_ICON = 'icons/128.png';
const recent = new Map(); // The same account open in several tabs fires the same notification.

function isDuplicate(key) {
  const now = Date.now();
  for (const [k, time] of recent) if (now - time > DEDUPE_MS) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

async function toDataUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'cdn.discordapp.com') return FALLBACK_ICON;
    const response = await fetch(url);
    if (!response.ok) return FALLBACK_ICON;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${response.headers.get('content-type') || 'image/png'};base64,${btoa(binary)}`;
  } catch {
    return FALLBACK_ICON;
  }
}

async function show(id, title, body, icon) {
  if (!chrome.notifications?.create) return false; // Host browser lacks the API; the page falls back.
  const iconUrl = icon ? await toDataUrl(icon) : FALLBACK_ICON;
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl,
      title: String(title || 'Discord').slice(0, 200),
      message: String(body || 'New message').slice(0, 500),
      silent: true // Discord plays its own sound.
    });
    return true;
  } catch {
    return false;
  }
}

async function keepAwake(tabId) {
  try {
    await chrome.tabs.update(tabId, { autoDiscardable: false });
  } catch {
    // Not supported by every Chromium host.
  }
}

async function keepAllAwake() {
  try {
    const tabs = await chrome.tabs.query({ url: DISCORD_URLS });
    await Promise.all(tabs.map((tab) => keepAwake(tab.id)));
  } catch {
    // Tabs API may be partial in embedded browsers.
  }
}

chrome.runtime.onInstalled.addListener(keepAllAwake);
chrome.runtime.onStartup.addListener(keepAllAwake);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message.type === 'notify' && sender.tab) {
    const tabId = sender.tab.id;
    keepAwake(tabId);
    if (isDuplicate(`${message.title}\n${message.body}`)) {
      sendResponse({ ok: true, duplicate: true });
      return false;
    }
    show(`${tabId}:${message.id}`, message.title, message.body, message.icon)
      .then((ok) => sendResponse({ ok }));
    return true;
  }

  if (message.type === 'close' && sender.tab) {
    chrome.notifications?.clear?.(`${sender.tab.id}:${message.id}`);
    return false;
  }

  if (message.type === 'hello' && sender.tab) {
    keepAwake(sender.tab.id);
    return false;
  }

  if (message.type === 'test') {
    show(`test:${Date.now()}`, 'Discord Notifier', 'Notifications are working.')
      .then((ok) => sendResponse({ ok }));
    return true;
  }

  if (message.type === 'status') {
    chrome.tabs.query({ url: DISCORD_URLS })
      .then((tabs) => sendResponse({ tabs: tabs.length, api: Boolean(chrome.notifications?.create) }))
      .catch(() => sendResponse({ tabs: 0, api: Boolean(chrome.notifications?.create) }));
    return true;
  }

  return false;
});

chrome.notifications?.onClicked?.addListener(async (notificationId) => {
  chrome.notifications.clear(notificationId);
  const [tabPart, hookId] = notificationId.split(':');
  const tabId = Number(tabPart);
  if (!Number.isInteger(tabId)) return;
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.sendMessage(tabId, { type: 'clicked', id: hookId });
  } catch {
    // The tab was closed after the notification appeared.
  }
});
