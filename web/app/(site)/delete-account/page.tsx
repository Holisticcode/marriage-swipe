'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, errMsg } from '@/lib/api';
import { PasswordField } from '@/lib/ui';

export default function DeleteAccount() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const d = await api('POST', '/auth/login', { identifier: id, password: pw }, { auth: false });
      await fetch('/api/me', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${d.accessToken}` }, body: JSON.stringify({ password: pw }) }).then(async (r) => { if (!r.ok) throw (await r.json()).error; });
      setDone(true);
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <article className="doc">
      <Link href="/">← Back</Link>
      <h1>Delete your account</h1>
      {done ? <p className="okmsg">Your account and everything on it has been deleted.</p> : (
        <>
          <p>This permanently removes your profile, photos, matches and messages. It cannot be undone. Log in below to confirm it is you. You can also do this in the app under Profile, then Delete my account.</p>
          <form onSubmit={submit} noValidate style={{ maxWidth: 420 }}>
            <div className="field"><label htmlFor="id">Email or mobile number</label><input id="id" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" /></div>
            <PasswordField id="pw" label="Password" value={pw} onChange={setPw} autoComplete="current-password" />
            <p className="err" role="alert">{err}</p>
            <button className="btn" style={{ background: 'var(--no)', color: '#fff' }} disabled={busy}>{busy ? 'Deleting…' : 'Delete my account'}</button>
          </form>
          <p>Lost your password? <Link href="/forgot">Reset it</Link> first, or email us from your account address.</p>
        </>
      )}
    </article>
  );
}
