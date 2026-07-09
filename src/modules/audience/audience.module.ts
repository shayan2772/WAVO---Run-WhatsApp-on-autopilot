import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from './entities/contact.entity';
import { ContactList } from './entities/contact-list.entity';
import { ContactListMembership } from './entities/contact-list-membership.entity';
import { AudienceService } from './audience.service';
import { AudienceController } from './audience.controller';

// Audiences: stored marketing contacts, lists, CSV import, and global opt-out. Exported so the
// campaign engine can resolve recipients and the inbound handler can process STOP keywords.
@Module({
  imports: [TypeOrmModule.forFeature([Contact, ContactList, ContactListMembership], 'data')],
  controllers: [AudienceController],
  providers: [AudienceService],
  exports: [AudienceService],
})
export class AudienceModule {}
