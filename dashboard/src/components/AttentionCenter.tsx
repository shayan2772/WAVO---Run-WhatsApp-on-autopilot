import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, Volume2, VolumeX, X, MessageSquare, Check } from 'lucide-react';
import { useAttention } from '../hooks/useAttention';
import './AttentionCenter.css';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

interface AttentionCenterProps {
  collapsed?: boolean;
}

/** Sidebar bell: unread badge + a panel of chats that need a human, with one-click open. */
export function AttentionCenter({ collapsed }: AttentionCenterProps) {
  const navigate = useNavigate();
  const {
    alerts,
    unreadCount,
    soundEnabled,
    toggleSound,
    notifPermission,
    requestNotifications,
    markAllRead,
    dismiss,
    clearAll,
  } = useAttention();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Clear the "unread" highlight once the user actually opens the panel.
  useEffect(() => {
    if (open && unreadCount > 0) markAllRead();
  }, [open, unreadCount, markAllRead]);

  const openChat = (sessionId: string, chatId: string) => {
    setOpen(false);
    navigate(`/chats?session=${encodeURIComponent(sessionId)}&chat=${encodeURIComponent(chatId)}`);
  };

  const hasAlerts = alerts.length > 0;

  return (
    <div className="attn" ref={ref}>
      <button
        className={`attn-trigger ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Attention needed"
        aria-label={`Attention needed${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {unreadCount > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {!collapsed && <span>Alerts</span>}
        {unreadCount > 0 && <span className="attn-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="attn-panel" role="menu">
          <div className="attn-panel__head">
            <div className="attn-panel__title">
              <BellRing size={16} />
              <strong>Needs a human</strong>
            </div>
            <div className="attn-panel__tools">
              <button
                className="attn-tool"
                onClick={toggleSound}
                title={soundEnabled ? 'Mute ringtone' : 'Unmute ringtone'}
                aria-label={soundEnabled ? 'Mute ringtone' : 'Unmute ringtone'}
              >
                {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
            </div>
          </div>

          {notifPermission === 'default' && (
            <button className="attn-enable" onClick={requestNotifications}>
              <Bell size={14} /> Enable desktop notifications
            </button>
          )}
          {notifPermission === 'denied' && (
            <div className="attn-note">Desktop notifications are blocked in your browser settings.</div>
          )}

          <div className="attn-list">
            {!hasAlerts && (
              <div className="attn-empty">
                <Check size={22} />
                <span>All clear — no chats waiting on a human.</span>
              </div>
            )}
            {alerts.map(a => (
              <div key={a.key} className={`attn-item ${a.read ? '' : 'unread'}`}>
                <div className="attn-item__body" onClick={() => openChat(a.sessionId, a.chatId)}>
                  <div className="attn-item__top">
                    <span className="attn-item__name">{a.contactName}</span>
                    <span className="attn-item__time">{timeAgo(a.at)}</span>
                  </div>
                  {a.preview && <p className="attn-item__preview">{a.preview}</p>}
                </div>
                <div className="attn-item__actions">
                  <button className="attn-open" onClick={() => openChat(a.sessionId, a.chatId)} title="Open chat">
                    <MessageSquare size={14} /> Open
                  </button>
                  <button className="attn-dismiss" onClick={() => dismiss(a.key)} title="Dismiss" aria-label="Dismiss">
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {hasAlerts && (
            <button className="attn-clear" onClick={clearAll}>
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
