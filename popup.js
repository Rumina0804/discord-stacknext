const $ = (id) => document.getElementById(id);

chrome.runtime.sendMessage({ type: 'status' }, (status) => {
  if (chrome.runtime.lastError || !status) {
    $('tabs').textContent = 'Could not read status.';
    return;
  }
  $('tabs').textContent = `Discord tabs watched: ${status.tabs}`;
  $('api').textContent = status.api
    ? 'System notifications: available'
    : 'System notifications: not supported here, using web notifications';
});

$('test').addEventListener('click', () => {
  $('result').textContent = 'Sending…';
  chrome.runtime.sendMessage({ type: 'test' }, (response) => {
    const failed = chrome.runtime.lastError || !response?.ok;
    $('result').textContent = failed
      ? 'Failed. Check Windows notification settings.'
      : 'Sent. If nothing appeared, check Windows Do Not Disturb.';
  });
});
