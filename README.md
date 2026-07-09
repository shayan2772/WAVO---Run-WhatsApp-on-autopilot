<p align="center">
  <img src="docs/logo/wavo-logo.svg" alt="Wavo" width="128"/>
</p>

<h1 align="center">Wavo</h1>
<p align="center">
  <strong>Run WhatsApp on autopilot — marketing &amp; AI support, self-hosted.</strong>
</p>

<p align="center">
  Connect your own WhatsApp numbers, send safely-paced bulk campaigns, and let an AI assistant
  handle replies — with a shared team inbox and human takeover — all from a modern dashboard and a
  clean REST API you fully own.
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-configuration">Configuration</a> •
  <a href="#-api-examples">API</a> •
  <a href="#-mcp-server-ai-agents">AI / MCP</a> •
  <a href="#-documentation">Docs</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-25D366.svg" alt="License"/>
  <img src="https://img.shields.io/badge/node-22_LTS-brightgreen.svg" alt="Node"/>
  <img src="https://img.shields.io/badge/NestJS-11.x-red.svg" alt="NestJS"/>
  <img src="https://img.shields.io/badge/React-19-3178C6.svg" alt="React"/>
  <img src="https://img.shields.io/badge/docker-ready-blue.svg" alt="Docker"/>
  <img src="https://img.shields.io/badge/self--hosted-✓-25D366.svg" alt="Self-hosted"/>
</p>

---

## ✨ What is Wavo?

**Wavo** turns WhatsApp into a first-class growth and support channel for your business — without
handing your customer data, or your budget, to a third-party SaaS.

It is a **multi-tenant platform**: sign up, create a workspace (business), invite your team, connect
one or more WhatsApp numbers, and start running conversations, campaigns, and AI-assisted replies —
all from a modern web dashboard, or programmatically over a clean REST API.

Under the hood, Wavo is built on a **pluggable gateway architecture**, so you can swap the WhatsApp
engine, database, storage, and cache backends by configuration alone — from a zero-config SQLite
laptop setup to a PostgreSQL + Redis + S3 production cluster — without changing a line of code.

|                                 |                                                                        |
| ------------------------------- | ---------------------------------------------------------------------- |
| 🔓 **100% Open Source (MIT)**   | Self-host the whole platform — no seats, no metered messages, no locks |
| 👥 **Multi-Tenant SaaS**        | Businesses/workspaces, team members, and role-based access control     |
| 📣 **Marketing Built-in**       | Audiences, templates, scheduled campaigns, and delivery analytics      |
| 💬 **Shared Team Inbox**        | Real-time chat across every number, with labels &amp; assignment       |
| 🤖 **AI Assistant**             | Knowledge-grounded reply drafting + MCP tools for AI agents            |
| 🏗️ **Pluggable Architecture**  | Swap DB / storage / cache adapters via config                          |
| 🐳 **Docker Native**            | Production-ready single-image deploy, Kubernetes-friendly              |

---

## 🎯 Features

### 💬 Messaging &amp; Sessions
| Feature             | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| Multi-Session       | Run many WhatsApp numbers concurrently on one instance                  |
| QR Onboarding       | Create a session, scan the QR, and you're linked in seconds            |
| Rich Messages       | Text, images, video, audio, documents, reactions, replies             |
| Delivery Tracking   | Sent / delivered / read receipts per message                          |
| Groups &amp; Channels | Create/manage groups, broadcast to WhatsApp Channels/Newsletters      |
| Contacts &amp; Labels | Sync contacts, organize chats with labels                             |
| Engine Choice       | `whatsapp-web.js` (default) or `baileys` — switch via config or UI     |
| Per-Session Proxy   | Route individual sessions through their own proxy                      |

### 📣 Marketing &amp; Growth
| Feature       | Description                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| Audiences     | Build and manage contact lists / segments                                      |
| Campaigns     | Schedule bulk sends to audiences with pacing to protect your numbers           |
| Campaign Analytics | Track delivery, reads, and replies per campaign                           |
| Templates     | Reusable, variable-driven message templates                                    |
| Catalog       | Product catalog support for commerce use cases                                 |

