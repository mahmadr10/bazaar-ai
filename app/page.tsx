'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChatCard, ChatResponse } from '@/lib/contracts';
import { LimitsPills } from '@/components/Nav';
import { AgentSteps, CardView } from '@/components/Cards';
import { api, refreshMe, useMe } from '@/components/useMe';

type Msg = { role: 'user' | 'assistant'; content: string; cards?: ChatCard[]; error?: boolean; trace?: string[]; model?: string };

const SUGGESTIONS = [
  'Under $10 mein best mascara le do',
  'Find me a good body wash under $15 and buy it',
  'مجھے 10 ڈالر سے کم میں نیل پالش خرید دیں',
  'Under $30 achhi shirt chahiye, le lo',
  'Meri limit kya hai?',
];

const STORE_KEY = 'bazaar-chat-v1';

export default function ChatPage() {
  const { me } = useMe(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [context, setContext] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the conversation across page reloads (per browser, convenience only).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
      if (saved?.msgs) { setMsgs(saved.msgs); setContext(saved.context || ''); }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ msgs: msgs.slice(-30), context })); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, context, busy]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: t }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const res = await api<ChatResponse>('/api/chat', {
        messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        context,
      });
      setMsgs([...next, { role: 'assistant', content: res.reply, cards: res.cards, trace: res.trace, model: res.model }]);
      setContext(res.context);
      if (res.cards.some((c) => c.type === 'receipt')) refreshMe();
    } catch (e: any) {
      setMsgs([...next, { role: 'assistant', content: e.message, error: true }]);
    }
    setBusy(false);
  }

  function clear() { setMsgs([]); setContext(''); }

  if (!me?.user) return <div className="page muted">Loading...</div>;

  return (
    <div className="chat">
      <div className="row">
        <div className="grow"><LimitsPills /></div>
        {msgs.length > 0 && <button className="btn btn-sm" onClick={clear} style={{ marginTop: 8 }}>New chat</button>}
      </div>

      <div className="msgs">
        {msgs.length === 0 && (
          <div className="hero">
            <h1>Tell me what you need and your budget.</h1>
            <p>I search the store, read the reviews, pick the best value. You approve with one tap and pay through PayPal, and your spending limits are enforced by code. English, Urdu or Roman Urdu.</p>
            <div className="how">
              <div className="card"><strong>1. You ask</strong>&quot;Under $10 mein best mascara le do&quot;</div>
              <div className="card"><strong>2. Agent picks</strong>Compares price, rating and reviews from our catalog.</div>
              <div className="card"><strong>3. Code checks limits</strong>A rules engine, not the AI, checks the price and your limits.</div>
              <div className="card"><strong>4. PayPal pays</strong>Receipt, 10-minute undo, seller paid after the window.</div>
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`}>
            {m.content && <div className={`bubble ${m.error ? 'err' : ''}`} dir="auto">{m.content}</div>}
            {m.cards?.map((c, j) => <CardView key={j} card={c} />)}
            {m.trace && <AgentSteps steps={m.trace} model={m.model} />}
          </div>
        ))}
        {busy && (
          <div className="msg bot">
            <div className="typing"><span className="dots"><span /><span /><span /></span> Searching the store and checking your limits</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        {msgs.length === 0 && (
          <div className="chips">
            {SUGGESTIONS.map((s) => <button key={s} className="chip" dir="auto" onClick={() => send(s)}>{s}</button>)}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. mujhe $10 se kam mein achhi lipstick chahiye" dir="auto" aria-label="Message" />
          <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}
