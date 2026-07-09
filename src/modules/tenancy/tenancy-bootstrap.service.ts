import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { createLogger } from '../../common/services/logger.service';
import { User } from './entities/user.entity';
import { Business } from './entities/business.entity';
import { BusinessMembership, MembershipRole } from './entities/business-membership.entity';
import { Session } from '../session/entities/session.entity';
import { TenancyService } from './tenancy.service';

const DEFAULT_SLUG = 'default-workspace';

// Upgrade path: when the app boots and finds pre-existing WhatsApp sessions that predate multi-tenancy
// (businessId IS NULL), create a "Default Workspace" business + an owner login and assign those
// sessions to it — so existing data keeps working and is reachable via the dashboard. Runs once
// effectively (idempotent: no orphan sessions → no-op). The boot-generated admin API key is left with
// a null business on purpose (operator/super-admin).
@Injectable()
export class TenancyBootstrapService implements OnApplicationBootstrap {
  private readonly logger = createLogger('TenancyBootstrap');

  constructor(
    @InjectRepository(User, 'data') private readonly userRepo: Repository<User>,
    @InjectRepository(Business, 'data') private readonly businessRepo: Repository<Business>,
    @InjectRepository(BusinessMembership, 'data') private readonly membershipRepo: Repository<BusinessMembership>,
    @InjectRepository(Session, 'data') private readonly sessionRepo: Repository<Session>,
    private readonly tenancy: TenancyService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    let orphanSessions: number;
    try {
      orphanSessions = await this.sessionRepo.count({ where: { businessId: IsNull() } });
    } catch {
      // Schema not ready yet (e.g. migrations pending); skip — a later boot will handle it.
      return;
    }
    if (orphanSessions === 0) return; // fresh install or already migrated

    const business = await this.ensureDefaultBusiness();
    await this.sessionRepo.update({ businessId: IsNull() }, { businessId: business.id });
    this.logger.log(`Backfilled ${orphanSessions} pre-existing session(s) to "Default Workspace"`, {
      action: 'tenancy_backfill',
      businessId: business.id,
      count: orphanSessions,
    });
  }

  private async ensureDefaultBusiness(): Promise<Business> {
    const existing = await this.businessRepo.findOne({ where: { slug: DEFAULT_SLUG } });
    if (existing) return existing;

    const email = (process.env.AUTH_DEFAULT_EMAIL || 'admin@openwa.local').toLowerCase();
    let user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      const password = process.env.AUTH_DEFAULT_PASSWORD || crypto.randomBytes(6).toString('hex');
      user = await this.userRepo.save(
        this.userRepo.create({
          email,
          passwordHash: await this.tenancy.hashPassword(password),
          name: 'Administrator',
          isActive: true,
          tokenVersion: 0,
        }),
      );
      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.log('  Default Workspace owner login created (change the password after first login):');
      this.logger.log(`     email:    ${email}`);
      this.logger.log(`     password: ${password}`);
      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    const business = await this.businessRepo.save(
      this.businessRepo.create({ name: 'Default Workspace', slug: DEFAULT_SLUG, ownerUserId: user.id }),
    );
    await this.membershipRepo.save(
      this.membershipRepo.create({ userId: user.id, businessId: business.id, role: MembershipRole.OWNER }),
    );
    if (!user.activeBusinessId) {
      await this.userRepo.update({ id: user.id }, { activeBusinessId: business.id });
    }
    return business;
  }
}
