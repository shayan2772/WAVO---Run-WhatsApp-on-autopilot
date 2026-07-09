import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '../../common/services/logger.service';
import { withSafeFetch, isSsrfProtectionEnabled } from '../../common/security/ssrf-guard';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

interface EmbeddingResponse {
  data?: Array<{ embedding: number[] }>;
  error?: { message?: string };
}

/**
 * Thin OpenRouter client (OpenAI-compatible). One key drives both chat completions and
 * embeddings, so the whole AI surface is a single provider. Uses the project's SSRF-guarded
 * undici wrapper for parity with webhook delivery (timeout + IP pinning).
 */
@Injectable()
export class OpenRouterService {
  private readonly logger = createLogger('OpenRouterService');

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('openrouter.apiKey'));
  }

  get defaultModel(): string {
    return this.config.get<string>('openrouter.model', 'openai/gpt-4o-mini');
  }

  async chat(
    messages: ChatMessage[],
    opts: { model?: string; temperature?: number; maxTokens?: number } = {},
  ): Promise<string> {
    const body = {
      model: opts.model || this.defaultModel,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 500,
    };
    const data = await this.post<ChatCompletionResponse>('/chat/completions', body);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new ServiceUnavailableException('OpenRouter returned an empty completion');
    }
    return content.trim();
  }

  async embed(texts: string[], model?: string): Promise<number[][]> {
    if (texts.length === 0) return [];
    const body = {
      model: model || this.config.get<string>('openrouter.embeddingModel', 'openai/text-embedding-3-small'),
      input: texts,
    };
    const data = await this.post<EmbeddingResponse>('/embeddings', body);
    if (!data.data || data.data.length !== texts.length) {
      throw new ServiceUnavailableException('OpenRouter returned an unexpected embeddings payload');
    }
    return data.data.map(d => d.embedding);
  }

  private async post<T extends { error?: { message?: string } }>(path: string, body: unknown): Promise<T> {
    const apiKey = this.config.get<string>('openrouter.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException('OPENROUTER_API_KEY is not configured');
    }
    const baseUrl = this.config.get<string>('openrouter.baseUrl', 'https://openrouter.ai/api/v1');
    const timeoutMs = this.config.get<number>('openrouter.timeoutMs', 30000);

    return withSafeFetch<T>(
      `${baseUrl}${path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'OpenWA',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      },
      async response => {
        // Read the body inside the callback — the dispatcher is torn down once this returns.
        const parsed = (await response.json()) as T;
        if (!response.ok) {
          const msg = parsed?.error?.message || `HTTP ${response.status}`;
          this.logger.warn(`OpenRouter ${path} failed: ${msg}`);
          throw new ServiceUnavailableException(`OpenRouter error: ${msg}`);
        }
        return parsed;
      },
      { guard: isSsrfProtectionEnabled() },
    );
  }
}
