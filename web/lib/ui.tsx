'use client';
import { useState } from 'react';

export function Mark({ light }: { light?: boolean }) {
  return (
    <svg className="mark" viewBox="0 0 84 56" fill="none" aria-hidden="true">
      <circle cx="29" cy="28" r="21" stroke={light ? '#ff8fa8' : '#d92d55'} strokeWidth="7" />
      <circle cx="55" cy="28" r="21" stroke="#f5b83d" strokeWidth="7" />
    </svg>
  );
}

export function Avatar({ src, hue = 280, cls = 'av' }: { src?: string | null; hue?: number | null; cls?: string }) {
  return (
    <div className={cls}>
      {src ? <img alt="" src={src} /> : (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="100" height="100" fill={`hsl(${hue ?? 280} 40% 55%)`} />
          <circle cx="50" cy="40" r="17" fill="rgba(255,255,255,.55)" />
          <path d="M16 100c4-26 20-38 34-38s30 12 34 38z" fill="rgba(255,255,255,.55)" />
        </svg>
      )}
    </div>
  );
}

export function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/i.test(pw) && /\d/.test(pw)) s++;
  if (pw.length >= 12) s++;
  if (/[^a-z0-9]/i.test(pw) && pw.length >= 8) s++;
  return s;
}

export function PasswordField({ id, label, value, onChange, autoComplete, meter, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; meter?: boolean; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pwrap">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
        <button type="button" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
      </div>
      {meter && <div className={`meter s${strength(value)}`} aria-hidden="true"><i /><i /><i /><i /></div>}
      {hint && <span className="hintline">{hint}</span>}
    </div>
  );
}

export function Seg({ name, options, value, onChange }: { name: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <span key={o} style={{ display: 'contents' }}>
          <input type="radio" name={name} id={`${name}-${o}`} checked={value === o} onChange={() => onChange(o)} />
          <label htmlFor={`${name}-${o}`}>{o}</label>
        </span>
      ))}
    </div>
  );
}
