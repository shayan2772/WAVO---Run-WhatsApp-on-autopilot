import { MessageSquare, Send, Bot, Users } from 'lucide-react';
import { BrandMark } from './BrandMark';

// Left brand panel shared by the login and signup screens.
export function AuthBrand() {
  return (
    <div className="auth-brand">
      <div className="auth-brand__logo">
        <BrandMark size={40} withWordmark />
      </div>
      <div>
        <h1 className="auth-brand__headline">WhatsApp marketing &amp; support, on autopilot.</h1>
        <p className="auth-brand__sub">
          Connect your numbers, send campaigns safely, and let an AI agent handle replies — with a human
          takeover whenever you want.
        </p>
      </div>
      <ul className="auth-brand__features">
        <li>
          <Send size={20} /> Bulk campaigns with smart anti-ban pacing
        </li>
        <li>
          <Bot size={20} /> AI auto-replies from your own knowledge base
        </li>
        <li>
          <MessageSquare size={20} /> Live shared inbox with human takeover
        </li>
        <li>
          <Users size={20} /> Multiple numbers &amp; teammates per business
        </li>
      </ul>
    </div>
  );
}
