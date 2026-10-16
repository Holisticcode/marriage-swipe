'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, errMsg, getSession, setSession, setSessionKey } from '@/lib/api';

setSessionKey('ms.admin');

const REASONS = ['Fake profile or photos', 'Nudity or sexual content', 'Harassment or abuse', 'Scam or asking for money', 'Looks under 18', 'Other'];
const fmt = (t?: string | null) => (t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
type U = any;

function Mark() {
  return (<svg width="32" height="22" viewBox="0 0 84 56" fill="none" aria-hidden="true"><circle cx="29" cy="28" r="21" stroke="#ff5c7f" strokeWidth="7" /><circle cx="55" cy="28" r="21" stroke="#f5b83d" strokeWidth="7" /></svg>);
}
function Av({ src }: { src?: string | null }) {
  return <div className="av">{src ? <img alt="" src={src} /> : <svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#c9c2d6" /><circle cx="50" cy="40" r="17" fill="#fff8" /><path d="M16 100c4-26 20-38 34-38s30 12 34 38z" fill="#fff8" /></svg>}</div>;
}
const StatusPill = ({ s }: { s: string }) => <span className={`pill ${s}`}>{s === 'active' ? 'Active' : s === 'suspended' ? 'On hold' : 'Removed'}</span>;
function VerifyPill({ u }: { u: U }) {
  if (u.is_sample) return <span className="pill grey">Sample</span>;
  if (!u.verified) return <span className="pill grey">Not verified</span>;
  if (u.verify_method === 'ai') return <span className="pill blue">AI verified</span>;
  return <span className="pill blue">Admin verified</span>;
}

function Login({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const d = await api('POST', '/auth/login', { identifier: email, password: pw }, { auth: false });
      if (d.user.role !== 'admin') { try { await api('POST', '/auth/logout', { refreshToken: d.refreshToken }, { auth: false }); } catch {} setErr('This account is not an administrator.'); return; }
      setSession({ accessToken: d.accessToken, refreshToken: d.refreshToken }); onIn();
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <div id="gate" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="gcard">
        <div className="logo"><Mark /> Marriage Swipe <small>Admin</small></div>
        <h1 style={{ fontSize: '1.9rem', margin: '22px 0 6px' }}>Super admin <em>login</em></h1>
        <p className="muted" style={{ margin: '0 0 18px' }}>Only administrators can sign in here.</p>
        <form onSubmit={go} noValidate>
          <label className="f">Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="f">Password<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <p className="err" role="alert">{err}</p>
          <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
        </form>
      </div>
    </div>
  );
}

export default function Console() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [view, setView] = useState<'overview' | 'users' | 'review' | 'reports' | 'activity'>('overview');
  const [open, setOpen] = useState<string | null>(null);
  const [badge, setBadge] = useState({ review: 0, reports: 0 });
  const [email, setEmail] = useState('');
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!getSession()) { setReady(true); return; }
    api('GET', '/me').then((d) => { if (d.user.role === 'admin') { setAuthed(true); setEmail(d.user.email); } else setSession(null); }).catch(() => setSession(null)).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!authed) return;
    api('GET', '/admin/overview').then((d) => setBadge({ review: d.counts.to_review, reports: d.counts.reported_profiles })).catch((e) => { if (e.status === 401 || e.status === 403) { setSession(null); setAuthed(false); } });
  }, [authed, tick, view]);

  async function signOut() { const s = getSession(); try { if (s) await api('POST', '/auth/logout', { refreshToken: s.refreshToken }); } catch {} setSession(null); setAuthed(false); setOpen(null); }

  if (!ready) return null;
  if (!authed) return <Login onIn={() => { setAuthed(true); api('GET', '/me').then((d) => setEmail(d.user.email)); }} />;
  const nav: [typeof view, string, number?][] = [['overview', 'Overview'], ['users', 'Profiles'], ['review', 'Photo review', badge.review], ['reports', 'Reports', badge.reports], ['activity', 'Activity log']];
  return (
    <div id="console">
      <aside>
        <div className="logo"><Mark /> Admin</div>
        <nav aria-label="Sections">{nav.map(([k, l, n]) => (<button key={k} aria-current={view === k ? 'page' : 'false'} onClick={() => setView(k)}>{l}{!!n && <span className="n">{n}</span>}</button>))}</nav>
        <div className="me"><span>{email}</span><button onClick={signOut}>Sign out</button></div>
      </aside>
      <main>
        {view === 'overview' && <Overview tick={tick} onOpen={setOpen} go={setView} />}
        {view === 'users' && <Users tick={tick} onOpen={setOpen} />}
        {view === 'review' && <Review tick={tick} onChange={bump} onOpen={setOpen} />}
        {view === 'reports' && <Reports tick={tick} onChange={bump} onOpen={setOpen} />}
        {view === 'activity' && <Activity tick={tick} />}
      </main>
      {open && <Drawer id={open} onClose={() => setOpen(null)} onChange={bump} />}
    </div>
  );
}

