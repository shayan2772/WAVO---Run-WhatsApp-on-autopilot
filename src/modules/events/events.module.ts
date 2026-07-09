import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsGateway } from './events.gateway';
import { AuthModule } from '../auth/auth.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { Session } from '../session/entities/session.entity';

@Global()
@Module({
  // TenancyModule → UserAuthService (verify dashboard JWTs); Session repo → scope subscriptions to
  // the business that owns the session.
  imports: [AuthModule, TenancyModule, TypeOrmModule.forFeature([Session], 'data')],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
