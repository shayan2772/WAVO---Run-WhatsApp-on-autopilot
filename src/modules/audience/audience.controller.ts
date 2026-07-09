import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { RequireRole, CurrentBusinessId } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AudienceService } from './audience.service';
import { CreateListDto, AddContactDto, OptOutDto } from './dto/audience.dto';

@ApiTags('audiences')
@Controller('audiences')
export class AudienceController {
  constructor(private readonly audience: AudienceService) {}

  @Get()
  @ApiOperation({ summary: 'List the business audiences (contact lists)' })
  listLists(@CurrentBusinessId() businessId: string) {
    return this.audience.listLists(businessId);
  }

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create an audience (contact list)' })
  createList(@CurrentBusinessId() businessId: string, @Body() dto: CreateListDto) {
    return this.audience.createList(businessId, dto.name, dto.description);
  }

  @Get(':listId')
  @ApiOperation({ summary: 'Get an audience' })
  getList(@CurrentBusinessId() businessId: string, @Param('listId') listId: string) {
    return this.audience.getList(businessId, listId);
  }

  @Delete(':listId')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Delete an audience (contacts are kept for opt-out history)' })
  async deleteList(@CurrentBusinessId() businessId: string, @Param('listId') listId: string) {
    await this.audience.deleteList(businessId, listId);
    return { success: true };
  }

  @Get(':listId/contacts')
  @ApiOperation({ summary: 'List contacts in an audience' })
  listContacts(
    @CurrentBusinessId() businessId: string,
    @Param('listId') listId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.audience.listContacts(
      businessId,
      listId,
      limit ? parseInt(limit, 10) : 100,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post(':listId/contacts')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Add a single contact to an audience' })
  addContact(
    @CurrentBusinessId() businessId: string,
    @Param('listId') listId: string,
    @Body() dto: AddContactDto,
  ) {
    return this.audience.upsertContact(
      businessId,
      { phone: dto.phone, name: dto.name, attributes: dto.attributes, source: 'manual' },
      listId,
    );
  }

  @Post(':listId/import')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import a CSV (headers: phone[,name,...merge fields]) into an audience' })
  @UseInterceptors(FileInterceptor('file'))
  importCsv(
    @CurrentBusinessId() businessId: string,
    @Param('listId') listId: string,
    @UploadedFile() file: { buffer: Buffer },
  ) {
    return this.audience.importCsv(businessId, listId, file.buffer);
  }

  @Post('contacts/:contactId/opt-out')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Opt a contact out of all future campaigns' })
  optOut(
    @CurrentBusinessId() businessId: string,
    @Param('contactId') contactId: string,
    @Body() dto: OptOutDto,
  ) {
    return this.audience.optOut(businessId, contactId, dto.reason);
  }
}
