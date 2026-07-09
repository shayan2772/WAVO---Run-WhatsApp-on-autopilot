import { useCallback, useEffect, useState } from 'react';
import { Bot, Hand, Loader2 } from 'lucide-react';
import { aiAssistantApi, type ContactAiState } from '../services/api';
import './AiTakeoverControl.css';

// Compact per-chat AI status + human-takeover control for the support inbox. Shows whether the AI is
// active or paused (with a live countdown) and lets an agent take over or hand the chat back.
export function AiTakeoverControl({ sessionId, chatId }: { sessionId: string; chatId: string }) {
  const [state, setState] = useState<ContactAiState | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(() => {
    aiAssistantApi.chatState(sessionId, chatId).then(setState).catch(() => setState(null));
  }, [sessionId, chatId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Tick every second so the countdown updates and the badge flips to Active on auto-resume.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const snoozedUntil = state?.snoozedUntil ? new Date(state.snoozedUntil).getTime() : 0;
  const paused = snoozedUntil > now;
  const remainingMin = paused ? Math.ceil((snoozedUntil - now) / 60000) : 0;

  const takeOver = async () => {
    setBusy(true);
    try {
      const s = await aiAssistantApi.snooze(sessionId, chatId);
      setState(s);
    } finally {
      setBusy(false);
    }
  };

  const handBack = async () => {
    setBusy(true);
    try {
      await aiAssistantApi.unsnooze(sessionId, chatId);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`ai-takeover ${paused ? 'ai-takeover--paused' : 'ai-takeover--active'}`}>
      <span className="ai-takeover__badge">
        <Bot size={14} />
        {paused ? `AI paused · ${remainingMin}m` : 'AI active'}
      </span>
      {paused ? (
        <button className="ai-takeover__btn" onClick={handBack} disabled={busy} title="Hand back to the AI">
          {busy ? <Loader2 className="animate-spin" size={14} /> : <Bot size={14} />} Hand to AI
        </button>
      ) : (
        <button className="ai-takeover__btn" onClick={takeOver} disabled={busy} title="Pause the AI and take over">
          {busy ? <Loader2 className="animate-spin" size={14} /> : <Hand size={14} />} Take over
        </button>
      )}
    </div>
  );
}
