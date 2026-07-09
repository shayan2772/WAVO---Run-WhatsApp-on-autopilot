import { Injectable, CanActivate, ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Session } from '../../session/entities/session.entity';
import { PUBLIC_KEY, SESSION_SCOPED_KEY } from '../decorators/auth.decorators';

// Cross-business isolation in ONE place: any route carrying a session id (`:sessionId`, or `:id` on a
// @SessionScoped controller) is checked to ensure that session belongs to the request's business.
// Runs as a global guard AFTER the auth guard (which sets request.businessId). A mismatch → 404 (not
// 403) so we never leak the existence of another tenant's session. This covers messages, webhooks,
// templates, ai-assistant, contacts, groups, etc. without editing each controller.
@Injectable()
export class BusinessSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Session, 'data') private readonly sessionRepo: Repository<Session>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { businessId?: string }>();
    const sessionScoped = this.reflector.getAllAndOverride<boolean>(SESSION_SCOPED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const sessionId = (request.params['sessionId'] || (sessionScoped ? request.params['id'] : undefined)) as
      | string
      | undefined;
    if (!sessionId) return true; // not a session-scoped route

    // No resolved tenant (e.g. a legacy null-business super-admin key): allow — the auth guard already
    // authenticated the caller and such keys are operator-level. Backfill stamps real keys/sessions.
    const businessId = request.businessId;
    if (!businessId) return true;

    const session = await this.sessionRepo.findOne({ where: { id: sessionId }, select: ['id', 'businessId'] });
    // If the session doesn't exist, let the downstream handler return its own 404.
    if (!session) return true;
    if (session.businessId && session.businessId !== businessId) {
      throw new NotFoundException('Session not found');
    }
    return true;
  }
}
