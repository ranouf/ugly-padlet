const UPDATE_STORAGE_KEY = "uglyPadletUpdateAvailable";

chrome.runtime.onUpdateAvailable.addListener(({ version }) => {
  chrome.storage.local.set({
    [UPDATE_STORAGE_KEY]: { version },
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(UPDATE_STORAGE_KEY);
});
