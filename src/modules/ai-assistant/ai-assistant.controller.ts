import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequireRole, CurrentBusinessId } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AiAssistantService } from './ai-assistant.service';
import { KnowledgeService } from './knowledge.service';
import { UpdateAiConfigDto, AddKnowledgeDto, TestAssistantDto, SnoozeDto, UnsnoozeDto } from './dto/ai-assistant.dto';
import { CurrentUser } from '../auth/decorators/auth.decorators';

@ApiTags('ai-assistant')
@Controller('sessions/:sessionId/ai-assistant')
export class AiAssistantController {
  constructor(
    private readonly assistant: AiAssistantService,
    private readonly knowledge: KnowledgeService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the AI assistant config for a session' })
  getConfig(@Param('sessionId') sessionId: string) {
    return this.assistant.getConfig(sessionId);
  }

  @Put()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update the AI assistant config (persona, model, toggles)' })
  updateConfig(@Param('sessionId') sessionId: string, @Body() dto: UpdateAiConfigDto) {
    return this.assistant.updateConfig(sessionId, dto);
  }

  @Post('enable')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Activate the AI assistant for this session' })
  enable(@Param('sessionId') sessionId: string) {
    return this.assistant.setEnabled(sessionId, true);
  }

  @Post('disable')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Deactivate the AI assistant for this session' })
  disable(@Param('sessionId') sessionId: string) {
    return this.assistant.setEnabled(sessionId, false);
  }

  // The knowledge base is per-business (shared across the business's numbers). It stays under the
  // session route for convenience; businessId is resolved from the authenticated caller.
  @Get('knowledge')
  @ApiOperation({ summary: 'List the business knowledge-base documents' })
  listKnowledge(@CurrentBusinessId() businessId: string) {
    return this.knowledge.listDocuments(businessId);
  }

  @Post('knowledge')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Add a knowledge-base document (chunked + embedded on save)' })
  addKnowledge(
    @CurrentBusinessId() businessId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: AddKnowledgeDto,
  ) {
    return this.knowledge.addDocument(businessId, sessionId, dto.title, dto.content);
  }

  @Delete('knowledge/:documentId')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Delete a knowledge-base document and its chunks' })
  async deleteKnowledge(@CurrentBusinessId() businessId: string, @Param('documentId') documentId: string) {
    await this.knowledge.deleteDocument(businessId, documentId);
    return { success: true };
  }

  @Post('test')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Generate a reply for a sample message without sending it (playground)' })
  test(@Param('sessionId') sessionId: string, @Body() dto: TestAssistantDto) {
    return this.assistant.test(sessionId, dto.text);
  }

  // ---- Human takeover / snooze (support inbox) ----
  @Get('chat-state')
  @ApiOperation({ summary: 'Get the AI takeover/snooze state for a chat' })
  chatState(@Param('sessionId') sessionId: string, @Query('chatId') chatId: string) {
    return this.assistant.getChatState(sessionId, chatId);
  }

  @Post('snooze')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Take over a chat: pause the AI (auto-resumes after the snooze window)' })
  snooze(
    @Param('sessionId') sessionId: string,
    @Body() dto: SnoozeDto,
    @CurrentUser() user?: { userId: string },
  ) {
    return this.assistant.snooze(sessionId, dto.chatId, dto.minutes, user?.userId);
  }

  @Post('unsnooze')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Hand a chat back to the AI immediately' })
  async unsnooze(@Param('sessionId') sessionId: string, @Body() dto: UnsnoozeDto) {
    await this.assistant.unsnooze(sessionId, dto.chatId);
    return { success: true };
  }
}
