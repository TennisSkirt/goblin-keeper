// db.js — IndexedDB 래퍼 (meta: 볼트 메타 1건, items: 암호화된 항목들)

const DB_NAME = "my-vault";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("items"))
        db.createObjectStore("items", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => {
      db.close();
      resolve(result.__value !== undefined ? result.__value : undefined);
    };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

function reqValue(req, holder) {
  req.onsuccess = () => { holder.__value = req.result; };
  return holder;
}

const vaultDB = {
  getMeta: () => tx("meta", "readonly", (s) => reqValue(s.get("meta"), {})),
  setMeta: (meta) => tx("meta", "readwrite", (s) => { s.put(meta, "meta"); return {}; }),
  getAllItems: () => tx("items", "readonly", (s) => reqValue(s.getAll(), {})),
  putItem: (item) => tx("items", "readwrite", (s) => { s.put(item); return {}; }),
  deleteItem: (id) => tx("items", "readwrite", (s) => { s.delete(id); return {}; }),
  clearItems: () => tx("items", "readwrite", (s) => { s.clear(); return {}; }),
  // 백업 정보(마지막 백업 시각) — 백업 파일에는 포함되지 않는 별도 키
  getBackupInfo: () => tx("meta", "readonly", (s) => reqValue(s.get("backup"), {})),
  setBackupInfo: (info) => tx("meta", "readwrite", (s) => { s.put(info, "backup"); return {}; }),
  // 생체인증 자격증명 + 볼트키를 감싼 레코드
  getBio: () => tx("meta", "readonly", (s) => reqValue(s.get("bio"), {})),
  setBio: (b) => tx("meta", "readwrite", (s) => { s.put(b, "bio"); return {}; }),
  deleteBio: () => tx("meta", "readwrite", (s) => { s.delete("bio"); return {}; }),
};
