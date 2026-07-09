import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAssistantConfig } from './entities/ai-assistant-config.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { KnowledgeChunk } from './entities/knowledge-chunk.entity';
import { ConversationTurn } from './entities/conversation-turn.entity';
import { ContactAiState } from './entities/contact-ai-state.entity';
import { Session } from '../session/entities/session.entity';
import { OpenRouterService } from './openrouter.service';
import { KnowledgeService } from './knowledge.service';
import { AiAssistantService } from './ai-assistant.service';
import { AiAssistantController } from './ai-assistant.controller';

// First-class, always-compiled feature (not a plugin). It deliberately does NOT import MessageModule:
// that would form a module cycle (AI → Message → Session → AI). Instead AiAssistantService resolves
// MessageService lazily via ModuleRef at reply time, so the module graph stays one-directional
// (SessionModule → AiAssistantModule only).
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [AiAssistantConfig, KnowledgeDocument, KnowledgeChunk, ConversationTurn, ContactAiState, Session],
      'data',
    ),
  ],
  controllers: [AiAssistantController],
  providers: [
    OpenRouterService,
    KnowledgeService,
    AiAssistantService,
    // String-token alias so SessionService can inject the assistant WITHOUT a runtime import of the
    // class (a value import would form the file cycle session → ai → message → session). SessionService
    // uses `import type` for the annotation + @Inject('AI_ASSISTANT_SERVICE') for the token.
    { provide: 'AI_ASSISTANT_SERVICE', useExisting: AiAssistantService },
  ],
  exports: [AiAssistantService, 'AI_ASSISTANT_SERVICE'],
})
export class AiAssistantModule {}
