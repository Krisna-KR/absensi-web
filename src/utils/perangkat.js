// Nama browser & sistem singkat dari user agent, untuk audit perangkat dan pesan login.
// Chrome di Android menyamarkan model HP ("Android 10; K"), jadi yang bisa dibaca hanya browser + sistem.
export function namaBrowser(ua) {
  if (!ua) return '';
  const s = String(ua);
  const browser =
    /FBAN|FBAV|FB_IAB/.test(s) ? 'Facebook' :
    /Instagram/.test(s) ? 'Instagram' :
    /WhatsApp/.test(s) ? 'WhatsApp' :
    /Line\//.test(s) ? 'LINE' :
    /MiuiBrowser|XiaoMi/.test(s) ? 'Mi Browser' :
    /SamsungBrowser/.test(s) ? 'Samsung Internet' :
    /HeyTapBrowser|OppoBrowser/.test(s) ? 'Browser Oppo' :
    /VivoBrowser/.test(s) ? 'Browser Vivo' :
    /EdgA|EdgiOS|Edg\//.test(s) ? 'Edge' :
    /OPR\/|Opera/.test(s) ? 'Opera' :
    /Firefox|FxiOS/.test(s) ? 'Firefox' :
    /CriOS/.test(s) ? 'Chrome' :
    /; wv\)/.test(s) ? 'Browser dalam aplikasi' :
    /Chrome\//.test(s) ? 'Chrome' :
    /Safari\//.test(s) ? 'Safari' : 'Browser lain';
  const sistem = /iPhone|iPad|iPod/.test(s) ? 'iPhone' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS X/.test(s) ? 'Mac' : '';
  return sistem ? `${browser} · ${sistem}` : browser;
}
