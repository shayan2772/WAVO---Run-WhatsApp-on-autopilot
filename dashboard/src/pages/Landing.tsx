import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Waves, ArrowRight, Rocket, Play, CheckCircle2, Webhook, Layers,
  ShieldCheck, LayoutDashboard, Bot, Sparkles, Gauge, KeyRound,
  BookOpen, GitBranch, Terminal, QrCode, Infinity as InfinityIcon, Check,
  Database, HardDrive, Zap, Server, FileCode2, Container, Workflow, Star, Shield,
  MessageSquare, LineChart, Megaphone, Brain,
} from 'lucide-react';
import { getAccessToken } from '../services/api';
import './Landing.css';

gsap.registerPlugin(ScrollTrigger);

/**
 * Wavo public marketing landing page — served at the app root (`/`).
 * The dashboard lives under `/app`; a full-page navigation crosses between the two
 * documents so this page's styles/animations never bleed into the app shell.
 *
 * CTA is auth-aware: a live session token (sessionStorage) swaps "Log in" for
 * "Go to Dashboard". Both routes into `/app`, which itself shows the login form
 * when there is no session and the dashboard when there is.
 */
export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const authed = !!getAccessToken();

  const enterApp = () => window.location.assign('/app');

  // Load the marketing typefaces only while the landing is mounted (CSP allows Google Fonts).
  useEffect(() => {
    const id = 'lp-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      root.current?.classList.add('is-static');
      const typed = root.current?.querySelector<HTMLElement>('#lp-typed');
      if (typed) typed.textContent = 'Hello from Wavo!';
      return;
    }

    const ctx = gsap.context((self) => {
      const q = self.selector!;

      // Scroll progress bar
      gsap.to('.lp-progress', {
        scaleX: 1, ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom bottom', scrub: 0.3 },
      });

      // Nav solidify on scroll
      ScrollTrigger.create({
        start: 'top -80',
        onUpdate: (st) => {
          const bar = root.current?.querySelector('.lp-nav-inner');
          if (bar) bar.classList.toggle('is-scrolled', st.scroll() > 80);
        },
      });

      // Hero intro
      gsap.fromTo(q('.lp-hero-el'),
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.9, stagger: 0.12, ease: 'power3.out' });

      // Typewriter in terminal
      const typed = q('#lp-typed')[0] as HTMLElement | undefined;
      if (typed) {
        const text = 'Hello from Wavo!';
        const obj = { i: 0 };
        gsap.to(obj, {
          i: text.length, duration: 1.6, delay: 1, ease: 'none',
          onUpdate: () => { typed.textContent = text.slice(0, Math.round(obj.i)); },
        });
      }

      // Floating chips
      gsap.to(q('.lp-chip'), { y: -12, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.6 });

      // Generic reveals (skip hero + batched grids)
      const batched = '.lp-feature, .lp-stat, .lp-arch';
      (q('.lp-reveal') as HTMLElement[]).forEach((el) => {
        if (el.classList.contains('lp-hero-el') || el.matches(batched)) return;
        gsap.fromTo(el, { y: 40, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.8, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        });
      });

      // Staggered card grids
      ['.lp-feature', '.lp-stat', '.lp-arch'].forEach((sel) => {
        gsap.set(q(sel), { opacity: 0, y: 40 });
        ScrollTrigger.batch(q(sel), {
          start: 'top 85%',
          onEnter: (b) => gsap.to(b, { opacity: 1, y: 0, stagger: 0.12, duration: 0.7, ease: 'power2.out', overwrite: true }),
        });
      });

      // Count-up numbers
      (q('.lp-counter') as HTMLElement[]).forEach((el) => {
        const end = parseFloat(el.dataset.to || '0');
        const obj = { v: 0 };
        ScrollTrigger.create({
          trigger: el, start: 'top 88%', once: true,
          onEnter: () => gsap.to(obj, {
            v: end, duration: 1.8, ease: 'power2.out',
            onUpdate: () => { el.textContent = Math.round(obj.v).toLocaleString(); },
          }),
        });
      });

      // Parallax layers
      (q('[data-parallax]') as HTMLElement[]).forEach((el) => {
        const depth = parseFloat(el.dataset.parallax || '0');
        gsap.to(el, {
          yPercent: depth * 100, ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });

      // Pinned horizontal "how it works"
      const track = q('.lp-htrack')[0] as HTMLElement | undefined;
      const pin = q('.lp-hpin')[0] as HTMLElement | undefined;
      if (track && pin) {
        const len = () => track.scrollWidth - window.innerWidth;
        const hAnim = gsap.to(track, {
          x: () => -len(), ease: 'none',
          scrollTrigger: {
            trigger: pin, start: 'top top', end: () => '+=' + len(),
            pin: true, scrub: 1, invalidateOnRefresh: true,
            onUpdate: (st) => gsap.set('.lp-hprog', { scaleX: st.progress }),
          },
        });
        (q('.lp-hpanel') as HTMLElement[]).forEach((panel) => {
          gsap.fromTo(panel, { scale: 0.94 }, {
            scale: 1, ease: 'none',
            scrollTrigger: { trigger: panel, containerAnimation: hAnim, start: 'left center', end: 'center center', scrub: true },
          });
        });
      }

      ScrollTrigger.refresh();
    }, root);

    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener('load', onLoad);
    return () => { window.removeEventListener('load', onLoad); ctx.revert(); };
  }, []);

  const navTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    root.current?.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="lp" ref={root} id="lp-top">
      <div className="lp-progress" />

      {/* NAV */}
      <header className="lp-nav">
        <div className="lp-wrap">
          <div className="lp-nav-inner lp-glass">
            <a className="lp-brand" href="#lp-top" onClick={navTo('#lp-top')} aria-label="Wavo home">
              <span className="lp-brand-chip"><Waves size={19} strokeWidth={2.4} /></span>
              <span className="lp-brand-word">Wavo</span>
            </a>
            <nav className="lp-nav-links" aria-label="Primary">
              <a href="#features" onClick={navTo('#features')}>Features</a>
              <a href="#how" onClick={navTo('#how')}>How it works</a>
              <a href="#architecture" onClick={navTo('#architecture')}>Architecture</a>
              <a href="#mcp" onClick={navTo('#mcp')}>AI / MCP</a>
              <a href="#pricing" onClick={navTo('#pricing')}>Pricing</a>
            </nav>
            <div className="lp-nav-cta">
              {authed ? (
                <button className="lp-btn lp-btn-primary lp-btn-sm" onClick={enterApp}>
                  Dashboard <LayoutDashboard size={16} />
                </button>
              ) : (
                <button className="lp-btn lp-btn-primary lp-btn-sm" onClick={enterApp}>
                  Log in <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-aurora" />
        <div className="lp-grid" />
        <div className="lp-blob" data-parallax="0.25" style={{ top: '33%', left: '50%', transform: 'translateX(-50%)', width: 900, height: 900, background: 'rgba(18,140,126,0.10)' }} />
        <div className="lp-wrap">
          <div className="lp-hero-grid">
            <div>
              <div className="lp-badge lp-glass lp-hero-el lp-reveal">
                <span className="lp-ping"><span /><span /></span>
                WhatsApp marketing &amp; support, on autopilot
              </div>
              <h1 className="lp-h1 lp-hero-el lp-reveal">
                Run WhatsApp<br />
                <span className="lp-gradient-text">on autopilot.</span>
              </h1>
              <p className="lp-sub lp-hero-el lp-reveal">
                Wavo connects your numbers, sends campaigns safely with smart anti-ban pacing, and lets
                an AI agent answer replies from your own knowledge base — with one-tap human takeover
                whenever you want. Self-hosted, on infrastructure you fully control.
              </p>
              <div className="lp-hero-actions lp-hero-el lp-reveal">
                <button className="lp-btn lp-btn-primary" onClick={enterApp}>
                  <Rocket size={20} /> {authed ? 'Open dashboard' : 'Start your workspace'}
                </button>
                <a className="lp-btn lp-btn-ghost" href="#features" onClick={navTo('#features')}>
                  <Play size={16} /> See how it works
                </a>
              </div>
              <div className="lp-hero-tags lp-hero-el lp-reveal">
                <span><CheckCircle2 size={16} /> Anti-ban pacing</span>
                <span><CheckCircle2 size={16} /> AI + human takeover</span>
                <span><CheckCircle2 size={16} /> Self-hosted</span>
              </div>
            </div>

            <div className="lp-hero-el lp-reveal" data-parallax="-0.12">
              <div className="lp-terminal">
                <div className="lp-terminal-glow" />
                <div className="lp-card lp-glass">
                  <div className="lp-card-bar">
                    <span className="lp-dot" style={{ background: 'rgba(248,113,113,0.8)' }} />
                    <span className="lp-dot" style={{ background: 'rgba(250,204,21,0.8)' }} />
                    <span className="lp-dot" style={{ background: 'rgba(37,211,102,0.8)' }} />
                    <span className="lp-card-title lp-mono">bash — wavo</span>
                  </div>
                  <pre className="lp-code">
<span className="c-mut"># Launch the full Wavo stack</span>{'\n'}
<span className="c-acc">$</span> docker compose -f docker-compose.dev.yml up -d{'\n'}
<span className="c-mut">✔</span> wavo-api        <span className="c-key">running</span>  :2785{'\n'}
<span className="c-mut">✔</span> dashboard       <span className="c-key">bundled</span>{'\n'}
<span className="c-mut">✔</span> swagger docs    /api/docs{'\n\n'}
<span className="c-mut"># Send your first campaign message</span>{'\n'}
<span className="c-acc">$</span> curl -X POST .../messages/send-text \{'\n'}
  -H <span className="c-key">"X-API-Key: ••••••••"</span> \{'\n'}
  -d '&#123;"chatId":"628…@c.us","text":"<span id="lp-typed" className="c-key" /><span className="lp-caret">▍</span>"&#125;'{'\n\n'}
<span className="c-key">→ 200 OK · message.sent ✓</span>
                  </pre>
                </div>
                <div className="lp-chip lp-chip-a lp-glass"><Bot size={16} /> AI handled the reply</div>
                <div className="lp-chip lp-chip-b lp-glass"><Webhook size={16} /> webhook fired</div>
              </div>
            </div>
          </div>
        </div>
        <div className="lp-scrollcue">
          <span className="lp-scrollcue-label">Scroll</span>
          <span className="lp-scrollcue-track"><span className="lp-scrollcue-dot" /></span>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="lp-marquee-sec">
        <p className="lp-marquee-label">Built on a battle-tested, pluggable stack</p>
        <div className="lp-marquee">
          <div className="lp-marquee-track">
            {[0, 1].map((k) => (
              <div className="lp-marquee-group" key={k} aria-hidden={k === 1}>
                <span><Server size={20} />NestJS 11</span>
                <span><FileCode2 size={20} />TypeScript 5</span>
                <span><Container size={20} />Docker</span>
                <span><Database size={20} />PostgreSQL</span>
                <span><Zap size={20} />Redis</span>
                <span><HardDrive size={20} />S3 / MinIO</span>
                <span><Workflow size={20} />n8n</span>
                <span><Bot size={20} />MCP for AI</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-stats">
            <div className="lp-stat lp-glass lp-card-hover lp-arch">
              <div className="lp-stat-num lp-gradient-text"><span className="lp-counter" data-to="39">0</span>+</div>
              <p>AI tools exposed over MCP</p>
            </div>
            <div className="lp-stat lp-glass lp-card-hover lp-arch">
              <div className="lp-stat-num lp-gradient-text">∞</div>
              <p>Concurrent WhatsApp numbers</p>
            </div>
            <div className="lp-stat lp-glass lp-card-hover lp-arch">
              <div className="lp-stat-num lp-gradient-text"><span className="lp-counter" data-to="10">0</span>+</div>
              <p>Languages in the dashboard</p>
            </div>
            <div className="lp-stat lp-glass lp-card-hover lp-arch">
              <div className="lp-stat-num lp-gradient-text"><span className="lp-counter" data-to="100">0</span>%</div>
              <p>Your data, your servers</p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lp-section" id="features">
        <div className="lp-wrap">
          <div className="lp-section-head">
            <p className="lp-eyebrow lp-reveal">Everything you need</p>
            <h2 className="lp-h2 lp-reveal">Market, support &amp; automate — <span className="lp-gradient-text">all in one place.</span></h2>
            <p className="lp-lead lp-reveal">From a thousand-contact campaign to a single AI-handled reply, Wavo runs your whole WhatsApp operation behind one modern dashboard and a clean API.</p>
          </div>
          <div className="lp-grid-3">
            {[
              { icon: <Megaphone size={24} />, t: 'Bulk Campaigns', d: 'Build audiences, schedule broadcasts, and track delivery, reads, and replies per campaign — with smart anti-ban pacing that protects your numbers.' },
              { icon: <Bot size={24} />, t: 'AI Auto-Replies', d: 'An AI agent answers incoming messages using your own knowledge base — on-brand, 24/7, and grounded in the docs you upload.' },
              { icon: <MessageSquare size={24} />, t: 'Human Takeover Inbox', d: 'A live shared inbox across every number. See when the AI is handling a chat, take over in one tap, and hand it back when you are done.' },
              { icon: <Layers size={24} />, t: 'Numbers & Teammates', d: 'Run multiple WhatsApp numbers and invite your whole team per business — each with roles, proxies, and per-session scoping.' },
              { icon: <Webhook size={24} />, t: 'REST API & Webhooks', d: 'Full WhatsApp API over HTTP with signed, filterable webhooks — wire Wavo into any stack or n8n workflow.' },
              { icon: <ShieldCheck size={24} />, t: 'Enterprise Security', d: 'Email auth with role-based workspaces, API keys, CIDR whitelisting, rate limiting, audit logging, and hardened non-root containers.' },
            ].map((f) => (
              <div className="lp-feature lp-glass lp-card-hover lp-reveal" key={f.t}>
                <div className="lp-ficon">{f.icon}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — pinned horizontal */}
      <section id="how">
        <div className="lp-wrap" style={{ paddingTop: 96, paddingBottom: 40 }}>
          <p className="lp-eyebrow lp-reveal">From zero to sent</p>
          <h2 className="lp-h2 lp-reveal">Live in <span className="lp-gradient-text">four steps</span></h2>
        </div>
        <div className="lp-hpin">
          <div className="lp-htrack">
            {[
              { n: '01', icon: <Terminal size={28} />, t: 'Spin up Wavo', d: 'One docker compose command brings up the API, dashboard, and Swagger docs. Config is auto-generated on first run.' },
              { n: '02', icon: <QrCode size={28} />, t: 'Connect a number', d: 'Create a session, scan the QR with WhatsApp, and you are linked in seconds. Repeat for every number you run.' },
              { n: '03', icon: <Bot size={28} />, t: 'Let AI take the wheel', d: 'Upload your knowledge base and the AI agent auto-replies around the clock. Jump into any chat for a one-tap human takeover whenever you want.' },
              { n: '04', icon: <InfinityIcon size={28} />, t: 'Scale & analyze', d: 'Launch campaigns to your audiences, track delivery and reply analytics, and add PostgreSQL, Redis, and S3 via compose profiles as you grow.' },
            ].map((p, i) => (
              <article className={`lp-hpanel lp-glass${i === 3 ? '' : ''}`} key={p.n}>
                <span className="lp-step">{p.n}</span>
                <div className="lp-hicon">{p.icon}</div>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </article>
            ))}
            <div style={{ width: '8vw', flexShrink: 0 }} />
          </div>
          <div className="lp-hprog-wrap"><div className="lp-hprog" /></div>
        </div>
      </section>

      {/* CODE SHOWCASE */}
      <section className="lp-section" id="quickstart">
        <div className="lp-wrap">
          <div className="lp-split">
            <div>
              <p className="lp-eyebrow lp-reveal">Developer-first</p>
              <h2 className="lp-h2 lp-reveal">An API that gets <span className="lp-gradient-text">out of your way</span></h2>
              <p className="lp-lead lp-reveal">Clean, predictable HTTP endpoints secured by API keys. Interactive Swagger docs ship in the box. Every route is documented, versioned, and yours to self-host.</p>
              <ul className="lp-check-list">
                <li className="lp-reveal"><KeyRound size={20} /><span><b>API-key auth</b> with roles &amp; per-session scoping — pass a header, done.</span></li>
                <li className="lp-reveal"><BookOpen size={20} /><span><b>Swagger UI</b> at <span className="lp-mono" style={{ color: 'var(--wa-300)' }}>/api/docs</span> — explore &amp; test live.</span></li>
                <li className="lp-reveal"><GitBranch size={20} /><span><b>Engine choice</b> — whatsapp-web.js or Baileys via one env var.</span></li>
              </ul>
            </div>
            <div className="lp-reveal">
              <div className="lp-card lp-glass">
                <div className="lp-card-bar">
                  <span className="lp-dot" style={{ background: 'rgba(248,113,113,0.7)' }} />
                  <span className="lp-dot" style={{ background: 'rgba(250,204,21,0.7)' }} />
                  <span className="lp-dot" style={{ background: 'rgba(37,211,102,0.7)' }} />
                  <span className="lp-card-title lp-mono">send-message.sh</span>
                  <span className="lp-mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(37,211,102,0.7)' }}>200 OK</span>
                </div>
                <pre className="lp-code">
<span className="c-mut"># Create a session</span>{'\n'}
<span className="c-acc">curl</span> -X POST /api/sessions \{'\n'}
  -H <span className="c-key">"X-API-Key: $KEY"</span> \{'\n'}
  -d <span className="c-acc">'&#123;"name":"my-bot"&#125;'</span>{'\n\n'}
<span className="c-mut"># Start it & grab the QR to scan</span>{'\n'}
<span className="c-acc">curl</span> -X POST .../sessions/<span className="c-str">&#123;id&#125;</span>/start{'\n'}
<span className="c-acc">curl</span> .../sessions/<span className="c-str">&#123;id&#125;</span>/qr{'\n\n'}
<span className="c-mut"># Send a message</span>{'\n'}
<span className="c-acc">curl</span> -X POST .../messages/send-text \{'\n'}
  -H <span className="c-key">"X-API-Key: $KEY"</span> \{'\n'}
  -d <span className="c-acc">'&#123; "chatId": "628…@c.us",{'\n'}       "text": "Hello from Wavo!" &#125;'</span>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section className="lp-section" id="architecture">
        <div className="lp-wrap">
          <div className="lp-section-head">
            <p className="lp-eyebrow lp-reveal">Pluggable by design</p>
            <h2 className="lp-h2 lp-reveal">Swap the engine room. <span className="lp-gradient-text">Keep the app.</span></h2>
            <p className="lp-lead lp-reveal">Database, storage, and cache are adapters chosen by config — not code. Start on SQLite and local disk, graduate to PostgreSQL, Redis, and S3 without a rewrite.</p>
          </div>
          <div className="lp-grid-3">
            <div className="lp-feature lp-glass lp-card-hover lp-arch" data-parallax="0.05">
              <div className="lp-arch-head"><Database size={24} /><h3>Database</h3></div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="lp-arch-row"><span>SQLite</span><span>zero-config</span></div>
                <div className="lp-arch-row"><span>PostgreSQL</span><span>production</span></div>
              </div>
            </div>
            <div className="lp-feature lp-glass lp-card-hover lp-arch" data-parallax="-0.04">
              <div className="lp-arch-head"><HardDrive size={24} /><h3>Storage</h3></div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="lp-arch-row"><span>Local disk</span><span>default</span></div>
                <div className="lp-arch-row"><span>S3 / MinIO</span><span>scalable</span></div>
              </div>
            </div>
            <div className="lp-feature lp-glass lp-card-hover lp-arch" data-parallax="0.05">
              <div className="lp-arch-head"><Zap size={24} /><h3>Cache</h3></div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="lp-arch-row"><span>In-memory</span><span>default</span></div>
                <div className="lp-arch-row"><span>Redis</span><span>performance</span></div>
              </div>
            </div>
          </div>
          <div className="lp-profiles lp-glass lp-reveal">
            <b>Compose profiles:</b>
            <span className="lp-mono"><span style={{ color: 'var(--wa-400)' }}>--profile</span> postgres</span>
            <span className="lp-mono"><span style={{ color: 'var(--wa-400)' }}>--profile</span> redis</span>
            <span className="lp-mono"><span style={{ color: 'var(--wa-400)' }}>--profile</span> minio</span>
            <span className="lp-mono"><span style={{ color: 'var(--wa-400)' }}>--profile</span> full</span>
          </div>
        </div>
      </section>

      {/* MCP / AI */}
      <section className="lp-section" id="mcp">
        <div className="lp-blob" data-parallax="0.15" style={{ top: '40%', left: '20%', width: 600, height: 600, background: 'rgba(18,140,126,0.10)' }} />
        <div className="lp-wrap">
          <div className="lp-split">
            <div className="lp-reveal" style={{ order: 1 }}>
              <div className="lp-card lp-glass">
                <div className="lp-card-bar">
                  <Bot size={16} style={{ color: 'var(--wa-400)' }} />
                  <span className="lp-card-title lp-mono">support inbox · +1 (555) 0134</span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--wa-400)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--wa-400)', boxShadow: '0 0 8px var(--wa-400)' }} /> AI ACTIVE
                  </span>
                </div>
                <div style={{ padding: 20, display: 'grid', gap: 12 }}>
                  <div style={{ maxWidth: '80%', background: 'rgba(255,255,255,0.06)', borderRadius: '14px 14px 14px 4px', padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
                    Hi! Do you ship to Canada, and how long does delivery take?
                  </div>
                  <div style={{ marginLeft: 'auto', maxWidth: '84%', background: 'rgba(37,211,102,0.14)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: '14px 14px 4px 14px', padding: '10px 14px', fontSize: 13, color: '#eafff4' }}>
                    Yes — we ship to Canada in 3–5 business days. Want me to start an order for you?
                    <span style={{ marginTop: 8, fontSize: 10.5, color: 'var(--wa-300)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Bot size={11} /> answered by Wavo AI · from your knowledge base
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: 12, color: 'var(--faint)' }}>AI paused on takeover · resumes in <span className="lp-mono" style={{ color: 'var(--wa-300)' }}>4:00</span></span>
                  <span className="lp-btn lp-btn-primary lp-btn-sm"><MessageSquare size={14} /> Take over</span>
                </div>
              </div>
            </div>
            <div>
              <p className="lp-eyebrow lp-reveal" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Sparkles size={16} /> AI autopilot</p>
              <h2 className="lp-h2 lp-reveal">Your AI agent. <span className="lp-gradient-text">Your rules.</span></h2>
              <p className="lp-lead lp-reveal">Wavo's AI answers WhatsApp messages using a <b style={{ color: '#fff' }}>knowledge base you control</b> — on-brand and around the clock. Step in for a one-tap human takeover and the AI pauses with a live countdown, then quietly picks back up when you're done.</p>
              <div className="lp-mini-grid">
                <div className="lp-mini lp-glass lp-reveal"><Brain size={18} /> Grounded in your own docs</div>
                <div className="lp-mini lp-glass lp-reveal"><MessageSquare size={18} /> One-tap human takeover</div>
                <div className="lp-mini lp-glass lp-reveal"><Gauge size={18} /> Smart anti-ban pacing</div>
                <div className="lp-mini lp-glass lp-reveal"><Sparkles size={18} /> Drive it over MCP too</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="lp-section" id="pricing">
        <div className="lp-wrap" style={{ maxWidth: 960 }}>
          <div className="lp-section-head" style={{ textAlign: 'center', margin: '0 auto 56px' }}>
            <p className="lp-eyebrow lp-reveal">Pricing</p>
            <h2 className="lp-h2 lp-reveal">Own it. <span className="lp-gradient-text">Self-host free.</span></h2>
            <p className="lp-lead lp-reveal">The full platform is open source under the MIT license. Run it on your own infrastructure with no seats, no metered messages, and no locked features.</p>
          </div>
          <div className="lp-price lp-glass lp-reveal">
            <div className="lp-blob" style={{ top: -96, right: -96, width: 288, height: 288, background: 'rgba(37,211,102,0.15)' }} />
            <div className="lp-price-grid">
              <div>
                <div className="lp-tag">MIT License</div>
                <div className="lp-price-amount"><span className="n">$0</span><span className="per">/ self-hosted</span></div>
                <p style={{ marginTop: 16, color: 'var(--muted)' }}>The complete platform — everything on this page is included, because it is all in the box.</p>
                <div style={{ marginTop: 32, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  <button className="lp-btn lp-btn-primary" onClick={enterApp}><Rocket size={20} /> {authed ? 'Open dashboard' : 'Get started'}</button>
                  <a className="lp-btn lp-btn-ghost" href="#quickstart" onClick={navTo('#quickstart')}><BookOpen size={16} /> Read the docs</a>
                </div>
              </div>
              <ul className="lp-check-list">
                {['Unlimited numbers, messages & seats', 'AI auto-replies + human takeover', 'Anti-ban campaigns & reply analytics', 'Knowledge base for grounded AI', 'REST API, webhooks & MCP server', 'Docker & Kubernetes-ready'].map((t) => (
                  <li key={t}><Check size={20} /> {t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-cta">
        <div className="lp-aurora" style={{ opacity: 0.7 }} />
        <div className="lp-wrap" style={{ maxWidth: 780 }}>
          <h2 className="lp-h2 lp-reveal">Put WhatsApp <span className="lp-gradient-text">on autopilot</span></h2>
          <p className="lp-lead lp-reveal" style={{ margin: '24px auto 0', maxWidth: '36rem' }}>Deploy Wavo in one command, connect your numbers, and let AI handle the replies — with your team one tap away. All on infrastructure you own.</p>
          <div className="lp-hero-actions lp-reveal" style={{ justifyContent: 'center', marginTop: 40 }}>
            <button className="lp-btn lp-btn-primary" onClick={enterApp}><Rocket size={20} /> {authed ? 'Open dashboard' : 'Start free'}</button>
            <a className="lp-btn lp-btn-ghost" href="#features" onClick={navTo('#features')}><LineChart size={18} /> Explore features</a>
          </div>
          <div className="lp-cta-cmd lp-glass lp-reveal"><Terminal size={16} /> docker compose -f docker-compose.dev.yml up -d</div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-grid">
            <div>
              <a className="lp-brand" href="#lp-top" onClick={navTo('#lp-top')} style={{ marginBottom: 16 }}>
                <span className="lp-brand-chip"><Waves size={19} strokeWidth={2.4} /></span>
                <span className="lp-brand-word">Wavo</span>
              </a>
              <p className="lp-footer-note">The open-source WhatsApp platform for messaging, campaigns, and AI — self-hosted, no vendor lock-in.</p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="#features" onClick={navTo('#features')}>Features</a></li>
                <li><a href="#how" onClick={navTo('#how')}>How it works</a></li>
                <li><a href="#architecture" onClick={navTo('#architecture')}>Architecture</a></li>
                <li><a href="#mcp" onClick={navTo('#mcp')}>AI / MCP</a></li>
              </ul>
            </div>
            <div>
              <h4>Developers</h4>
              <ul>
                <li><button className="lp-btn" style={{ padding: 0, background: 'none', color: 'inherit', fontWeight: 400, fontSize: '0.875rem' }} onClick={enterApp}>Dashboard</button></li>
                <li><a href="#quickstart" onClick={navTo('#quickstart')}>API Reference</a></li>
                <li><a href="#quickstart" onClick={navTo('#quickstart')}>Swagger Docs</a></li>
                <li><a href="#architecture" onClick={navTo('#architecture')}>Self-hosting</a></li>
              </ul>
            </div>
            <div>
              <h4>Community</h4>
              <ul>
                <li><a href="#">GitHub</a></li>
                <li><a href="#">Report a bug</a></li>
                <li><a href="#">Request a feature</a></li>
                <li><a href="#">Contributing</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <div className="lp-wrap">
            <div className="lp-footer-bottom-inner">
              <p>© {new Date().getFullYear()} Wavo · MIT License · Made with 💚 by the community</p>
              <div className="lp-social">
                <a href="#" aria-label="GitHub"><Star size={20} /></a>
                <a href="#" aria-label="Docs"><BookOpen size={20} /></a>
                <a href="#" aria-label="Security"><Shield size={20} /></a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
