import { Plus, Webhook as WebhookIcon, Shield, Zap, Code2 } from 'lucide-react';
import { Button } from './Button';
import './WebhookTutorial.css';

interface WebhookTutorialProps {
  onAddWebhook?: () => void;
  canWrite?: boolean;
  /** Compact = shown as a help panel above an existing list (no big hero). */
  compact?: boolean;
}

const SAMPLE_PAYLOAD = `POST https://your-server.com/webhooks
Content-Type: application/json
X-OpenWA-Event: message.received
X-OpenWA-Signature: sha256=<hmac>
X-OpenWA-Delivery-Id: 9f2c…

{
  "event": "message.received",
  "sessionId": "sess_123",
  "data": {
    "from": "923001234567",
    "body": "Hi!",
    "timestamp": 1736400000
  }
}`;

/**
 * Featured "how to add a webhook" guide. Shown in place of the empty state when there are no
 * webhooks, and as a collapsible help panel (compact) once some exist.
 */
export function WebhookTutorial({ onAddWebhook, canWrite, compact }: WebhookTutorialProps) {
  return (
    <div className={`wh-tut ${compact ? 'wh-tut--compact' : ''}`}>
      {!compact && (
        <div className="wh-tut__hero">
          <span className="wh-tut__hero-icon">
            <WebhookIcon size={26} />
          </span>
          <div>
            <h3>Send events to your own server</h3>
            <p>
              Webhooks push real-time events (incoming messages, delivery receipts, session status) to
              any HTTPS endpoint so you can build automations and integrations.
            </p>
          </div>
        </div>
      )}

      <ol className="wh-tut__steps">
        <li>
          <span className="wh-tut__num">1</span>
          <div>
            <strong>Expose an HTTPS endpoint</strong>
            <p>Stand up a URL that accepts <code>POST</code> JSON (e.g. <code>https://api.you.com/wa</code>). For local testing use a tunnel like ngrok.</p>
          </div>
        </li>
        <li>
          <span className="wh-tut__num">2</span>
          <div>
            <strong>Add the webhook here</strong>
            <p>Click <em>Add Webhook</em>, paste your URL, pick the number (session) and the events to receive, and set a secret.</p>
          </div>
        </li>
        <li>
          <span className="wh-tut__num">3</span>
          <div>
            <strong>Verify &amp; go live</strong>
            <p>Use the <em>Test</em> (▶) button to send a sample event, confirm your server returns <code>2xx</code>, and you're live. Failed deliveries retry automatically.</p>
          </div>
        </li>
      </ol>

      <div className="wh-tut__cards">
        <div className="wh-tut__card">
          <Shield size={16} />
          <div>
            <strong>Verify authenticity</strong>
            <p>Every request is signed — check the <code>X-OpenWA-Signature</code> header (HMAC-SHA256 of the body using your secret).</p>
          </div>
        </div>
        <div className="wh-tut__card">
          <Zap size={16} />
          <div>
            <strong>Idempotency</strong>
            <p>De-dupe retries with <code>X-OpenWA-Delivery-Id</code> / <code>X-OpenWA-Idempotency-Key</code>.</p>
          </div>
        </div>
      </div>

      <div className="wh-tut__sample">
        <div className="wh-tut__sample-head">
          <Code2 size={14} /> Example delivery
        </div>
        <pre>{SAMPLE_PAYLOAD}</pre>
      </div>

      {!compact && canWrite && onAddWebhook && (
        <Button variant="primary" icon={<Plus size={16} />} onClick={onAddWebhook}>
          Add your first webhook
        </Button>
      )}
    </div>
  );
}
