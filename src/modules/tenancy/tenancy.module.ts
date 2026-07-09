import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { Business } from './entities/business.entity';
import { BusinessMembership } from './entities/business-membership.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Session } from '../session/entities/session.entity';
import { TenancyService } from './tenancy.service';
import { UserAuthService } from './user-auth.service';
import { TenancyBootstrapService } from './tenancy-bootstrap.service';
import { UserAuthController } from './user-auth.controller';
import { BusinessController } from './business.controller';

// Multi-tenant identity: users, businesses, memberships, refresh tokens. Exports TenancyService +
// UserAuthService so the global AuthModule's UnifiedAuthGuard can verify JWTs and resolve businessId.
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Business, BusinessMembership, RefreshToken, Session], 'data'),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // Sign/verify options are passed explicitly per-call in UserAuthService; the module just needs
      // the default secret so JwtService is constructable.
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtAccessSecret'),
      }),
    }),
  ],
  controllers: [UserAuthController, BusinessController],
  providers: [TenancyService, UserAuthService, TenancyBootstrapService],
  exports: [TenancyService, UserAuthService],
})
export class TenancyModule {}
