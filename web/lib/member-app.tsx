'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errMsg, getSession, Me, Profile, setSession } from './api';
import { ProfileForm } from './profile-form';
import { SelfieStep } from './selfie';
import { Discover } from './deck';
import { Chat, MatchRow, Matches } from './matches';
import { MeTab } from './me-tab';
import { Avatar, Mark } from './ui';

function VerifyEmail({ me, onDone, onLogout }: { me: Me; onDone: (m: Me) => void; onLogout: () => void }) {
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [sent, setSent] = useState(false);
  async function send() { setErr(''); try { await api('POST', '/auth/email/send'); setSent(true); } catch (x) { setErr(errMsg(x)); } }
  async function verify(e: React.FormEvent) { e.preventDefault(); setErr(''); try { const d = await api('POST', '/auth/email/verify', { code }); onDone(d.user); } catch (x) { setErr(errMsg(x)); } }
  return (
    <main className="screen">
      <div className="topbar"><b>Confirm your email</b><button className="link" onClick={onLogout}>Log out</button></div>
      <p className="tag">We will send a 6-digit code to {me.email}.</p>
      {!sent ? <button className="btn accent" onClick={send}>Send code</button> : (
        <form onSubmit={verify}><div className="field"><label htmlFor="c">Code</label><input id="c" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></div><p className="err">{err}</p><button className="btn accent">Confirm</button></form>
      )}
      {!sent && <p className="err">{err}</p>}
    </main>
  );
}

export default function MemberApp() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<'discover' | 'matches' | 'me'>('discover');
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [chat, setChat] = useState<MatchRow | null>(null);
  const [made, setMade] = useState<{ id: string; profile: Profile } | null>(null);
  const [toast, setToast] = useState('');
  const [fatal, setFatal] = useState('');

  const say = useCallback((s: string) => { setToast(s); setTimeout(() => setToast(''), 4200); }, []);
  const logout = useCallback(async () => {
    const s = getSession();
    try { if (s) await api('POST', '/auth/logout', { refreshToken: s.refreshToken }); } catch {}
    setSession(null); router.replace('/login');
  }, [router]);

  useEffect(() => {
    if (!getSession()) { router.replace('/login'); return; }
    api('GET', '/me').then((d) => {
      if (d.user.role === 'admin') { setFatal('This is an admin account. Use the admin console at /admin.'); return; }
      setMe(d.user);
    }).catch((e) => { if (e?.status === 401 || e?.status === 403) { setSession(null); router.replace('/login' + (e.code === 'ACCOUNT_REMOVED' ? '?removed=1' : '')); } else setFatal(errMsg(e)); });
  }, [router]);

  const loadMatches = useCallback(() => { api('GET', '/matches').then((d) => setRows(d.matches)).catch(() => {}); }, []);
  useEffect(() => { if (me?.verification === 'verified') loadMatches(); }, [me?.verification, loadMatches]);

  if (fatal) return <div className="page"><main className="screen"><p className="err">{fatal}</p><button className="btn ghost" onClick={logout}>Log out</button></main></div>;
  if (!me) return <div className="page"><main className="screen"><p className="note">Loading…</p></main></div>;

  let body: React.ReactNode;
  if (me.requiresEmailVerification && !me.emailVerified) body = <VerifyEmail me={me} onDone={setMe} onLogout={logout} />;
  else if (!me.profile) body = <ProfileForm me={me} onSaved={setMe} onLogout={logout} />;
  else if (me.verification !== 'verified') body = <SelfieStep me={me} onDone={setMe} onLogout={logout} />;
  else {
    const unread = (rows || []).reduce((n, r) => n + r.unread, 0);
    body = (
      <>
        <main id="main" className="screen" style={{ padding: 0, flex: 1, minHeight: 0 }}>
          {tab === 'discover' && <Discover onMatch={(m) => { setMade(m); loadMatches(); }} onToast={say} />}
          {tab === 'matches' && <Matches rows={rows} onOpen={setChat} reload={loadMatches} />}
          {tab === 'me' && <MeTab me={me} setMe={setMe} onLogout={logout} onToast={say} />}
        </main>
        <nav className="tabs" role="tablist" aria-label="Sections">
          {(['discover', 'matches', 'me'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              <span className="tl">{t === 'discover' ? 'Discover' : t === 'matches' ? 'Matches' : 'Profile'}</span>
              {tab === t && <span>{t === 'discover' ? 'Discover' : t === 'matches' ? 'Matches' : 'Profile'}</span>}
              {tab !== t && <span aria-hidden="true">{t === 'discover' ? '♥' : t === 'matches' ? '✉' : '☺'}</span>}
              {t === 'matches' && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
        </nav>
        {made && (
          <div className="overlay modal" role="dialog" aria-label="It is a match">
            <div className="sheet">
              <div className="pair"><Avatar src={me.photos[0]?.url} cls="av" /><Avatar src={made.profile.photos[0]} hue={made.profile.hue} cls="av" /></div>
              <h2>It&apos;s a <em>match</em></h2>
              <p>You and {made.profile.name} like each other.</p>
              <button className="btn accent" onClick={() => { const m = made; setMade(null); setTab('matches'); setChat({ id: m.id, matchedAt: '', profile: m.profile, lastMessage: null, unread: 0 }); }}>Say hello</button>
              <button className="btn ghost" onClick={() => setMade(null)}>Keep swiping</button>
            </div>
          </div>
        )}
        {chat && <Chat match={chat} onClose={() => { setChat(null); loadMatches(); }} onToast={say} onGone={() => { setChat(null); loadMatches(); }} />}
      </>
    );
  }
  return (
    <div className="page" style={{ height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      {body}
      {toast && <div role="status" className="toast" style={{ position: 'absolute', left: 16, right: 16, bottom: 96, background: 'var(--ink)', color: 'var(--ink-fg)', padding: '12px 16px', borderRadius: 16, zIndex: 40, fontWeight: 600 }}>{toast}</div>}
    </div>
  );
}
