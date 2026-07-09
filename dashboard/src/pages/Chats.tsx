import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatPhoneDisplay } from '../utils/phone';
import { useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import {
  Search,
  Send,
  ArrowLeft,
  Loader2,
  AlertCircle,
  MessageSquare,
  Paperclip,
  Smile,
  X,
  CornerUpLeft,
  Trash2,
  PenSquare,
} from 'lucide-react';
import { PhoneInput } from '../components/PhoneInput';
import { Button } from '../components/Button';
import { ChatAvatar } from '../components/ChatAvatar';
import {
  sessionApi,
  messageApi,
  aiAssistantApi,
  asMessageType,
  type Session,
  type Chat,
  type MessageType,
} from '../services/api';
import { AiTakeoverControl } from '../components/AiTakeoverControl';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { mergeDeliveryStatus, type ChatMessageView } from '../utils/chatMessages';
import { useWebSocket } from '../hooks/useWebSocket';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import { useToast } from '../components/Toast';
import { PageHeader } from '../components/PageHeader';
import {
  useChatMessages,
  useChatMessagesActions,
  messagesQueryKey,
} from '../hooks/useChatMessages';
import { useChatScrollPosition } from '../hooks/useChatScrollPosition';
import MessageBody from '../components/chats/MessageBody';
import MediaLightbox, { type LightboxItem } from '../components/chats/MediaLightbox';
import './Chats.css';

type MessageMedia = { mimetype: string; filename?: string; data?: string; omitted?: boolean; sizeBytes?: number };

// mergeDeliveryStatus (forward-only delivery-tick merge) is shared with mergeOrAppend in utils/chatMessages
// so the WS append path and the ack path apply the exact same rule.

interface IncomingWsMessage {
  id: string;
  chatId: string;
  from: string;
  to: string;
  body: string;
  type: string;
  timestamp: number;
  fromMe?: boolean;
  media?: MessageMedia;
  quotedMessage?: { id: string; body: string };
  // The backend emits `call` as a top-level field on the live `message.received` event (it's only
  // folded into `metadata` on the persisted/history path), so declare it here to carry it through.
  call?: { video: boolean; missed: boolean };
  metadata?: ChatMessageView['metadata'];
}

// Map an attachment MIME type to the neutral MessageType for the optimistic outgoing bubble, so the
// placeholder matches what the backend will persist (e.g. a PDF is `document`, not `application`).
const messageTypeFromMime = (mimetype: string): MessageType => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
};

const getMediaSrc = (media?: MessageMedia): string => {
  if (!media || !media.data) return '';
  if (media.data.startsWith('data:') || media.data.startsWith('http://') || media.data.startsWith('https://')) {
    return media.data;
  }
  return `data:${media.mimetype};base64,${media.data}`;
};

