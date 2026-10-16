import Link from 'next/link';
import { Mark } from '@/lib/ui';

export default function Landing() {
  return (
    <div className="page">
      <main className="screen" style={{ justifyContent: 'flex-end', gap: 22, paddingBlock: '16px 32px', minHeight: '100vh' }}>
        <div className="hero" aria-hidden="true">
          <div className="t t1" /><div className="t t2" /><div className="t t3" />
          <div className="tick"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg></div>
          <div className="pill">Every face is checked</div>
        </div>
        <div>
          <div className="brandline"><Mark /> Marriage Swipe</div>
          <h1 className="brand">Swipe with <em>intention.</em></h1>
          <p className="tag">For people ready for marriage. Every profile photo is checked against a live selfie, so you meet the real person.</p>
        </div>
        <ul className="points">
          <li><b>Real faces</b>Selfie matched to every photo</li>
          <li><b>Kept clean</b>AI and people review photos</li>
          <li><b>Private</b>No phone numbers in chat</li>
        </ul>
        <div className="stack">
          <Link className="btn accent" href="/signup">Create account</Link>
          <Link className="btn ghost" href="/login">I already have an account</Link>
        </div>
        <p className="note center">18+ only. <Link href="/terms">Community rules</Link> · <Link href="/privacy">Privacy</Link></p>
      </main>
    </div>
  );
}
