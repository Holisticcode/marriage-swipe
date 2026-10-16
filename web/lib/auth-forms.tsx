'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errMsg, setSession, getSession } from './api';
import { Mark, PasswordField } from './ui';

function Shell({ title, sub, children }: { title: React.ReactNode; sub?: string; children: React.ReactNode }) {
  return (
    <div className="page">
      <main className="screen">
        <div className="topbar">
          <Link href="/" className="brandline" style={{ textDecoration: 'none', color: 'inherit' }}><Mark /> Marriage Swipe</Link>
        </div>
        <h1 style={{ fontSize: '2.2rem', marginTop: 10 }}>{title}</h1>
        {sub && <p className="tag" style={{ marginBottom: 22 }}>{sub}</p>}
        {children}
      </main>
    </div>
  );
}

export function LoginForm() {
  const r = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const d = await api('POST', '/auth/login', { identifier: id, password: pw }, { auth: false });
      if (d.user.role === 'admin') { setErr('Admins sign in at /admin.'); return; }
      setSession({ accessToken: d.accessToken, refreshToken: d.refreshToken });
      r.replace('/app');
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <Shell title={<>Welcome <em>back</em></>} sub="Log in with your email or mobile number.">
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="id">Email or mobile number</label><input id="id" type="text" autoComplete="username" inputMode="email" value={id} onChange={(e) => setId(e.target.value)} /></div>
        <PasswordField id="pw" label="Password" value={pw} onChange={setPw} autoComplete="current-password" />
        <p className="err" role="alert">{err}</p>
        <button className="btn accent" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="center" style={{ marginTop: 16 }}><Link className="link" href="/forgot">Forgot password?</Link></p>
      <p className="center note">New here? <Link href="/signup">Create an account</Link></p>
    </Shell>
  );
}

export function SignupForm() {
  const r = useRouter();
  const [f, setF] = useState({ email: '', phone: '', password: '', terms: false });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!/^\+[1-9]\d{7,14}$/.test(f.phone.replace(/[\s()-]/g, ''))) { setErr('Enter your mobile number with country code, like +61 412 345 678.'); return; }
    setBusy(true);
    try {
      const d = await api('POST', '/auth/signup', { email: f.email.trim(), phone: f.phone.replace(/[\s()-]/g, ''), password: f.password, acceptTerms: f.terms }, { auth: false });
      setSession({ accessToken: d.accessToken, refreshToken: d.refreshToken });
      r.replace('/app');
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <Shell title={<>Create your <em>account</em></>} sub="Your email and number stay private. Nobody else sees them.">
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="phone">Mobile number</label><input id="phone" type="tel" autoComplete="tel" placeholder="+61 412 345 678" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /><span className="hintline">Include your country code.</span></div>
        <PasswordField id="pw" label="Create a password" value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" meter hint="8 or more characters with letters and numbers." />
        <label className="check"><input type="checkbox" checked={f.terms} onChange={(e) => setF({ ...f, terms: e.target.checked })} /><span>I am 18 or older and agree to the <Link href="/terms" target="_blank">community rules</Link> and <Link href="/privacy" target="_blank">privacy policy</Link>.</span></label>
        <p className="err" role="alert">{err}</p>
        <button className="btn accent" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="center note" style={{ marginTop: 16 }}>Already a member? <Link href="/login">Log in</Link></p>
    </Shell>
  );
}

export function ForgotForm() {
  const [step, setStep] = useState<'ask' | 'reset' | 'done'>('ask');
  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function ask(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('POST', '/auth/forgot', { identifier: id }, { auth: false }); setStep('reset'); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  async function reset(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('POST', '/auth/reset', { identifier: id, code, newPassword: pw }, { auth: false }); setStep('done'); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }
  return (
    <Shell title={<>Reset your <em>password</em></>} sub={step === 'ask' ? 'We will email you a 6-digit code.' : undefined}>
      {step === 'ask' && (
        <form onSubmit={ask} noValidate>
          <div className="field"><label htmlFor="id">Email or mobile number</label><input id="id" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" /></div>
          <p className="err" role="alert">{err}</p>
          <button className="btn accent" disabled={busy}>Send code</button>
        </form>
      )}
      {step === 'reset' && (
        <form onSubmit={reset} noValidate>
          <p className="note">If that account exists, a code is on its way to the email on it. It lasts 10 minutes.</p>
          <div className="field"><label htmlFor="code">6-digit code</label><input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <PasswordField id="npw" label="New password" value={pw} onChange={setPw} autoComplete="new-password" meter />
          <p className="err" role="alert">{err}</p>
          <button className="btn accent" disabled={busy}>Set new password</button>
        </form>
      )}
      {step === 'done' && (<><p className="okmsg">Password changed. Log in with your new password.</p><Link className="btn accent" href="/login">Log in</Link></>)}
      <p className="center note" style={{ marginTop: 16 }}><Link href="/login">Back to log in</Link></p>
    </Shell>
  );
}

export { getSession };
