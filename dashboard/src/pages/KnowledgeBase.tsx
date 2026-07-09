import { useEffect, useRef, useState } from 'react';
import { Brain, Upload, Plus, Trash2, Loader2, FlaskConical, FileText, Save, Bot } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { sessionApi, aiAssistantApi, type Session, type AiConfig, type KnowledgeDoc, type RagTestResult } from '../services/api';
import { formatPhoneDisplay } from '../utils/phone';
import './KnowledgeBase.css';

// Popular OpenRouter models the user can pick without knowing model ids. "" = use the server default.
const MODELS: Array<{ id: string; label: string }> = [
  { id: '', label: 'Default — GPT-4o mini (fast & low cost)' },
  { id: 'openai/gpt-4o', label: 'GPT-4o — most capable (OpenAI)' },
  { id: 'google/gemini-flash-1.5', label: 'Gemini 1.5 Flash — fast (Google)' },
  { id: 'google/gemini-pro-1.5', label: 'Gemini 1.5 Pro — smart (Google)' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat — capable & cheap' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet — great writing (Anthropic)' },
  { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B — open model (Meta)' },
];
const MODEL_IDS = new Set(MODELS.map(m => m.id).filter(Boolean));

export function KnowledgeBase() {
  useDocumentTitle('AI Assistant');
  const { success: ok, error: err } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // add-document form
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDoc, setConfirmDoc] = useState<KnowledgeDoc | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // config save
  const [saving, setSaving] = useState(false);

  // test playground
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<RagTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    sessionApi
      .list()
      .then(list => {
        setSessions(list);
        if (list.length && !sessionId) setSessionId(list[0].id);
      })
      .catch(() => err('Failed to load numbers'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFor = (id: string) => {
    if (!id) return;
    aiAssistantApi
      .getConfig(id)
      .then(setConfig)
      .catch(() => setConfig(null));
    aiAssistantApi.listKnowledge(id).then(setDocs).catch(() => setDocs([]));
    setTestResult(null);
  };
  useEffect(() => {
    if (sessionId) loadFor(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const patch = (p: Partial<AiConfig>) => setConfig(c => (c ? { ...c, ...p } : c));

  const toggleEnabled = async (next: boolean) => {
    if (!sessionId) return;
    patch({ enabled: next });
    try {
      await (next ? aiAssistantApi.enable(sessionId) : aiAssistantApi.disable(sessionId));
      ok(next ? 'AI assistant enabled' : 'AI assistant disabled');
    } catch (e) {
      patch({ enabled: !next });
      err('Could not update', e instanceof Error ? e.message : undefined);
    }
  };

  const saveConfig = async () => {
    if (!sessionId || !config) return;
    setSaving(true);
    try {
      // Send ONLY the whitelisted config fields — the API rejects unknown props (id/createdAt/…).
      const payload = {
        model: config.model,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        topK: config.topK,
        minScore: config.minScore,
        historyLimit: config.historyLimit,
        rewriteFollowups: config.rewriteFollowups,
        replyToGroups: config.replyToGroups,
        handoffKeywords: config.handoffKeywords,
        fallbackMessage: config.fallbackMessage,
      };
      const saved = await aiAssistantApi.updateConfig(sessionId, payload);
      setConfig(saved);
      ok('Settings saved');
    } catch (e) {
      err('Could not save settings', e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const addDoc = async (t: string, c: string) => {
    if (!sessionId || !t.trim() || !c.trim()) {
      err('Give the document a title and some content');
      return;
    }
    setAdding(true);
    try {
      await aiAssistantApi.addKnowledge(sessionId, t.trim(), c.trim());
      setTitle('');
      setContent('');
      aiAssistantApi.listKnowledge(sessionId).then(setDocs).catch(() => {});
      ok('Added to knowledge base', 'Chunked & embedded for retrieval.');
    } catch (e) {
      err('Could not add document', e instanceof Error ? e.message : undefined);
    } finally {
      setAdding(false);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await addDoc(file.name.replace(/\.[^.]+$/, ''), text);
    } catch {
      err('Could not read the file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deleteDoc = async () => {
    if (!sessionId || !confirmDoc) return;
    setDeletingDoc(true);
    try {
      await aiAssistantApi.deleteKnowledge(sessionId, confirmDoc.id);
      setDocs(prev => prev.filter(d => d.id !== confirmDoc.id));
      ok('Document removed');
      setConfirmDoc(null);
    } catch (e) {
      err('Could not delete', e instanceof Error ? e.message : undefined);
    } finally {
      setDeletingDoc(false);
    }
  };

  const runTest = async () => {
    if (!sessionId || !testInput.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await aiAssistantApi.test(sessionId, testInput.trim()));
    } catch (e) {
      err('Test failed', e instanceof Error ? e.message : undefined);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="page"><div className="mkt-loading"><Loader2 className="animate-spin" size={28} /></div></div>;
  }

  return (
    <div className="page">
      <PageHeader
        title="AI Assistant"
        subtitle="Upload your knowledge base and tune how the AI auto-replies"
        actions={
          <select value={sessionId} onChange={e => setSessionId(e.target.value)} style={{ maxWidth: 280 }}>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.phone ? formatPhoneDisplay(s.phone) : '—'})</option>
            ))}
          </select>
        }
      />

      <ConfirmDialog
        open={!!confirmDoc}
        title="Delete document"
        message={
          <p style={{ margin: 0 }}>
            Remove <strong>{confirmDoc?.title}</strong> from the knowledge base? The AI will no longer use it.
          </p>
        }
        loading={deletingDoc}
        onConfirm={deleteDoc}
        onCancel={() => setConfirmDoc(null)}
      />

      {sessions.length === 0 ? (
        <div className="mkt-empty-state">
          <Bot size={32} />
          <p>Connect a WhatsApp number first, then set up its AI assistant here.</p>
        </div>
      ) : (
        <div className="kb-grid">
          {/* LEFT: knowledge base + settings */}
          <div className="kb-col">
            {/* Enable toggle */}
            <div className="kb-card kb-toggle">
              <div>
                <div className="kb-card__title"><Bot size={17} /> Auto-reply</div>
                <p className="kb-hint">When on, the AI answers incoming messages from the knowledge base below.</p>
              </div>
              <label className="kb-switch">
                <input type="checkbox" checked={!!config?.enabled} onChange={e => toggleEnabled(e.target.checked)} />
                <span className="kb-switch__slider" />
              </label>
            </div>

            {/* Knowledge base */}
            <div className="kb-card">
              <div className="kb-card__title"><Brain size={17} /> Knowledge base</div>
              <p className="kb-hint">
                Docs are chunked, embedded, and retrieved at reply time (RAG). Shared across this business's numbers.
              </p>

              <div className="kb-add">
                <input placeholder="Document title (e.g. Pricing, FAQ, Hours)" value={title} onChange={e => setTitle(e.target.value)} />
                <textarea
                  placeholder="Paste the content here — business info, FAQs, policies, product details…"
                  rows={4}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                />
                <div className="kb-add__actions">
                  <Button variant="primary" icon={<Plus size={15} />} loading={adding} onClick={() => addDoc(title, content)}>
                    Add document
                  </Button>
                  <Button icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
                    Upload file (.txt/.md/.csv)
                  </Button>
                  <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv,.json,text/*" hidden onChange={onUpload} />
                </div>
              </div>

              <div className="kb-docs">
                {docs.length === 0 ? (
                  <div className="kb-docs__empty"><FileText size={22} /><span>No documents yet — add or upload one above.</span></div>
                ) : (
                  docs.map(d => (
                    <div key={d.id} className="kb-doc">
                      <FileText size={16} />
                      <div className="kb-doc__info">
                        <span className="kb-doc__title">{d.title}</span>
                        <span className="kb-doc__meta">
                          {d.chunkCount != null ? `${d.chunkCount} chunks` : ''}
                          {d.charCount != null ? ` · ${d.charCount.toLocaleString()} chars` : ''}
                        </span>
                      </div>
                      <button className="kb-doc__del" onClick={() => setConfirmDoc(d)} title="Delete"><Trash2 size={15} /></button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* RAG / behavior settings */}
            {config && (
              <div className="kb-card">
                <div className="kb-card__title"><FlaskConical size={17} /> How the AI behaves</div>
                <p className="kb-hint">Plain-language settings — hover the tips under each one. Defaults work well; tweak only if needed.</p>
                <div className="kb-fields">
                  <label className="kb-field kb-field--full">
                    <span className="kb-field__label">AI instructions &amp; personality</span>
                    <small className="kb-field__help">Tell the AI who it is and how to reply — its role, tone, and any rules.</small>
                    <textarea rows={3} value={config.systemPrompt ?? ''} onChange={e => patch({ systemPrompt: e.target.value })}
                      placeholder="You're the support assistant for Acme Co. Be friendly and only answer using our info." />
                  </label>

                  <label className="kb-field kb-field--full">
                    <span className="kb-field__label">AI model</span>
                    <small className="kb-field__help">Which AI brain to use. Faster/cheaper vs. smarter — all via OpenRouter.</small>
                    <select
                      value={config.model && MODEL_IDS.has(config.model) ? config.model : ''}
                      onChange={e => patch({ model: e.target.value || null })}
                    >
                      {MODELS.map(m => <option key={m.id || 'default'} value={m.id}>{m.label}</option>)}
                    </select>
                  </label>

                  <label className="kb-field">
                    <span className="kb-field__label">How much info to look up: {config.topK}</span>
                    <small className="kb-field__help">Pieces of your knowledge base pulled in per answer. More = broader.</small>
                    <input type="range" min={1} max={10} value={config.topK} onChange={e => patch({ topK: Number(e.target.value) })} />
                  </label>

                  <label className="kb-field">
                    <span className="kb-field__label">How closely it must match: {config.minScore.toFixed(2)}</span>
                    <small className="kb-field__help">Higher = only very relevant info is used (fewer wrong answers, more "not sure").</small>
                    <input type="range" min={0} max={1} step={0.01} value={config.minScore} onChange={e => patch({ minScore: Number(e.target.value) })} />
                  </label>

                  <label className="kb-field">
                    <span className="kb-field__label">Creativity: {config.temperature.toFixed(2)}</span>
                    <small className="kb-field__help">Low = precise &amp; consistent. High = more varied wording.</small>
                    <input type="range" min={0} max={1} step={0.05} value={config.temperature} onChange={e => patch({ temperature: Number(e.target.value) })} />
                  </label>

                  <label className="kb-field">
                    <span className="kb-field__label">Maximum reply length</span>
                    <small className="kb-field__help">Roughly how long each reply can be (in tokens; ~1 word = 1.3).</small>
                    <input type="number" value={config.maxTokens} onChange={e => patch({ maxTokens: Number(e.target.value) })} />
                  </label>

                  <label className="kb-field">
                    <span className="kb-field__label">Conversation memory</span>
                    <small className="kb-field__help">How many past messages the AI remembers in a chat.</small>
                    <input type="number" value={config.historyLimit} onChange={e => patch({ historyLimit: Number(e.target.value) })} />
                  </label>

                  <label className="kb-field kb-field--check">
                    <input type="checkbox" checked={config.rewriteFollowups} onChange={e => patch({ rewriteFollowups: e.target.checked })} />
                    <span>Understand follow-up questions <small>(rephrases "and the price?" into a full question so it finds the right info)</small></span>
                  </label>

                  <label className="kb-field kb-field--full">
                    <span className="kb-field__label">Hand over to a human on these words</span>
                    <small className="kb-field__help">If a customer types any of these, the AI pauses so a person can take over.</small>
                    <input value={config.handoffKeywords ?? ''} onChange={e => patch({ handoffKeywords: e.target.value || null })} placeholder="human, agent, representative" />
                  </label>

                  <label className="kb-field kb-field--full">
                    <span className="kb-field__label">What to say when it's unsure</span>
                    <small className="kb-field__help">Sent if the AI has no good answer or hits an error.</small>
                    <input value={config.fallbackMessage ?? ''} onChange={e => patch({ fallbackMessage: e.target.value || null })} placeholder="Sorry, let me connect you with a teammate." />
                  </label>
                </div>
                <Button variant="primary" icon={<Save size={15} />} loading={saving} onClick={saveConfig}>Save settings</Button>
              </div>
            )}
          </div>

          {/* RIGHT: test playground */}
          <div className="kb-col">
            <div className="kb-card kb-test">
              <div className="kb-card__title"><FlaskConical size={17} /> Test the assistant</div>
              <p className="kb-hint">Ask a question the way a customer would — see the reply and which chunks were retrieved. No message is sent.</p>
              <textarea rows={2} placeholder="e.g. What are your opening hours?" value={testInput} onChange={e => setTestInput(e.target.value)} />
              <Button variant="primary" icon={<FlaskConical size={15} />} loading={testing} onClick={runTest} block>Run test</Button>

              {testResult && (
                <div className="kb-result">
                  <div className="kb-result__reply">
                    <span className="kb-result__label">Reply</span>
                    <div className="kb-bubble">{testResult.reply}</div>
                  </div>
                  <div className="kb-result__chunks">
                    <span className="kb-result__label">Retrieved ({testResult.retrieved.length})</span>
                    {testResult.retrieved.length === 0 ? (
                      <p className="kb-hint">Nothing matched above the relevance threshold — lower minScore or add more docs.</p>
                    ) : (
                      testResult.retrieved.map((r, i) => (
                        <div key={i} className="kb-chunk">
                          <span className={`kb-score ${r.score >= 0.5 ? 'good' : r.score >= 0.3 ? 'mid' : 'low'}`}>{r.score.toFixed(3)}</span>
                          <span className="kb-chunk__text">{r.preview}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
