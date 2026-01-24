'use strict';

chrome.action.onClicked.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { type: 'ageaf:open-settings' }, () => {
      // It's expected that most tabs won't have our content script injected.
      // Avoid unhandled promise rejections like:
      // "Could not establish connection. Receiving end does not exist."
      void chrome.runtime.lastError;
    });
  });
});
