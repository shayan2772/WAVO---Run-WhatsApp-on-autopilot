# 26 — Anti-Ban & Throttling Strategies

> **Scope.** This document describes every throttling / rate-limiting / humanizing mechanism the
> platform uses to protect connected WhatsApp numbers from being banned when sending marketing
> campaigns and automated replies over the **unofficial engine** (Baileys / whatsapp-web.js).
>
> **Honest disclaimer.** These are *client-side pacing heuristics*. They substantially reduce ban
> risk but **cannot eliminate it** — the residual risk of unofficial automation is never zero. The
> only fully-safe path is the official **WhatsApp Business Cloud API** (template approval + tiered
> messaging limits), which could be added as an alternate engine.

---

## At a glance

| Layer | Mechanism | Where |
|---|---|---|
| 1 | **Campaign pacer** — warm-up tiers, jittered delays, daily caps, send windows, health de-rating | `src/modules/campaign/campaign-pacer.service.ts`, `warmup.config.ts` |
| 2 | **Typing simulation** — length-scaled, jittered "typing…" pause before each send | `src/modules/message/message.service.ts` |
| 3 | **Opt-out / DND** — `STOP` marks a contact opted-out; re-checked immediately before every send | `campaign-pacer.service.ts`, `audience` module |
| 4 | **AI reply cooldown** — 3 s per-chat cooldown on auto-replies | `src/modules/ai-assistant/ai-assistant.service.ts` |
| 5 | **Per-conversation ordering lock** — one message at a time per chat, never reordered | `src/modules/integration/ordering-lock.ts` |
| 6 | **Bulk-send spacing** — `delayBetweenMessages` between messages in a blast | `src/modules/message` (bulk) |
| 7 | **API rate limiting** — protects the HTTP API itself (not WhatsApp) | `src/app.module.ts` (`ThrottlerModule`) |

---

## 1. Campaign pacer — the core anti-ban engine

`CampaignPacerService` is a **single in-process loop** (the deployment target is one VPS) that ticks
every **5 seconds** (`TICK_MS`). On each tick, for every running/scheduled campaign, **each connected
number may send at most ONE message** — and only if it passes every gate below.

### 1a. Warm-up ramp (by number age)

New numbers send little and slowly; volume and speed increase as the number ages (measured from
`NumberHealth.firstReadyAt`, the first time it reached `READY`). Tiers (`warmup.config.ts`):

| Number age | Daily cap | Inter-message spacing |
|---|---|---|
| **0–6 days** | **40 / day** | **30–90 s** |
| **7–13 days** | **150 / day** | **20–45 s** |
| **14–20 days** | **400 / day** | **12–25 s** |
| **21+ days** | **1000 / day** | **8–15 s** |

- An unknown / brand-new number (`firstReadyAt` absent) is treated as **age 0** → the most
  conservative tier.
- Tiers auto-advance daily as the number ages — no manual step.

### 1b. Jittered inter-message delay

The actual wait before a number's next send is randomized **within** the tier's range:

```
required = minDelay + random() * (maxDelay - minDelay)
```

A message only goes out if `now - lastSentAt >= required`. Because the interval is random every time,
sends are **never metronomic** — a fixed cadence is a classic bot fingerprint.

### 1c. Per-number daily cap

```
dailyCap = min(campaign.schedule.dailyCapPerNumber ?? tierCap, tierCap)
```

A campaign may set a **lower** cap than the tier, but never a higher one. `sentToday` resets each day
(`rollDay`, UTC `YYYY-MM-DD` key). Once a number hits its cap, it stops for the day and remaining
recipients wait for the next day/window.

### 1d. Send window (business hours)

If the campaign schedule defines `windowStartHour` / `windowEndHour`, messages only send inside that
window, evaluated in the campaign's **IANA `timezone`** via `Intl.DateTimeFormat` (no timezone
dependency). Overnight windows (e.g. 22:00–06:00) are supported. Sending at 3 a.m. looks automated.

### 1e. Number must be connected

A send is attempted only if the session status is `READY`. Disconnected / connecting numbers are
skipped until they recover.

### 1f. Health states & auto de-rating

Each number has a `NumberHealth` row with a `healthState`:

- **HEALTHY** — normal.
- **THROTTLED** — set automatically after **5 consecutive send failures**
  (`FAILURE_THROTTLE_THRESHOLD`); signals trouble.
- **PAUSED** — skipped entirely by the pacer.

On a successful send, `consecutiveFailures` resets to 0 and the state returns to HEALTHY.

### 1g. Multi-number round-robin pool

A campaign can list several `sessionIds`. Each tick, every number in the pool gets its own chance to
send (numbers run in parallel), so volume is **spread across numbers** rather than concentrated on one
— each still bounded by its own tier, cap, and delay.

### 1h. Durability (supports safe pacing)

