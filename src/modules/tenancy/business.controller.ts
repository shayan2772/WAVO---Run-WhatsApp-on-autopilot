import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { TenancyService } from './tenancy.service';
import { CreateBusinessDto } from './dto/tenancy.dto';

@ApiTags('businesses')
@Controller('businesses')
export class BusinessController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's businesses" })
  list(@CurrentUser() user: { userId: string }) {
    return this.tenancy.listBusinesses(user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new business (caller becomes owner)' })
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateBusinessDto) {
    return this.tenancy.createBusiness(user.userId, dto.name);
  }
}