### 🤖 AI &amp; Automation
| Feature          | Description                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| AI Assistant     | Draft on-brand replies grounded in your own content                          |
| Knowledge Base   | Upload documents; answers are grounded in your knowledge chunks              |
| MCP Server       | ~39 curated tools over the Model Context Protocol for Claude, Cursor, etc.   |
| Webhooks         | Real-time events with HMAC signatures and optional smart pre-dispatch filters|
| n8n Integration  | Community nodes for no-code workflow automation                              |

### 👥 Team &amp; Multi-Tenancy
| Feature            | Description                                                              |
| ------------------ | ----------------------------------------------------------------------- |
| Workspaces         | Each account owns one or more businesses (tenants)                      |
| Roles              | Owner / Admin / Member — mapped to admin / operator / viewer access     |
| Auth               | Email + password sign-up/sign-in with refresh-token sessions           |
| Shared Inbox       | Real-time team inbox with an "attention center" so nothing slips        |
| Localized UI       | Dashboard translated into 10+ languages (incl. RTL: Arabic, Hebrew)     |

### 🧑‍💻 Developer &amp; API
| Feature        | Description                                                       |
| -------------- | ----------------------------------------------------------------- |
| REST API       | Full WhatsApp API over HTTP                                       |
| Swagger Docs   | Interactive API reference at `/api/docs`                         |
| API Keys       | Scoped keys with roles, CIDR whitelisting, and rate limits       |
| Message Tester | Send test messages straight from the dashboard                   |
| Audit &amp; Logs   | Track all API operations and system events                    |

### 🏭 Infrastructure &amp; Security
| Feature          | Description                                             |
| ---------------- | ------------------------------------------------------ |
| Database         | SQLite (zero-config) or PostgreSQL (built-in or external) |
| Cache / Queue    | Optional Redis (built-in or external) + BullMQ         |
| Storage          | Local disk, or S3 / MinIO                               |
| Docker           | One-image deploy; multi-arch (amd64 / arm64) images    |
| Health Checks    | Kubernetes-ready liveness/readiness probes             |
| Hardened Runtime | Non-root container, Docker socket proxy, strict CSP    |
| Data Migration   | Export/import between database &amp; storage backends   |

---

## 🚀 Quick Start

### Option A — Docker (recommended)

```bash
git clone <your-repo-url> wavo
cd wavo
docker compose -f docker-compose.dev.yml up -d
```

Then open:

| URL                                | What you get                                       |
| ---------------------------------- | -------------------------------------------------- |
| **http://localhost:2785/**         | 🌊 Wavo **landing page** (marketing)               |
| **http://localhost:2785/app**      | 🔐 Dashboard — **sign up / log in**, then the app  |
| http://localhost:2785/api          | REST API                                           |
| http://localhost:2785/api/docs     | Swagger / interactive API docs                     |

> First run auto-generates config. Create your account at `/app`, name your business, connect a
> WhatsApp number under **Sessions**, and you're live.

<details>
<summary>Using Podman instead of Docker?</summary>

```bash
systemctl --user start podman.socket
systemctl --user enable podman.socket
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
```
Add the `export` line to your `~/.bashrc` to make it permanent.
</details>

### Option B — Local development

```bash
git clone <your-repo-url> wavo
cd wavo

# Install API + dashboard dependencies
npm install

# Start the API and the dashboard dev server together
npm run dev
```

| URL                             | What you get                                    |
| ------------------------------- | ----------------------------------------------- |
| **http://localhost:2886/**      | Wavo landing page (Vite dev server, hot reload) |
| **http://localhost:2886/app**   | Dashboard (proxies the API on :2785)            |
| http://localhost:2785/api       | REST API                                        |
| http://localhost:2785/api/docs  | Swagger docs                                     |

---

## 🧭 How routing works

Wavo serves a **public marketing site** and the **product** from the same origin:

```
/            → Wavo landing page          (public — "Log in" / "Dashboard" button)
/app         → Dashboard SPA              (sign-up / login, then the authenticated app)
/api         → REST API                   (JSON)
/api/docs    → Swagger                    (interactive docs)
/mcp         → Model Context Protocol      (optional, for AI agents)
```

The dashboard is a React SPA mounted under `/app`; the landing page owns the root `/`. The landing's
primary button is **auth-aware** — it reads your live session and shows **“Log in”** when signed out
or **“Dashboard”** when signed in, routing into `/app` either way.

---

## ⚙️ Configuration