function useLoad<T>(path: string, deps: unknown[]) {
  const [d, setD] = useState<T | null>(null); const [err, setErr] = useState('');
  useEffect(() => { let live = true; setErr(''); api('GET', path).then((x) => live && setD(x)).catch((e) => live && setErr(errMsg(e))); return () => { live = false; }; }, [path, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { d, err };
}

function Overview({ tick, onOpen, go }: { tick: number; onOpen: (id: string) => void; go: (v: any) => void }) {
  const { d, err } = useLoad<any>('/admin/overview', [tick]);
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const c = d.counts; const m = d.moderation;
  const tiles: [string, number, string?][] = [['Members', c.real], ['Active', c.active], ['On hold or removed', c.off], ['Open reports', c.open_reports, 'reports'], ['Photos to review', c.to_review, 'review'], ['Photos blocked by AI', c.blocked_photos], ['Matches', c.matches], ['Messages', c.messages]];
  return (
    <>
      <div className="head"><h1>Over<em>view</em></h1></div>
      <div className="tiles">{tiles.map(([l, n, g]) => (<div className="tile" key={l} onClick={() => g && go(g)} style={g ? { cursor: 'pointer' } : undefined}><b>{n}</b><span>{l}</span></div>))}</div>
      <div className="panel"><h3>AI photo checks</h3><p className="muted" style={{ margin: '6px 0 0' }}>{m.mode === 'off' ? 'AI checks are switched off. Every photo waits for a human.' : m.ready ? `Running on the server (${m.backend}). Nudity is blocked and every photo is compared with the member's selfie.` : 'Starting up. Photos wait for a human until it is ready.'}</p></div>
      <div className="panel"><h3>Needs attention</h3>
        {d.attention.length === 0 ? <div className="empty">Nothing waiting. Nice.</div> : (
          <div className="tablewrap" style={{ marginTop: 10 }}><table><tbody>{d.attention.map((a: U) => (<tr key={a.id}><td><div className="who"><Av src={a.avatar} /><div><b>{a.name || a.email}</b></div></div></td><td>{a.open_reports > 0 && <span className="pill red">{a.open_reports} report{a.open_reports > 1 ? 's' : ''}</span>} {a.photos_review > 0 && <span className="pill amber">{a.photos_review} photo{a.photos_review > 1 ? 's' : ''} to review</span>}</td><td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => onOpen(a.id)}>Open</button></td></tr>))}</tbody></table></div>
        )}
      </div>
      <div className="panel"><h3>Recent activity</h3><div className="feed">{d.recent.map((r: U) => (<div key={r.id}><time>{fmt(r.at)}</time><span><b>{r.actor_label}</b> {r.action.replace(/_/g, ' ')}</span></div>))}</div></div>
    </>
  );
}

function Users({ tick, onOpen }: { tick: number; onOpen: (id: string) => void }) {
  const [q, setQ] = useState(''); const [f, setF] = useState('all'); const [page, setPage] = useState(1); const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const { d, err } = useLoad<any>(`/admin/users?q=${encodeURIComponent(dq)}&filter=${f}&page=${page}`, [tick]);
  return (
    <>
      <div className="head"><h1>Pro<em>files</em></h1></div>
      <div className="toolbar"><input style={{ maxWidth: 340 }} placeholder="Search name, email, phone or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select style={{ width: 'auto' }} value={f} onChange={(e) => { setF(e.target.value); setPage(1); }} aria-label="Filter"><option value="all">Everyone</option><option value="real">Real members</option><option value="sample">Demo profiles</option><option value="active">Active</option><option value="off">On hold or removed</option><option value="reported">Reported</option><option value="review">Photos to review</option></select></div>
      {err && <p className="err">{err}</p>}
      <div className="tablewrap"><table><thead><tr><th>Member</th><th>Contact</th><th>City</th><th>Status</th><th>Face</th><th>Flags</th><th>Joined</th><th /></tr></thead>
        <tbody>{d?.users.map((u: U) => (
          <tr key={u.id}><td><div className="who"><Av src={u.avatar} /><div><b>{u.name || '(no profile yet)'}{u.age ? `, ${u.age}` : ''}</b><span>{u.gender || ''} {u.relationship_status ? `· ${u.relationship_status}` : ''}</span></div></div></td>
            <td><div style={{ fontSize: '.82rem' }}>{u.email}<br /><span className="muted">{u.phone}</span></div></td><td>{u.city || '—'}</td><td><StatusPill s={u.status} /></td><td><VerifyPill u={u} /></td>
            <td>{u.open_reports > 0 && <span className="pill red">{u.open_reports} report{u.open_reports > 1 ? 's' : ''}</span>} {u.photos_review > 0 && <span className="pill amber">{u.photos_review} to review</span>}</td>
            <td className="muted">{fmt(u.created_at)}</td><td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => onOpen(u.id)}>Open</button></td></tr>))}
        </tbody></table>{d && d.users.length === 0 && <div className="empty">No profiles match.</div>}</div>
      {d && d.total > d.pageSize && (<div className="toolbar" style={{ marginTop: 14, alignItems: 'center' }}><button className="btn sm ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="muted">Page {page} of {Math.ceil(d.total / d.pageSize)} · {d.total} profiles</span><button className="btn sm ghost" disabled={page * d.pageSize >= d.total} onClick={() => setPage(page + 1)}>Next</button></div>)}
    </>
  );
}

function PhotoCard({ p, onAct, onOpen, actions }: { p: U; onAct: () => void; onOpen: (id: string) => void; actions: 'review' | 'rejected' }) {
  const [reveal, setReveal] = useState(false); const [busy, setBusy] = useState(false);
  const sc = p.scores;
  async function run(fn: () => Promise<unknown>) { setBusy(true); try { await fn(); onAct(); } catch (e) { alert(errMsg(e)); } finally { setBusy(false); } }
  return (
    <div className="pcard">
      <div className={`pimg${reveal ? '' : ' blur'}`}><img alt="" src={p.url} /><button className="reveal" onClick={() => setReveal(true)}>Click to reveal</button></div>
      <div className="pbody">
        <b>{p.userName}</b><span className="muted">{p.kind === 'selfie' ? 'Selfie' : 'Extra photo'} · {fmt(p.createdAt)}</span>
        {p.reason && <span>{p.reason}</span>}
        {sc && <span className="muted">Nudity {Math.round((sc.explicit || 0) * 100)}% · Revealing {Math.round((sc.revealing || 0) * 100)}% · Faces {sc.faces ?? '?'}</span>}
        <div className="acts">
          {actions === 'review' && <button className="btn sm ok" disabled={busy} onClick={() => run(() => api('POST', `/admin/photos/${p.id}/approve`))}>Approve</button>}
          {actions === 'review' && <button className="btn sm bad" disabled={busy} onClick={() => run(() => api('POST', `/admin/photos/${p.id}/reject`, { reason: 'Rejected by admin' }))}>Reject</button>}
          <button className="btn sm ghost" onClick={() => onOpen(p.userId)}>Profile</button>
        </div>
      </div>
    </div>
  );
}

function Review({ tick, onChange, onOpen }: { tick: number; onChange: () => void; onOpen: (id: string) => void }) {
  const [tab, setTab] = useState<'review' | 'rejected'>('review');
  const { d, err } = useLoad<any>(`/admin/photos?status=${tab}`, [tick, tab]);
  return (
    <>
      <div className="head"><h1>Photo <em>review</em></h1></div>
      <div className="tabs2"><button aria-pressed={tab === 'review'} onClick={() => setTab('review')}>Waiting for you</button><button aria-pressed={tab === 'rejected'} onClick={() => setTab('rejected')}>Blocked by AI</button></div>
      <p className="muted">Photos are blurred. Reveal one only when you need to decide. Blocked nudity is stored only as a tiny blurred thumbnail.</p>
      {err && <p className="err">{err}</p>}
      {d && d.photos.length === 0 && <div className="panel"><div className="empty">Nothing here.</div></div>}
      <div className="pcards">{d?.photos.map((p: U) => <PhotoCard key={p.id} p={p} actions={tab} onAct={onChange} onOpen={onOpen} />)}</div>
    </>
  );
}

function Reports({ tick, onChange, onOpen }: { tick: number; onChange: () => void; onOpen: (id: string) => void }) {
  const { d, err } = useLoad<any>('/admin/reports', [tick]);
  const [remove, setRemove] = useState<U | null>(null);
  return (
    <>
      <div className="head"><h1>Re<em>ports</em></h1></div>
      {err && <p className="err">{err}</p>}
      {d && d.profiles.length === 0 && <div className="panel"><div className="empty">No open reports.</div></div>}
      <div className="panel">{d?.profiles.map((p: U) => (
        <div className="rep" key={p.userId}>
          <Av src={p.avatar} />
          <div><b>{p.name}</b> <StatusPill s={p.status} /><ul>{p.reports.map((r: U) => <li key={r.id}>{r.reason}{r.note ? ` — “${r.note}”` : ''} <span className="muted">({r.reporter}, {fmt(r.at)})</span></li>)}</ul></div>
          <div className="acts"><button className="btn sm ghost" onClick={() => onOpen(p.userId)}>Open</button><button className="btn sm ghost" onClick={async () => { await api('POST', `/admin/users/${p.userId}/reports/dismiss`); onChange(); }}>Dismiss</button><button className="btn sm bad" onClick={() => setRemove(p)}>Remove…</button></div>
        </div>))}</div>
      {remove && <StatusModal u={{ id: remove.userId, name: remove.name }} status="removed" onClose={() => setRemove(null)} onDone={() => { setRemove(null); onChange(); }} />}
    </>
  );
}

function Activity({ tick }: { tick: number }) {
  const [page, setPage] = useState(1);
  const { d, err } = useLoad<any>(`/admin/log?page=${page}`, [tick]);
  return (
    <>
      <div className="head"><h1>Activity <em>log</em></h1></div>
      {err && <p className="err">{err}</p>}
      <div className="panel"><div className="feed">{d?.entries.map((r: U) => (<div key={r.id}><time>{fmt(r.at)}</time><span><b>{r.actor_label}</b> {r.action.replace(/_/g, ' ')}{r.detail?.name ? ` · ${r.detail.name}` : ''}{r.detail?.reason ? ` · ${r.detail.reason}` : ''}</span></div>))}</div></div>
      {d && d.total > 100 && <div className="toolbar"><button className="btn sm ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button><button className="btn sm ghost" disabled={page * 100 >= d.total} onClick={() => setPage(page + 1)}>Older</button></div>}
    </>
  );
}

function StatusModal({ u, status, onClose, onDone }: { u: { id: string; name: string }; status: 'suspended' | 'removed'; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(REASONS[0]); const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go() { setBusy(true); try { await api('POST', `/admin/users/${u.id}/status`, { status, reason, note }); onDone(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } }
  return (
    <div className="modal" role="dialog" aria-modal="true"><div className="box">
      <h2 style={{ fontSize: '1.4rem' }}>{status === 'removed' ? 'Remove' : 'Put on hold'} {u.name}</h2>
      <p className="muted" style={{ margin: 0 }}>They are signed out at once and see the reason below. {status === 'removed' ? 'You can restore them later.' : ''}</p>
      <label className="f">Reason<select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
      <label className="f">Note (optional, shown to them)<input value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} /></label>
      <p className="err">{err}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn bad" disabled={busy} onClick={go}>{status === 'removed' ? 'Remove profile' : 'Put on hold'}</button></div>
    </div></div>
  );
}

function Drawer({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [n, setN] = useState(0);
  const { d, err } = useLoad<any>(`/admin/users/${id}`, [n]);
  const [modal, setModal] = useState<null | 'suspended' | 'removed' | 'delete' | 'pw'>(null);
  const [temp, setTemp] = useState(''); const [confirm, setConfirm] = useState('');
  const reload = () => { setN(n + 1); onChange(); };
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && !modal && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [modal, onClose]);
  const u = d?.user;
  async function act(fn: () => Promise<unknown>) { try { await fn(); reload(); } catch (e) { alert(errMsg(e)); } }
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Profile details">
        {err && <p className="err">{err}</p>}
        {!u ? <p className="muted">Loading…</p> : (
          <>
            <div className="dhead"><Av src={u.avatar} /><div><h2>{u.name || '(no profile yet)'}{u.age ? `, ${u.age}` : ''}</h2><StatusPill s={u.status} /> <VerifyPill u={u} /></div><button className="close" onClick={onClose} aria-label="Close">×</button></div>
            {u.status !== 'active' && <div className="dsec" style={{ background: 'var(--warnbg)' }}><b>{u.status === 'removed' ? 'Removed' : 'On hold'}</b><span>{u.status_reason}</span></div>}
            <div className="kv"><div><small>Email</small>{u.email || '—'}</div><div><small>Mobile</small>{u.phone || '—'}</div><div><small>I am / looking for</small>{u.gender || '—'} / {u.looking_for || '—'}</div><div><small>Status · City</small>{u.relationship_status || '—'} · {u.city || '—'}</div><div><small>Joined</small>{fmt(u.created_at)}</div><div><small>Last log-in</small>{fmt(u.last_login_at)}</div></div>
            {u.bio && <div className="dsec"><h3>Bio</h3><span>{u.bio}</span></div>}
            <div className="dsec"><h3>Photos</h3>
              <div className="dphotos">{d.photos.filter((p: U) => !p.attempt).map((p: U) => (<PhotoThumb key={p.id} p={p} onAct={reload} act={act} />))}</div>
              {d.photos.some((p: U) => p.attempt) && <span className="muted">{d.photos.filter((p: U) => p.attempt).length} blocked attempt(s) on record.</span>}
            </div>
            <div className="dsec"><h3>Reports ({d.reports.length})</h3>{d.reports.length === 0 ? <span className="muted">None.</span> : d.reports.map((r: U) => <div key={r.id} style={{ fontSize: '.88rem' }}><b>{r.reason}</b>{r.note ? ` — “${r.note}”` : ''}<br /><span className="muted">{r.reporter}, {fmt(r.created_at)} · {r.open ? 'open' : r.resolution}</span></div>)}</div>
            <div className="dsec"><h3>Actions</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {u.status === 'active' ? <><button className="btn warn" onClick={() => setModal('suspended')}>Put on hold</button><button className="btn bad" onClick={() => setModal('removed')}>Remove profile</button></> : <button className="btn ok" onClick={() => act(() => api('POST', `/admin/users/${u.id}/status`, { status: 'active' }))}>Restore profile</button>}
                {!u.is_sample && <button className="btn ghost" onClick={async () => { try { const r = await api('POST', `/admin/users/${u.id}/reset-password`); setTemp(r.temporaryPassword); setModal('pw'); } catch (e) { alert(errMsg(e)); } }}>Reset password</button>}
                {d.reports.some((r: U) => r.open) && <button className="btn ghost" onClick={() => act(() => api('POST', `/admin/users/${u.id}/reports/dismiss`))}>Dismiss reports</button>}
              </div></div>
            <div className="dsec danger"><h3>Delete permanently</h3><span className="muted">Removes the account, photos, matches and messages for good. A log entry stays.</span><div><button className="btn bad" onClick={() => { setConfirm(''); setModal('delete'); }}>Delete account…</button></div></div>
            <div className="dsec"><h3>History</h3>{d.log.length === 0 ? <span className="muted">Nothing yet.</span> : d.log.map((l: U, i: number) => <div key={i} style={{ fontSize: '.85rem' }}><span className="muted">{fmt(l.at)}</span> · {l.actor_label} {l.action.replace(/_/g, ' ')}</div>)}</div>
          </>
        )}
      </div>
      {u && (modal === 'suspended' || modal === 'removed') && <StatusModal u={{ id: u.id, name: u.name || u.email }} status={modal} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'pw' && <div className="modal"><div className="box"><h2 style={{ fontSize: '1.3rem' }}>Temporary password</h2><p className="muted" style={{ margin: 0 }}>Share it privately. They are signed out everywhere and should change it after logging in. It will not be shown again.</p><code className="tmp">{temp}</code><button className="btn" onClick={() => { setModal(null); setTemp(''); }}>Done</button></div></div>}
      {u && modal === 'delete' && <div className="modal"><div className="box"><h2 style={{ fontSize: '1.3rem' }}>Delete {u.name || u.email}?</h2><p className="muted" style={{ margin: 0 }}>This cannot be undone. Type <b>DELETE</b> to confirm.</p><input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type DELETE" /><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn bad" disabled={confirm !== 'DELETE'} onClick={async () => { try { await api('DELETE', `/admin/users/${u.id}`); setModal(null); onChange(); onClose(); } catch (e) { alert(errMsg(e)); } }}>Delete forever</button></div></div></div>}
    </div>
  );
}

function PhotoThumb({ p, act }: { p: U; onAct: () => void; act: (fn: () => Promise<unknown>) => void }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div>
      <div className={`pimg${reveal || p.status === 'approved' ? '' : ' blur'}`}><img alt="" src={p.url} /><button className="reveal" onClick={() => setReveal(true)}>Reveal</button></div>
      <div className="cap"><span>{p.kind === 'selfie' ? 'Selfie' : 'Photo'} · {p.status}</span>
        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {p.status === 'review' && <button className="btn sm ok" onClick={() => act(() => api('POST', `/admin/photos/${p.id}/approve`))}>OK</button>}
          {p.status !== 'rejected' && <button className="btn sm bad" onClick={() => act(() => api('DELETE', `/admin/photos/${p.id}`))}>Remove</button>}
        </span></div>
    </div>
  );
}
