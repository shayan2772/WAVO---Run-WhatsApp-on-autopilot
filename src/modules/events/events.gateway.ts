import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { resolveCorsPolicy } from '../../config/bootstrap-security';
import { UserAuthService } from '../tenancy/user-auth.service';
import { Session } from '../session/entities/session.entity';

/**
 * WebSocket CORS origin: reuse the HTTP CORS policy instead of a hardcoded '*'.
 * Dev → allow any origin; production → the configured CORS_ORIGINS allowlist (or none).
 * Read from process.env at module load (real env vars apply; same-origin is unaffected).
 */
function resolveWsCorsOrigin(): boolean | string[] {
  const policy = resolveCorsPolicy(process.env.CORS_ORIGINS, process.env.NODE_ENV);
  return policy.allowAnyOrigin ? true : policy.origins;
}
import type {
  WSClientMessage,
  WSSubscribeRequest,
  WSUnsubscribeRequest,
  WSSubscribedResponse,
  WSUnsubscribedResponse,
  WSEventMessage,
  WSErrorResponse,
  WSPongResponse,
} from './dto/ws-messages.dto';
import { SUBSCRIBABLE_EVENTS, buildRoomName } from './dto/ws-messages.dto';
import type { DeliveryStatus } from '../../engine/interfaces/whatsapp-engine.interface';

/**
 * Whether an API key may subscribe to a session's WebSocket event rooms.
 * An unrestricted key (no `allowedSessions`) may subscribe to anything, including
 * the `*` wildcard. A key scoped to specific sessions may NOT subscribe to `*`
 * (which would receive every session's events) nor to a session outside its
 * allowlist — preventing cross-tenant event leakage (#221).
 */
export function isSessionSubscriptionAllowed(allowedSessions: string[] | null | undefined, sessionId: string): boolean {
  if (!allowedSessions || allowedSessions.length === 0) {
    return true;
  }
  if (sessionId === '*') {
    return false;
  }
  return allowedSessions.includes(sessionId);
}

