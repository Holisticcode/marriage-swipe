'use client';
import { useRef, useState } from 'react';
import { api, errMsg, Me } from './api';
import { PasswordField } from './ui';
import { ProfileForm } from './profile-form';

export function MeTab({ me, setMe, onLogout, onToast }: { me: Me; setMe: (m: Me) => void; onLogout: () => void; onToast: (s: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [pw, setPw] = useState({ cur: '', next: '' });
  const [pwOpen, setPwOpen] = useState(false);
  const [del, setDel] = useState<null | string>(null);
  const [err, setErr] = useState('');
  const p = me.profile!;
  const extras = me.photos.filter((x) => x.kind === 'extra');

  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setBusy(true);
    try { const fd = new FormData(); fd.append('photo', f); const d = await api('POST', '/me/photos', undefined, { form: fd }); setMe(d.user); onToast(d.message); } catch (x) { onToast(errMsg(x)); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { const d = await api('DELETE', `/me/photos/${id}`); setMe(d.user); } catch (x) { onToast(errMsg(x)); }
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await api('POST', '/me/password', { current: pw.cur, next: pw.next }); setPwOpen(false); setPw({ cur: '', next: '' }); onToast('Password changed.'); } catch (x) { setErr(errMsg(x)); }
  }
  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await api('DELETE', '/me', { password: del }); onLogout(); } catch (x) { setErr(errMsg(x)); }
  }
  if (edit) return <ProfileForm me={me} onSaved={(m) => { setMe(m); setEdit(false); onToast('Saved.'); }} onCancel={() => setEdit(false)} />;
  const selfie = me.photos.find((x) => x.kind === 'selfie');
  return (
    <div className="tabview scroll">
      <div className="top" style={{ paddingInline: 0 }}><div className="lg">Your profile</div><button className="link" onClick={onLogout}>Log out</button></div>
      <div className="mine">
        <div className="card"><div className="photo">{selfie ? <img alt="Your verified selfie" src={selfie.url} /> : null}</div>
          <div className="info"><div className="nm">{p.name} <span className="age">{p.age}</span><span className="vb" title="Face verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 12l5 5 9-10" /></svg></span></div>
            <div className="chips"><span className="chip">{p.city}</span><span className="chip st">{p.status}</span></div>{p.bio && <p className="bio">{p.bio}</p>}</div></div>
        <div className="kv"><div><small>Email</small>{me.email}</div><div><small>Mobile</small>{me.phone}</div></div>
        <button className="btn ghost" onClick={() => setEdit(true)}>Edit details</button>
      </div>
      <h3 style={{ fontSize: '1.2rem', margin: '24px 0 4px' }}>More photos</h3>
      <p className="note">Each photo is checked. It has to show you (matching your selfie) and be fully clothed.</p>
      <div className="kv" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {extras.map((x) => (
          <div key={x.id} style={{ padding: 0, position: 'relative', overflow: 'hidden', aspectRatio: '3/4' }}>
            <img alt="" src={x.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {x.status === 'review' && <span className="sample" style={{ top: 6, left: 6, fontSize: '.6rem' }}>In review</span>}
            <button className="iconbtn" aria-label="Remove photo" onClick={() => remove(x.id)} style={{ position: 'absolute', right: 4, top: 4, width: 30, height: 30 }}>×</button>
          </div>
        ))}
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={add} />
      {extras.length < me.limits.maxExtraPhotos && <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => file.current?.click()} disabled={busy}>{busy ? 'Checking photo…' : 'Add a photo'}</button>}

      <h3 style={{ fontSize: '1.2rem', margin: '28px 0 8px' }}>Account</h3>
      {!pwOpen ? <button className="btn ghost" onClick={() => setPwOpen(true)}>Change password</button> : (
        <form onSubmit={changePw}><PasswordField id="cp" label="Current password" value={pw.cur} onChange={(v) => setPw({ ...pw, cur: v })} autoComplete="current-password" /><PasswordField id="np" label="New password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} autoComplete="new-password" meter /><p className="err">{err}</p><button className="btn accent">Save password</button></form>
      )}
      <div style={{ height: 10 }} />
      {del === null ? <button className="link" onClick={() => { setDel(''); setErr(''); }}>Delete my account</button> : (
        <form onSubmit={deleteAccount} className="stack"><p className="note">This permanently removes your profile, photos, matches and messages. Enter your password to confirm.</p><PasswordField id="dp" label="Password" value={del} onChange={setDel} autoComplete="current-password" /><p className="err">{err}</p><button className="btn" style={{ background: 'var(--no)', color: '#fff' }}>Delete everything</button><button type="button" className="btn ghost" onClick={() => setDel(null)}>Keep my account</button></form>
      )}
    </div>
  );
}
