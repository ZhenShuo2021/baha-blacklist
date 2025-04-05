const originalFetch = window.fetch;
let blacklist = new Set();
let blacklistPromise = null;

// 判斷是否是彈幕請求URL
function isDanmuRequestUrl(url) {
  const targetUrlPattern = /^https:\/\/api\.gamer\.com\.tw\/anime\/v1\/danmu\.php\?/;
  return targetUrlPattern.test(url);
}

// 創建新的修改後的response
function createModifiedResponse(originalResponse, jsonData) {
  const modifiedBody = JSON.stringify(jsonData);
  const responseHeaders = new Headers(originalResponse.headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-encoding");
  responseHeaders.set("content-type", "application/json; charset=utf-8");

  return new Response(modifiedBody, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: responseHeaders,
  });
}

// 從inject script獲取黑名單
async function getBlacklistFromBackground() {
  if (blacklistPromise) return blacklistPromise;

  blacklistPromise = new Promise((resolve) => {
    // 設置監聽器來接收blacklist數據
    const listener = (event) => {
      if (event.data?.type === "BLACKLIST_RESPONSE") {
        window.removeEventListener("message", listener);
        resolve(new Set(event.data.blacklist));
      }
    };

    window.addEventListener("message", listener);
    // 向inject腳本請求數據
    window.postMessage({ type: "GET_BLACKLIST_FROM_CONTENT" }, "*");
  });

  return blacklistPromise;
}

// 處理彈幕數據
async function processDanmuResponse(response, blacklist) {
  const clonedResponse = response.clone();

  try {
    const jsonData = await clonedResponse.json();
    if (jsonData?.data?.danmu?.length) {
      const originalCount = jsonData.data.danmu.length;
      jsonData.data.danmu = jsonData.data.danmu.filter(
        (item) => !blacklist.has(item.userid)
      );
      const filteredCount = originalCount - jsonData.data.danmu.length;
      if (filteredCount > 0) {
        console.log(`彈幕過濾器：已過濾 ${filteredCount} 條彈幕`);
      }
    }

    return createModifiedResponse(response, jsonData);
  } catch (error) {
    console.error("處理彈幕數據失敗:", error);
    return response;
  }
}

// 監聽黑名單更新事件
window.addEventListener("message", (event) => {
  if (event.data?.type === "BLACKLIST_UPDATED") {
    // 重置黑名單緩存，強制下次請求重新獲取
    blacklistPromise = null;
    console.log("彈幕過濾器：黑名單已更新");
  }
});

// 重寫fetch方法以攔截彈幕請求
window.fetch = async (...args) => {
  const resource = args[0];
  const url = resource instanceof Request ? resource.url : String(resource);

  if (!isDanmuRequestUrl(url)) {
    return originalFetch(...args);
  }

  // 彈幕請求，需要過濾
  if (blacklist.size === 0) {
    try {
      blacklist = await getBlacklistFromBackground();
    } catch (error) {
      console.error("獲取黑名單失敗:", error);
      blacklist = new Set(); // 使用空集合而不是硬編碼的預設黑名單
    }
  }

  const response = await originalFetch(...args);
  return processDanmuResponse(response, blacklist);
};
