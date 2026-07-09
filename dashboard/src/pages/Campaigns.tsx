import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Pause, X, Loader2, Megaphone, Users, Send, CheckCircle2, Radio, Upload, Paperclip } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { VariableInserter } from '../components/VariableInserter';
import { useToast } from '../components/Toast';
import { campaignApi, audienceApi, sessionApi, type Campaign, type ContactList, type Session } from '../services/api';
import { formatPhoneDisplay } from '../utils/phone';
import './Marketing.css';

const STATUS_META: Record<string, { color: string; label: string }> = {
  running: { color: 'green', label: 'Running' },
  scheduled: { color: 'blue', label: 'Scheduled' },
  completed: { color: 'blue', label: 'Completed' },
  paused: { color: 'amber', label: 'Paused' },
  draft: { color: 'gray', label: 'Draft' },
  cancelled: { color: 'red', label: 'Cancelled' },
  failed: { color: 'red', label: 'Failed' },
};

// Circular progress indicator (premium look vs a flat bar).
function ProgressRing({ pct, size = 60, stroke = 6 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, pct)) / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="camp-ring">
      <circle cx={size / 2} cy={size / 2} r={r} className="camp-ring__track" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="camp-ring__fill"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" className="camp-ring__label" dominantBaseline="central" textAnchor="middle">
        {pct}%
      </text>
    </svg>
  );
}

