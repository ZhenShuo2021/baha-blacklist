const LOCAL_FILES_KEY = "local_blacklist_files";
const DEFAULT_BLACKLIST_KEY = "default_blacklist";
const NETWORK_SOURCES_KEY = "network_sources";
const DEFAULT_NETWORK_SOURCE =
  "https://raw.githubusercontent.com/ZhenShuo2021/baha-blacklist/refs/heads/main/blacklist.txt";

// 存儲與獲取功能
async function getFromStorage(key, defaultValue = null) {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] || defaultValue;
  } catch (error) {
    console.error(`獲取數據失敗 (${key}):`, error);
    return defaultValue;
  }
}

async function getSavedFiles() {
  return await getFromStorage(LOCAL_FILES_KEY, []);
}

// 文件處理功能
async function readFileContent(file) {
  const reader = new FileReader();
  const contentPromise = new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("文件讀取失敗"));
  });

  reader.readAsText(file);
  return await contentPromise;
}

async function selectFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".txt";

  // 創建一個Promise來處理文件選擇
  const filePromise = new Promise((resolve) => {
    input.onchange = (event) => {
      if (event.target.files.length > 0) {
        resolve(event.target.files[0]);
      } else {
        resolve(null);
      }
    };
  });

  // 觸發文件選擇器
  input.click();

  // 等待用戶選擇文件
  return await filePromise;
}

// 初始化網絡來源功能
async function initializeNetworkSources() {
  try {
    const sources = await getFromStorage(NETWORK_SOURCES_KEY);

    // 如果網絡來源不存在或為空數組，設置默認值
    if (!sources || (Array.isArray(sources) && sources.length === 0)) {
      console.log("設置默認網絡來源:", DEFAULT_NETWORK_SOURCE);
      await chrome.storage.local.set({
        [NETWORK_SOURCES_KEY]: [DEFAULT_NETWORK_SOURCE],
      });

      // 通知background.js更新網絡來源
      await chrome.runtime.sendMessage({
        action: "updateNetworkSources",
        sources: [DEFAULT_NETWORK_SOURCE],
      });
    }
  } catch (error) {
    console.error("初始化網絡來源失敗:", error);
  }
}

// UI 互動功能 - 本地文件
async function addLocalFile() {
  try {
    const file = await selectFile();
    if (!file) return;

    const content = await readFileContent(file);
    const userIdCount = content
      .split("\n")
      .filter((line) => line.trim()).length;

    // 保存文件信息到存儲
    const savedFiles = await getSavedFiles();
    const fileInfo = {
      path: file.name,
      lastAccessed: Date.now(),
      userIdCount,
      content: content,
    };

    // 檢查是否已存在相同名稱的文件
    const existingIndex = savedFiles.findIndex((f) => f.path === file.name);
    if (existingIndex >= 0) {
      savedFiles[existingIndex] = fileInfo;
    } else {
      savedFiles.push(fileInfo);
    }

    await chrome.storage.local.set({ [LOCAL_FILES_KEY]: savedFiles });

    // 通知background.js更新黑名單
    await chrome.runtime.sendMessage({
      action: "updateLocalFiles",
      files: savedFiles,
    });

    // 更新UI
    await updateLocalFilesList();
    await updateCurrentBlacklist();
  } catch (error) {
    console.error("添加文件失敗:", error);
    alert("添加文件失敗: " + error.message);
  }
}

async function removeLocalFile(index) {
  const savedFiles = await getSavedFiles();
  savedFiles.splice(index, 1);
  await chrome.storage.local.set({ [LOCAL_FILES_KEY]: savedFiles });

  // 通知background.js更新黑名單
  await chrome.runtime.sendMessage({
    action: "updateLocalFiles",
    files: savedFiles,
  });

  // 更新UI
  await updateLocalFilesList();
  await updateCurrentBlacklist();
}

// UI 互動功能 - 默認黑名單
async function loadDefaultBlacklist() {
  try {
    const defaultBlacklist = await getFromStorage(DEFAULT_BLACKLIST_KEY, []);
    document.getElementById("defaultBlacklist").value =
      defaultBlacklist.join("\n");
  } catch (error) {
    console.error("加載默認黑名單失敗:", error);
  }
}

async function saveDefaultBlacklist() {
  try {
    const input = document.getElementById("defaultBlacklist").value;
    const blacklist = input
      .split("\n")
      .map((id) => id.trim())
      .filter((id) => id);

    await chrome.storage.local.set({ [DEFAULT_BLACKLIST_KEY]: blacklist });

    // 通知background.js更新黑名單
    await chrome.runtime.sendMessage({
      action: "updateDefaultBlacklist",
      blacklist,
    });

    await updateCurrentBlacklist();
    alert("手動設定黑名單已保存");
  } catch (error) {
    console.error("保存手動設定黑名單失敗:", error);
    alert("保存失敗: " + error.message);
  }
}