All configuration lives in `.env` (copy from `.env.example`, the single source of truth). The most
common knobs — engine, database, cache, storage — can also be changed from the dashboard under
**Infrastructure**, which writes `data/.env.generated`.

### WhatsApp engine
```bash
# whatsapp-web.js (default, Chromium-based) or baileys (WebSocket, no Chromium)
ENGINE_TYPE=whatsapp-web.js
```

### Database
```bash
DATABASE_TYPE=sqlite            # sqlite | postgres
POSTGRES_BUILTIN=false          # spin up a bundled PostgreSQL container
# POSTGRES_HOST / POSTGRES_PORT / POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB for external
```

### Cache &amp; queue (optional)
```bash
REDIS_ENABLED=false             # enable Redis for caching + BullMQ queue
REDIS_BUILTIN=false             # spin up a bundled Redis container
# REDIS_HOST / REDIS_PORT for external
```

### Storage
```bash
STORAGE_TYPE=local              # local | s3
STORAGE_LOCAL_PATH=./data/media
# S3_* / MINIO_* settings when STORAGE_TYPE=s3
```

### AI / MCP (optional)
```bash
MCP_ENABLED=true                # mount the MCP server at POST /mcp
MCP_READONLY=false              # expose only read tools
MCP_RATE_LIMIT_MAX=60           # tool calls per key per window
```

---

## 🏭 Production Deployment

Use the main `docker-compose.yml` with optional service profiles:

```bash
# Basic (SQLite, local storage) — the dashboard + landing are bundled into the API image
docker compose up -d

# With PostgreSQL
docker compose --profile postgres up -d

# Full stack (PostgreSQL + Redis + MinIO)
docker compose --profile full up -d
```

| Profile    | Adds                    |
| ---------- | ----------------------- |
| `postgres` | PostgreSQL database      |
| `redis`    | Redis cache + queue      |
| `minio`    | S3-compatible storage    |
| `full`     | All of the above         |

> The landing page and dashboard are bundled into the API image and served by NestJS on the API port
> (`2785`), so they need no extra profile. For public/TLS exposure, put your own reverse proxy (nginx,
> Caddy, a cloud load balancer, or a Kubernetes Ingress) in front — see `docs/12-troubleshooting-faq.md`.
> Official GHCR images are published as multi-arch manifests for `linux/amd64` and `linux/arm64`.

---

## 🔌 Ports

| Service              | Port            | Description                                          |
| -------------------- | --------------- | ---------------------------------------------------- |
| API + Landing + App  | `2785`          | REST API, marketing landing (`/`), dashboard (`/app`)|
| Swagger              | `2785/api/docs` | Interactive API docs                                 |
| Dashboard (dev)      | `2886`          | Vite dev server with hot reload (`npm run dev`)      |

---

## 📡 API Examples

### Create a session
```bash
curl -X POST http://localhost:2785/api/sessions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"name": "my-bot"}'
```

### Start the session &amp; get a QR code
```bash
curl -X POST http://localhost:2785/api/sessions/{sessionId}/start \
  -H "X-API-Key: YOUR_API_KEY"

# Fetch the QR (scan with WhatsApp)
curl http://localhost:2785/api/sessions/{sessionId}/qr \
  -H "X-API-Key: YOUR_API_KEY"
```

### Send a message
```bash
curl -X POST http://localhost:2785/api/sessions/{sessionId}/messages/send-text \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "chatId": "628123456789@c.us",
    "text": "Hello from Wavo!"
  }'
```

### Register a webhook
```bash
curl -X POST http://localhost:2785/api/sessions/{sessionId}/webhooks \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "url": "https://your-server.com/webhook",
    "events": ["message.received", "session.status"],
    "secret": "your-hmac-secret"
  }'
```

> **Smart filters (optional):** add a `filters` object to fire a webhook only when conditions match
> (`sender` / `recipient` / `body` / `type` / `mentions` / `fromMe` / `hasMedia` / `isGroup`).
> A webhook with no filters behaves exactly as before. See the API specification for the full schema.

---

## 🤖 MCP Server (AI Agents)

