import { IsArray, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CampaignMessageTemplate, CampaignSchedule } from '../entities/campaign.entity';

export class CreateCampaignDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Message: { type: text|image|video|document, text?, mediaUrl?, caption?, filename? }' })
  @IsObject()
  messageTemplate: CampaignMessageTemplate;

  @ApiProperty({ description: 'Target audience list ids', type: [String] })
  @IsArray()
  @IsString({ each: true })
  targetListIds: string[];

  @ApiProperty({ description: 'Sending WhatsApp session ids (the number pool)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  sessionIds: string[];

  @ApiPropertyOptional({ description: 'Scheduling/pacing overrides (startAt, timezone, send window, delays, dailyCap)' })
  @IsOptional()
  @IsObject()
  schedule?: CampaignSchedule;
}
