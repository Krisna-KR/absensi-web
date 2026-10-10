'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

// Pengganti alert()/confirm() bawaan browser: dialog & toast di dalam aplikasi.
const FeedbackContext = createContext(null);

const GAYA_TOAST = {
  sukses: { icon: CheckCircle2, cls: 'border-green-200 text-green-800', iconCls: 'text-green-600' },
  gagal:  { icon: AlertCircle,  cls: 'border-rose-200 text-rose-800',   iconCls: 'text-rose-600' },
  info:   { icon: Info,         cls: 'border-slate-200 text-slate-800', iconCls: 'text-blue-600' },
};

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);

  const tutupToast = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);

  const toast = useCallback((pesan, tipe = 'sukses') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(t => [...t, { id, pesan, tipe }]);
    setTimeout(() => tutupToast(id), tipe === 'gagal' ? 7000 : 4000);
  }, [tutupToast]);

  /** Dialog konfirmasi. Resolve true jika tombol utama ditekan. */
  const konfirmasi = useCallback((opsi) => new Promise((resolve) => {
    resolver.current = resolve;
    setDialog(opsi);
  }), []);

  /** Dialog informasi dengan satu tombol. */
  const info = useCallback((opsi) => konfirmasi({ tombolYa: 'Mengerti', ...opsi, tanpaBatal: true }), [konfirmasi]);

  const tutupDialog = useCallback((hasil) => {
    resolver.current?.(hasil);
    resolver.current = null;
    setDialog(null);
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e) => {
      if (e.key === 'Escape') tutupDialog(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, tutupDialog]);

  const nada = dialog?.nada || 'biasa';
  const IconDialog = nada === 'bahaya' ? AlertTriangle : nada === 'sukses' ? CheckCircle2 : Info;
  const warnaIcon = nada === 'bahaya' ? 'bg-rose-50 text-rose-600' : nada === 'sukses' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600';
  const warnaTombol = nada === 'bahaya' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700';

  return (
    <FeedbackContext.Provider value={{ toast, konfirmasi, info }}>
      {children}

      {dialog && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => tutupDialog(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="dialog-judul" onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
            <div className="flex gap-4">
              <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center ${warnaIcon}`}><IconDialog className="w-5 h-5" /></div>
              <div className="min-w-0">
                <h3 id="dialog-judul" className="font-bold text-slate-900 leading-snug">{dialog.judul}</h3>
                {dialog.pesan && <div className="text-sm text-slate-600 mt-1.5 leading-relaxed">{dialog.pesan}</div>}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              {!dialog.tanpaBatal && (
                <button onClick={() => tutupDialog(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200">{dialog.tombolTidak || 'Batal'}</button>
              )}
              <button autoFocus onClick={() => tutupDialog(true)} className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${warnaTombol}`}>{dialog.tombolYa || 'Lanjutkan'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed z-[70] bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-96 flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map(t => {
          const g = GAYA_TOAST[t.tipe] || GAYA_TOAST.info;
          const Icon = g.icon;
          return (
            <div key={t.id} className={`pointer-events-auto flex items-start gap-3 bg-white border rounded-xl shadow-lg px-4 py-3 text-sm ${g.cls}`}>
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${g.iconCls}`} />
              <p className="flex-1 leading-snug">{t.pesan}</p>
              <button onClick={() => tutupToast(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Tutup"><X className="w-4 h-4" /></button>
            </div>
          );
        })}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback harus dipakai di dalam FeedbackProvider');
  return ctx;
}