// UI 互動功能 - 網絡來源
async function loadNetworkSources() {
  try {
    const sources = await getFromStorage(NETWORK_SOURCES_KEY, []);
    document.getElementById("networkSources").value = sources.join("\n");
  } catch (error) {
    console.error("加載網絡來源失敗:", error);
  }
}

async function saveNetworkSources() {
  try {
    const input = document.getElementById("networkSources").value;
    const sources = input
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url);

    // 保存用戶輸入的值，即使是空的
    await chrome.storage.local.set({ [NETWORK_SOURCES_KEY]: sources });

    // 通知background.js更新網絡來源
    await chrome.runtime.sendMessage({
      action: "updateNetworkSources",
      sources,
    });

    await updateCurrentBlacklist();
    alert("網絡來源已保存");
  } catch (error) {
    console.error("保存網絡來源失敗:", error);
    alert("保存失敗: " + error.message);
  }
}

// UI 更新功能
async function updateLocalFilesList() {
  const filesListElem = document.getElementById("localFilesList");
  filesListElem.innerHTML = "";

  const savedFiles = await getSavedFiles();

  if (savedFiles.length === 0) {
    filesListElem.innerHTML = '<div class="status">尚未添加本地文件</div>';
    return;
  }

  // 按ID數量由高到低排序文件
  const sortedFiles = [...savedFiles].sort(
    (a, b) => b.userIdCount - a.userIdCount
  );

  sortedFiles.forEach((file, index) => {
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";

    const fileInfo = document.createElement("div");
    fileInfo.innerHTML = `<strong>${file.path}</strong> (包含 ${file.userIdCount} 個ID)`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "移除";

    // 找到原始數組中的索引
    const originalIndex = savedFiles.findIndex((f) => f.path === file.path);
    removeBtn.addEventListener("click", () => removeLocalFile(originalIndex));

    fileItem.appendChild(fileInfo);
    fileItem.appendChild(removeBtn);
    filesListElem.appendChild(fileItem);
  });
}

async function updateCurrentBlacklist() {
  const blacklistElem = document.getElementById("currentBlacklist");
  blacklistElem.innerHTML = '<div class="status">正在加載黑名單...</div>';

  try {
    const response = await chrome.runtime.sendMessage({
      action: "getBlacklist",
    });

    // 清空當前內容
    blacklistElem.innerHTML = "";

    // 檢查黑名單是否存在且是非空數組
    if (
      response &&
      response.blacklist &&
      Array.isArray(response.blacklist) &&
      response.blacklist.length > 0
    ) {
      // 使用localeCompare確保按照字符順序排序
      const sortedBlacklist = [...response.blacklist].sort((a, b) =>
        a.localeCompare(b)
      );

      const list = document.createElement("ul");
      sortedBlacklist.forEach((userId) => {
        if (userId && userId.trim()) {
          // 確保ID不是空字符串
          const item = document.createElement("li");
          item.textContent = userId;
          list.appendChild(item);
        }
      });

      // 只有當列表中有項目時才添加到DOM
      if (list.children.length > 0) {
        blacklistElem.appendChild(list);
      } else {
        blacklistElem.innerHTML = '<div class="status">黑名單為空</div>';
      }
    } else {
      // 黑名單為空或不存在
      blacklistElem.innerHTML = '<div class="status">黑名單為空</div>';
    }
  } catch (error) {
    console.error("更新黑名單顯示失敗:", error);
    blacklistElem.innerHTML = `<div class="status">更新黑名單顯示失敗: ${error.message}</div>`;
  }
}

// 頁面初始化
document.addEventListener("DOMContentLoaded", async () => {
  // 確保網絡來源至少有默認值
  await initializeNetworkSources();

  // 初始化界面
  await Promise.all([
    loadDefaultBlacklist(),
    loadNetworkSources(),
    updateLocalFilesList(),
    updateCurrentBlacklist(),
  ]);

  // 添加事件監聽器
  document
    .getElementById("addLocalFile")
    .addEventListener("click", addLocalFile);
  document
    .getElementById("saveDefaultBlacklist")
    .addEventListener("click", saveDefaultBlacklist);
  document
    .getElementById("saveNetworkSources")
    .addEventListener("click", saveNetworkSources);
});
