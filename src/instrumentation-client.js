// Polyfill kecil untuk HP lama (contoh: iPhone 7 dengan iOS 15.0–15.3).
// Fitur di bawah baru ada sejak Safari 15.4; di browser yang sudah punya, kode ini tidak melakukan apa-apa.
// Target browser (supaya sintaks JS ikut diturunkan) diatur di "browserslist" pada package.json.

if (typeof Object.hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', {
    value: (obj, key) => Object.prototype.hasOwnProperty.call(obj, key),
    configurable: true, writable: true,
  });
}

function at(n) {
  const len = this.length >>> 0;
  let i = Math.trunc(n) || 0;
  if (i < 0) i += len;
  return i < 0 || i >= len ? undefined : this[i];
}
for (const C of [Array, String]) {
  if (typeof C.prototype.at !== 'function') {
    Object.defineProperty(C.prototype, 'at', { value: at, configurable: true, writable: true });
  }
}

// ID perangkat di halaman /scan memakai crypto.randomUUID
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function' && typeof crypto.getRandomValues === 'function') {
  crypto.randomUUID = function randomUUID() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;   // versi 4
    b[8] = (b[8] & 0x3f) | 0x80;   // varian RFC 4122
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}