@WebSocketGateway({
  cors: {
    origin: resolveWsCorsOrigin(),
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('EventsGateway');

  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly userAuth: UserAuthService,
    @InjectRepository(Session, 'data') private readonly sessionRepo: Repository<Session>,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    // Two credential types (never via query string, which leaks into logs):
    //   • dashboard users → a JWT in auth.token / `Authorization: Bearer <jwt>` (scoped to a business)
    //   • dev/programmatic → an API key in auth.apiKey / `X-API-Key` / `Bearer owa_...`
    const handshakeAuth = client.handshake.auth as { token?: string; apiKey?: string } | undefined;
    const bearer =
      typeof client.handshake.headers['authorization'] === 'string' &&
      (client.handshake.headers['authorization'] as string).startsWith('Bearer ')
        ? (client.handshake.headers['authorization'] as string).slice(7)
        : undefined;
    const token = handshakeAuth?.token || (bearer && bearer.split('.').length === 3 ? bearer : undefined);
    const apiKey =
      handshakeAuth?.apiKey ||
      (client.handshake.headers['x-api-key'] as string) ||
      (bearer && bearer.startsWith('owa_') ? bearer : undefined);

    const data = client.data as {
      authType?: 'jwt' | 'apikey';
      businessId?: string;
      rawToken?: string;
      apiKey?: unknown;
      rawApiKey?: string;
    };

    try {
      if (token) {
        const ctx = await this.userAuth.verifyAccessToken(token);
        data.authType = 'jwt';
        data.businessId = ctx.businessId;
        data.rawToken = token; // re-verified on each subscribe (catches expiry/removal)
        this.logger.log(`Client connected: ${client.id} (business: ${ctx.businessId})`);
        return;
      }
      if (apiKey) {
        const validKey = await this.authService.validateApiKey(apiKey);
        data.authType = 'apikey';
        data.apiKey = validKey;
        data.rawApiKey = apiKey;
        this.logger.log(`Client connected: ${client.id} (key: ${validKey.name})`);
        return;
      }
      this.logger.warn(`Client ${client.id} rejected: no credentials`);
      void this.auditService.logWarn(AuditAction.API_KEY_AUTH_FAILED, {
        ipAddress: client.handshake.address,
        metadata: { surface: 'websocket' },
        errorMessage: 'missing credentials',
      });
      client.emit('message', this.createError('UNAUTHORIZED', 'Authentication required'));
      client.disconnect();
    } catch (error) {
      this.logger.warn(`Client ${client.id} rejected: Auth error`, {
        error: error instanceof Error ? error.message : String(error),
      });
      void this.auditService.logWarn(AuditAction.API_KEY_AUTH_FAILED, {
        ipAddress: client.handshake.address,
        metadata: { surface: 'websocket' },
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      client.emit('message', this.createError('UNAUTHORIZED', 'Authentication failed'));
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('message')
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() message: WSClientMessage) {
    switch (message.type) {
      case 'subscribe':
        return this.handleSubscribe(client, message);
      case 'unsubscribe':
        return this.handleUnsubscribe(client, message);
      case 'ping':
        return this.handlePing(client, message.requestId);
      default:
        return this.createError(
          'INVALID_MESSAGE',
          `Unknown message type`,
          (message as { requestId?: string }).requestId,
        );
    }
  }

  private async handleSubscribe(
    client: Socket,
    message: WSSubscribeRequest,
  ): Promise<WSSubscribedResponse | WSErrorResponse> {
    const { sessionId, events, requestId } = message;

    // Validate sessionId
    if (!sessionId || typeof sessionId !== 'string') {
      return this.createError('INVALID_SESSION', 'sessionId is required', requestId);
    }

    const data = client.data as { authType?: 'jwt' | 'apikey'; rawToken?: string; rawApiKey?: string };

    // Resolve the concrete session ids this client may join (isolation-scoped), re-checking the
    // credential live so a revoked key / expired-or-removed user is caught mid-connection.
    let targetSessionIds: string[];
    if (data.authType === 'jwt') {
      let businessId: string;
      try {
        ({ businessId } = await this.userAuth.verifyAccessToken(data.rawToken ?? ''));
      } catch {
        client.emit('message', this.createError('UNAUTHORIZED', 'Session no longer valid', requestId));
        client.disconnect();
        return this.createError('UNAUTHORIZED', 'Session no longer valid', requestId);
      }
      if (sessionId === '*') {
        // Expand '*' to ONLY this business's sessions — never the global wildcard rooms, so a user
        // can't receive another tenant's events.
        const owned = await this.sessionRepo.find({ where: { businessId }, select: ['id'] });
        targetSessionIds = owned.map(s => s.id);
      } else {
        const session = await this.sessionRepo.findOne({ where: { id: sessionId }, select: ['id', 'businessId'] });
        if (!session || session.businessId !== businessId) {
          return this.createError('FORBIDDEN_SESSION', 'Not authorized for this session', requestId);
        }
        targetSessionIds = [sessionId];
      }
    } else {
      // API-key path: re-validate the key and enforce its allowedSessions scope (unchanged behavior;
      // '*' stays a real wildcard for unrestricted keys).
      const rawApiKey = data.rawApiKey;
      let subscriberKey: { allowedSessions?: string[] | null } | null;
      try {
        subscriberKey = rawApiKey ? await this.authService.validateApiKey(rawApiKey) : null;
      } catch {
        subscriberKey = null;
      }
      if (!subscriberKey) {
        client.emit('message', this.createError('UNAUTHORIZED', 'API key is no longer valid', requestId));
        client.disconnect();
        return this.createError('UNAUTHORIZED', 'API key is no longer valid', requestId);
      }
      if (!isSessionSubscriptionAllowed(subscriberKey.allowedSessions, sessionId)) {
        return this.createError('FORBIDDEN_SESSION', 'API key is not authorized for this session', requestId);
      }
      targetSessionIds = [sessionId];
    }

    // Validate events
    if (!events || !Array.isArray(events) || events.length === 0) {
      return this.createError('INVALID_EVENTS', 'events array is required', requestId);
    }
    const validEvents = events.filter(
      e => e === '*' || SUBSCRIBABLE_EVENTS.includes(e as (typeof SUBSCRIBABLE_EVENTS)[number]),
    );
    if (validEvents.length === 0) {
      return this.createError(
        'INVALID_EVENTS',
        `No valid events. Valid: ${SUBSCRIBABLE_EVENTS.join(', ')}, *`,
        requestId,
      );
    }

    // Join a room per (resolved session, event). For a JWT '*' this is the business's session set;
    // for an API key it's the single sessionId (possibly the real '*' wildcard).
    const rooms: string[] = [];
    for (const sid of targetSessionIds) {
      for (const event of validEvents) {
        const room = buildRoomName(sid, event);
        void client.join(room);
        rooms.push(room);
      }
    }

    this.logger.debug(`Client ${client.id} subscribed to: ${rooms.join(', ')}`);

    return {
      type: 'subscribed',
      sessionId,
      events: validEvents,
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  private handleUnsubscribe(client: Socket, message: WSUnsubscribeRequest): WSUnsubscribedResponse {
    const { sessionId, requestId } = message;

    // Leave all rooms for this session
    const clientRooms = Array.from(client.rooms);
    const sessionPrefix = `session:${sessionId}:`;

    for (const room of clientRooms) {
      if (room.startsWith(sessionPrefix) || (sessionId === '*' && room.startsWith('session:'))) {
        void client.leave(room);
      }
    }

    this.logger.debug(`Client ${client.id} unsubscribed from session: ${sessionId}`);

    return {
      type: 'unsubscribed',
      sessionId,
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  private handlePing(_client: Socket, requestId?: string): WSPongResponse {
    return {
      type: 'pong',
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  private createError(code: string, message: string, requestId?: string): WSErrorResponse {
    return {
      type: 'error',
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  // ========== Event Emission Methods (room-based) ==========

  /**
   * Emit event to specific rooms based on sessionId and event type
   */
  private emitToRooms(sessionId: string, event: string, data: unknown): void {
    const eventMessage: WSEventMessage = {
      type: 'event',
      payload: { event, sessionId, data },
      timestamp: new Date().toISOString(),
    };

    // Emit once to the specific room + the three wildcard rooms. Chaining .to()
    // unions the rooms into a single broadcast, so a socket joined to several of
    // them receives the event exactly once (Socket.IO dedups recipients per
    // broadcast). Four separate .emit() calls would deliver one copy per room.
    this.server
      .to(buildRoomName(sessionId, event))
      .to(buildRoomName(sessionId, '*'))
      .to(buildRoomName('*', event))
      .to(buildRoomName('*', '*'))
      .emit('message', eventMessage);
  }

  /**
   * Emit session status change
   */
  emitSessionStatus(sessionId: string, status: string, data?: Record<string, unknown>) {
    this.emitToRooms(sessionId, 'session.status', { status, ...data });
  }

  /**
   * Emit session authenticated (engine reached READY). Mirrors the webhook payload.
   */
  emitSessionAuthenticated(sessionId: string, data: { phone: string; pushName: string }) {
    this.emitToRooms(sessionId, 'session.authenticated', data);
  }

  /**
   * Emit session disconnected. Carries the `reason` that the session.status flip drops.
   */
  emitSessionDisconnected(sessionId: string, data: { reason: string }) {
    this.emitToRooms(sessionId, 'session.disconnected', data);
  }

  /**
   * Emit QR code update for a session
   */
  emitQRCode(sessionId: string, qrCode: string) {
    this.emitToRooms(sessionId, 'session.qr', { qrCode });
  }

  /**
   * Emit new message notification
   */
  emitMessage(sessionId: string, message: Record<string, unknown>) {
    this.emitToRooms(sessionId, 'message.received', message);
  }

  /**
   * Emit message sent notification
   */
  emitMessageSent(sessionId: string, message: Record<string, unknown>) {
    this.emitToRooms(sessionId, 'message.sent', message);
  }

  /**
   * Emit a live delivery-status update. The payload mirrors the `message.ack` webhook exactly
   * (`id`, `messageId`, neutral `status`, and the deprecated legacy numeric `ack`) so a socket
   * client and a webhook consumer see the same shape.
   */
  emitMessageAck(sessionId: string, data: { id: string; messageId: string; status: DeliveryStatus; ack: number }) {
    this.emitToRooms(sessionId, 'message.ack', data);
  }

  /**
   * Emit message revoked ("deleted for everyone") notification
   */
  emitMessageRevoked(sessionId: string, message: Record<string, unknown>) {
    this.emitToRooms(sessionId, 'message.revoked', message);
  }

  /**
   * Emit message reaction notification
   */
  emitMessageReaction(sessionId: string, data: Record<string, unknown>) {
    this.emitToRooms(sessionId, 'message.reaction', data);
  }

  /**
   * Emit an AI-handoff alert: the assistant has paused itself for a chat and a human should take
   * over. The dashboard reacts by ringing + raising a desktop notification and deep-linking to the
   * chat. `snoozedUntil` (ISO) tells the UI how long the AI stays silent.
   */
  emitAiHandoff(
    sessionId: string,
    data: { chatId: string; reason: string; snoozedUntil: string | null; contactName?: string; preview?: string },
  ) {
    this.emitToRooms(sessionId, 'ai.handoff', data);
  }
}
