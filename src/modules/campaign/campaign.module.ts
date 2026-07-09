import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionModule } from '../session/session.module';
import { MessageModule } from '../message/message.module';
import { AudienceModule } from '../audience/audience.module';
import { Contact } from '../audience/entities/contact.entity';
import { Campaign } from './entities/campaign.entity';
import { CampaignRecipient } from './entities/campaign-recipient.entity';
import { NumberHealth } from './entities/number-health.entity';
import { CampaignService } from './campaign.service';
import { CampaignPacerService } from './campaign-pacer.service';
import { CampaignController } from './campaign.controller';

// Marketing campaigns + the anti-ban send engine. One-directional deps (Session/Message/Audience);
// nothing imports CampaignModule back, so no forwardRef needed.
@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, CampaignRecipient, NumberHealth, Contact], 'data'),
    SessionModule,
    MessageModule,
    AudienceModule,
  ],
  controllers: [CampaignController],
  providers: [CampaignService, CampaignPacerService],
  exports: [CampaignService],
})
export class CampaignModule {}
