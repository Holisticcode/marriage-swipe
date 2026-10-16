'use client';
import { useEffect, useRef, useState } from 'react';
import { api, errMsg, Profile } from './api';
import { Avatar } from './ui';
import { ReportSheet } from './deck';

export type MatchRow = { id: string; matchedAt: string; profile: Profile; lastMessage: { text: string; mine: boolean; at: string } | null; unread: number };

export function Matches({ rows, onOpen, reload }: { rows: MatchRow[] | null; onOpen: (m: MatchRow) => void; reload: () => void }) {
  useEffect(() => { reload(); const t = setInterval(reload, 15000); return () => clearInterval(t); }, [reload]);
  return (
    <div className="tabview scroll">
      <div className="top" style={{ paddingInline: 0 }}><div className="lg">Matches</div></div>
      {rows === null ? <p className="note">Loading…</p> : rows.length === 0 ? (
        <div className="empty" style={{ position: 'static', padding: 32 }}><h3>No matches yet</h3><p>When you both like each other, you can chat here.</p></div>
      ) : (
        <div className="list">
          {rows.map((m) => (
            <button key={m.id} className="row" onClick={() => onOpen(m)}>
              <Avatar src={m.profile.photos[0]} hue={m.profile.hue} />
              <div className="meta"><b>{m.profile.name}, {m.profile.age}</b><span>{m.lastMessage ? `${m.lastMessage.mine ? 'You: ' : ''}${m.lastMessage.text}` : 'Say hello'}</span></div>
              {m.unread > 0 && <span className="badge" style={{ position: 'static', marginLeft: 'auto' }}>{m.unread}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Msg = { id: number; mine: boolean; text: string; at: string };

export function Chat({ match, onClose, onToast, onGone }: { match: MatchRow; onClose: () => void; onToast: (s: string) => void; onGone: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const last = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const p = match.profile;

  useEffect(() => {
    let live = true;
    async function poll() {
      try {
        const d = await api('GET', `/matches/${match.id}/messages?after=${last.current}`);
        if (!live || !d.messages.length) return;
        last.current = d.messages[d.messages.length - 1].id;
        setMsgs((m) => [...m, ...d.messages]);
      } catch (x: any) { if (x?.status === 404 || x?.status === 403) { onToast('This chat is no longer available.'); onGone(); } }
    }
    poll(); const t = setInterval(poll, 3500);
    return () => { live = false; clearInterval(t); };
  }, [match.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim(); if (!t) return;
    setText('');
    try {
      const d = await api('POST', `/matches/${match.id}/messages`, { text: t });
      last.current = Math.max(last.current, d.message.id);
      setMsgs((m) => [...m, d.message]);
    } catch (x) { setText(t); onToast(errMsg(x)); }
  }
  return (
    <div className="overlay" role="dialog" aria-label={`Chat with ${p.name}`}>
      <div className="chead">
        <button onClick={onClose} aria-label="Back">←</button>
        <Avatar src={p.photos[0]} hue={p.hue} cls="av" />
        <div style={{ minWidth: 0 }}><b>{p.name}, {p.age}</b><div className="note" style={{ margin: 0 }}>{p.city} · {p.status}</div></div>
        <button style={{ marginLeft: 'auto' }} onClick={() => setMenu(true)} aria-label="Report or block">⋯</button>
      </div>
      <div className="msgs">
        <div className="sys">Keep it respectful. Phone numbers and emails are removed from messages until you both decide to share them.</div>
        {msgs.map((m) => <div key={m.id} className={`msg${m.mine ? ' me' : ''}`}>{m.text}</div>)}
        <div ref={end} />
      </div>
      <form className="cform" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Write a message" aria-label="Message" />
        <button className="btn accent">Send</button>
      </form>
      {menu && <ReportSheet target={p} onClose={() => setMenu(false)} onDone={(m) => { setMenu(false); onToast(m); onGone(); }} />}
    </div>
  );
}
