'use client';
import { useState } from 'react';
import { api, errMsg, Me } from './api';
import { Seg } from './ui';

export function ProfileForm({ me, onSaved, onLogout, onCancel }: { me: Me; onSaved: (m: Me) => void; onLogout?: () => void; onCancel?: () => void }) {
  const p = me.profile;
  const [f, setF] = useState({ name: p?.name || '', age: p ? String(p.age) : '', gender: p?.gender || '', lookingFor: p?.lookingFor || '', status: p?.status || '', city: p?.city || '', bio: p?.bio || '', adult: !!p });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const d = await api('PUT', '/me/profile', { ...f, age: Number(f.age) }); onSaved(d.user); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <main className="screen scroll">
      <div className="topbar"><b>{onCancel ? 'Edit profile' : 'Step 1 of 2'}</b>{onLogout && <button className="link" onClick={onLogout}>Log out</button>}{onCancel && <button className="link" onClick={onCancel}>Cancel</button>}</div>
      {!onCancel && <div className="stepper" aria-hidden="true"><i className="on" /><i /></div>}
      <h1 style={{ fontSize: '2rem', marginBottom: 18 }}>{onCancel ? <>Your <em>details</em></> : <>Tell us <em>about you</em></>}</h1>
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="name">First name</label><input id="name" maxLength={24} value={f.name} onChange={(e) => set('name')(e.target.value)} autoComplete="given-name" /></div>
        <div className="field"><label htmlFor="age">Age</label><input id="age" type="number" inputMode="numeric" min={18} max={90} value={f.age} onChange={(e) => set('age')(e.target.value)} /></div>
        <div className="field"><span className="lbl">I am</span><Seg name="gender" options={['Man', 'Woman']} value={f.gender} onChange={set('gender')} /></div>
        <div className="field"><span className="lbl">Looking for</span><Seg name="lf" options={['Man', 'Woman', 'Everyone']} value={f.lookingFor} onChange={set('lookingFor')} /></div>
        <div className="field"><span className="lbl">Status</span><Seg name="st" options={['Single', 'Divorced', 'Widowed', 'Separated']} value={f.status} onChange={set('status')} /></div>
        <div className="field"><label htmlFor="city">City</label><input id="city" maxLength={40} value={f.city} onChange={(e) => set('city')(e.target.value)} autoComplete="address-level2" /></div>
        <div className="field"><label htmlFor="bio">One line about you</label><textarea id="bio" maxLength={140} value={f.bio} onChange={(e) => set('bio')(e.target.value)} placeholder="No phone numbers or emails. Those stay private." /><span className="hintline">{f.bio.length}/140</span></div>
        <label className="check"><input type="checkbox" checked={f.adult} onChange={(e) => setF({ ...f, adult: e.target.checked })} /><span>I confirm I am 18 or older and looking for marriage.</span></label>
        <p className="err" role="alert">{err}</p>
        <button className="btn accent" disabled={busy}>{busy ? 'Saving…' : onCancel ? 'Save' : 'Continue'}</button>
      </form>
    </main>
  );
}
