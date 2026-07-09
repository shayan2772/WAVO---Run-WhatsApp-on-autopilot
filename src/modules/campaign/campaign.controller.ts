import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequireRole, CurrentBusinessId } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/campaign.dto';

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Get()
  @ApiOperation({ summary: 'List campaigns' })
  list(@CurrentBusinessId() businessId: string) {
    return this.campaigns.list(businessId);
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a campaign (draft)' })
  create(@CurrentBusinessId() businessId: string, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(businessId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a campaign' })
  get(@CurrentBusinessId() businessId: string, @Param('id') id: string) {
    return this.campaigns.get(businessId, id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Recipient status breakdown for a campaign' })
  stats(@CurrentBusinessId() businessId: string, @Param('id') id: string) {
    return this.campaigns.stats(businessId, id);
  }

  @Get(':id/recipients')
  @ApiOperation({ summary: 'Per-recipient delivery rows (sent/failed/pending) for the detail view' })
  recipients(
    @CurrentBusinessId() businessId: string,
    @Param('id') id: string,
    @Query('status') status?: string,
  ) {
    return this.campaigns.recipients(businessId, id, status);
  }

  @Post(':id/start')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Materialize recipients and start (or schedule) sending' })
  start(@CurrentBusinessId() businessId: string, @Param('id') id: string) {
    return this.campaigns.start(businessId, id);
  }

  @Post(':id/pause')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Pause a running campaign' })
  pause(@CurrentBusinessId() businessId: string, @Param('id') id: string) {
    return this.campaigns.pause(businessId, id);
  }

  @Post(':id/resume')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Resume a paused campaign' })
  resume(@CurrentBusinessId() businessId: string, @Param('id') id: string) {
    return this.campaigns.resume(businessId, id);
  }

  @Post(':id/cancel')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Cancel a campaign' })
  cancel(@CurrentBusinessId() businessId: string, @Param('id') id: string) {
    return this.campaigns.cancel(businessId, id);
  }
}