Wavo can expose a **curated set of tools over the [Model Context Protocol](https://modelcontextprotocol.io)**
so AI agents (Claude, Cursor, …) can drive WhatsApp. It is **off by default** and **additive** — every
REST route keeps working unchanged.

Set `MCP_ENABLED=true` to mount a stateless Streamable-HTTP transport at **`POST /mcp`** (same port, no
extra process). It exposes ~39 curated tools (sessions, messaging, contacts, basic group ops, webhook
reads) — a focused surface so agents aren't overwhelmed and destructive operations stay off the path.

```json
{
  "mcpServers": {
    "wavo": {
      "type": "http",
      "url": "http://localhost:2785/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

The key can be passed as `Authorization: Bearer …` or `X-API-Key: …`. Every tool call goes through the
**same API-key auth, role, and per-session scoping** as REST.

**Security guidance:** mint a dedicated, least-privilege, session-scoped key for the agent; set
`MCP_READONLY=true` for read-only access; set `MCP_RATE_LIMIT_MAX` to cap tool calls per key; and do
**not** expose `/mcp` to the public internet without a fronting auth proxy.

---

## 🛠 Tech Stack

| Layer         | Technology                                              |
| ------------- | ------------------------------------------------------- |
| **Backend**   | Node.js 22 LTS · NestJS 11 · TypeScript 5 · TypeORM     |
| **Frontend**  | React 19 · Vite · React Router · TanStack Query · GSAP  |
| **WA Engine** | whatsapp-web.js (default) / Baileys — set `ENGINE_TYPE` |
| **Database**  | SQLite / PostgreSQL                                     |
| **Cache/Queue** | Redis + BullMQ (optional)                             |
| **Storage**   | Local / S3 / MinIO                                      |
| **Container** | Docker + Docker Compose                                 |

---

## 📁 Project Structure

```
wavo/
├── src/                         # NestJS API
│   ├── main.ts                  # Entry point (serves landing + dashboard + API)
│   ├── app.module.ts            # Root module
│   ├── modules/
│   │   ├── auth/                # Accounts, businesses, memberships, API keys
│   │   ├── tenancy/            # Multi-tenant workspace context
│   │   ├── session/           # WhatsApp session management
│   │   ├── message/           # Messaging
│   │   ├── audience/          # Contact lists / segments
│   │   ├── campaign/          # Bulk campaigns + analytics
│   │   ├── template/          # Message templates
│   │   ├── ai-assistant/      # Knowledge base + AI reply drafting
│   │   ├── mcp/               # Model Context Protocol server
│   │   ├── webhook/           # Webhooks (signed, filterable)
│   │   ├── group/ contact/ channel/ label/ catalog/
│   │   ├── events/            # Real-time (WebSocket) gateway
│   │   ├── infra/ docker/     # Infrastructure management
│   │   └── health/ metrics/ audit/ stats/
│   ├── engine/                 # WhatsApp engine abstraction (web.js / baileys)
│   └── common/                 # Cache + storage adapters, shared utils
├── dashboard/                   # React dashboard + Wavo landing page
│   └── src/pages/Landing.tsx    # Public marketing landing (served at `/`)
├── docs/                        # Documentation
├── docker-compose.yml           # Production stack (+ profiles)
├── docker-compose.dev.yml       # Local/dev stack
└── package.json
```

---

## 📚 Documentation

| Document                                                | Description                  |
| ------------------------------------------------------- | ---------------------------- |
| [Project Overview](./docs/01-project-overview.md)       | Introduction and goals       |
| [Requirements](./docs/02-requirements-specification.md) | Feature specifications       |
| [Architecture](./docs/03-system-architecture.md)        | System design                |
| [Security](./docs/04-security-design.md)                | Security implementation      |
| [Database](./docs/05-database-design.md)                | Data models and migrations   |
| [API Spec](./docs/06-api-specification.md)              | Complete API reference       |
| [Development](./docs/08-development-guidelines.md)      | Coding standards             |
| [Migration Guide](./docs/14-migration-guide.md)         | Database &amp; storage migration |

---

## 🤝 Contributing

Contributions are welcome!

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

Please read the [Development Guidelines](./docs/08-development-guidelines.md) first.

---

## 📄 License

Licensed under the **MIT License** — free for personal and commercial use. See [LICENSE](./LICENSE).

---

<div align="center">

**Wavo** — Run WhatsApp on autopilot: marketing &amp; AI support, self-hosted.

<sub>Open source (MIT) · Made with 💚</sub>

</div>
