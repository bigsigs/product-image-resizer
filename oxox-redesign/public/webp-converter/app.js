import {
  buildOutputName,
  createStoredZip,
  dedupeNames,
  formatBytes,
  normalizeQuality
} from "./core.js";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_FILES = 200;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PIXELS = 80_000_000;
const CONCURRENCY = 3;

const state = {
  files: [],
  results: [],
  namingMode: "original",
  background: "transparent",
  processing: false,
  reconvertDirty: false,
  id: 0
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const elements = {
  fileInput: $("#fileInput"),
  dropZone: $("#dropZone"),
  queue: $("#queue"),
  queueTitle: $("#queueTitle"),
  fileList: $("#fileList"),
  addButton: $("#addButton"),
  clearButton: $("#clearButton"),
  convertButton: $("#convertButton"),
  quality: $("#quality"),
  qualityOutput: $("#qualityOutput"),
  baseName: $("#baseName"),
  startNumber: $("#startNumber"),
  digits: $("#digits"),
  nameTemplate: $("#nameTemplate"),
  prefix: $("#prefix"),
  suffix: $("#suffix"),
  namePreview: $("#namePreview"),
  progressWrap: $("#progressWrap"),
  progressText: $("#progressText"),
  progressCount: $("#progressCount"),
  progressBar: $("#progressBar"),
  progressTrack: $(".progress-track"),
  results: $("#results"),
  resultGrid: $("#resultGrid"),
  resultSummary: $("#resultSummary"),
  restartButton: $("#restartButton"),
  downloadAllButton: $("#downloadAllButton")
};

function namingOptions(file, index, dimensions = {}) {
  return {
    mode: state.namingMode,
    originalName: file.name,
    index: index + 1,
    base: elements.baseName.value,
    start: Number(elements.startNumber.value),
    digits: Number(elements.digits.value),
    template: elements.nameTemplate.value,
    prefix: elements.prefix.value,
    suffix: elements.suffix.value,
    width: dimensions.width,
    height: dimensions.height
  };
}

function previewNames() {
  const sampleFiles = state.files.length
    ? state.files.slice(0, 3).map(item => item.file)
    : [
        { name: "front-view.jpg" },
        { name: "detail shot.png" },
        { name: "包装图.webp" }
      ];

  const names = dedupeNames(sampleFiles.map((file, index) =>
    buildOutputName(namingOptions(file, index))
  ));

  elements.namePreview.replaceChildren(...names.map(name => {
    const line = document.createElement("div");
    line.className = "preview-name";
    line.textContent = name;
    return line;
  }));
}

function updateModeFields() {
  $$(".naming-mode").forEach(button => {
    button.classList.toggle("active", button.dataset.mode === state.namingMode);
  });
  $$(".mode-fields").forEach(group => {
    group.hidden = group.dataset.fields !== state.namingMode;
  });
  previewNames();
  applyGeneratedNames();
}

function setBackground(mode) {
  state.background = mode;
  $$(".background-mode").forEach(button => {
    button.classList.toggle("active", button.dataset.background === mode);
  });
  markReconvertNeeded();
}

function markReconvertNeeded() {
  if (!state.files.length || state.processing) return;
  state.reconvertDirty = state.results.length > 0;
  elements.convertButton.disabled = false;
  elements.convertButton.textContent = state.reconvertDirty
    ? `按新设置重新转换 ${state.files.length} 张`
    : `转换 ${state.files.length} 张图片`;
}

function addFiles(fileList) {
  const incoming = [...fileList];
  const rejected = incoming.filter(file => !ACCEPTED_TYPES.has(file.type) || file.size > MAX_FILE_BYTES);
  const accepted = incoming.filter(file => ACCEPTED_TYPES.has(file.type) && file.size <= MAX_FILE_BYTES);

  if (rejected.length) {
    window.alert(`有 ${rejected.length} 个文件未添加：仅支持 JPG、PNG、WebP、AVIF，且单个文件不能超过 50 MB。`);
  }

  const existingKeys = new Set(state.files.map(item =>
    `${item.file.name}:${item.file.size}:${item.file.lastModified}`
  ));

  for (const file of accepted) {
    if (state.files.length >= MAX_FILES) break;
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    state.files.push({ id: ++state.id, file });
  }

  releaseResults();
  renderQueue();
  previewNames();
}

function renderQueue() {
  const hasFiles = state.files.length > 0;
  elements.dropZone.hidden = hasFiles;
  elements.queue.classList.toggle("active", hasFiles);
  elements.results.classList.remove("active");
  elements.progressWrap.classList.remove("active");
  elements.queueTitle.textContent = `待转换图片 · ${state.files.length} 张`;
  elements.convertButton.disabled = !hasFiles;
  elements.convertButton.textContent = hasFiles
    ? `转换 ${state.files.length} 张图片`
    : "选择图片后开始转换";

  const generated = dedupeNames(state.files.map((item, index) =>
    buildOutputName(namingOptions(item.file, index))
  ));

  const rows = state.files.map((item, index) => {
    const row = document.createElement("div");
    row.className = "file-row";

    const number = document.createElement("span");
    number.className = "file-no";
    number.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("div");
    copy.className = "file-copy";
    const source = document.createElement("div");
    source.className = "file-name";
    source.textContent = item.file.name;
    const target = document.createElement("div");
    target.className = "file-target";
    target.textContent = `→ ${generated[index]}`;
    copy.append(source, target);

    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = formatBytes(item.file.size);

    const remove = document.createElement("button");
    remove.className = "remove-file";
    remove.type = "button";
    remove.setAttribute("aria-label", `移除 ${item.file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      state.files = state.files.filter(fileItem => fileItem.id !== item.id);
      renderQueue();
      previewNames();
    });

    row.append(number, copy, size, remove);
    return row;
  });

  elements.fileList.replaceChildren(...rows);
}

function clearAll() {
  releaseResults();
  state.files = [];
  elements.fileInput.value = "";
  renderQueue();
  previewNames();
}

function releaseResults() {
  for (const result of state.results) {
    if (result.url) URL.revokeObjectURL(result.url);
  }
  state.results = [];
  elements.resultGrid.replaceChildren();
}

function loadImageFallback(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url)
    });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("浏览器无法读取这个图片格式"));
    };
    image.src = url;
  });
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      };
    } catch {
      return loadImageFallback(file);
    }
  }
  return loadImageFallback(file);
}

function canvasToWebP(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob || blob.type !== "image/webp") {
        reject(new Error("当前浏览器不支持 WebP 编码"));
        return;
      }
      resolve(blob);
    }, "image/webp", quality);
  });
}

async function convertFile(file) {
  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_PIXELS) {
      throw new Error("图片尺寸过大，单张不能超过 8000 万像素");
    }

    const canvas = document.createElement("canvas");
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext("2d", { alpha: state.background === "transparent" });

    if (!context) throw new Error("浏览器无法创建图片画布");
    if (state.background === "white") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(decoded.source, 0, 0);

    const blob = await canvasToWebP(canvas, normalizeQuality(elements.quality.value));
    return {
      blob,
      width: decoded.width,
      height: decoded.height,
      url: URL.createObjectURL(blob)
    };
  } finally {
    decoded.close();
  }
}

function updateProgress(done, total) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  elements.progressCount.textContent = `${done} / ${total}`;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressTrack.setAttribute("aria-valuenow", String(percent));
}

async function processAll() {
  if (!state.files.length || state.processing) return;
  releaseResults();
  state.processing = true;
  state.reconvertDirty = false;
  elements.convertButton.disabled = true;
  elements.queue.classList.remove("active");
  elements.results.classList.remove("active");
  elements.progressWrap.classList.add("active");
  elements.progressText.textContent = "正在本地转换";
  updateProgress(0, state.files.length);

  const results = new Array(state.files.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < state.files.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = state.files[index];
      try {
        const converted = await convertFile(item.file);
        results[index] = { ...converted, item, error: null, name: "" };
      } catch (error) {
        results[index] = {
          item,
          error: error instanceof Error ? error.message : "转换失败",
          name: ""
        };
      }
      completed += 1;
      updateProgress(completed, state.files.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, state.files.length) }, worker));
  state.results = results;
  state.processing = false;
  applyGeneratedNames();
  renderResults();
}

function applyGeneratedNames() {
  const successful = state.results.filter(result => result && !result.error);
  if (!successful.length) return;

  const rawNames = successful.map(result => {
    const index = state.files.findIndex(item => item.id === result.item.id);
    return buildOutputName(namingOptions(result.item.file, index, result));
  });
  const uniqueNames = dedupeNames(rawNames);
  successful.forEach((result, index) => { result.name = uniqueNames[index]; });

  if (elements.results.classList.contains("active")) renderResults();
}

function applyManualName(result, value) {
  result.name = buildOutputName({ originalName: value || "image" });
  const successful = state.results.filter(item => item && !item.error);
  const unique = dedupeNames(successful.map(item => item.name));
  successful.forEach((item, index) => { item.name = unique[index]; });
  renderResults();
}

function savingLabel(originalSize, outputSize) {
  if (!originalSize) return { text: "已转换", negative: false };
  const percent = Math.round((1 - outputSize / originalSize) * 100);
  return percent >= 0
    ? { text: `减少 ${percent}%`, negative: false }
    : { text: `增加 ${Math.abs(percent)}%`, negative: true };
}

function renderResults() {
  elements.progressWrap.classList.remove("active");
  elements.queue.classList.remove("active");
  elements.results.classList.add("active");

  const cards = state.results.map((result, index) => {
    const card = document.createElement("article");
    card.className = "result-card";
    card.style.animationDelay = `${index * 35}ms`;

    if (result.error) {
      const error = document.createElement("div");
      error.className = "result-error";
      error.textContent = `${result.item.file.name}\n${result.error}`;
      card.append(error);
      return card;
    }

    const preview = document.createElement("div");
    preview.className = "result-preview";
    const image = document.createElement("img");
    image.src = result.url;
    image.alt = `${result.item.file.name} 的 WebP 预览`;
    preview.append(image);

    const body = document.createElement("div");
    body.className = "result-body";

    const name = document.createElement("input");
    name.className = "result-name";
    name.value = result.name;
    name.setAttribute("aria-label", `${result.item.file.name} 的输出文件名`);
    name.addEventListener("change", event => applyManualName(result, event.target.value));

    const meta = document.createElement("div");
    meta.className = "result-meta";
    const dimensions = document.createElement("span");
    dimensions.textContent = `${result.width} × ${result.height}`;
    const original = document.createElement("span");
    original.textContent = `原 ${formatBytes(result.item.file.size)}`;
    const output = document.createElement("span");
    output.textContent = `WebP ${formatBytes(result.blob.size)}`;
    const savingData = savingLabel(result.item.file.size, result.blob.size);
    const saving = document.createElement("span");
    saving.className = `saving${savingData.negative ? " negative" : ""}`;
    saving.textContent = savingData.text;
    meta.append(dimensions, original, output, saving);

    const download = document.createElement("button");
    download.className = "result-download";
    download.type = "button";
    download.textContent = "下载这张";
    download.addEventListener("click", () => downloadBlob(result.blob, result.name));

    body.append(name, meta, download);
    card.append(preview, body);
    return card;
  });

  elements.resultGrid.replaceChildren(...cards);
  const successful = state.results.filter(result => result && !result.error);
  const failed = state.results.length - successful.length;
  const originalBytes = successful.reduce((sum, result) => sum + result.item.file.size, 0);
  const outputBytes = successful.reduce((sum, result) => sum + result.blob.size, 0);
  elements.resultSummary.textContent =
    `${successful.length} 张成功 · ${formatBytes(originalBytes)} → ${formatBytes(outputBytes)}${failed ? ` · ${failed} 张失败` : ""}`;
  elements.downloadAllButton.disabled = successful.length === 0;
  elements.downloadAllButton.textContent = successful.length === 1 ? "下载 WebP" : `下载 ZIP · ${successful.length} 张`;
  elements.convertButton.disabled = false;
  elements.convertButton.textContent = `重新转换 ${state.files.length} 张`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadAll() {
  const successful = state.results.filter(result => result && !result.error);
  if (!successful.length) return;
  if (successful.length === 1) {
    downloadBlob(successful[0].blob, successful[0].name);
    return;
  }

  elements.downloadAllButton.disabled = true;
  elements.downloadAllButton.textContent = "正在打包…";
  try {
    const entries = await Promise.all(successful.map(async result => ({
      name: result.name,
      data: new Uint8Array(await result.blob.arrayBuffer())
    })));
    const zip = createStoredZip(entries);
    downloadBlob(new Blob([zip], { type: "application/zip" }), `oxox-webp-${new Date().toISOString().slice(0,10)}.zip`);
  } finally {
    elements.downloadAllButton.disabled = false;
    elements.downloadAllButton.textContent = `下载 ZIP · ${successful.length} 张`;
  }
}

elements.dropZone.addEventListener("click", () => elements.fileInput.click());
elements.addButton.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", event => {
  addFiles(event.target.files);
  event.target.value = "";
});
elements.dropZone.addEventListener("dragover", event => {
  event.preventDefault();
  elements.dropZone.classList.add("dragging");
});
elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("dragging"));
elements.dropZone.addEventListener("drop", event => {
  event.preventDefault();
  elements.dropZone.classList.remove("dragging");
  addFiles(event.dataTransfer.files);
});

$$(".naming-mode").forEach(button => {
  button.addEventListener("click", () => {
    state.namingMode = button.dataset.mode;
    updateModeFields();
    if (!state.results.length) renderQueue();
  });
});
$$(".background-mode").forEach(button => {
  button.addEventListener("click", () => setBackground(button.dataset.background));
});

[
  elements.baseName,
  elements.startNumber,
  elements.digits,
  elements.nameTemplate,
  elements.prefix,
  elements.suffix
].forEach(input => {
  input.addEventListener("input", () => {
    previewNames();
    applyGeneratedNames();
    if (!state.results.length) renderQueue();
  });
});

elements.quality.addEventListener("input", () => {
  elements.qualityOutput.textContent = `${elements.quality.value}%`;
  markReconvertNeeded();
});
elements.clearButton.addEventListener("click", clearAll);
elements.restartButton.addEventListener("click", clearAll);
elements.convertButton.addEventListener("click", processAll);
elements.downloadAllButton.addEventListener("click", downloadAll);
window.addEventListener("beforeunload", releaseResults);

previewNames();
