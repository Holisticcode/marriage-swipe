'use client';
import { useEffect, useRef, useState } from 'react';
import { api, errMsg, Me } from './api';

// Step: take a live selfie. The server checks it (no nudity, one clear face) and stores the face as the reference for every later photo.
export function SelfieStep({ me, onDone, onLogout }: { me: Me; onDone: (m: Me) => void; onLogout: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [cam, setCam] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const pending = me.verification === 'pending';

  useEffect(() => () => stop(), []);
  function stop() { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setCam(false); }

  async function start() {
    setErr('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1200 } }, audio: false });
      stream.current = s; setCam(true);
      setTimeout(() => { if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } }, 30);
    } catch { setErr('We could not open the camera. Allow camera access, or choose a photo instead.'); file.current?.click(); }
  }
  function snap() {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d')!; g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) { setBlob(b); setPreview(URL.createObjectURL(b)); stop(); } }, 'image/jpeg', 0.9);
  }
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBlob(f); setPreview(URL.createObjectURL(f)); setErr('');
  }
  async function send() {
    if (!blob) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('photo', blob, 'selfie.jpg');
      const d = await api('POST', '/me/selfie', undefined, { form: fd });
      setNote(d.message || ''); onDone(d.user);
    } catch (x) { setErr(errMsg(x)); setBlob(null); setPreview(null); } finally { setBusy(false); }
  }

  if (pending) {
    return (
      <main className="screen">
        <div className="topbar"><b>Almost there</b><button className="link" onClick={onLogout}>Log out</button></div>
        <h1 style={{ fontSize: '2rem' }}>A person is <em>checking</em> your selfie</h1>
        <p className="tag">The automatic check could not decide, so a moderator will look. You can use the app as soon as it is approved. Come back later or retake it now.</p>
        {note && <p className="note">{note}</p>}
        <button className="btn ghost" style={{ marginTop: 18 }} onClick={() => onDone({ ...me, verification: 'none' })}>Take a new selfie</button>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => api('GET', '/me').then((d) => onDone(d.user))}>Check again</button>
      </main>
    );
  }

  return (
    <main className="screen scroll">
      <div className="topbar"><b>Step 2 of 2</b><button className="link" onClick={onLogout}>Log out</button></div>
      <div className="stepper" aria-hidden="true"><i className="on" /><i className="on" /></div>
      <h1 style={{ fontSize: '2rem' }}>Verify <em>your face</em></h1>
      <p className="tag">Take a clear selfie in good light. Every photo you add later has to match it. Photos with nudity are never allowed.</p>
      <div className={`frame ${err ? 'bad' : preview ? 'ok' : ''}`}>
        {cam ? <video ref={video} playsInline muted /> : preview ? <img alt="Your selfie" src={preview} /> : <div className="hint">Face the camera, no hat or sunglasses, only you in the frame.</div>}
      </div>
      <p className="err" role="alert">{err}</p>
      <input ref={file} type="file" accept="image/*" capture="user" hidden onChange={pick} />
      {cam ? (
        <button className="btn accent" onClick={snap}>Take photo</button>
      ) : preview ? (
        <div className="stack">
          <button className="btn accent" onClick={send} disabled={busy}>{busy ? 'Checking…' : 'Use this selfie'}</button>
          <button className="btn ghost" onClick={() => { setPreview(null); setBlob(null); }} disabled={busy}>Retake</button>
        </div>
      ) : (
        <div className="stack">
          <button className="btn accent" onClick={start}>Open camera</button>
          <button className="btn ghost" onClick={() => file.current?.click()}>Choose a photo instead</button>
        </div>
      )}
      <p className="note" style={{ marginTop: 14 }}>The AI check runs on our own server. Your selfie is not shared with any outside service.</p>
    </main>
  );
}