export function Chats() {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.chats'));
  const { canWrite } = useRole();
  const { success: showSuccessToast, error: showErrorToast, warning: showWarningToast } = useToast();

  // "New message" composer (start a chat with any number).
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatMsg, setNewChatMsg] = useState('');
  const [startingChat, setStartingChat] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const [showDeleteChat, setShowDeleteChat] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<ChatMessageView | null>(null);
  const [deletingMsg, setDeletingMsg] = useState(false);

  // Deep-link target from the attention center / notifications: /chats?session=..&chat=..
  // Captured once on mount so navigating away from it later doesn't re-trigger.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkRef = useRef<{ session: string; chat: string } | null>(
    searchParams.get('session') && searchParams.get('chat')
      ? { session: searchParams.get('session') as string, chat: searchParams.get('chat') as string }
      : null,
  );

  // Sessions list & active session
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);

  // Chats list
  const [chats, setChats] = useState<Chat[]>([]);
  const [loadingChats, setLoadingChats] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected chat & message history
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const {
    data: messages = [],
    isLoading: loadingMessages,
    isError: messagesError,
  } = useChatMessages(selectedSessionId, activeChat?.id ?? null);
  const { appendMessage, updateMessage } = useChatMessagesActions();
  const queryClient = useQueryClient();
  const [messageInput, setMessageInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  // Lightbox state for media viewer
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // File attachments
  const [attachment, setAttachment] = useState<{
    file: File;
    base64: string;
    mimetype: string;
    filename: string;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);

  // References
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessageView | null>(null);

  // Per-chat scroll-position memory + auto-scroll heuristic.
  // Pass `messages.length > 0` as the loaded signal: it stays stable once the
  // chat has any message (doesn't toggle per append) and covers both the
  // first-fetch resolution and a WS-driven first message on a previously-empty
  // chat. `loadingMessages` alone would miss the latter case.
  const { containerRef: messagesContainerRef, onMessageAppended } =
    useChatScrollPosition(activeChat?.id ?? null, messages.length > 0);

  // Popular emojis
  const popularEmojis = ['😀', '😂', '👍', '❤️', '🔥', '👏', '🙏', '🎉', '💡', '🤔', '😅', '😍', '😊', '😭', '😎', '😜', '🚀', '✨'];

  // 1. Fetch available connected sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        setLoadingSessions(true);
        const list = await sessionApi.list();
        const readySessions = list.filter(s => s.status === 'ready');
        setSessions(readySessions);
        if (readySessions.length > 0) {
          // Prefer a deep-linked session if it's connected; otherwise the first ready one.
          const dl = deepLinkRef.current;
          const linked = dl && readySessions.find(s => s.id === dl.session);
          setSelectedSessionId(linked ? linked.id : readySessions[0].id);
        }
      } catch (err) {
        showErrorToast(t('chats.errors.loadSessions'), err instanceof Error ? err.message : undefined);
      } finally {
        setLoadingSessions(false);
      }
    };
    void loadSessions();
  }, [t, showErrorToast]);

  // 2. Fetch chats when active session changes
  const loadChats = useCallback(
    async (sessionId: string) => {
      if (!sessionId) return;
      try {
        setLoadingChats(true);
        const data = await sessionApi.getChats(sessionId);
        const sorted = [...data].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setChats(sorted);
      } catch (err) {
        showErrorToast(t('chats.errors.loadChats'), err instanceof Error ? err.message : undefined);
        setChats([]);
      } finally {
        setLoadingChats(false);
      }
    },
    [t, showErrorToast],
  );

  useEffect(() => {
    if (selectedSessionId) {
      void loadChats(selectedSessionId);
      setActiveChat(null);
      setAttachment(null);
      setPreviewUrl(null);
    }
  }, [selectedSessionId, loadChats]);

  // Once the chat list for the deep-linked session has loaded, auto-open the target chat, then
  // consume the query params so a later navigation doesn't re-open it.
  useEffect(() => {
    const dl = deepLinkRef.current;
    if (!dl || dl.session !== selectedSessionId || chats.length === 0) return;
    const target = chats.find(c => c.id === dl.chat);
    if (target) setActiveChat(target);
    deepLinkRef.current = null;
    setSearchParams({}, { replace: true });
  }, [chats, selectedSessionId, setSearchParams]);

  // Revoke the object URL created for an image-attachment preview once it is replaced, cleared, or
  // the page unmounts. The cleanup runs with the previous value on every change, so this single
  // effect covers all paths (new file, remove, session switch) — otherwise each preview leaks a
  // blob held for the lifetime of the document.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const markChatRead = useCallback(
    (chatId: string) => {
      void sessionApi.markChatRead(selectedSessionId, chatId).catch(err => {
        showWarningToast(t('chats.errors.markRead'), err instanceof Error ? err.message : undefined);
      });
    },
    [selectedSessionId, t, showWarningToast],
  );

  // 3. WebSocket integration for real-time messages
  const handleIncomingMessage = useCallback(
    (event: { sessionId: string; message: Record<string, unknown> }) => {
      if (event.sessionId !== selectedSessionId) return;

      const newMsg = event.message as unknown as IncomingWsMessage;

      const mappedMessage: ChatMessageView = {
        id: newMsg.id,
        waMessageId: newMsg.id,
        chatId: newMsg.chatId,
        from: newMsg.from,
        to: newMsg.to,
        body: newMsg.body,
        type: asMessageType(newMsg.type),
        direction: newMsg.fromMe ? 'outgoing' : 'incoming',
        status: 'sent',
        timestamp: newMsg.timestamp,
        createdAt: new Date(newMsg.timestamp * 1000).toISOString(),
        metadata: newMsg.metadata || {
          media: newMsg.media,
          quotedMessage: newMsg.quotedMessage,
          call: newMsg.call,
        },
      };

      // Always write to the React Query cache for this message's session — keeps non-active chats
      // up to date so re-opening them shows fresh data without a refetch.
      appendMessage(event.sessionId, newMsg.chatId, mappedMessage);

      // If the message belongs to the currently visible chat, mark-as-read and run the scroll heuristic.
      if (activeChat && newMsg.chatId === activeChat.id) {
        markChatRead(activeChat.id);
        if (!newMsg.fromMe) onMessageAppended('incoming');
      }

      // Update sidebar chat list
      setChats(prevChats => {
        const chatIndex = prevChats.findIndex(c => c.id === newMsg.chatId);
        if (chatIndex === -1) {
          // A message for a chat not in the sidebar. Suppress the refetch ONLY for an outgoing echo
          // addressed as `@lid`: a LID-migrated contact echoes back `@lid` while the user sent to
          // `@c.us`, and the sent bubble is already reconciled in the active chat, so refetching on
          // every such send just churns the chat list (#583 R2). Incoming messages and ordinary
          // outgoing sends to a genuinely new chat still refetch so the sidebar stays complete.
          const isMigratedEcho = newMsg.fromMe && (newMsg.chatId?.endsWith('@lid') ?? false);
          if (!isMigratedEcho) {
            void loadChats(selectedSessionId);
          }
          return prevChats;
        }

        const updatedChats = [...prevChats];
        const targetChat = { ...updatedChats[chatIndex] };
        // A location message's body is the (multi-KB) base64 map thumbnail; show a label instead.
        targetChat.lastMessage = newMsg.type === 'location' ? `📍 ${t('chats.media.location')}` : newMsg.body;
        targetChat.timestamp = newMsg.timestamp;

        if (!newMsg.fromMe && (!activeChat || activeChat.id !== targetChat.id)) {
          targetChat.unreadCount = (targetChat.unreadCount || 0) + 1;
        }

        updatedChats.splice(chatIndex, 1);
        updatedChats.unshift(targetChat);
        return updatedChats;
      });
    },
    [selectedSessionId, activeChat, loadChats, markChatRead, appendMessage, onMessageAppended, t],
  );

  const handleIncomingMessageAck = useCallback(
    (event: { sessionId: string; messageId: string; status: ChatMessageView['status'] }) => {
      if (event.sessionId !== selectedSessionId) return;

      // Acks can arrive for any cached chat under this session. Walk every cache entry under
      // ['messages', event.sessionId, *] and apply the forward-only delivery merge in place.
      const caches = queryClient.getQueriesData<ChatMessageView[]>({
        queryKey: ['messages', event.sessionId],
      });
      for (const [key, list] of caches) {
        if (!list) continue;
        const idx = list.findIndex(
          m => m.id === event.messageId || m.waMessageId === event.messageId,
        );
        if (idx === -1) continue;
        const target = list[idx];
        // Backend now sends the neutral delivery status directly (no engine-specific ack codes).
        // Merge forward-only so an out-of-order/replayed lower ack can't downgrade the tick.
        const nextStatus = mergeDeliveryStatus(target.status, event.status) ?? target.status;
        const next = list.slice();
        next[idx] = { ...target, status: nextStatus };
        queryClient.setQueryData(key, next);
      }
    },
    [selectedSessionId, queryClient],
  );

  const handleIncomingMessageReaction = useCallback(
    (event: { sessionId: string; messageId: string; reactions: Record<string, string> }) => {
      if (event.sessionId !== selectedSessionId) return;

      // Reactions update `metadata.reactions` while preserving `metadata.media` / `metadata.quotedMessage`,
      // so we must read the prior message and deep-merge — `updateMessage`'s shallow merge would clobber
      // the rest of metadata.
      const caches = queryClient.getQueriesData<ChatMessageView[]>({
        queryKey: ['messages', event.sessionId],
      });
      for (const [key, list] of caches) {
        if (!list) continue;
        const idx = list.findIndex(
          m => m.id === event.messageId || m.waMessageId === event.messageId,
        );
        if (idx === -1) continue;
        const target = list[idx];
        const next = list.slice();
        next[idx] = {
          ...target,
          metadata: { ...(target.metadata || {}), reactions: event.reactions },
        };
        queryClient.setQueryData(key, next);
      }
    },
    [selectedSessionId, queryClient],
  );

  const handleIncomingMessageRevoked = useCallback(
    (event: { sessionId: string; id: string; type: string }) => {
      if (event.sessionId !== selectedSessionId) return;

      // Walk every cached chat under this session, find the message by id or waMessageId and zero it
      // — the backend emits an empty body; the localized "deleted" label is rendered below.
      const caches = queryClient.getQueriesData<ChatMessageView[]>({
        queryKey: ['messages', event.sessionId],
      });
      for (const [key, list] of caches) {
        if (!list) continue;
        const idx = list.findIndex(m => m.id === event.id || m.waMessageId === event.id);
        if (idx === -1) continue;
        const target = list[idx];
        const next = list.slice();
        next[idx] = { ...target, body: '', type: asMessageType(event.type) };
        queryClient.setQueryData(key, next);
      }
    },
    [selectedSessionId, queryClient],
  );

  const { isConnected, connectionFailed, reconnect, subscribe, unsubscribe } = useWebSocket({
    onMessage: handleIncomingMessage,
    onMessageAck: handleIncomingMessageAck,
    onMessageReaction: handleIncomingMessageReaction,
    onMessageRevoked: handleIncomingMessageRevoked,
  });

  useEffect(() => {
    if (selectedSessionId && isConnected) {
      subscribe(selectedSessionId, [
        'message.received',
        'message.sent',
        'message.ack',
        'message.reaction',
        'message.revoked',
      ]);
      return () => {
        unsubscribe(selectedSessionId);
      };
    }
  }, [selectedSessionId, isConnected, subscribe, unsubscribe]);

  // 4. Message history is fetched by useChatMessages (React Query). The active-chat side effects
  // (mark-as-read + clear sidebar unread badge) live in a small effect below.

  const handleReactMessage = async (msg: ChatMessageView, emoji: string) => {
    if (!selectedSessionId || !activeChat) return;

    const msgId = msg.waMessageId || msg.id;
    const currentReactions = msg.metadata?.reactions || {};
    const sessionPhone = sessions.find(s => s.id === selectedSessionId)?.phone || 'me';

    let alreadyReacted = false;
    for (const [sender, emo] of Object.entries(currentReactions)) {
      if ((sender === 'me' || sender.includes(sessionPhone)) && emo === emoji) {
        alreadyReacted = true;
        break;
      }
    }

    const emojiToSend = alreadyReacted ? '' : emoji;

    try {
      await messageApi.react(selectedSessionId, {
        chatId: activeChat.id,
        messageId: msgId,
        emoji: emojiToSend,
      });

      // Deep-merge metadata.reactions so existing media / quotedMessage on metadata survive.
      const key = messagesQueryKey(selectedSessionId, activeChat.id);
      queryClient.setQueryData<ChatMessageView[]>(key, (old = []) =>
        old.map(m => {
          if (m.id === msg.id || m.waMessageId === msg.id) {
            const metadata = m.metadata || {};
            const reactions = { ...(metadata.reactions || {}) };
            if (emojiToSend === '') {
              delete reactions['me'];
            } else {
              reactions['me'] = emojiToSend;
            }
            return { ...m, metadata: { ...metadata, reactions } };
          }
          return m;
        }),
      );
    } catch (err) {
      showErrorToast(t('chats.errors.react'), err instanceof Error ? err.message : undefined);
    }
  };

  // Message delete now confirms via the shared HTML dialog (not a browser alert).
  const handleDeleteMessage = async () => {
    const msg = confirmMsg;
    if (!selectedSessionId || !activeChat || !msg) return;
    const msgId = msg.waMessageId || msg.id;
    setDeletingMsg(true);
    try {
      await messageApi.delete(selectedSessionId, {
        chatId: activeChat.id,
        messageId: msgId,
        forEveryone: true,
      });
      updateMessage(selectedSessionId, activeChat.id, msg.id, { body: '', type: 'revoked' });
      setConfirmMsg(null);
    } catch (err) {
      showErrorToast(t('chats.errors.delete'), err instanceof Error ? err.message : undefined);
    } finally {
      setDeletingMsg(false);
    }
  };

  // Side effects when the active chat changes: mark-as-read on the gateway + clear sidebar unread badge.
  // The message-history fetch is driven by useChatMessages; scroll restoration is driven by
  // useChatScrollPosition (both keyed off activeChat?.id). Deliberately keying off `activeChat?.id`
  // (not the whole object) so a sidebar reshuffle that mutates the activeChat instance doesn't re-fire
  // the mark-as-read RPC for the same chat.
  useEffect(() => {
    if (!activeChat) return;
    markChatRead(activeChat.id);
    setChats(prev => prev.map(c => (c.id === activeChat.id ? { ...c, unreadCount: 0 } : c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat?.id, markChatRead]);

  // 5. Handle file selection & base64 conversion
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }

    const reader = new FileReader();
    reader.onload = event => {
      const dataUrl = event.target?.result as string;
      const base64Data = dataUrl.split(',')[1];
      setAttachment({ file, base64: base64Data, mimetype: file.type, filename: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = () => {
    setAttachment(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleEmojiClick = (emoji: string) => {
    setMessageInput(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  // 7. Handle sending a message / media
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedSessionId || !activeChat || sending) return;

    const textToSend = messageInput.trim();
    if (!textToSend && !attachment) return;

    // Human takeover: sending a manual reply pauses the AI for this chat (auto-resumes later).
    if (!activeChat.isGroup) {
      void aiAssistantApi.snooze(selectedSessionId, activeChat.id).catch(() => {});
    }

    setMessageInput('');
    setSending(true);

    const tempId = `temp_${Date.now()}`;
    const tempMessage: ChatMessageView = {
      id: tempId,
      chatId: activeChat.id,
      from: 'me',
      to: activeChat.id,
      body: attachment
        ? attachment.mimetype.startsWith('image/') ||
          attachment.mimetype.startsWith('video/') ||
          attachment.mimetype.startsWith('audio/')
          ? textToSend
          : attachment.filename
        : textToSend,
      type: attachment ? messageTypeFromMime(attachment.mimetype) : 'text',
      direction: 'outgoing',
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: attachment
        ? {
            media: {
              mimetype: attachment.mimetype,
              filename: attachment.filename,
              data: attachment.base64,
            },
          }
        : replyingTo
          ? {
              quotedMessage: {
                id: replyingTo.waMessageId || replyingTo.id,
                body: replyingTo.type !== 'text' ? `[${replyingTo.type}]` : replyingTo.body,
              },
            }
          : undefined,
    };

    appendMessage(selectedSessionId, activeChat.id, tempMessage);
    onMessageAppended('outgoing');

    const currentAttachment = attachment;
    const currentReplyingTo = replyingTo;
    handleRemoveAttachment();
    setReplyingTo(null);

    try {
      let result;

      if (currentAttachment) {
        let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
        const mime = currentAttachment.mimetype;
        if (mime.startsWith('image/')) mediaType = 'image';
        else if (mime.startsWith('video/')) mediaType = 'video';
        else if (mime.startsWith('audio/')) mediaType = 'audio';

        result = await messageApi.sendMedia(selectedSessionId, activeChat.id, mediaType, {
          base64: currentAttachment.base64,
          mimetype: currentAttachment.mimetype,
          filename: currentAttachment.filename,
          caption: mediaType !== 'audio' ? textToSend : undefined,
        });
      } else if (currentReplyingTo) {
        result = await messageApi.reply(selectedSessionId, {
          chatId: activeChat.id,
          quotedMessageId: currentReplyingTo.waMessageId || currentReplyingTo.id,
          text: textToSend,
        });
      } else {
        result = await messageApi.sendText(selectedSessionId, activeChat.id, textToSend);
      }

      // Race guard: the realtime `message.sent` echo can arrive before this response and already
      // append the message by its real WA id (the dedup at receive time misses because the
      // optimistic placeholder still carries the temp id). If so, drop the placeholder instead of
      // renaming it — otherwise both the echo and the renamed temp render as duplicate bubbles.
      const sendKey = messagesQueryKey(selectedSessionId, activeChat.id);
      queryClient.setQueryData<ChatMessageView[]>(sendKey, (prev = []) => {
        const echoAlreadyAdded = prev.some(
          m => m.id === result.messageId || m.waMessageId === result.messageId,
        );
        if (echoAlreadyAdded) {
          return prev.filter(m => m.id !== tempId);
        }
        return prev.map(m =>
          m.id === tempId
            ? { ...m, id: result.messageId, waMessageId: result.messageId, status: 'sent' }
            : m,
        );
      });

      // Update sidebar chat list (move active chat to the top with the new snippet)
      setChats(prevChats => {
        const chatIndex = prevChats.findIndex(c => c.id === activeChat.id);
        if (chatIndex === -1) return prevChats;
        const updatedChats = [...prevChats];
        const target = { ...updatedChats[chatIndex] };
        target.lastMessage = currentAttachment
          ? `[${currentAttachment.mimetype.split('/')[0]}]`
          : textToSend;
        target.timestamp = Math.floor(Date.now() / 1000);
        updatedChats.splice(chatIndex, 1);
        updatedChats.unshift(target);
        return updatedChats;
      });
    } catch (err) {
      showErrorToast(t('chats.errors.send'), err instanceof Error ? err.message : undefined);
      updateMessage(selectedSessionId, activeChat.id, tempId, { status: 'failed' });
    } finally {
      setSending(false);
    }
  };

  // Helper formats
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatLastMessageSnippet = (chat: Chat) => chat.lastMessage || '';

  const formatChatTime = useCallback(
    (timestamp?: number) => {
      if (!timestamp) return '';
      const date = new Date(timestamp * 1000);
      const today = new Date();
      if (date.toDateString() === today.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) {
        return t('chats.yesterday');
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    },
    [t],
  );

  // ---- WhatsApp-style contact display helpers ----
  const digitsOf = (id: string) => (id || '').split('@')[0].replace(/[^\d]/g, '');
  const isRealName = (chat: Chat) => !!chat.name && !/^\+?[\d\s()+-]+$/.test(chat.name) && !chat.name.includes('@');
  const chatTitle = (chat: Chat) => (isRealName(chat) ? chat.name : formatPhoneDisplay(digitsOf(chat.id)));
  const chatNumber = (chat: Chat) => (chat.isGroup ? '' : formatPhoneDisplay(digitsOf(chat.id)));
  const chatInitials = (chat: Chat) => {
    const title = chatTitle(chat).trim();
    if (/^\+?\d/.test(title)) return digitsOf(chat.id).slice(-2);
    const parts = title.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || title.slice(0, 2).toUpperCase();
  };
  const avatarStyle = (seed: string) => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return { background: `linear-gradient(135deg, hsl(${hue} 62% 52%), hsl(${(hue + 32) % 360} 62% 42%))` };
  };

  // Start (or open) a chat with an arbitrary number, optionally sending a first message.
  const startChat = async () => {
    const digits = newChatPhone.replace(/[^\d]/g, '');
    if (!digits) {
      showErrorToast(t('chats.newChat.invalidPhone', { defaultValue: 'Enter a valid phone number' }));
      return;
    }
    if (!selectedSessionId) {
      showErrorToast(t('chats.newChat.noSession', { defaultValue: 'Select a connected number first' }));
      return;
    }
    const chatId = `${digits}@c.us`;
    setStartingChat(true);
    try {
      if (newChatMsg.trim()) {
        await messageApi.sendText(selectedSessionId, chatId, newChatMsg.trim());
      }
      const existing = chats.find(c => c.id === chatId);
      const chat: Chat =
        existing ?? {
          id: chatId,
          name: formatPhoneDisplay(digits),
          isGroup: false,
          unreadCount: 0,
          timestamp: Math.floor(Date.now() / 1000),
          lastMessage: newChatMsg.trim() || undefined,
        };
      if (!existing) setChats(prev => [chat, ...prev]);
      setActiveChat(chat);
      setShowNewChat(false);
      setNewChatPhone('');
      setNewChatMsg('');
      showSuccessToast(
        newChatMsg.trim()
          ? t('chats.newChat.sent', { defaultValue: 'Message sent' })
          : t('chats.newChat.opened', { defaultValue: 'Chat opened' }),
      );
    } catch (e) {
      showErrorToast(
        t('chats.newChat.failed', { defaultValue: 'Could not start chat' }),
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setStartingChat(false);
    }
  };

  // Delete a whole conversation: purges its stored messages so it leaves the inbox for good.
  // Confirmation is the shared HTML modal (below), not a browser alert.
  const handleDeleteChat = async () => {
    if (!activeChat || !selectedSessionId) return;
    const chatId = activeChat.id;
    setDeletingChat(true);
    try {
      await sessionApi.deleteChat(selectedSessionId, chatId);
      setChats(prev => prev.filter(c => c.id !== chatId));
      setActiveChat(null);
      setShowDeleteChat(false);
      showSuccessToast(t('chats.chatDeleted', { defaultValue: 'Conversation deleted' }));
    } catch (e) {
      showErrorToast(t('chats.chatDeleteFailed', { defaultValue: 'Could not delete conversation' }), e instanceof Error ? e.message : undefined);
    } finally {
      setDeletingChat(false);
    }
  };

  const filteredChats = chats.filter(
    c =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Image media items for the lightbox, in render order. `getMediaSrc` reconstructs a usable src
  // from either a base64 payload or a URL — the ChatMessageView shape stores both in `data`.
  const imageMedia = useMemo<LightboxItem[]>(
    () =>
      messages
        .filter(m => m.type === 'image' && Boolean(getMediaSrc(m.metadata?.media)))
        .map(m => ({
          id: m.id,
          url: getMediaSrc(m.metadata?.media),
          alt: m.body || m.metadata?.media?.filename || '',
          senderName: undefined,
          timestamp: formatChatTime(m.timestamp || Math.floor(new Date(m.createdAt).getTime() / 1000)),
        })),
    [messages, formatChatTime],
  );

  return (
    <div className="chats-page">
      <PageHeader title={t('nav.chats')} subtitle={t('chats.subtitle')} />

      {showNewChat && (
        <div className="modal-overlay" onClick={() => !startingChat && setShowNewChat(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('chats.newChat.title', { defaultValue: 'New message' })}</h2>
              <button className="btn-icon" onClick={() => setShowNewChat(false)} disabled={startingChat}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <label>{t('chats.newChat.phoneLabel', { defaultValue: 'Customer phone number' })}</label>
              <div style={{ marginBottom: '1rem' }}>
                <PhoneInput value={newChatPhone} onChange={setNewChatPhone} placeholder="Phone number" />
              </div>
              <label>{t('chats.newChat.messageLabel', { defaultValue: 'Message (optional)' })}</label>
              <textarea
                rows={3}
                value={newChatMsg}
                onChange={e => setNewChatMsg(e.target.value)}
                placeholder={t('chats.newChat.messagePlaceholder', { defaultValue: 'Type a first message, or leave blank to just open the chat' })}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowNewChat(false)} disabled={startingChat}>
                {t('common.cancel')}
              </button>
              <Button variant="primary" loading={startingChat} icon={<Send size={16} />} onClick={startChat}>
                {newChatMsg.trim()
                  ? t('chats.newChat.send', { defaultValue: 'Send' })
                  : t('chats.newChat.open', { defaultValue: 'Open chat' })}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-conversation confirmation — shared HTML dialog (no browser alert). */}
      <ConfirmDialog
        open={showDeleteChat && !!activeChat}
        title={t('chats.deleteChat', { defaultValue: 'Delete conversation' })}
        message={
          <>
            <p style={{ margin: 0 }}>
              {t('chats.deleteChatBody', { defaultValue: 'This removes the conversation from your inbox and cannot be undone.' })}
            </p>
            {activeChat && <p style={{ margin: '0.6rem 0 0', fontWeight: 600 }}>{chatTitle(activeChat)}</p>}
          </>
        }
        confirmLabel={t('common.delete')}
        loading={deletingChat}
        onConfirm={handleDeleteChat}
        onCancel={() => setShowDeleteChat(false)}
      />

      {/* Delete-single-message confirmation. */}
      <ConfirmDialog
        open={!!confirmMsg}
        title={t('chats.deleteMessageTitle', { defaultValue: 'Delete message' })}
        message={t('chats.deleteConfirm', { defaultValue: 'Delete this message for everyone? This cannot be undone.' })}
        confirmLabel={t('common.delete')}
        loading={deletingMsg}
        onConfirm={handleDeleteMessage}
        onCancel={() => setConfirmMsg(null)}
      />

      {/* Real-time connection permanently dropped — let the user re-establish it instead of
          silently showing stale chats. */}
      {connectionFailed && (
        <div className="chats-reconnect-banner" role="alert">
          <AlertCircle size={16} />
          <span>{t('common.disconnected')}</span>
          <button className="btn-secondary" onClick={reconnect}>
            {t('common.refresh')}
          </button>
        </div>
      )}

      {loadingSessions ? (
        <div className="chats-loading-container">
          <Loader2 className="animate-spin" size={32} />
          <p>{t('common.loading')}</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="chats-error-state">
          <AlertCircle size={48} className="text-warn" />
          <h3>{t('chats.noSessionsTitle')}</h3>
          <p>
            <Trans i18nKey="chats.noSessionsDesc">
              Please connect a WhatsApp session from the <strong>Sessions</strong> menu first to use the chat
              feature.
            </Trans>
          </p>
        </div>
      ) : (
        <div className={`chats-layout ${activeChat ? 'has-active-chat' : ''}`}>
          {/* LEFT SIDEBAR: session & chat rooms */}
          <aside className="chats-sidebar">
            <div className="sidebar-header-box">
              {/* Session selector */}
              <div className="session-select-group">
                <label className="form-label">{t('chats.sessionLabel')}</label>
                <select
                  value={selectedSessionId}
                  onChange={e => setSelectedSessionId(e.target.value)}
                  className="session-selector"
                >
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone ? formatPhoneDisplay(s.phone) : t('chats.noPhone')})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search bar */}
              <div className="chat-search-input">
                <Search size={18} />
                <input
                  type="text"
                  placeholder={t('chats.searchPlaceholder')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {canWrite && (
                <Button variant="primary" block icon={<PenSquare size={16} />} onClick={() => setShowNewChat(true)}>
                  {t('chats.newChat.button', { defaultValue: 'New message' })}
                </Button>
              )}
            </div>

            {/* Chat list */}
            <div className="chats-list">
              {loadingChats ? (
                <div className="chats-list-loading">
                  <Loader2 className="animate-spin" size={24} />
                  <span>{t('chats.loadingChats')}</span>
                </div>
              ) : filteredChats.length === 0 ? (
                <div className="chats-list-empty">
                  <MessageSquare size={34} strokeWidth={1.5} />
                  <span>{searchQuery ? t('chats.empty') : t('chats.noChatsYet', { defaultValue: 'No conversations yet' })}</span>
                  {canWrite && !searchQuery && (
                    <Button variant="primary" size="sm" icon={<PenSquare size={15} />} onClick={() => setShowNewChat(true)}>
                      {t('chats.newChat.button', { defaultValue: 'New message' })}
                    </Button>
                  )}
                </div>
              ) : (
                filteredChats.map(chat => {
                  const isActive = activeChat?.id === chat.id;
                  return (
                    <div
                      key={chat.id}
                      className={`chat-item-card ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveChat(chat)}
                    >
                      <ChatAvatar
                        sessionId={selectedSessionId}
                        chatId={chat.id}
                        isGroup={chat.isGroup}
                        initials={chatInitials(chat)}
                        style={avatarStyle(chat.id)}
                        size={44}
                      />

                      <div className="chat-item-info">
                        <div className="chat-item-top">
                          <span className="chat-item-name" title={chatTitle(chat)}>
                            {chatTitle(chat)}
                          </span>
                          {chat.timestamp && (
                            <span className="chat-item-time">{formatChatTime(chat.timestamp)}</span>
                          )}
                        </div>
                        {!chat.isGroup && isRealName(chat) && (
                          <div className="chat-item-number">{chatNumber(chat)}</div>
                        )}
                        <div className="chat-item-bottom">
                          <span className="chat-item-snippet" title={formatLastMessageSnippet(chat)}>
                            {formatLastMessageSnippet(chat) || (
                              <span className="no-message">{t('chats.noMessageYet')}</span>
                            )}
                          </span>
                          {chat.unreadCount > 0 && (
                            <span className="chat-unread-badge">{chat.unreadCount}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* RIGHT VIEW: active chat room */}
          <main className="chats-room">
            {activeChat ? (
              <div className="room-container">
                {/* Room header */}
                <header className="room-header">
                  <button className="room-back" onClick={() => setActiveChat(null)} aria-label={t('common.back')}>
                    <ArrowLeft size={20} />
                  </button>
                  <ChatAvatar
                    className="room-avatar"
                    sessionId={selectedSessionId}
                    chatId={activeChat.id}
                    isGroup={activeChat.isGroup}
                    initials={chatInitials(activeChat)}
                    style={avatarStyle(activeChat.id)}
                    size={44}
                  />
                  <div className="room-contact-info">
                    <h3>{chatTitle(activeChat)}</h3>
                    {/* Only show the number line when the title is a real NAME — otherwise the title
                        already IS the number and we'd print it twice. */}
                    <span>
                      {activeChat.isGroup
                        ? t('chats.groupChat', { defaultValue: 'Group chat' })
                        : isRealName(activeChat)
                          ? chatNumber(activeChat)
                          : t('chats.whatsappContact', { defaultValue: 'WhatsApp contact' })}
                    </span>
                  </div>
                  {!activeChat.isGroup && (
                    <AiTakeoverControl sessionId={selectedSessionId} chatId={activeChat.id} />
                  )}
                  {canWrite && (
                    <button
                      className="room-delete"
                      onClick={() => setShowDeleteChat(true)}
                      title={t('chats.deleteChat', { defaultValue: 'Delete conversation' })}
                      aria-label={t('chats.deleteChat', { defaultValue: 'Delete conversation' })}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </header>

                {/* Messages body */}
                <div className="room-messages" ref={messagesContainerRef}>
                  {loadingMessages ? (
                    <div className="messages-loading">
                      <Loader2 className="animate-spin" size={32} />
                      <span>{t('chats.loadingMessages')}</span>
                    </div>
                  ) : messagesError ? (
                    <div className="messages-empty">
                      <MessageSquare size={32} />
                      <span>{t('chats.loadMessagesError')}</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="messages-empty">
                      <MessageSquare size={32} />
                      <span>{t('chats.noMessagesInChat')}</span>
                    </div>
                  ) : (
                    messages.map(msg => {
                      const isMe = msg.direction === 'outgoing';
                      const formattedTime = formatTime(
                        msg.timestamp || Math.floor(new Date(msg.createdAt).getTime() / 1000),
                      );

                      const isMediaMessage = msg.type !== 'text';
                      const mediaInfo = msg.metadata?.media;

                      const renderMedia = () => {
                        if (msg.type === 'revoked') return null;
                        // location/call have no downloadable media payload — render them before the
                        // mediaInfo gate. The raw body (a base64 thumbnail / empty token) is suppressed below.
                        if (msg.type === 'location') {
                          // WhatsApp location messages carry a base64 JPEG map-preview thumbnail in `body`.
                          const thumb = msg.body && msg.body.length > 100 ? `data:image/jpeg;base64,${msg.body}` : '';
                          return (
                            <div className="message-location">
                              {thumb && (
                                <img
                                  src={thumb}
                                  alt=""
                                  style={{ maxWidth: 220, borderRadius: 8, display: 'block', marginBottom: 4 }}
                                />
                              )}
                              <span className="message-media-omitted">📍 {t('chats.media.location')}</span>
                            </div>
                          );
                        }
                        if (msg.type === 'call') {
                          const call = msg.metadata?.call;
                          const callKey = call?.video
                            ? call.missed
                              ? 'callVideoMissed'
                              : 'callVideo'
                            : call?.missed
                              ? 'callMissed'
                              : 'call';
                          return (
                            <div className="message-media-omitted">
                              {`${call?.video ? '📹' : '📞'} ${t(`chats.media.${callKey}`)}`}
                            </div>
                          );
                        }
                        if (!mediaInfo) return null;
                        if (mediaInfo.omitted) {
                          return <div className="message-media-omitted">📎 {t('chats.media.omitted')}</div>;
                        }
                        const mediaSrc = getMediaSrc(mediaInfo);
                        if (!mediaSrc) return null;

                        switch (msg.type) {
                          case 'image':
                          case 'sticker':
                            return (
                              <div className="message-media-image">
                                <img
                                  src={mediaSrc}
                                  alt={mediaInfo.filename || t('chats.media.image')}
                                  className="chat-image-media"
                                  onClick={() => {
                                    const idx = imageMedia.findIndex(x => x.id === msg.id);
                                    if (idx >= 0) setLightboxIndex(idx);
                                  }}
                                />
                              </div>
                            );
                          case 'video':
                            return (
                              <div className="message-media-video">
                                <video src={mediaSrc} controls className="chat-video-media" />
                              </div>
                            );
                          case 'audio':
                          case 'voice':
                            return (
                              <div className="message-media-audio">
                                <audio src={mediaSrc} controls className="chat-audio-media" />
                              </div>
                            );
                          case 'document':
                          default:
                            return (
                              <div className="message-media-document">
                                <a
                                  href={mediaSrc}
                                  download={mediaInfo.filename || 'document'}
                                  className="chat-document-media"
                                >
                                  📎 {mediaInfo.filename || t('chats.downloadDocument')}
                                </a>
                              </div>
                            );
                        }
                      };

                      const reactions = msg.metadata?.reactions || {};
                      const hasReactions = Object.keys(reactions).length > 0;
                      const isRevoked = msg.type === 'revoked';
                      const isMasked = msg.type === 'masked';

                      return (
                        <div
                          key={msg.id}
                          className={`message-bubble-wrapper ${isMe ? 'outgoing' : 'incoming'}`}
                        >
                          <div className="message-bubble-container">
                            <div
                              className={`message-bubble ${isMe ? 'outgoing' : 'incoming'} ${msg.status} ${
                                isMediaMessage ? 'media-type' : ''
                              } ${isRevoked ? 'revoked-type' : ''}`}
                            >
                              {/* Quoted message display */}
                              {msg.metadata?.quotedMessage && (
                                <div className="message-quote-box">
                                  <MessageBody
                                    text={msg.metadata.quotedMessage.body}
                                    className="quote-body"
                                  />
                                </div>
                              )}

                              {renderMedia()}

                              {isRevoked ? (
                                <div className="message-text">{t('chats.messageDeleted')}</div>
                              ) : isMasked ? (
                                <div className="message-text message-masked">{t('chats.messageMasked')}</div>
                              ) : (
                                msg.body &&
                                (!mediaInfo || msg.body !== mediaInfo.filename) &&
                                msg.type !== 'location' &&
                                msg.type !== 'call' && (
                                  <MessageBody text={msg.body} className="message-text" />
                                )
                              )}

                              <div className="message-meta">
                                <span className="message-time">{formattedTime}</span>
                                {isMe && (
                                  <span className={`message-status-icon ${msg.status}`}>
                                    {msg.status === 'pending' && '🕒'}
                                    {msg.status === 'sent' && '✓'}
                                    {msg.status === 'delivered' && '✓✓'}
                                    {msg.status === 'read' && '✓✓'}
                                    {msg.status === 'failed' && '⚠️'}
                                  </span>
                                )}
                              </div>

                              {/* Reactions display */}
                              {hasReactions && (
                                <div className="message-reactions-badge">
                                  {Object.values(reactions)
                                    .slice(0, 3)
                                    .map((emoji, idx) => (
                                      <span key={idx} className="reaction-emoji-span">
                                        {emoji}
                                      </span>
                                    ))}
                                  {Object.keys(reactions).length > 1 && (
                                    <span className="reactions-count-span">
                                      {Object.keys(reactions).length}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Message actions menu (hover) */}
                            {!isRevoked && (
                              <div className="message-actions-menu">
                                <button
                                  type="button"
                                  className="action-btn"
                                  onClick={() => setReplyingTo(msg)}
                                  title={t('chats.actions.reply')}
                                >
                                  <CornerUpLeft size={14} />
                                </button>

                                <div className="reaction-trigger-wrapper">
                                  <button
                                    type="button"
                                    className="action-btn reaction-btn"
                                    title={t('chats.actions.react')}
                                  >
                                    <Smile size={14} />
                                  </button>
                                  <div className="reaction-quick-popover">
                                    {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => handleReactMessage(msg, emoji)}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {isMe && msg.status !== 'pending' && (
                                  <button
                                    type="button"
                                    className="action-btn delete-btn"
                                    onClick={() => setConfirmMsg(msg)}
                                    title={t('chats.actions.delete')}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Attachment preview banner */}
                {attachment && (
                  <div className="attachment-preview-banner">
                    {previewUrl ? (
                      <img src={previewUrl} alt={attachment.filename} className="preview-thumbnail" />
                    ) : (
                      <div className="preview-file-icon">📎</div>
                    )}
                    <div className="preview-file-info">
                      <span className="preview-filename">{attachment.filename}</span>
                      <span className="preview-filesize">({(attachment.file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button className="btn-remove-attachment" onClick={handleRemoveAttachment}>
                      <X size={18} />
                    </button>
                  </div>
                )}

                {/* Popular emojis panel */}
                {showEmojiPicker && (
                  <div className="chats-emoji-picker">
                    <div className="emoji-grid">
                      {popularEmojis.map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          className="emoji-btn"
                          onClick={() => handleEmojiClick(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Replying preview banner */}
                {replyingTo && (
                  <div className="replying-preview-banner">
                    <div className="replying-preview-content">
                      <div className="replying-to-title">
                        {t('chats.replyingTo', {
                          name:
                            replyingTo.direction === 'outgoing'
                              ? t('chats.you')
                              : activeChat.name || activeChat.id.split('@')[0],
                        })}
                      </div>
                      <div className="replying-to-body">
                        {replyingTo.type !== 'text' ? `[${replyingTo.type}]` : replyingTo.body}
                      </div>
                    </div>
                    <button className="btn-close-reply" onClick={() => setReplyingTo(null)}>
                      <X size={18} />
                    </button>
                  </div>
                )}

                {/* Message input bar */}
                <footer className="room-input-footer">
                  <form onSubmit={handleSend} className="input-form">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />

                    <button
                      type="button"
                      onClick={triggerFileSelect}
                      disabled={!canWrite || sending}
                      className="btn-input-accessory"
                      title={t('chats.attachTitle')}
                    >
                      <Paperclip size={20} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      disabled={!canWrite || sending}
                      className={`btn-input-accessory ${showEmojiPicker ? 'active' : ''}`}
                      title={t('chats.emojiTitle')}
                    >
                      <Smile size={20} />
                    </button>

                    <input
                      type="text"
                      placeholder={
                        canWrite
                          ? attachment
                            ? t('chats.captionPlaceholder')
                            : t('chats.messagePlaceholder')
                          : t('chats.noPermission')
                      }
                      value={messageInput}
                      onChange={e => setMessageInput(e.target.value)}
                      disabled={!canWrite || sending}
                      className="message-text-input"
                    />
                    <button
                      type="submit"
                      disabled={!canWrite || (!messageInput.trim() && !attachment) || sending}
                      className="btn-send-message"
                      aria-label={t('chats.send')}
                    >
                      {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    </button>
                  </form>
                </footer>
              </div>
            ) : (
              <div className="chats-room-placeholder">
                <MessageSquare size={80} className="placeholder-icon" />
                <h2>{t('chats.placeholderTitle')}</h2>
                <p>{t('chats.placeholderDesc')}</p>
              </div>
            )}
          </main>
        </div>
      )}

      <MediaLightbox
        items={imageMedia}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </div>
  );
}
