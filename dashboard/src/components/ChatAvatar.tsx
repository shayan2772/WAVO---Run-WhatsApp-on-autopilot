import { useEffect, useState, type CSSProperties } from 'react';
import { Users } from 'lucide-react';
import { contactApi } from '../services/api';

// Cross-component, cross-render cache so each contact's photo is fetched at most once per session.
//   picCache: resolved url|null   inFlight: the shared pending promise (so EVERY mounted avatar for
// the same contact — e.g. the list row AND the open-chat header — resolves from one request).
const picCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function fetchPic(sessionId: string, chatId: string): Promise<string | null> {
  const k = `${sessionId}:${chatId}`;
  if (picCache.has(k)) return Promise.resolve(picCache.get(k) ?? null);
  let p = inFlight.get(k);
  if (!p) {
    p = contactApi
      .profilePicture(sessionId, chatId)
      .then(r => {
        const u = r.url ?? null;
        picCache.set(k, u);
        return u;
      })
      .catch(() => {
        picCache.set(k, null);
        return null;
      })
      .finally(() => inFlight.delete(k));
    inFlight.set(k, p);
  }
  return p;
}

interface ChatAvatarProps {
  sessionId: string;
  chatId: string;
  isGroup?: boolean;
  /** Initials shown until (or unless) a real photo loads. */
  initials: string;
  size?: number;
  /** Gradient background for the initials fallback. */
  style?: CSSProperties;
  /** Outer class — "chat-avatar" (list) or "room-avatar" (header). */
  className?: string;
}

/**
 * Contact avatar that shows the real WhatsApp profile picture when available (fetched via the
 * per-session engine, best-effort + cached), falling back to a colored initials chip. Groups show
 * a group glyph. Any fetch/render failure silently degrades to initials.
 */
export function ChatAvatar({ sessionId, chatId, isGroup, initials, size = 44, style, className = 'chat-avatar' }: ChatAvatarProps) {
  const key = `${sessionId}:${chatId}`;
  const [url, setUrl] = useState<string | null | undefined>(() => picCache.get(key));

  useEffect(() => {
    if (isGroup || !sessionId || !chatId) return;
    let alive = true;
    // Shares one request across every avatar for this contact, so the list row and the chat header
    // always resolve to the same photo (previously the 2nd-mounted one got stuck on initials).
    void fetchPic(sessionId, chatId).then(u => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [sessionId, chatId, isGroup]);

  const showImg = !isGroup && !!url;
  const dim: CSSProperties = { width: size, height: size };

  return (
    <div
      className={`${className} ${isGroup ? 'is-group' : ''} ${showImg ? 'has-img' : ''}`.trim()}
      style={showImg || isGroup ? dim : { ...dim, ...style }}
    >
      {isGroup ? (
        <Users size={Math.round(size * 0.45)} />
      ) : showImg ? (
        <img
          className="chat-avatar__img"
          src={url as string}
          alt=""
          loading="lazy"
          onError={() => {
            picCache.set(key, null);
            setUrl(null);
          }}
        />
      ) : (
        <span className="chat-avatar__initials">{initials}</span>
      )}
    </div>
  );
}
