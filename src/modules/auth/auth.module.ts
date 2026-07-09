import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ApiKey } from './entities/api-key.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthValidateController } from './auth-validate.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { BusinessSessionGuard } from './guards/business-session.guard';
import { ProxyAwareThrottlerGuard } from '../../common/security/proxy-aware-throttler.guard';
import { TenancyModule } from '../tenancy/tenancy.module';
import { Session } from '../session/entities/session.entity';

@Global()
@Module({
  // TenancyModule provides UserAuthService (JWT verify + businessId resolution) to the unified guard.
  // Session repo ('data') is needed by BusinessSessionGuard for cross-business ownership checks.
  imports: [TypeOrmModule.forFeature([ApiKey], 'main'), TypeOrmModule.forFeature([Session], 'data'), TenancyModule],
  controllers: [AuthController, AuthValidateController],
  providers: [
    AuthService,
    // Guard order matters (APP_GUARDs are AND-composed, run in registration order): throttle →
    // authenticate (sets request.businessId) → enforce session belongs to that business.
    {
      provide: APP_GUARD,
      useClass: ProxyAwareThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BusinessSessionGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
