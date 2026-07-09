import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWebSocket } from './useWebSocket';
import { useToast } from '../components/Toast';
import { playRingtone, unlockAudio } from '../utils/ringtone';

export interface AttentionAlert {
  /** Stable key per chat so repeat handoffs update in place instead of stacking. */
  key: string;
  sessionId: string;
  chatId: string;
  contactName: string;
  reason: string;
  preview?: string;
  snoozedUntil: string | null;
  at: number;
  read: boolean;
}

type NotifPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface AttentionContextValue {
  alerts: AttentionAlert[];
  unreadCount: number;
  soundEnabled: boolean;
  toggleSound: () => void;
  notifPermission: NotifPermission;
  requestNotifications: () => void;
  markAllRead: () => void;
  dismiss: (key: string) => void;
  clearAll: () => void;
}

const AttentionContext = createContext<AttentionContextValue | null>(null);

export function useAttention() {
  const ctx = useContext(AttentionContext);
  if (!ctx) throw new Error('useAttention must be used within AttentionProvider');
  return ctx;
}

const SOUND_KEY = 'owa_attention_sound';
const getInitialPermission = (): NotifPermission =>
  typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as NotifPermission);

interface AttentionProviderProps {
  children: ReactNode;
  /** Deep-link into the inbox when a user acts on an alert. */
  onOpenChat?: (sessionId: string, chatId: string) => void;
}

/**
 * App-wide "a human is needed" center. Listens for `ai.handoff` events across all of the business's
 * sessions and, when one arrives, (1) rings a chime, (2) raises a desktop notification, (3) drops a
 * toast, and (4) keeps a list the sidebar bell can surface — so an agent comes and attends the chat.
 */
export function AttentionProvider({ children, onOpenChat }: AttentionProviderProps) {
  const { info } = useToast();
  const [alerts, setAlerts] = useState<AttentionAlert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_KEY) !== 'off');
  const [notifPermission, setNotifPermission] = useState<NotifPermission>(getInitialPermission);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const onOpenRef = useRef(onOpenChat);
  onOpenRef.current = onOpenChat;

  const handleHandoff = useCallback(
    (e: {
      sessionId: string;
      chatId: string;
      reason: string;
      snoozedUntil: string | null;
      contactName?: string;
      preview?: string;
    }) => {
      const key = `${e.sessionId}:${e.chatId}`;
      const name = e.contactName || e.chatId.split('@')[0] || e.chatId;
      setAlerts(prev => {
        const next = prev.filter(a => a.key !== key);
        next.unshift({
          key,
          sessionId: e.sessionId,
          chatId: e.chatId,
          contactName: name,
          reason: e.reason,
          preview: e.preview,
          snoozedUntil: e.snoozedUntil,
          at: Date.now(),
          read: false,
        });
        return next.slice(0, 50);
      });

      if (soundRef.current) playRingtone();
      info('A customer needs a human', `${name}: ${e.preview || 'requested to talk to a person'}`);

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification('👋 Customer needs a human', {
            body: `${name}\n${e.preview || 'Requested to speak with a person'}`,
            tag: key, // collapse repeat alerts for the same chat
            requireInteraction: true,
          });
          n.onclick = () => {
            window.focus();
            onOpenRef.current?.(e.sessionId, e.chatId);
            n.close();
          };
        } catch {
          /* notification best-effort */
        }
      }
    },
    [info],
  );

  const wsEvents = useMemo(() => ({ onAiHandoff: handleHandoff }), [handleHandoff]);
  const { isConnected, subscribe } = useWebSocket(wsEvents);

  // Subscribe to handoff events across the whole business ('*' expands to this user's sessions
  // server-side) as soon as the socket is up, and re-subscribe on every reconnect.
  useEffect(() => {
    if (isConnected) subscribe('*', ['ai.handoff']);
  }, [isConnected, subscribe]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
      if (next) unlockAudio();
      return next;
    });
  }, []);

  const requestNotifications = useCallback(() => {
    if (typeof Notification === 'undefined') return;
    unlockAudio(); // this is a user gesture — also prime audio
    void Notification.requestPermission().then(p => setNotifPermission(p as NotifPermission));
  }, []);

  const markAllRead = useCallback(() => setAlerts(prev => prev.map(a => ({ ...a, read: true }))), []);
  const dismiss = useCallback((key: string) => setAlerts(prev => prev.filter(a => a.key !== key)), []);
  const clearAll = useCallback(() => setAlerts([]), []);

  const unreadCount = alerts.reduce((n, a) => n + (a.read ? 0 : 1), 0);

  // Update the tab title with the unread count so alerts are visible even on another tab.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
  }, [unreadCount]);

  const value = useMemo(
    () => ({
      alerts,
      unreadCount,
      soundEnabled,
      toggleSound,
      notifPermission,
      requestNotifications,
      markAllRead,
      dismiss,
      clearAll,
    }),
    [alerts, unreadCount, soundEnabled, toggleSound, notifPermission, requestNotifications, markAllRead, dismiss, clearAll],
  );

  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>;
}
