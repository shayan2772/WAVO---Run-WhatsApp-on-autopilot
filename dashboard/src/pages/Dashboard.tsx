import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import { lazyWithRetry as lazy } from '../utils/lazyWithRetry';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Smartphone,
  Send,
  Users,
  Megaphone,
  ChevronRight,
  BellRing,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  useSessionsQuery,
  useSessionStatsQuery,
  useStopSessionMutation,
  useStatsOverviewQuery,
} from '../hooks/queries';
import { useAttention } from '../hooks/useAttention';
import { campaignApi, audienceApi, type Campaign, type ContactList } from '../services/api';
import { formatPhoneDisplay } from '../utils/phone';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Skeleton } from '../components/Skeleton';
import './Dashboard.css';

// recharts is heavy (~150kB gzip); load the analytics section on demand so it never bloats the
// main/login bundle and only ships when the dashboard actually renders.
const DashboardCharts = lazy(() => import('../components/DashboardCharts').then(m => ({ default: m.DashboardCharts })));

const ACTIVE_CAMPAIGN = ['running', 'scheduled', 'paused'];

export function Dashboard() {
  const { t } = useTranslation();
  useDocumentTitle(t('dashboard.title'));
  const navigate = useNavigate();
  const { data: sessions = [], isLoading: loadingSessions, error: sessionsError } = useSessionsQuery();
  const { data: stats } = useSessionStatsQuery();
  const { data: overview } = useStatsOverviewQuery();
  const stopMutation = useStopSessionMutation();
  const { alerts } = useAttention();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  useEffect(() => {
    campaignApi.list().then(setCampaigns).catch(() => {});
    audienceApi.list().then(setLists).catch(() => {});
  }, []);

  const messagesToday = overview ? overview.messages.today.sent + overview.messages.today.received : null;
  const totalContacts = lists.reduce((n, l) => n + (l.contactCount || 0), 0);
  const activeCampaigns = campaigns.filter(c => ACTIVE_CAMPAIGN.includes(c.status));
  const loading = loadingSessions;
  const error =
    sessionsError instanceof Error ? sessionsError.message : sessionsError ? t('dashboard.loadError') : null;

  const handleDisconnect = async (id: string) => {
    try {
      await stopMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  const kpis = [
    {
      label: 'Connected numbers',
      value: stats?.ready ?? 0,
      sub: stats ? `${stats.total} total` : '',
      icon: Smartphone,
      accent: 'var(--primary)',
      to: '/sessions',
    },
    {
      label: 'Messages today',
      value: messagesToday,
      sub: 'sent + received',
      icon: Send,
      accent: '#3b82f6',
      to: '/chats',
    },
    {
      label: 'Contacts',
      value: totalContacts,
      sub: `${lists.length} audience${lists.length === 1 ? '' : 's'}`,
      icon: Users,
      accent: '#8b5cf6',
      to: '/audiences',
    },
    {
      label: 'Active campaigns',
      value: activeCampaigns.length,
      sub: `${campaigns.length} total`,
      icon: Megaphone,
      accent: '#f59e0b',
      to: '/campaigns',
    },
  ];

  const formatLastActive = (date?: string) => {
    if (!date) return t('common.never');
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60000) return t('common.justNow');
    if (diff < 3600000) return t('common.minAgo', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('common.hoursAgo', { count: Math.floor(diff / 3600000) });
    return new Date(date).toLocaleDateString();
  };
  const formatStatus = (status: string) => t(`sessionStatus.${status}`, { defaultValue: status });

  if (error) {
    return (
      <div className="dashboard" style={{ padding: '2rem' }}>
        <div className="error-banner">
          <span className="error-banner-text">{t('dashboard.errorPrefix', { message: error })}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        badge={
          <span className={`status-badge ${stats && stats.ready > 0 ? 'connected' : 'disconnected'}`}>
            {stats && stats.ready > 0 && <span className="live-dot" style={{ marginRight: 6 }} />}
            {stats && stats.ready > 0 ? t('common.connected') : t('common.disconnected')}
          </span>
        }
      />

      {/* Human-in-the-loop: chats waiting on a person. Highest-priority thing on the page. */}
      {alerts.length > 0 && (
        <div className="attn-banner" role="alert">
          <div className="attn-banner__icon">
            <BellRing size={20} />
          </div>
          <div className="attn-banner__text">
            <strong>
              {alerts.length} {alerts.length === 1 ? 'chat needs' : 'chats need'} a human
            </strong>
            <span>{alerts.map(a => a.contactName).slice(0, 3).join(', ')}{alerts.length > 3 ? '…' : ''}</span>
          </div>
          <div className="attn-banner__chats">
            {alerts.slice(0, 3).map(a => (
              <button
                key={a.key}
                className="attn-banner__chat"
                onClick={() => navigate(`/chats?session=${encodeURIComponent(a.sessionId)}&chat=${encodeURIComponent(a.chatId)}`)}
              >
                <MessageSquare size={14} /> {a.contactName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="stats-grid">
        {kpis.map(({ label, value, sub, icon: Icon, accent, to }) => (
          <button
            key={label}
            className="kpi-card"
            onClick={() => navigate(to)}
            style={{ '--kpi-accent': accent } as CSSProperties}
          >
            <div className="kpi-card__head">
              <span className="kpi-card__icon">
                <Icon size={18} />
              </span>
              <ChevronRight className="kpi-card__go" size={16} />
            </div>
            <div className="kpi-card__value">
              {value === null ? <Skeleton width={64} height={30} /> : Number(value).toLocaleString()}
            </div>
            <div className="kpi-card__label">{label}</div>
            {sub && <div className="kpi-card__sub">{sub}</div>}
          </button>
        ))}
      </div>

      {/* Live campaign progress — only the ones in flight. */}
      {activeCampaigns.length > 0 && (
        <section className="dash-section">
          <div className="dash-section__head">
            <h2>Campaigns in progress</h2>
            <button className="dash-link" onClick={() => navigate('/campaigns')}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="camp-progress-grid">
            {activeCampaigns.slice(0, 4).map(c => {
              const pct = c.totalRecipients ? Math.round((c.sentCount / c.totalRecipients) * 100) : 0;
              return (
                <button key={c.id} className="camp-progress-card" onClick={() => navigate('/campaigns')}>
                  <div className="camp-progress-card__top">
                    <span className="camp-progress-card__name">{c.name}</span>
                    <span className={`pill pill--${c.status === 'running' ? 'ok' : c.status === 'paused' ? 'warn' : 'muted'}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="camp-progress-card__bar">
                    <div className="camp-progress-card__fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="camp-progress-card__meta">
                    {c.sentCount.toLocaleString()}/{c.totalRecipients.toLocaleString()} sent
                    {c.failedCount ? ` · ${c.failedCount} failed` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <Suspense fallback={null}>
        <DashboardCharts />
      </Suspense>

      <section className="sessions-section">
        <div className="section-header">
          <h2>{t('dashboard.sessionsOverview')}</h2>
          <span className="section-subtitle">
            {t('dashboard.showingSessions', { shown: sessions.length, total: stats?.total ?? 0 })}
          </span>
        </div>

        <div className="sessions-table">
          <div className="table-header">
            <span>{t('dashboard.columns.sessionId')}</span>
            <span>{t('dashboard.columns.phone')}</span>
            <span>{t('dashboard.columns.status')}</span>
            <span>{t('dashboard.columns.lastActive')}</span>
            <span>{t('dashboard.columns.actions')}</span>
          </div>
          {loading ? (
            [0, 1, 2].map(i => (
              <div key={i} className="table-row">
                <Skeleton width={120} />
                <Skeleton width={110} />
                <Skeleton width={70} height={22} radius={999} />
                <Skeleton width={80} />
                <Skeleton width={120} height={28} />
              </div>
            ))
          ) : sessions.length === 0 ? (
            <div className="table-row dash-empty-row">
              <span>{t('dashboard.noSessions')}</span>
              <Button variant="primary" size="sm" icon={<Smartphone size={14} />} onClick={() => navigate('/sessions')}>
                Connect a number
              </Button>
            </div>
          ) : (
            sessions.map(session => (
              <div key={session.id} className="table-row">
                <div className="session-info-cell">
                  <span className="session-id">{session.id.substring(0, 12)}</span>
                  <span className="session-name" title={session.name}>
                    {session.name}
                  </span>
                </div>
                <span className="phone">{formatPhoneDisplay(session.phone)}</span>
                <span className={`status-pill ${session.status}`}>{formatStatus(session.status)}</span>
                <span className="last-active">{formatLastActive(session.lastActive)}</span>
                <div className="actions">
                  <button className="btn-sm" onClick={() => navigate('/chats')}>
                    Open inbox
                  </button>
                  {['ready', 'initializing', 'connecting', 'qr_ready'].includes(session.status) && (
                    <button className="btn-sm danger" onClick={() => handleDisconnect(session.id)}>
                      {t('dashboard.disconnect')}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
