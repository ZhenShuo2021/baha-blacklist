// 監聽內容腳本請求獲取黑名單
window.addEventListener("message", (event) => {
  if (event.data?.type === "GET_BLACKLIST_FROM_CONTENT") {
    // 從background腳本獲取黑名單
    chrome.runtime.sendMessage({ action: "getBlacklist" }, (response) => {
      // 將黑名單發送回content script
      window.postMessage(
        {
          type: "BLACKLIST_RESPONSE",
          blacklist: response?.blacklist || [],
        },
        "*"
      );
    });
  }
});

// 監聽擴展程序消息，更新黑名單
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "blacklistUpdated") {
    // 通知content script黑名單已更新
    window.postMessage(
      {
        type: "BLACKLIST_UPDATED",
      },
      "*"
    );
  }
});
