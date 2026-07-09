import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Paperclip, CheckCircle2, XCircle, Clock, Ban } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { campaignApi, type Campaign, type CampaignRecipientRow } from '../services/api';
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

const R_STATUS: Record<string, { color: string; label: string }> = {
  sent: { color: 'green', label: 'Sent' },
  failed: { color: 'red', label: 'Failed' },
  pending: { color: 'gray', label: 'Pending' },
  sending: { color: 'amber', label: 'Sending' },
  skipped: { color: 'amber', label: 'Skipped (opted out)' },
};

// Mirror the backend renderTemplate so we can show exactly what each contact received.
function renderMsg(text: string, r: CampaignRecipientRow): string {
  const vars: Record<string, string> = { phone: r.phone };
  for (const [k, v] of Object.entries(r.attributes ?? {})) vars[k] = v == null ? '' : String(v);
  return text
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m))
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

const FILTERS = ['all', 'sent', 'failed', 'pending', 'skipped'] as const;
type Filter = (typeof FILTERS)[number];

export function CampaignDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { error: showErrorToast } = useToast();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [rows, setRows] = useState<CampaignRecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const load = () => {
    Promise.all([campaignApi.get(id), campaignApi.recipients(id)])
      .then(([c, r]) => {
        setCampaign(c);
        setRows(r);
      })
      .catch(() => showErrorToast('Failed to load campaign'))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // Live-refresh while it's still sending.
    const t = setInterval(() => {
      if (campaign && (campaign.status === 'running' || campaign.status === 'scheduled')) load();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, campaign?.status]);

  const counts = useMemo(() => {
    const c = { sent: 0, failed: 0, pending: 0, skipped: 0, sending: 0 };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'pending') return rows.filter(r => r.status === 'pending' || r.status === 'sending');
    return rows.filter(r => r.status === filter);
  }, [rows, filter]);

  if (loading) {
    return (
      <div className="page">
        <div className="mkt-loading"><Loader2 className="animate-spin" size={28} /></div>
      </div>
    );
  }
  if (!campaign) {
    return (
      <div className="page">
        <button className="mkt-back" onClick={() => navigate('/campaigns')}><ArrowLeft size={16} /> Campaigns</button>
        <p className="mkt-empty">Campaign not found.</p>
      </div>
    );
  }

  const tpl = campaign.messageTemplate;
  const meta = STATUS_META[campaign.status] || { color: 'gray', label: campaign.status };
  const total = campaign.totalRecipients || rows.length;

  return (
    <div className="page">
      <button className="mkt-back" onClick={() => navigate('/campaigns')}><ArrowLeft size={16} /> All campaigns</button>
      <PageHeader
        title={campaign.name}
        subtitle={`${total.toLocaleString()} recipients · created ${new Date(campaign.createdAt).toLocaleString()}`}
        badge={<span className={`mkt-tag mkt-tag--${meta.color}`}>{meta.label}</span>}
      />

      {/* The message that was sent */}
      <div className="cd-message">
        <div className="cd-message__head">
          <span className={`mkt-tag mkt-tag--gray`}>{tpl.type}</span>
          {tpl.type !== 'text' &&
            (tpl.mediaUrl ? (
              <a className="cd-message__media" href={tpl.mediaUrl} target="_blank" rel="noreferrer">
                <Paperclip size={13} /> attachment
              </a>
            ) : tpl.mediaBase64 ? (
              <span className="cd-message__media"><Paperclip size={13} /> {tpl.filename || 'uploaded file'}</span>
            ) : null)}
        </div>
        <div className="cd-message__bubble">
          {tpl.type === 'text' ? tpl.text || <em>(empty)</em> : tpl.caption || <em>(no caption)</em>}
        </div>
        <p className="mkt-hint">Variables like <code>{'{{name}}'}</code> / <code>{'{{phone}}'}</code> are filled per contact — see each row below.</p>
      </div>

      {/* Summary */}
      <div className="cd-stats">
        {[
          { key: 'sent', label: 'Sent', value: counts.sent, icon: CheckCircle2, color: 'var(--primary)' },
          { key: 'failed', label: 'Failed', value: counts.failed, icon: XCircle, color: 'var(--error)' },
          { key: 'pending', label: 'Pending', value: counts.pending + counts.sending, icon: Clock, color: 'var(--text-muted)' },
          { key: 'skipped', label: 'Opted out', value: counts.skipped, icon: Ban, color: 'var(--warning)' },
        ].map(s => (
          <div key={s.key} className="cd-stat">
            <s.icon size={18} style={{ color: s.color }} />
            <div>
              <div className="cd-stat__value">{s.value.toLocaleString()}</div>
              <div className="cd-stat__label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="cd-tabs">
        {FILTERS.map(f => (
          <button key={f} className={`cd-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? `All (${rows.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Recipients */}
      <table className="mkt-table">
        <thead>
          <tr>
            <th>Contact</th>
            <th>Status</th>
            <th>Message sent</th>
            <th>Sent at</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => {
            const name = (r.attributes?.name as string) || '';
            const rs = R_STATUS[r.status] || { color: 'gray', label: r.status };
            return (
              <tr key={r.id}>
                <td>
                  <div className="cd-contact">
                    <span className="cd-contact__name">{name || formatPhoneDisplay(r.phone)}</span>
                    {name && <span className="cd-contact__phone">{formatPhoneDisplay(r.phone)}</span>}
                  </div>
                </td>
                <td>
                  <span className={`mkt-tag mkt-tag--${rs.color}`}>{rs.label}</span>
                  {r.status === 'failed' && r.error && <div className="cd-error" title={r.error}>{r.error}</div>}
                </td>
                <td className="cd-msg-cell">{tpl.type === 'text' ? renderMsg(tpl.text || '', r) : `[${tpl.type}]${tpl.caption ? ' ' + renderMsg(tpl.caption, r) : ''}`}</td>
                <td className="mono-num">{r.sentAt ? new Date(r.sentAt).toLocaleString() : '—'}</td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr><td colSpan={4} className="mkt-empty">No recipients in this view.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
