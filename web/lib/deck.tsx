'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg, Profile } from './api';
import { Avatar } from './ui';

const REASONS = ['Fake profile or photos', 'Nudity or sexual content', 'Harassment or abuse', 'Asking for money', 'Looks under 18', 'Something else'];

export function ReportSheet({ target, onClose, onDone }: { target: { id: string; name: string }; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function report() {
    if (!reason) { setErr('Choose a reason.'); return; }
    setBusy(true);
    try { await api('POST', '/reports', { userId: target.id, reason, note: note || undefined }); onDone(`Thanks. ${target.name} is hidden from you and our team will review this profile.`); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  async function block() {
    setBusy(true);
    try { await api('POST', `/users/${target.id}/block`); onDone(`${target.name} is blocked.`); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`Report or block ${target.name}`} style={{ zIndex: 20 }}>
      <div className="screen scroll">
        <div className="topbar"><b>Report or block {target.name}</b><button className="link" onClick={onClose}>Close</button></div>
        <div className="field"><span className="lbl">What is wrong?</span>
          <div className="stack">{REASONS.map((r) => (<label key={r} className="check" style={{ background: 'var(--surface)', padding: 12, borderRadius: 14, margin: 0 }}><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /><span style={{ color: 'var(--fg)' }}>{r}</span></label>))}</div>
        </div>
        <div className="field"><label htmlFor="note">Details (optional)</label><textarea id="note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <p className="err" role="alert">{err}</p>
        <div className="stack"><button className="btn accent" onClick={report} disabled={busy}>Send report</button><button className="btn ghost" onClick={block} disabled={busy}>Just block them</button></div>
      </div>
    </div>
  );
}

function Card({ p, onSwipe, top, onMenu }: { p: Profile; onSwipe: (d: 'yes' | 'no') => void; top: boolean; onMenu: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [i, setI] = useState(0);
  const [fly, setFly] = useState<0 | 1 | -1>(0);
  const photos = p.photos;
  const go = (d: 'yes' | 'no') => { setFly(d === 'yes' ? 1 : -1); setTimeout(() => onSwipe(d), 220); };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (!top) return; if (e.key === 'ArrowRight') go('yes'); if (e.key === 'ArrowLeft') go('no'); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  const tf = fly ? `translateX(${fly * 520}px) rotate(${fly * 22}deg)` : `translateX(${dx}px) rotate(${dx / 18}deg)`;
  return (
    <div
      ref={el}
      className={`card${top ? '' : ' back'}`}
      style={top ? { transform: tf, transition: drag.current ? 'none' : undefined, opacity: fly ? 0 : 1 } : undefined}
      onPointerDown={(e) => { if (!top || (e.target as HTMLElement).closest('button')) return; drag.current = { x: e.clientX, y: e.clientY }; el.current?.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (drag.current) setDx(e.clientX - drag.current.x); }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        const moved = e.clientX - drag.current.x; drag.current = null;
        if (moved > 110) go('yes'); else if (moved < -110) go('no');
        else { if (Math.abs(moved) < 6 && photos.length > 1) setI((i + 1) % photos.length); setDx(0); }
      }}
      onPointerCancel={() => { drag.current = null; setDx(0); }}
    >
      <div className="photo"><Avatar src={photos[i]} hue={p.hue} cls="" /></div>
      {p.sample && <span className="sample">Demo profile</span>}
      {top && <button className="iconbtn" onClick={onMenu} aria-label={`Report or block ${p.name}`} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(23,19,31,.55)', color: '#fff' }}>⋯</button>}
      <span className="stamp yes" style={{ opacity: Math.min(Math.max(dx / 110, 0), 1) }}>YES</span>
      <span className="stamp no" style={{ opacity: Math.min(Math.max(-dx / 110, 0), 1) }}>NO</span>
      <div className="info">
        <div className="nm">{p.name} <span className="age">{p.age}</span>{p.verified && <span className="vb" title="Face verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg></span>}</div>
        <div className="chips"><span className="chip">{p.city}</span><span className="chip st">{p.status}</span>{photos.length > 1 && <span className="chip">{i + 1}/{photos.length} photos</span>}</div>
        {p.bio && <p className="bio">{p.bio}</p>}
      </div>
    </div>
  );
}

export function Discover({ onMatch, onToast }: { onMatch: (m: { id: string; profile: Profile }) => void; onToast: (s: string) => void }) {
  const [deck, setDeck] = useState<Profile[] | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [menu, setMenu] = useState<Profile | null>(null);
  const [err, setErr] = useState('');
  const busy = useRef(false);

  const load = useCallback(async (c: string) => {
    setErr('');
    try { const d = await api('GET', `/discover?city=${encodeURIComponent(c)}`); setDeck(d.profiles); } catch (x) { setErr(errMsg(x)); setDeck([]); }
  }, []);
  useEffect(() => { load(city); }, [city, load]);
  useEffect(() => { api('GET', '/discover/cities').then((d) => setCities(d.cities)).catch(() => {}); }, []);

  async function swipe(p: Profile, direction: 'yes' | 'no') {
    if (busy.current) return; busy.current = true;
    setDeck((d) => (d || []).filter((x) => x.id !== p.id));
    try { const r = await api('POST', '/swipes', { userId: p.id, direction }); if (r.matched) onMatch(r.match); } catch (x) { onToast(errMsg(x)); } finally { busy.current = false; }
  }
  const top = deck?.[0];
  return (
    <>
      <div className="top">
        <div className="lg">Discover</div>
        <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City"><option value="">Anywhere</option>{cities.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <div id="stackWrap">
        {deck === null && <div className="empty"><p>Finding people…</p></div>}
        {deck && !top && <div className="empty"><h3>You are all caught up</h3><p>{err || 'No new profiles right now. Try another city or check back soon.'}</p><button className="btn ghost" onClick={() => load(city)}>Refresh</button></div>}
        {deck && deck[1] && <Card key={deck[1].id} p={deck[1]} top={false} onSwipe={() => {}} onMenu={() => {}} />}
        {top && <Card key={top.id} p={top} top onSwipe={(d) => swipe(top, d)} onMenu={() => setMenu(top)} />}
      </div>
      <div className="actions">
        <button className="round" disabled={!top} onClick={() => top && swipe(top, 'no')} aria-label="Pass"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        <button className="round yes" disabled={!top} onClick={() => top && swipe(top, 'yes')} aria-label="Like"><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3 5 6.2 5c2 0 3.2 1 3.8 2 .6-1 1.8-2 3.8-2C17 5 19 8.3 17.5 11.8 15.5 16.4 12 21 12 21z" transform="translate(1 0)" /></svg></button>
      </div>
      <p className="legend">Drag the card, use the buttons, or press the arrow keys.</p>
      {menu && <ReportSheet target={menu} onClose={() => setMenu(null)} onDone={(m) => { setDeck((d) => (d || []).filter((x) => x.id !== menu.id)); setMenu(null); onToast(m); }} />}
    </>
  );
}
