// PDF, Word and Excel attachments. File bodies live in IndexedDB (too large for localStorage); cards keep only a fileId.
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const FILE_KINDS = {
  pdf:   { label: 'PDF',   icon: 'file-earmark-pdf-fill',   color: '#e5484d', exts: ['pdf'],              mimes: ['application/pdf'] },
  word:  { label: 'Word',  icon: 'file-earmark-word-fill',  color: '#2b6ce0', exts: ['doc', 'docx'],      mimes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  excel: { label: 'Excel', icon: 'file-earmark-excel-fill', color: '#1f9d55', exts: ['xls', 'xlsx', 'csv'], mimes: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'] },
};
export const FILE_ACCEPT = Object.values(FILE_KINDS).flatMap(k => k.exts.map(e => '.' + e)).join(',');

export function fileKind(file) {
  const ext = (file?.name || '').split('.').pop().toLowerCase();
  for (const [kind, info] of Object.entries(FILE_KINDS)) if (info.exts.includes(ext) || info.mimes.includes(file?.type)) return kind;
  return null;
}
export function formatSize(bytes) {
  if (!(bytes >= 0)) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

let dbPromise = null;
function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('yozu-files', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}
function run(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const tx = d.transaction('files', mode), req = fn(tx.objectStore('files'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  }));
}
export const putFile = (id, blob) => run('readwrite', s => s.put(blob, id));
export const getFile = id => run('readonly', s => s.get(id)).then(b => b || null, () => null);

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
}
export function dataUrlToBlob(url) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url); if (!m) return null;
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
}
