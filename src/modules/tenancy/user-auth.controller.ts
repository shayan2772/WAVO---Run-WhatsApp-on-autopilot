import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public, CurrentUser } from '../auth/decorators/auth.decorators';
import { UserAuthService, IssuedTokens } from './user-auth.service';
import { SignupDto, LoginDto, SwitchBusinessDto } from './dto/tenancy.dto';

const REFRESH_COOKIE = 'owa_refresh';
const REFRESH_PATH = '/api/auth';

@ApiTags('auth')
@Controller('auth')
export class UserAuthController {
  constructor(
    private readonly auth: UserAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Create a user + first business, and sign in' })
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.signup(dto.email, dto.password, dto.name || '', dto.businessName || '');
    return this.respondWithTokens(res, tokens);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Sign in with email + password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto.email, dto.password);
    return this.respondWithTokens(res, tokens);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange the refresh cookie for a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!raw) {
      res.status(401);
      return { error: 'No refresh token' };
    }
    const tokens = await this.auth.refresh(raw);
    return this.respondWithTokens(res, tokens);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke refresh tokens and invalidate access tokens' })
  async logout(@CurrentUser() user: { userId: string } | undefined, @Res({ passthrough: true }) res: Response) {
    if (user) await this.auth.logout(user.userId);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
    return { success: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user, businesses, and active business' })
  me(@CurrentUser() user: { userId: string }) {
    return this.auth.me(user.userId);
  }

  @Post('switch-business')
  @ApiOperation({ summary: 'Switch the active business and mint a new access token' })
  async switchBusiness(
    @CurrentUser() user: { userId: string },
    @Body() dto: SwitchBusinessDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.switchBusiness(user.userId, dto.businessId);
    return this.respondWithTokens(res, tokens);
  }

  private respondWithTokens(res: Response, tokens: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.get<boolean>('auth.cookieSecure', false),
      sameSite: 'strict',
      domain: this.config.get<string>('auth.cookieDomain'),
      path: REFRESH_PATH,
      maxAge: this.auth.refreshTtlMs,
    });
    return { accessToken: tokens.accessToken };
  }
}
