'use client';
// Diagram struktur bebas (Rekap -> Struktur -> tab Diagram).
// Hanya informasi: garis A -> B ditarik manual, satu orang boleh punya beberapa garis masuk,
// tidak mengubah atasan, absensi, atau allowance. Isi awal = struktur atasan (disalin di database).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, MarkerType, NodeToolbar,
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath, ViewportPortal, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Search, Wand2, RotateCcw, Plus, GripVertical, Trash2, X } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';
import { useFeedback } from '@/components/Feedback';
import { useAkses } from '@/components/AksesAdmin';
import MohonTunggu from '@/components/MohonTunggu';

const LEBAR = 184;
const TINGGI = 56;
const JARAK_SNAP = 8;          // dalam satuan diagram: kartu "menempel" ke garis bantu kalau sedekat ini
const AksiContext = createContext({ bisaUbah: false, hapusGaris: () => {}, keluarkan: () => {} });

// ---------- Tata letak otomatis (atas ke bawah) ----------
function tataLetak(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 32, ranksep: 72, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach(n => g.setNode(n.id, { width: LEBAR, height: TINGGI }));
  edges.forEach(e => { if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target); });
  dagre.layout(g);
  const pos = {};
  nodes.forEach(n => { const p = g.node(n.id); pos[n.id] = { x: Math.round(p.x - LEBAR / 2), y: Math.round(p.y - TINGGI / 2) }; });
  return pos;
}

// Apakah dari `awal` bisa sampai ke `tujuan` lewat garis yang ada (untuk menolak lingkaran)
function bisaSampai(edges, awal, tujuan) {
  const anak = {};
  edges.forEach(e => { (anak[e.source] ||= []).push(e.target); });
  const lihat = new Set([awal]); const antre = [awal];
  while (antre.length) {
    const id = antre.shift();
    if (id === tujuan) return true;
    (anak[id] || []).forEach(a => { if (!lihat.has(a)) { lihat.add(a); antre.push(a); } });
  }
  return false;
}

