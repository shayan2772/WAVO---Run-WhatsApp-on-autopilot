import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { TenancyService } from './tenancy.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { MembershipRole } from './entities/business-membership.entity';

export interface AccessClaims {
  sub: string; // userId
  bid: string | null; // active businessId
  role: MembershipRole;
  tv: number; // tokenVersion
}

// The resolved identity the UnifiedAuthGuard attaches to a JWT request.
export interface AuthedUserContext {
  userId: string;
  businessId: string;
  role: MembershipRole;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class UserAuthService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(RefreshToken, 'data') private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  // ---- Flows -------------------------------------------------------------

  async signup(email: string, password: string, name: string, businessName: string): Promise<IssuedTokens> {
    if (!password || password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const passwordHash = await this.tenancy.hashPassword(password);
    const { user, business } = await this.tenancy.createUserWithBusiness(
      email,
      passwordHash,
      name || email.split('@')[0],
      businessName || `${(name || 'My').split(' ')[0]}'s Workspace`,
    );
    return this.issueTokens(user.id, business.id, MembershipRole.OWNER, user.tokenVersion);
  }

  async login(email: string, password: string): Promise<IssuedTokens> {
    const user = await this.tenancy.findUserByEmail(email);
    if (!user || !user.isActive || !(await this.tenancy.verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const businessId = user.activeBusinessId ?? (await this.tenancy.getMemberships(user.id))[0]?.businessId ?? null;
    if (!businessId) throw new UnauthorizedException('Account has no business');
    const membership = await this.tenancy.getMembership(user.id, businessId);
    return this.issueTokens(user.id, businessId, membership?.role ?? MembershipRole.VIEWER, user.tokenVersion);
  }

  async me(userId: string): Promise<unknown> {
    const user = await this.tenancy.findUserById(userId);
    if (!user) throw new UnauthorizedException();
    const businesses = await this.tenancy.listBusinesses(userId);
    const memberships = await this.tenancy.getMemberships(userId);
    const roleByBiz = new Map(memberships.map(m => [m.businessId, m.role]));
    return {
      user: { id: user.id, email: user.email, name: user.name },
      activeBusinessId: user.activeBusinessId,
      businesses: businesses.map(b => ({ id: b.id, name: b.name, role: roleByBiz.get(b.id) })),
    };
  }

  async switchBusiness(userId: string, businessId: string): Promise<IssuedTokens> {
    const membership = await this.tenancy.getMembership(userId, businessId);
    if (!membership) throw new UnauthorizedException('Not a member of that business');
    await this.tenancy.setActiveBusiness(userId, businessId);
    const user = await this.tenancy.findUserById(userId);
    return this.issueTokens(userId, businessId, membership.role, user!.tokenVersion);
  }

  /** Rotate: verify the presented refresh token, delete it, mint a fresh access+refresh pair. */
  async refresh(rawRefreshToken: string): Promise<IssuedTokens> {
    const hash = this.hashToken(rawRefreshToken);
    const row = await this.refreshRepo.findOne({ where: { tokenHash: hash } });
    if (!row || new Date(row.expiresAt).getTime() < Date.now()) {
      if (row) await this.refreshRepo.delete({ id: row.id });
      throw new UnauthorizedException('Refresh token invalid or expired');
    }
    await this.refreshRepo.delete({ id: row.id }); // rotate
    const user = await this.tenancy.findUserById(row.userId);
    if (!user || !user.isActive) throw new UnauthorizedException();
    const businessId = user.activeBusinessId ?? (await this.tenancy.getMemberships(user.id))[0]?.businessId ?? null;
    if (!businessId) throw new UnauthorizedException('Account has no business');
    const membership = await this.tenancy.getMembership(user.id, businessId);
    return this.issueTokens(user.id, businessId, membership?.role ?? MembershipRole.VIEWER, user.tokenVersion);
  }

  async logout(userId: string): Promise<void> {
    await this.refreshRepo.delete({ userId });
    await this.tenancy.bumpTokenVersion(userId); // invalidate outstanding access tokens
  }

  // ---- Used by the UnifiedAuthGuard --------------------------------------

  /** Verify an access JWT and resolve the live business/role. Throws on any failure. */
  async verifyAccessToken(token: string): Promise<AuthedUserContext> {
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        secret: this.config.get<string>('auth.jwtAccessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const user = await this.tenancy.findUserById(claims.sub);
    if (!user || !user.isActive || user.tokenVersion !== claims.tv) {
      throw new UnauthorizedException('Session no longer valid');
    }
    if (!claims.bid) throw new UnauthorizedException('No active business');
    // Never trust the claim alone — re-check live membership so a removed member loses access now.
    const membership = await this.tenancy.getMembership(user.id, claims.bid);
    if (!membership) throw new UnauthorizedException('No longer a member of this business');
    return { userId: user.id, businessId: claims.bid, role: membership.role };
  }

  // ---- Internals ---------------------------------------------------------

  private async issueTokens(userId: string, businessId: string, role: MembershipRole, tv: number): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, bid: businessId, role, tv } satisfies AccessClaims,
      {
        secret: this.config.get<string>('auth.jwtAccessSecret'),
        expiresIn: this.config.get<number>('auth.jwtAccessTtl', 3600),
      },
    );
    const refreshToken = await this.createRefreshToken(userId);
    return { accessToken, refreshToken };
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const raw = crypto.randomBytes(32).toString('hex');
    const days = this.config.get<number>('auth.refreshTtlDays', 30);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await this.refreshRepo.save(this.refreshRepo.create({ userId, tokenHash: this.hashToken(raw), expiresAt }));
    // Opportunistic cleanup of this user's expired tokens.
    await this.refreshRepo.delete({ userId, expiresAt: LessThan(new Date().toISOString()) });
    return raw;
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  get refreshTtlMs(): number {
    return this.config.get<number>('auth.refreshTtlDays', 30) * 24 * 60 * 60 * 1000;
  }
}
