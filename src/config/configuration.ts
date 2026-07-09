import { computeFeatureFlags } from './feature-flags';

export default () => ({
  port: parseInt(process.env.PORT || '2785', 10),

  // Runtime feature flags. Single source of truth: src/config/feature-flags.ts. Exposed here so the
  // full set is discoverable via ConfigService (`features.*`) instead of scattered process.env reads.
  features: computeFeatureFlags(),

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    connectTimeoutMs: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10),
  },

  // Queue configuration
  queue: {
    enabled: process.env.QUEUE_ENABLED === 'true',
  },

  // Cache configuration
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true',
  },

  // Main Database configuration (always SQLite for boot config)
  database: {
    type: 'sqlite' as const,
    // SQLite file for the auth/audit DB. Overridable (e.g. e2e points it at a temp file) so tests
    // never write api keys into the developer's ./data/main.sqlite.
    database: process.env.MAIN_DATABASE_NAME || './data/main.sqlite',
    // Schema management for the auth/audit DB. Default ON (zero-config first boot).
    // Set MAIN_DATABASE_SYNCHRONIZE=false to manage schema via the main-owned migrations
    // instead (migrationsRun then creates api_keys/audit_logs). When disabled, run the
    // main-connection migrations explicitly with `npm run migration:run:main` (or
    // `migration:run:main:prod` for the compiled image) — the plain `migration:run` only
    // manages the data connection.
    synchronize: process.env.MAIN_DATABASE_SYNCHRONIZE !== 'false',
    logging: process.env.DATABASE_LOGGING === 'true',
  },

  // Data Storage Database configuration (pluggable: SQLite, PostgreSQL, etc.)
  dataDatabase: {
    type: process.env.DATABASE_TYPE || 'sqlite',
    // SQLite path (used when type is sqlite)
    database: process.env.DATABASE_NAME || './data/openwa.sqlite',
    // Postgres database NAME (used when type is postgres). Resolved from the same
    // DATABASE_NAME env as the migration CLI (data-source.ts) so the runtime factory and
    // migrations never target different databases. Distinct sqlite-vs-pg defaults.
    name: process.env.DATABASE_NAME || 'openwa',
    // PostgreSQL schema (used when type is postgres). Default 'public' preserves the historical
    // behavior; set POSTGRES_SCHEMA to place OpenWA's tables + the TypeORM migration ledger in a
    // dedicated schema (e.g. a managed-Postgres project schema, or to isolate OpenWA from other
    // apps sharing the database). The schema must already exist — a missing one fails fast at
    // migration time rather than silently falling back to public. SQLite ignores this.
    schema: process.env.POSTGRES_SCHEMA || 'public',
    // PostgreSQL/MySQL connection (used when type is postgres/mysql)
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
    logging: process.env.DATABASE_LOGGING === 'true',
    // Connection pooling (PostgreSQL)
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
    // Pool/query timeouts (PostgreSQL). statement_timeout is server-side per query; idle/connection
    // are pool-side. Set any to 0 to disable. Applied to the runtime connection only (see app.module).
    statementTimeoutMs: parseInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS || '30000', 10),
    idleTimeoutMs: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMs: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '10000', 10),
    // SSL configuration
    ssl: process.env.DATABASE_SSL === 'true',
    sslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  },

  // WhatsApp engine configuration
  engine: {
    type: process.env.ENGINE_TYPE || 'whatsapp-web.js',
    puppeteer: {
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      // Accept either delimiter: .env/compose use commas, the dashboard Infrastructure form
      // persists space-separated. Splitting on both keeps each flag a discrete argv token —
      // a single glued token like "--no-sandbox --disable-gpu" silently neuters --no-sandbox.
      args: (process.env.PUPPETEER_ARGS || '--no-sandbox,--disable-setuid-sandbox').split(/[\s,]+/).filter(Boolean),
      // Optional path to a system Chromium/Chrome binary. When unset, whatsapp-web.js
      // uses Puppeteer's bundled Chromium. Required on hosts where the bundled binary
      // is missing or incompatible (Alpine, ARM, custom base images).
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    },
    sessionDataPath: process.env.SESSION_DATA_PATH || './data/sessions',
    // Baileys engine (used when ENGINE_TYPE=baileys). Multi-file auth state base dir; each session
    // gets its own subdirectory. Read by the Baileys plugin from the opaque engine config blob.
    baileys: {
      authDir: process.env.BAILEYS_AUTH_DIR || './data/baileys',
    },
  },

  sessions: {
    // 0 = unlimited/backwards-compatible. Set to a positive integer to cap concurrently running or
    // initializing WhatsApp engines, which protects memory/Chromium-constrained deployments.
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '0', 10),
  },

  // Webhook configuration
  webhook: {
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '10000', 10),
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '5000', 10),
  },

  // User auth (dashboard signup/login). API keys remain for the dev API; these are for humans.
  auth: {
    // MUST be set in production. A dev fallback keeps zero-config local boot working.
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-insecure-access-secret-change-me',
    // Access-token lifetime in SECONDS (number → satisfies jsonwebtoken's expiresIn type cleanly).
    jwtAccessTtl: parseInt(process.env.JWT_ACCESS_TTL_SECONDS || '3600', 10),
    // Refresh token lifetime (days) — stored hashed, rotated on use, delivered in an httpOnly cookie.
    refreshTtlDays: parseInt(process.env.AUTH_REFRESH_TTL_DAYS || '30', 10),
    cookieSecure: process.env.AUTH_COOKIE_SECURE === 'true',
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    bcryptRounds: parseInt(process.env.AUTH_BCRYPT_ROUNDS || '12', 10),
  },

  // AI Assistant (OpenRouter) — built-in auto-reply + knowledge base.
  // Generation and embeddings both go through OpenRouter (OpenAI-compatible),
  // so `model` accepts any OpenRouter model id (e.g. anthropic/claude-3.5-sonnet,
  // openai/gpt-4o-mini). A single OPENROUTER_API_KEY covers both endpoints.
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    embeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small',
    timeoutMs: parseInt(process.env.OPENROUTER_TIMEOUT_MS || '30000', 10),
  },

  // API configuration
  api: {
    rateLimit: {
      // Short burst protection: 10 requests per second
      shortTtl: parseInt(process.env.RATE_LIMIT_SHORT_TTL || '1000', 10),
      shortLimit: parseInt(process.env.RATE_LIMIT_SHORT_LIMIT || '10', 10),
      // Medium protection: 100 requests per minute
      mediumTtl: parseInt(process.env.RATE_LIMIT_MEDIUM_TTL || '60000', 10),
      mediumLimit: parseInt(process.env.RATE_LIMIT_MEDIUM_LIMIT || '100', 10),
      // Long protection: 1000 requests per hour
      longTtl: parseInt(process.env.RATE_LIMIT_LONG_TTL || '3600000', 10),
      longLimit: parseInt(process.env.RATE_LIMIT_LONG_LIMIT || '1000', 10),
    },
  },

  // Security configuration
  security: {
    // Comma-separated IPs/CIDRs of reverse proxies whose X-Forwarded-For header
    // may be trusted for client-IP resolution. Empty by default: X-Forwarded-For
    // is ignored and the direct socket address is used, preventing spoofing of
    // the API-key allowedIps whitelist.
    trustedProxies: (process.env.TRUSTED_PROXIES || '')
      .split(',')
      .map(proxy => proxy.trim())
      .filter(Boolean),
  },

  // Plugin platform configuration
  plugins: {
    // Where installed plugins live on disk (matches the plugin loader's default).
    dir: process.env.PLUGINS_DIR || './plugins',
    // Remote catalog of installable plugins (JSON array; the OpenWA-plugins repo's plugins.json).
    // Fetched through the SSRF guard — add its host to SSRF_ALLOWED_HOSTS if it is not publicly resolvable.
    catalogUrl:
      process.env.PLUGIN_CATALOG_URL || 'https://raw.githubusercontent.com/rmyndharis/OpenWA-plugins/main/plugins.json',
    // Cap on a plugin .zip downloaded by install-from-URL (matches the 5 MB upload limit). Fail-safe:
    // a non-numeric or non-positive value (parseInt → NaN/0/-n) falls back to the default rather than
    // silently disabling the cap (a downstream `??` would not catch NaN).
    downloadMaxBytes: (() => {
      const n = parseInt(process.env.PLUGIN_DOWNLOAD_MAX_BYTES ?? '', 10);
      return Number.isFinite(n) && n > 0 ? n : 5 * 1024 * 1024;
    })(),
  },

  // Storage configuration
  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    localPath: process.env.STORAGE_LOCAL_PATH || './data/media',
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT,
    },
  },
});
