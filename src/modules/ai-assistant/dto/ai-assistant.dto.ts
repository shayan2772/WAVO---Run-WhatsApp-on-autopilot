import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class UpdateAiConfigDto {
  @ApiPropertyOptional({ description: 'Activate/deactivate the assistant for this session' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'OpenRouter model id, e.g. anthropic/claude-3.5-sonnet' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string | null;

  @ApiPropertyOptional({ description: 'Persona / behaviour instructions for the assistant' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  systemPrompt?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 4000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4000)
  maxTokens?: number;

  @ApiPropertyOptional({ description: 'How many KB chunks to retrieve', minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;

  @ApiPropertyOptional({ description: 'Min cosine similarity to inject a chunk (0 disables)', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minScore?: number;

  @ApiPropertyOptional({ description: 'Recent messages of memory per contact (0 = single-turn)', minimum: 0, maximum: 40 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(40)
  historyLimit?: number;

  @ApiPropertyOptional({ description: 'Rewrite follow-ups into standalone queries before KB retrieval' })
  @IsOptional()
  @IsBoolean()
  rewriteFollowups?: boolean;

  @ApiPropertyOptional({ description: 'Also reply in group chats (default false = 1:1 only)' })
  @IsOptional()
  @IsBoolean()
  replyToGroups?: boolean;

  @ApiPropertyOptional({ description: 'Comma-separated keywords that suppress the auto-reply (human handoff)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  handoffKeywords?: string | null;

  @ApiPropertyOptional({ description: 'Message sent when the model errors or returns nothing' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fallbackMessage?: string | null;
}

export class AddKnowledgeDto {
  @ApiProperty({ description: 'A short title for this knowledge item' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'The knowledge-base text (FAQ, product info, policies, …)' })
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  content: string;
}

export class TestAssistantDto {
  @ApiProperty({ description: 'A sample inbound message to generate a reply for (no WhatsApp send)' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text: string;
}

export class SnoozeDto {
  @ApiProperty({ description: 'Chat/contact id to take over (e.g. 12345@c.us)' })
  @IsString()
  chatId: string;

  @ApiPropertyOptional({ description: 'Minutes to pause the AI before it auto-resumes (default: config)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number;
}

export class UnsnoozeDto {
  @ApiProperty({ description: 'Chat/contact id to hand back to the AI' })
  @IsString()
  chatId: string;
}
