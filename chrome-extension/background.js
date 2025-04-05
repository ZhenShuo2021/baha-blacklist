const CACHE_DURATION = 24 * 60 * 60 * 1000;
const CACHE_PATH = "danmu_blacklist_cache";
const LOCAL_FILES_KEY = "local_blacklist_files";
const DEFAULT_BLACKLIST_KEY = "default_blacklist";
const NETWORK_SOURCES_KEY = "network_sources";
const DEFAULT_NETWORK_SOURCE = "https://raw.githubusercontent.com/ZhenShuo2021/baha-blacklist/refs/heads/main/blacklist.txt";
const FILE_WATCH_INTERVAL = 5000; // 5秒檢查一次文件是否更新

async function getFromStorage(key, defaultValue = null) {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] || defaultValue;
  } catch (error) {
    console.error(`獲取數據失敗 (${key}):`, error);
    return defaultValue;
  }
}

async function saveToStorage(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    return true;
  } catch (error) {
    console.error(`儲存數據失敗 (${key}):`, error);
    return false;
  }
}

// 黑名單相關請求功能
async function getCachedBlacklist(path) {
  try {
    const cached = await getFromStorage(`${CACHE_PATH}_${path}`);
    return cached?.content || null;
  } catch (error) {
    console.error(`獲取緩存的黑名單失敗 (${path}):`, error);
    return null;
  }
}

async function fetchAndCacheBlacklist(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const text = await response.text();
    await saveToStorage(`${CACHE_PATH}_${url}`, {
      content: text,
      timestamp: Date.now(),
    });
    return text;
  } catch (error) {
    console.error(`獲取黑名單失敗 (${url}):`, error);
    return null;
  }
}

async function getDefaultBlacklist() {
  return await getFromStorage(DEFAULT_BLACKLIST_KEY, []);
}

async function getLocalFiles() {
  return await getFromStorage(LOCAL_FILES_KEY, []);
}

async function getNetworkSources() {
  return await getFromStorage(NETWORK_SOURCES_KEY, []);
}

// 黑名單管理功能
async function loadBlacklists() {
  const blacklistSources = {
    default: await getDefaultBlacklist(),
    network: [],
    local: [],
  };

  // 合併所有來源到一個集合
  const userIds = new Set();

  // 添加默認黑名單
  blacklistSources.default.forEach((id) => userIds.add(id));

  // 加載網絡源
  const networkSources = await getNetworkSources();
  for (const url of networkSources) {
    let text = await getCachedBlacklist(url);
    if (!text) {
      text = await fetchAndCacheBlacklist(url);
    }
    if (text) {
      const ids = text
        .split("\n")
        .map((id) => id.trim())
        .filter((id) => id);

      blacklistSources.network = blacklistSources.network.concat(ids);
      ids.forEach((id) => userIds.add(id));
    }
  }

  // 加載本地文件
  try {
    const savedFiles = await getLocalFiles();

    for (const fileInfo of savedFiles) {
      let text;

      // 優先使用直接保存的內容
      if (fileInfo.content) {
        text = fileInfo.content;
      } else {
        text = await getCachedBlacklist(fileInfo.path);
      }

      if (text) {
        const ids = text
          .split("\n")
          .map((id) => id.trim())
          .filter((id) => id);

        blacklistSources.local = blacklistSources.local.concat(ids);
        ids.forEach((id) => userIds.add(id));
      }
    }
  } catch (error) {
    console.error("加載本地文件失敗:", error);
  }

  // 確保最後返回的列表是按字符順序排序的
  return {
    combined: Array.from(userIds).sort((a, b) => a.localeCompare(b)),
    sources: blacklistSources,
  };
}

// 通知功能
function notifyBlacklistUpdated() {
  chrome.tabs.query(
    { url: "https://ani.gamer.com.tw/animeVideo.php?sn=*" },
    (tabs) => {
      for (const tab of tabs) {
        chrome.tabs
          .sendMessage(tab.id, { action: "blacklistUpdated" })
          .catch((err) =>
            console.log(`無法發送更新到標籤頁 ${tab.id}: ${err.message}`)
          );
      }
    }
  );
}

// 更新功能
async function updateLocalFilesList(files) {
  // 保存文件列表到存儲
  await saveToStorage(LOCAL_FILES_KEY, files);

  // 清除之前的緩存
  const keysToRemove = [];
  const result = await chrome.storage.local.get(null);
  for (const key in result) {
    if (key.startsWith(`${CACHE_PATH}_`) && !key.includes("https://")) {
      // 保留網絡源的緩存，但刪除本地文件緩存
      keysToRemove.push(key);
    }
  }

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }

  // 為每個文件進行緩存
  for (const fileInfo of files) {
    try {
      if (fileInfo.content) {
        await saveToStorage(`${CACHE_PATH}_${fileInfo.path}`, {
          content: fileInfo.content,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error(`緩存文件內容失敗 (${fileInfo.path}):`, error);
    }
  }

  notifyBlacklistUpdated();
}

async function updateNetworkSources() {
  const sources = await getNetworkSources();
  if (sources.length === 0) {
    // 如果沒有網絡來源，只需通知更新即可
    notifyBlacklistUpdated();
    return;
  }

  for (const url of sources) {
    await fetchAndCacheBlacklist(url);
  }
  notifyBlacklistUpdated();
}

// 事件處理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getBlacklist") {
    loadBlacklists().then((result) => {
      sendResponse({ blacklist: result.combined, sources: result.sources });
    });
    return true;
  } else if (message.action === "updateLocalFiles") {
    if (message.files) {
      updateLocalFilesList(message.files)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error("更新本地文件列表失敗:", error);
          sendResponse({ success: false, error: error.message });
        });
    }
    return true;
  } else if (message.action === "updateDefaultBlacklist") {
    if (message.blacklist) {
      saveToStorage(DEFAULT_BLACKLIST_KEY, message.blacklist)
        .then(() => {
          notifyBlacklistUpdated();
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error("更新默認黑名單失敗:", error);
          sendResponse({ success: false, error: error.message });
        });
    }
    return true;
  } else if (message.action === "updateNetworkSources") {
    if (message.sources !== undefined) {
      // 使用 !== undefined 來允許空數組
      saveToStorage(NETWORK_SOURCES_KEY, message.sources)
        .then(() => {
          updateNetworkSources().then(() => {
            sendResponse({ success: true });
          });
        })
        .catch((error) => {
          console.error("更新網絡來源失敗:", error);
          sendResponse({ success: false, error: error.message });
        });
    }
    return true;
  }
});

// 初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    console.log("首次安裝擴展");

    // 檢查是否已有網絡源
    const networkSources = await getNetworkSources();
    if (networkSources.length === 0) {
      // 如果沒有，設置默認網絡源
      await saveToStorage(NETWORK_SOURCES_KEY, [DEFAULT_NETWORK_SOURCE]);

      // 預取默認網絡源的內容
      await fetchAndCacheBlacklist(DEFAULT_NETWORK_SOURCE);
    }
  } else if (details.reason === "update") {
    console.log(`擴展更新: ${details.previousVersion} -> ${chrome.runtime.getManifest().version}`);

    // 更新時也檢查並刷新緩存
    await updateNetworkSources();
  }
});