// ---------- Kartu: nama + jabatan ----------
function KartuKaryawan({ id, data, selected }) {
  const { bisaUbah, keluarkan } = useContext(AksiContext);
  return (
    <>
      {bisaUbah && (
        <NodeToolbar isVisible={selected} position={Position.Right} className="print:hidden">
          <button type="button" onClick={() => keluarkan(id)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-rose-600 bg-white border border-rose-200 rounded-md shadow-sm hover:bg-rose-50">
            <X className="w-3.5 h-3.5" /> Keluarkan
          </button>
        </NodeToolbar>
      )}
      <Handle type="target" position={Position.Top} isConnectable={bisaUbah}
        className="!w-2.5 !h-2.5 !bg-slate-300 !border-2 !border-white" />
      <div style={{ width: LEBAR, height: TINGGI }}
        className={`box-border px-3 flex flex-col justify-center text-center rounded-[10px] border text-[13px] leading-[18px] ${data.nonaktif ? 'bg-slate-100 border-dashed border-slate-300 text-slate-400' : 'bg-white border-slate-300 text-slate-900'} ${selected ? '!border-indigo-500 ring-2 ring-indigo-200' : ''} ${data.sorot ? 'ring-4 ring-amber-300' : ''}`}>
        <span className="font-semibold truncate" title={data.nama}>{data.nama}</span>
        <span className={`text-xs truncate ${data.nonaktif ? '' : 'text-slate-500'}`}>{data.nonaktif ? 'Nonaktif' : (data.jabatan || '–')}</span>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={bisaUbah}
        className={`!w-3 !h-3 !border-2 !border-white ${bisaUbah ? '!bg-indigo-500' : '!bg-slate-300'}`} />
    </>
  );
}

// ---------- Garis: panah, tombol hapus muncul saat dipilih ----------
function GarisStruktur({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, selected }) {
  const { bisaUbah, hapusGaris } = useContext(AksiContext);
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={16}
        style={{ ...style, ...(selected ? { stroke: '#4f46e5', strokeWidth: 2.5 } : {}) }} />
      {bisaUbah && selected && (
        <EdgeLabelRenderer>
          <button type="button" onClick={() => hapusGaris(id)}
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: 'all' }}
            className="nodrag nopan inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-rose-600 bg-white border border-rose-200 rounded-md shadow-sm hover:bg-rose-50 print:hidden">
            <Trash2 className="w-3.5 h-3.5" /> Hapus garis
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { kartu: KartuKaryawan };
const edgeTypes = { garis: GarisStruktur };

function bentukEdge(g, nonaktif) {
  const redup = nonaktif.has(g.dari) || nonaktif.has(g.ke);
  const warna = redup ? '#cbd5e1' : '#94a3b8';
  return {
    id: g.id, source: g.dari, target: g.ke, type: 'garis',
    markerEnd: { type: MarkerType.ArrowClosed, color: warna, width: 18, height: 18 },
    style: { stroke: warna, strokeWidth: 1.5, ...(redup ? { strokeDasharray: '6 6' } : {}) },
  };
}

function Diagram() {
  const { boleh } = useAkses();
  const { toast, konfirmasi } = useFeedback();
  const rf = useReactFlow();
  const [dimuat, setDimuat] = useState(false);
  const [galat, setGalat] = useState('');
  const [karyawan, setKaryawan] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [bantu, setBantu] = useState({ x: null, y: null });   // garis bantu lurus saat menggeser
  const posisiSnap = useRef(null);                            // posisi terakhir setelah menempel, dipakai saat geser selesai
  const [cari, setCari] = useState('');
  const [layarKecil, setLayarKecil] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [muatKe, setMuatKe] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const atur = () => setLayarKecil(mq.matches);
    mq.addEventListener('change', atur);
    return () => mq.removeEventListener('change', atur);
  }, []);
  const bisaUbah = boleh('rekap', 'ubah') && !layarKecil;

  // ---------- Muat data ----------
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      const [rk, rg, rkar] = await Promise.all([
        supabase.from('diagram_struktur_kartu').select('id_karyawan, x, y').abortSignal(ac.signal),
        supabase.from('diagram_struktur_garis').select('id, dari, ke').abortSignal(ac.signal),
        supabase.from('karyawan').select('id, nama_lengkap, jabatan, is_aktif, is_approved').eq('is_approved', true).order('nama_lengkap').abortSignal(ac.signal),
      ]);
      if (ac.signal.aborted) return;
      const e = rk.error || rg.error || rkar.error;
      if (e) { setGalat(pesanError(e)); setDimuat(true); return; }
      const kar = rkar.data || [];
      const byId = Object.fromEntries(kar.map(k => [k.id, k]));
      const nonaktif = new Set(kar.filter(k => !k.is_aktif).map(k => k.id));
      const kartu = (rk.data || []).filter(c => byId[c.id_karyawan]);
      const adaKartu = new Set(kartu.map(c => c.id_karyawan));
      const ed = (rg.data || []).filter(g => adaKartu.has(g.dari) && adaKartu.has(g.ke)).map(g => bentukEdge(g, nonaktif));
      let nd = kartu.map(c => ({
        id: c.id_karyawan, type: 'kartu',
        position: c.x == null || c.y == null ? null : { x: Number(c.x), y: Number(c.y) },
        data: { nama: byId[c.id_karyawan].nama_lengkap, jabatan: byId[c.id_karyawan].jabatan, nonaktif: !byId[c.id_karyawan].is_aktif },
      }));
      // Kartu yang belum pernah digeser: semua kosong -> tata letak otomatis; sebagian -> taruh di bawah garis masuknya
      if (nd.length && nd.every(n => !n.position)) {
        const pos = tataLetak(nd, ed);
        nd = nd.map(n => ({ ...n, position: pos[n.id] }));
      } else if (nd.some(n => !n.position)) {
        const posById = Object.fromEntries(nd.filter(n => n.position).map(n => [n.id, n.position]));
        let bawah = Math.max(0, ...Object.values(posById).map(p => p.y)) + TINGGI * 3;
        let geser = 0;
        nd = nd.map(n => {
          if (n.position) return n;
          const induk = ed.find(x => x.target === n.id && posById[x.source]);
          const p = induk ? { x: posById[induk.source].x + (geser++ % 4) * 24, y: posById[induk.source].y + TINGGI * 2 + 24 }
            : { x: (geser++ % 8) * (LEBAR + 24), y: bawah + Math.floor(geser / 8) * (TINGGI + 24) };
          return { ...n, position: p };
        });
      }
      setKaryawan(kar); setNodes(nd); setEdges(ed); setGalat(''); setDimuat(true);
      requestAnimationFrame(() => rf.fitView({ padding: 0.1 }));
    })();
    return () => ac.abort();
  }, [muatKe, rf]);

  const diDiagram = useMemo(() => new Set(nodes.map(n => n.id)), [nodes]);
  const belumMasuk = useMemo(() => karyawan.filter(k => k.is_aktif && !diDiagram.has(k.id)), [karyawan, diDiagram]);

  // ---------- Simpan posisi ----------
  const simpanPosisi = useCallback(async (list) => {
    if (!list.length) return;
    const { error } = await supabase.from('diagram_struktur_kartu').upsert(
      list.map(n => ({ id_karyawan: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y), updated_at: new Date().toISOString() })),
      { onConflict: 'id_karyawan' });
    if (error) toast(`Posisi belum tersimpan. ${pesanError(error)}`, 'gagal');
  }, [toast]);

  // ---------- Geser kartu + garis bantu lurus ----------
  const onNodesChange = useCallback((changes) => {
    const geser = changes.filter(c => c.type === 'position' && c.dragging && c.position);
    if (geser.length === 1) {
      const c = geser[0];
      const { x, y } = c.position;
      let dx = 0; let dy = 0; let gx = null; let gy = null;
      let terdekatX = JARAK_SNAP + 1; let terdekatY = JARAK_SNAP + 1;
      for (const n of nodes) {
        if (n.id === c.id) continue;
        // sejajar kiri, tengah, atau kanan (garis bantu tegak)
        for (const off of [0, LEBAR / 2, LEBAR]) {
          const d = n.position.x + off - (x + off);
          if (Math.abs(d) < terdekatX) { terdekatX = Math.abs(d); dx = d; gx = n.position.x + off; }
        }
        // sejajar atas, tengah, atau bawah (garis bantu mendatar)
        for (const off of [0, TINGGI / 2, TINGGI]) {
          const d = n.position.y + off - (y + off);
          if (Math.abs(d) < terdekatY) { terdekatY = Math.abs(d); dy = d; gy = n.position.y + off; }
        }
      }
      c.position = { x: x + dx, y: y + dy };
      posisiSnap.current = { id: c.id, position: c.position };
      setBantu({ x: gx, y: gy });
    } else if (changes.some(c => c.type === 'position' && c.dragging === false)) {
      // Akhir geser: pakai posisi yang sudah menempel, bukan posisi mentah dari pointer
      changes.forEach(c => {
        if (c.type === 'position' && c.dragging === false && posisiSnap.current?.id === c.id) c.position = posisiSnap.current.position;
      });
      setBantu({ x: null, y: null });
    }
    setNodes(ns => applyNodeChanges(changes, ns));
  }, [nodes]);

  const onNodeDragStop = useCallback((_, __, dragged) => {
    setBantu({ x: null, y: null });
    const snap = posisiSnap.current;
    posisiSnap.current = null;
    simpanPosisi(dragged.map(n => (snap && n.id === snap.id && dragged.length === 1 ? { ...n, position: snap.position } : n)));
  }, [simpanPosisi]);

  // ---------- Tarik garis A -> B ----------
  const namaDari = useCallback(id => karyawan.find(k => k.id === id)?.nama_lengkap || '?', [karyawan]);
  const onConnect = useCallback(async ({ source, target }) => {
    if (!source || !target || source === target) return;
    if (edges.some(e => e.source === source && e.target === target)) { toast(`${namaDari(source)} → ${namaDari(target)} sudah ada.`, 'gagal'); return; }
    if (bisaSampai(edges, target, source)) {
      toast(`Tidak bisa ${namaDari(source)} → ${namaDari(target)}. ${namaDari(target)} sudah berada di atas ${namaDari(source)}.`, 'gagal');
      return;
    }
    const { data, error } = await supabase.from('diagram_struktur_garis').insert({ dari: source, ke: target }).select('id, dari, ke').single();
    if (error) { toast(pesanError(error), 'gagal'); return; }
    const nonaktif = new Set(nodes.filter(n => n.data.nonaktif).map(n => n.id));
    setEdges(es => [...es, bentukEdge(data, nonaktif)]);
  }, [edges, nodes, namaDari, toast]);

  const hapusGaris = useCallback(async (id) => {
    const { error } = await supabase.from('diagram_struktur_garis').delete().eq('id', id);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    setEdges(es => es.filter(e => e.id !== id));
  }, [toast]);

  const keluarkan = useCallback(async (id) => {
    const ok = await konfirmasi({
      judul: `Keluarkan ${namaDari(id)} dari diagram?`,
      pesan: 'Kartu dan semua garis yang tersambung ke orang ini dihapus dari diagram. Data karyawannya tidak berubah, dan dia bisa ditarik masuk lagi dari daftar "Belum ada di diagram".',
      tombolYa: 'Keluarkan', nada: 'bahaya',
    });
    if (!ok) return;
    const r1 = await supabase.from('diagram_struktur_garis').delete().or(`dari.eq.${id},ke.eq.${id}`);
    const r2 = r1.error ? r1 : await supabase.from('diagram_struktur_kartu').delete().eq('id_karyawan', id);
    if (r2.error) { toast(pesanError(r2.error), 'gagal'); return; }
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
    setNodes(ns => ns.filter(n => n.id !== id));
  }, [konfirmasi, namaDari, toast]);

  // ---------- Masukkan karyawan ke diagram ----------
  const masukkan = useCallback(async (id, posisi) => {
    const k = karyawan.find(x => x.id === id);
    if (!k || diDiagram.has(id)) return;
    const { error } = await supabase.from('diagram_struktur_kartu').upsert({ id_karyawan: id, x: Math.round(posisi.x), y: Math.round(posisi.y) }, { onConflict: 'id_karyawan' });
    if (error) { toast(pesanError(error), 'gagal'); return; }
    setNodes(ns => [...ns, { id, type: 'kartu', position: posisi, data: { nama: k.nama_lengkap, jabatan: k.jabatan, nonaktif: !k.is_aktif } }]);
  }, [karyawan, diDiagram, toast]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('application/x-karyawan');
    if (!id) return;
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    masukkan(id, { x: p.x - LEBAR / 2, y: p.y - TINGGI / 2 });
  }, [rf, masukkan]);

  const tambahDiTengah = (id) => {
    const el = document.querySelector('.diagram-struktur');
    const r = el?.getBoundingClientRect();
    const p = r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    masukkan(id, { x: p.x - LEBAR / 2, y: p.y - TINGGI / 2 });
  };

  // ---------- Tombol atas ----------
  const rapikan = async () => {
    const ok = await konfirmasi({
      judul: 'Rapikan otomatis?',
      pesan: 'Semua kartu disusun ulang dari atas ke bawah mengikuti garis. Posisi yang sudah kamu geser manual ikut berubah.',
      tombolYa: 'Rapikan',
    });
    if (!ok) return;
    const pos = tataLetak(nodes, edges);
    const baru = nodes.map(n => ({ ...n, position: pos[n.id] }));
    setNodes(baru);
    await simpanPosisi(baru);
    requestAnimationFrame(() => rf.fitView({ padding: 0.1, duration: 300 }));
  };

  const kembalikan = async () => {
    const ok = await konfirmasi({
      judul: 'Kembalikan ke struktur atasan?',
      pesan: 'Semua garis dan posisi kartu di diagram dihapus, lalu diisi ulang sesuai atasan di data karyawan saat ini. Garis yang kamu tarik manual hilang.',
      tombolYa: 'Kembalikan', nada: 'bahaya',
    });
    if (!ok) return;
    const { error } = await supabase.rpc('fn_diagram_reset');
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast('Diagram dikembalikan ke struktur atasan.');
    setMuatKe(n => n + 1);
  };

  const cariKartu = (e) => {
    e.preventDefault();
    const q = cari.trim().toLowerCase();
    if (!q) return;
    const n = nodes.find(x => x.data.nama.toLowerCase().includes(q));
    if (!n) { toast(`"${cari}" tidak ada di diagram.`, 'gagal'); return; }
    setNodes(ns => ns.map(x => ({ ...x, selected: x.id === n.id, data: { ...x.data, sorot: x.id === n.id } })));
    rf.setCenter(n.position.x + LEBAR / 2, n.position.y + TINGGI / 2, { zoom: 1.2, duration: 400 });
    setTimeout(() => setNodes(ns => ns.map(x => (x.data.sorot ? { ...x, data: { ...x.data, sorot: false } } : x))), 2000);
  };

  const aksi = useMemo(() => ({ bisaUbah, hapusGaris, keluarkan }), [bisaUbah, hapusGaris, keluarkan]);

  if (!dimuat) return <div className="bg-white rounded-xl border border-slate-200"><MohonTunggu className="min-h-[18rem]" /></div>;
  if (galat) return <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">Diagram belum bisa dimuat. {galat}</div>;

  return (
    <AksiContext.Provider value={aksi}>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 print:hidden">
          <p className="text-sm text-slate-500">
            {bisaUbah ? 'Tarik dari titik biru di bawah kartu ke kartu lain untuk membuat garis. Klik garis untuk menghapus. Hanya informasi, tidak mengubah atasan.'
              : layarKecil ? 'Di HP diagram hanya untuk dilihat. Ubah lewat laptop.' : 'Hanya untuk dilihat. Hak Edit Rekap & struktur dibutuhkan untuk mengubah.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={cariKartu} className="flex items-center gap-1.5 h-9 px-2.5 border border-slate-200 rounded-lg">
              <Search className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <input type="search" value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama, Enter" aria-label="Cari nama di diagram"
                className="w-36 text-sm outline-none bg-transparent" />
            </form>
            {bisaUbah && <>
              <button type="button" onClick={rapikan} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"><Wand2 className="w-4 h-4" /> Rapikan otomatis</button>
              <button type="button" onClick={kembalikan} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"><RotateCcw className="w-4 h-4" /> Kembalikan ke struktur atasan</button>
            </>}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row">
          {bisaUbah && (
            <aside className="lg:w-60 shrink-0 p-3 border-b lg:border-b-0 lg:border-r border-slate-100 print:hidden">
              <p className="text-sm font-semibold text-slate-900">Belum ada di diagram <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 ml-1">{belumMasuk.length}</span></p>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">Tarik ke diagram, atau klik +.</p>
              {belumMasuk.length === 0 ? <p className="text-xs text-slate-400">Semua karyawan aktif sudah ada di diagram.</p> : (
                <ul className="space-y-1.5 max-h-40 lg:max-h-[60vh] overflow-y-auto">
                  {belumMasuk.map(k => (
                    <li key={k.id} draggable onDragStart={e => { e.dataTransfer.setData('application/x-karyawan', k.id); e.dataTransfer.effectAllowed = 'move'; }}
                      className="flex items-center gap-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg cursor-grab">
                      <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-slate-900 truncate">{k.nama_lengkap}</span>
                        <span className="block text-[11px] text-slate-500 truncate">{k.jabatan || '–'}</span>
                      </span>
                      <button type="button" onClick={() => tambahDiTengah(k.id)} aria-label={`Masukkan ${k.nama_lengkap} ke diagram`}
                        className="p-1 rounded-md text-slate-500 hover:bg-slate-100"><Plus className="w-4 h-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          )}

          <div className="diagram-struktur relative flex-1 min-w-0 h-[70vh] min-h-[460px] print:h-[180mm]"
            onDragOver={e => { if (bisaUbah) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }} onDrop={bisaUbah ? onDrop : undefined}>
            <ReactFlow
              nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
              onNodesChange={onNodesChange} onNodeDragStop={onNodeDragStop} onConnect={onConnect}
              onEdgesChange={changes => setEdges(es => es.map(e => {
                const c = changes.find(x => x.type === 'select' && x.id === e.id);
                return c ? { ...e, selected: c.selected } : e;
              }))}
              nodesDraggable={bisaUbah} nodesConnectable={bisaUbah} elementsSelectable={bisaUbah}
              deleteKeyCode={null} minZoom={0.15} maxZoom={2} fitView proOptions={{ hideAttribution: true }}
              connectionLineStyle={{ stroke: '#4f46e5', strokeWidth: 2, strokeDasharray: '6 6' }}>
              <Background gap={24} size={1} color="#e2e8f0" className="print:hidden" />
              <Controls showInteractive={false} className="print:hidden" />
              <MiniMap pannable zoomable className="print:hidden !hidden md:!block" nodeColor={n => (n.data?.nonaktif ? '#e2e8f0' : '#cbd5e1')} />
              <ViewportPortal>
                {bantu.x != null && <div className="absolute pointer-events-none border-l border-dashed border-indigo-400" style={{ left: bantu.x, top: -100000, height: 200000 }} />}
                {bantu.y != null && <div className="absolute pointer-events-none border-t border-dashed border-indigo-400" style={{ top: bantu.y, left: -100000, width: 200000 }} />}
              </ViewportPortal>
            </ReactFlow>
          </div>
        </div>
      </div>
    </AksiContext.Provider>
  );
}

export default function DiagramStruktur() {
  return <ReactFlowProvider><Diagram /></ReactFlowProvider>;
}
