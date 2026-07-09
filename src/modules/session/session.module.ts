import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { Message } from '../message/entities/message.entity';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { WebhookModule } from '../webhook/webhook.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { AudienceModule } from '../audience/audience.module';

@Module({
  // Both WebhookModule and AiAssistantModule are one-directional dependencies (neither imports
  // SessionModule back — the AI module resolves MessageService lazily via ModuleRef), so no
  // forwardRef() is needed. SessionService injects AiAssistantService to run the auto-reply.
  imports: [TypeOrmModule.forFeature([Session, Message], 'data'), WebhookModule, AiAssistantModule, AudienceModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
