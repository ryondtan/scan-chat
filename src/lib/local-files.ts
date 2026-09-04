/**
 * Local attachment store (IndexedDB).
 *
 * Chat photos/files are cached on the device that sent or first opened them,
 * so re-viewing them never re-downloads from cloud storage. Images are also
 * compressed before upload, which keeps cloud storage usage small.
 */

const DB_NAME = "lumen-files";
const STORE = "attachments";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("No IndexedDB"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function saveLocalFile(key: string, blob: Blob): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put(blob, key) as IDBRequest<IDBValidKey>);
  } catch {
    /* storage full or unavailable — cloud copy still works */
  }
}

export async function getLocalFile(key: string): Promise<Blob | null> {
  try {
    const blob = await tx<Blob | undefined>("readonly", (s) => s.get(key) as IDBRequest<Blob | undefined>);
    return blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteLocalFile(key: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(key) as unknown as IDBRequest<undefined>);
  } catch {
    /* ignore */
  }
}

export async function clearLocalFiles(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.clear() as unknown as IDBRequest<undefined>);
  } catch {
    /* ignore */
  }
}

/** Approximate bytes used by the local attachment cache. */
export async function localFilesUsage(): Promise<number> {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return est.usage ?? 0;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/**
 * Downscale + re-encode an image so the cloud copy stays small.
 * Non-images (and failures) return the original file untouched.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 300 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