export function Campaigns() {
  const navigate = useNavigate();
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // form state
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [listId, setListId] = useState('');
  const [sessionId, setSessionId] = useState('');
  // Attachment: 'text' = no media; otherwise an uploaded file (base64) or a media URL, sent as caption.
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video' | 'document'>('text');
  const [mediaUrl, setMediaUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [mediaBase64, setMediaBase64] = useState('');
  const [mediaMimetype, setMediaMimetype] = useState('');
  const campFileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  // id:action currently in flight → drives the per-row spinner so no action ever feels stuck.
  const [busy, setBusy] = useState<string | null>(null);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const load = () => {
    setLoading(true);
    campaignApi
      .list()
      .then(setCampaigns)
      .catch(() => showErrorToast('Failed to load campaigns'))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    audienceApi.list().then(setLists).catch(() => {});
    sessionApi.list().then(s => setSessions(s.filter(x => x.status === 'ready'))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh running campaigns' progress periodically.
  useEffect(() => {
    const t = setInterval(() => {
      if (campaigns.some(c => c.status === 'running' || c.status === 'scheduled')) load();
    }, 5000);
    return () => clearInterval(t);
  }, [campaigns]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setMediaBase64(String(reader.result).split(',')[1] ?? '');
      setMediaMimetype(file.type);
      setFilename(file.name);
      setMediaUrl('');
      setMediaType(file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document');
    };
    reader.readAsDataURL(file);
    if (campFileRef.current) campFileRef.current.value = '';
  };
  const clearFile = () => {
    setMediaBase64('');
    setMediaMimetype('');
    setFilename('');
  };

  const create = async () => {
    const hasMedia = mediaType !== 'text';
    const hasFile = !!mediaBase64;
    if (!name.trim() || !listId || !sessionId || (!hasMedia && !text.trim()) || (hasMedia && !hasFile && !mediaUrl.trim())) {
      showErrorToast(hasMedia ? 'Attach a file or media URL (plus name, audience, and a number)' : 'Fill in name, message, audience, and a number');
      return;
    }
    setSubmitting(true);
    try {
      const messageTemplate = hasMedia
        ? {
            type: mediaType,
            ...(hasFile ? { mediaBase64, mediaMimetype } : { mediaUrl: mediaUrl.trim() }),
            caption: text.trim() || undefined,
            filename: filename.trim() || undefined,
          }
        : { type: 'text', text: text.trim() };
      await campaignApi.create({
        name: name.trim(),
        messageTemplate,
        targetListIds: [listId],
        sessionIds: [sessionId],
      });
      setShowForm(false);
      setName('');
      setText('');
      setListId('');
      setSessionId('');
      setMediaType('text');
      setMediaUrl('');
      setFilename('');
      setMediaBase64('');
      setMediaMimetype('');
      load();
      showSuccessToast('Campaign created (draft) — press Start to send');
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Could not create campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (id: string, action: string, fn: (id: string) => Promise<unknown>, ok: string) => {
    setBusy(`${id}:${action}`);
    try {
      await fn(id);
      load();
      showSuccessToast(ok);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Campaigns"
        subtitle="Bulk WhatsApp campaigns with safe, paced delivery"
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowForm(v => !v)}>
            New campaign
          </Button>
        }
      />

      {showForm && (
        <div className="mkt-form">
          <input placeholder="Campaign name" value={name} onChange={e => setName(e.target.value)} />

          {/* Attachment */}
          <div className="mkt-form__row camp-attach">
            <select value={mediaType} onChange={e => setMediaType(e.target.value as typeof mediaType)}>
              <option value="text">No attachment</option>
              <option value="image">🖼️ Image</option>
              <option value="video">🎬 Video</option>
              <option value="document">📄 Document</option>
            </select>
            {mediaType !== 'text' && (
              <>
                <Button type="button" icon={<Upload size={15} />} onClick={() => campFileRef.current?.click()}>
                  Upload file
                </Button>
                <input
                  ref={campFileRef}
                  type="file"
                  hidden
                  accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.zip"
                  onChange={pickFile}
                />
                {mediaBase64 ? (
                  <span className="camp-file-chip">
                    <Paperclip size={13} /> {filename}
                    <button type="button" onClick={clearFile} title="Remove"><X size={13} /></button>
                  </span>
                ) : (
                  <input
                    placeholder="…or paste a media URL (https://…)"
                    value={mediaUrl}
                    onChange={e => setMediaUrl(e.target.value)}
                    style={{ flex: 2 }}
                  />
                )}
              </>
            )}
          </div>

          <VariableInserter targetRef={msgRef} value={text} onChange={setText} />
          <textarea
            ref={msgRef}
            placeholder={mediaType === 'text'
              ? 'Message — click a variable above or type {{name}} to personalize'
              : 'Caption (optional) — sent with the attachment. Use {{name}}/{{phone}}.'}
            rows={3}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="mkt-form__row">
            <select value={listId} onChange={e => setListId(e.target.value)}>
              <option value="">Select audience…</option>
              {lists.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.contactCount})</option>
              ))}
            </select>
            <select value={sessionId} onChange={e => setSessionId(e.target.value)}>
              <option value="">Select number…</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({formatPhoneDisplay(s.phone)})</option>
              ))}
            </select>
            <Button variant="primary" loading={submitting} onClick={create}>
              Create
            </Button>
          </div>
          {lists.length === 0 && (
            <p className="mkt-hint">
              No audiences yet.{' '}
              <button className="mkt-inline-link" onClick={() => navigate('/audiences')}>
                <Users size={13} /> Create an audience
              </button>{' '}
              to target.
            </p>
          )}
          {sessions.length === 0 && (
            <p className="mkt-hint">
              No connected numbers —{' '}
              <button className="mkt-inline-link" onClick={() => navigate('/sessions')}>
                connect one
              </button>{' '}
              first.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="mkt-loading"><Loader2 className="animate-spin" size={28} /></div>
      ) : campaigns.length === 0 ? (
        <div className="mkt-empty-state">
          <Megaphone size={34} />
          <p>No campaigns yet. Create one to start sending safely-paced bulk messages.</p>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowForm(true)}>
            New campaign
          </Button>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="camp-stats">
            {[
              { label: 'Campaigns', value: campaigns.length, icon: Megaphone, accent: 'var(--primary)' },
              {
                label: 'Active',
                value: campaigns.filter(c => ['running', 'scheduled', 'paused'].includes(c.status)).length,
                icon: Radio,
                accent: '#f59e0b',
              },
              {
                label: 'Completed',
                value: campaigns.filter(c => c.status === 'completed').length,
                icon: CheckCircle2,
                accent: '#3b82f6',
              },
              {
                label: 'Messages sent',
                value: campaigns.reduce((n, c) => n + (c.sentCount || 0), 0),
                icon: Send,
                accent: '#8b5cf6',
              },
            ].map(s => (
              <div key={s.label} className="camp-stat" style={{ '--kpi-accent': s.accent } as CSSProperties}>
                <span className="camp-stat__icon"><s.icon size={18} /></span>
                <div>
                  <div className="camp-stat__value">{s.value.toLocaleString()}</div>
                  <div className="camp-stat__label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Campaign cards */}
          <div className="camp-grid">
            {campaigns.map(c => {
              const pct = c.totalRecipients ? Math.round((c.sentCount / c.totalRecipients) * 100) : 0;
              const meta = STATUS_META[c.status] || { color: 'gray', label: c.status };
              const pending = Math.max(0, (c.totalRecipients || 0) - (c.sentCount || 0) - (c.failedCount || 0));
              const b = (a: string) => busy === `${c.id}:${a}`;
              return (
                <div
                  key={c.id}
                  className={`camp-card status-${c.status} camp-card--link`}
                  onClick={() => navigate(`/campaigns/${c.id}`)}
                  role="button"
                  title="View campaign details"
                >
                  <div className="camp-card__head">
                    <span className="camp-card__icon"><Megaphone size={18} /></span>
                    <div className="camp-card__titles">
                      <h3 title={c.name}>{c.name}</h3>
                      <span className="camp-card__sub">{(c.totalRecipients || 0).toLocaleString()} recipients</span>
                    </div>
                    <span className={`mkt-tag mkt-tag--${meta.color}`}>
                      {c.status === 'running' && <span className="live-dot" style={{ marginRight: 5 }} />}
                      {meta.label}
                    </span>
                  </div>

                  <div className="camp-card__body">
                    <ProgressRing pct={pct} />
                    <div className="camp-card__metrics">
                      <div className="camp-metric"><span className="camp-metric__dot ok" /> {c.sentCount.toLocaleString()} sent</div>
                      <div className="camp-metric"><span className="camp-metric__dot pending" /> {pending.toLocaleString()} pending</div>
                      <div className="camp-metric"><span className="camp-metric__dot fail" /> {(c.failedCount || 0).toLocaleString()} failed</div>
                    </div>
                  </div>

                  <div className="camp-card__actions" onClick={e => e.stopPropagation()}>
                    {(c.status === 'draft' || c.status === 'scheduled') && (
                      <Button variant="primary" size="sm" loading={b('start')} disabled={!!busy && !b('start')} icon={<Play size={15} />} onClick={() => act(c.id, 'start', campaignApi.start, 'Started')}>Start</Button>
                    )}
                    {c.status === 'running' && (
                      <Button size="sm" loading={b('pause')} disabled={!!busy && !b('pause')} icon={<Pause size={15} />} onClick={() => act(c.id, 'pause', campaignApi.pause, 'Paused')}>Pause</Button>
                    )}
                    {c.status === 'paused' && (
                      <Button variant="primary" size="sm" loading={b('resume')} disabled={!!busy && !b('resume')} icon={<Play size={15} />} onClick={() => act(c.id, 'resume', campaignApi.resume, 'Resumed')}>Resume</Button>
                    )}
                    {['draft', 'scheduled', 'running', 'paused'].includes(c.status) && (
                      <Button variant="danger" size="sm" loading={b('cancel')} disabled={!!busy && !b('cancel')} icon={<X size={15} />} onClick={() => act(c.id, 'cancel', campaignApi.cancel, 'Cancelled')}>Cancel</Button>
                    )}
                    {['completed', 'cancelled', 'failed'].includes(c.status) && (
                      <span className="camp-card__done">Finished</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
