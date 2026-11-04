// Covers are local image assets, separate from task metadata and conversation storage.
const urls = new Map();
let database;

function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open("preacherman.task.covers", 1);
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error("Cover storage is unavailable. Please try again later."));
    }, 6000);
    request.onupgradeneeded = () => request.result.createObjectStore("covers");
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); database = null; };
      resolve(request.result);
    };
  }).catch(error => { database = null; throw error; });
  return database;
}

async function transact(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("covers", mode);
    const request = operation(transaction.objectStore("covers"));
    const timer = setTimeout(() => transaction.abort(), 6000);
    transaction.oncomplete = () => { clearTimeout(timer); resolve(request.result); };
    transaction.onabort = transaction.onerror = () => {
      clearTimeout(timer);
      reject(transaction.error ?? new Error("The cover could not be saved. Please try again."));
    };
  });
}

export function taskCoverUrl(id) { return urls.get(id) ?? null; }

export async function loadTaskCovers(ids) {
  const missing = [...new Set(ids.filter(id => typeof id === "string" && !urls.has(id)))];
  await Promise.all(missing.map(async id => {
    try {
      const blob = await transact("readonly", store => store.get(id));
      if (blob instanceof Blob && !urls.has(id)) urls.set(id, URL.createObjectURL(blob));
    } catch {
      // A missing image must not prevent the task or its conversation from opening.
    }
  }));
}

export async function saveTaskCover(blob) {
  const id = crypto.randomUUID();
  await transact("readwrite", store => store.put(blob, id));
  urls.set(id, URL.createObjectURL(blob));
  return id;
}

export async function discardTaskCover(id) {
  await transact("readwrite", store => store.delete(id));
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
}

export async function prepareTaskCover(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  const source = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The image took too long to load. Please select it again.")), 10000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error("The image could not be read. Please choose another.")); };
      image.src = source;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("The image has no valid dimensions. Please choose another.");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("The image could not be processed. Please choose another.");
    return blob;
  } finally {
    image.onload = image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(source);
  }
}

addEventListener("pagehide", event => {
  if (event.persisted) return;
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  database?.then(db => db.close()).catch(() => {});
  database = null;
});