Not throttling per se, but essential to it: per-recipient `CampaignRecipient` rows are the cursor,
claimed with a compare-and-swap `PENDING → SENDING`. A crash/restart re-queues in-flight rows
(`SENDING → PENDING`) so a message is **never double-sent** — double-sends would both waste the cap
and look spammy.

---

## 2. Typing simulation (per-send humanizer)

Before the actual send, the engine shows the real **"typing…" presence** and pauses so a message
never lands instantaneously (an automation tell). On by default (`SIMULATE_TYPING`).

```
planned  = min(SIMULATE_TYPING_MAX_MS (=5000), 500 + text.length * 45)   // length-scaled
jittered = planned * (0.85 + random() * 0.30)                            // ±15% so it isn't metronomic
```

Best-effort and engine-agnostic (via `sendChatState`) — it never throws and never blocks the send if
presence fails. Applies to single sends; bulk sends use their own spacing (layer 6).

---

## 3. Opt-out / DND enforcement

- Inbound `STOP` / `UNSUBSCRIBE` marks the `Contact.optedOut = true`.
- The pacer **re-checks opt-out immediately before every send** (in case a `STOP` arrived *after* the
  campaign materialized its recipients). Opted-out contacts are marked `SKIPPED` and counted in
  `skippedCount` — **never messaged again**.
- Contacts can also be marked **DND manually** from the Audiences UI.
- Honoring opt-out is both a compliance requirement and an anti-ban signal (low block/report rate).

---

## 4. AI auto-reply cooldown

The built-in AI assistant enforces a **3 s per-chat cooldown** (`REPLY_COOLDOWN_MS`) so a burst of
incoming messages from one contact doesn't fan out into a burst of auto-replies (and model calls).

---

## 5. Per-conversation ordering lock

`KeyedAsyncLock`, keyed on the **conversation**, serializes processing so a given chat handles **one
message at a time** — never interleaved or reordered. Prevents a number from firing several messages
into the same chat simultaneously.

---

## 6. Bulk-send spacing

The legacy "blast now" endpoint (`POST /messages/send-bulk`) spaces messages within a batch by
`delayBetweenMessages` (**default 3000 ms**). For large, safe campaigns prefer the pacer (layer 1),
which adds warm-up, caps, windows, and health de-rating on top.

---

## 7. API rate limiting (protects the API, not WhatsApp)

`ThrottlerModule` (via a proxy-aware guard) bounds HTTP request rate per client:

| Tier | Window | Limit |
|---|---|---|
| short | 1 s | 10 requests |
| medium | 60 s | 100 requests |
| long | 1 hour | 1000 requests |

This defends the gateway from abuse/misconfigured clients; it is independent of WhatsApp-side pacing.

---

## Configuration reference

| Setting | Default | Notes |
|---|---|---|
| Pacer tick | 5 s | `TICK_MS` |
| Failure → THROTTLED | 5 consecutive | `FAILURE_THROTTLE_THRESHOLD` |
| Warm-up tiers | see §1a | `warmup.config.ts` (`minAgeDays`, `dailyCap`, `min/maxDelayMs`) |
| Per-campaign overrides | — | `schedule.dailyCapPerNumber`, `interMessageDelayMin/MaxMs`, `windowStartHour/EndHour`, `timezone`, `startAt` (caps clamp to tier) |
| `SIMULATE_TYPING` | `true` | Enable/disable typing pause |
| `SIMULATE_TYPING_MAX_MS` | `5000` | Cap on the typing pause |
| AI reply cooldown | 3000 ms | `REPLY_COOLDOWN_MS` |
| Bulk `delayBetweenMessages` | 3000 ms | per-batch spacing |
| API rate limits | 10/s · 100/min · 1000/hr | `api.rateLimit.*` |

---

## Operational guidance

1. **Warm up new numbers.** Do not point a fresh number at a 5,000-contact campaign on day one — the
   pacer will cap it at ~40/day regardless, but respect that pace; don't override caps upward.
2. **Keep opt-out honest.** Always include a `STOP` instruction in marketing copy; a low block/report
   rate is the single biggest protective signal.
3. **Personalize.** Use `{{name}}` / `{{phone}}` merge fields — identical byte-for-byte broadcasts are
   easier to flag. (The pacer renders per-recipient at send time.)
4. **Send in-hours.** Configure a send window in the recipient's timezone.
5. **Spread across numbers** for large volume rather than pushing one number to its ceiling.
6. **Watch health.** A number flipping to THROTTLED/PAUSED or accumulating failures is an early
   warning — pause the campaign and investigate before it escalates to a ban.

---

## Related documents

- `docs/03-system-architecture.md` — where the pacer sits in the system.
- `docs/16-risk-management.md` — ban risk in the broader risk register.
- `docs/13-horizontal-scaling.md` — moving the single-process pacer to a BullMQ singleton for
  multi-replica deployments.
