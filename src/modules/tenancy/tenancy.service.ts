import { Injectable, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { Business } from './entities/business.entity';
import { BusinessMembership, MembershipRole } from './entities/business-membership.entity';

// Data + password layer for tenancy. Auth flows/JWT live in UserAuthService.
@Injectable()
export class TenancyService {
  constructor(
    @InjectRepository(User, 'data') private readonly userRepo: Repository<User>,
    @InjectRepository(Business, 'data') private readonly businessRepo: Repository<Business>,
    @InjectRepository(BusinessMembership, 'data') private readonly membershipRepo: Repository<BusinessMembership>,
    private readonly config: ConfigService,
  ) {}

  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.config.get<number>('auth.bcryptRounds', 12));
  }

  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  findUserByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  /** Create a user + their first business + owner membership atomically. */
  async createUserWithBusiness(
    email: string,
    passwordHash: string,
    name: string,
    businessName: string,
  ): Promise<{ user: User; business: Business; membership: BusinessMembership }> {
    const normEmail = email.trim().toLowerCase();
    if (await this.findUserByEmail(normEmail)) {
      throw new ConflictException('An account with this email already exists');
    }
    // Use a transaction on the data connection so a half-created account can't linger.
    const ds = this.userRepo.manager.connection as DataSource;
    return ds.transaction(async manager => {
      const user = await manager.save(
        manager.create(User, { email: normEmail, passwordHash, name, isActive: true, tokenVersion: 0 }),
      );
      const business = await manager.save(
        manager.create(Business, { name: businessName, ownerUserId: user.id }),
      );
      const membership = await manager.save(
        manager.create(BusinessMembership, {
          userId: user.id,
          businessId: business.id,
          role: MembershipRole.OWNER,
        }),
      );
      user.activeBusinessId = business.id;
      await manager.save(user);
      return { user, business, membership };
    });
  }

  getMemberships(userId: string): Promise<BusinessMembership[]> {
    return this.membershipRepo.find({ where: { userId } });
  }

  getMembership(userId: string, businessId: string): Promise<BusinessMembership | null> {
    return this.membershipRepo.findOne({ where: { userId, businessId } });
  }

  async listBusinesses(userId: string): Promise<Business[]> {
    const memberships = await this.getMemberships(userId);
    if (memberships.length === 0) return [];
    return this.businessRepo.find({ where: { id: In(memberships.map(m => m.businessId)) } });
  }

  async createBusiness(userId: string, name: string): Promise<Business> {
    const business = await this.businessRepo.save(this.businessRepo.create({ name, ownerUserId: userId }));
    await this.membershipRepo.save(
      this.membershipRepo.create({ userId, businessId: business.id, role: MembershipRole.OWNER }),
    );
    return business;
  }

  async setActiveBusiness(userId: string, businessId: string): Promise<void> {
    await this.userRepo.update({ id: userId }, { activeBusinessId: businessId });
  }

  async bumpTokenVersion(userId: string): Promise<void> {
    await this.userRepo.increment({ id: userId }, 'tokenVersion', 1);
  }
}
