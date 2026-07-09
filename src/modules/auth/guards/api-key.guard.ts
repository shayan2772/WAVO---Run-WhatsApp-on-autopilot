import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { ApiKeyRole } from '../entities/api-key.entity';
import { REQUIRED_ROLE_KEY, PUBLIC_KEY, SESSION_SCOPED_KEY } from '../decorators/auth.decorators';
import { resolveClientIp } from '../../../common/utils/ip';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';
import { UserAuthService, AuthedUserContext } from '../../tenancy/user-auth.service';
import { MembershipRole } from '../../tenancy/entities/business-membership.entity';

// Unified auth: one global guard that accepts EITHER a dev API key (X-API-Key / Bearer owa_...) or a
// dashboard user JWT (Bearer <jwt>). Both paths resolve a common request.businessId used by every
// business-scoped controller. Keeping the class name preserves the APP_GUARD registration.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly userAuth: UserAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    try {
      return await this.authorize(request, context);
    } catch (err) {
      // Record rejected/denied authentication attempts so the audit log has a forensic trail for
      // credential probing. Fire-and-forget: audit logging is best-effort and must never turn a
      // 401/403 into a failure of the guard itself.
      if (err instanceof UnauthorizedException || err instanceof ForbiddenException) {
        void this.auditService.logWarn(AuditAction.API_KEY_AUTH_FAILED, {
          ipAddress: this.getClientIp(request),
          method: request.method,
          path: request.path,
          errorMessage: err.message,
        });
      }
      throw err;
    }
  }

  private async authorize(request: Request, context: ExecutionContext): Promise<boolean> {
    const credential = this.extractCredential(request);
    if (!credential) {
      throw new UnauthorizedException('Authentication is required');
    }

    const requiredRole = this.reflector.getAllAndOverride<ApiKeyRole>(REQUIRED_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (credential.type === 'jwt') {
      return this.authorizeJwt(request, credential.token, requiredRole);
    }
    return this.authorizeApiKey(request, context, credential.token, requiredRole);
  }

  private async authorizeApiKey(
    request: Request,
    context: ExecutionContext,
    apiKeyHeader: string,
    requiredRole: ApiKeyRole | undefined,
  ): Promise<boolean> {
    // Resolve the session id used for the key's allowedSessions scope. `:sessionId` is always a
    // session; the bare `:id` param is only a session on controllers marked @SessionScoped (i.e.
    // SessionController) — on other routes `:id` is an unrelated resource id (API key, plugin, …)
    // and must NOT be fed to the allowedSessions check, which would spuriously deny a scoped key.
    const sessionScoped = this.reflector.getAllAndOverride<boolean>(SESSION_SCOPED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const sessionId = (request.params['sessionId'] || (sessionScoped ? request.params['id'] : undefined)) as
      | string
      | undefined;
    const clientIp = this.getClientIp(request);

    const apiKey = await this.authService.validateApiKey(apiKeyHeader, clientIp, sessionId);

    if (requiredRole && !this.authService.hasPermission(apiKey, requiredRole)) {
      throw new ForbiddenException(`Insufficient permissions. Required: ${requiredRole}`);
    }

    (request as Request & { apiKey: typeof apiKey }).apiKey = apiKey;
    (request as Request & { clientIp?: string }).clientIp = clientIp;
    // Common tenant key — dev API is per-business.
    (request as Request & { businessId?: string }).businessId = apiKey.businessId ?? undefined;
    return true;
  }

  private async authorizeJwt(
    request: Request,
    token: string,
    requiredRole: ApiKeyRole | undefined,
  ): Promise<boolean> {
    const ctx: AuthedUserContext = await this.userAuth.verifyAccessToken(token);
    if (requiredRole && !this.membershipSatisfies(ctx.role, requiredRole)) {
      throw new ForbiddenException(`Insufficient permissions. Required: ${requiredRole}`);
    }
    (request as Request & { user?: AuthedUserContext }).user = ctx;
    (request as Request & { businessId?: string }).businessId = ctx.businessId;
    return true;
  }

  // Project both role systems onto one numeric scale so existing @RequireRole(ApiKeyRole.X) works for
  // JWT users too. ApiKey: viewer<operator<admin. Membership: viewer<member<admin<owner.
  private membershipSatisfies(role: MembershipRole, required: ApiKeyRole): boolean {
    const membershipLevel: Record<MembershipRole, number> = {
      [MembershipRole.VIEWER]: 1,
      [MembershipRole.MEMBER]: 2,
      [MembershipRole.ADMIN]: 3,
      [MembershipRole.OWNER]: 4,
    };
    const requiredLevel: Record<ApiKeyRole, number> = {
      [ApiKeyRole.VIEWER]: 1,
      [ApiKeyRole.OPERATOR]: 2,
      [ApiKeyRole.ADMIN]: 3,
    };
    return membershipLevel[role] >= requiredLevel[required];
  }

  private extractCredential(request: Request): { type: 'apikey' | 'jwt'; token: string } | undefined {
    const xApiKey = request.headers['x-api-key'] as string;
    if (xApiKey) return { type: 'apikey', token: xApiKey };

    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // Discriminate: OpenWA API keys are `owa_...`; a JWT is three dot-separated base64url segments.
      if (token.startsWith('owa_')) return { type: 'apikey', token };
      if (token.split('.').length === 3) return { type: 'jwt', token };
      return { type: 'apikey', token }; // legacy/master key fallback
    }
    return undefined;
  }

  /**
   * Resolve the real client IP used for the API key's allowedIps whitelist.
   *
   * X-Forwarded-For is client-controllable, so it is only honored when the
   * request actually arrives from a configured trusted proxy (TRUSTED_PROXIES).
   * With no trusted proxies configured, the header is ignored entirely and the
   * direct socket address is used — preventing IP-whitelist spoofing.
   */
  private getClientIp(request: Request): string {
    const trustedProxies = this.configService.get<string[]>('security.trustedProxies') ?? [];
    return resolveClientIp(request, trustedProxies);
  }
}
