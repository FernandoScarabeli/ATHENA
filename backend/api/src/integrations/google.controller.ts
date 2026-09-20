import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GoogleService } from './google.service';

/** OAuth callback is intentionally public: the one-use state authenticates and binds the flow. */
@Controller('integrations/google/oauth')
export class GoogleOAuthController {
  constructor(private readonly google: GoogleService) {}

  @Get('callback')
  async callback(@Query('state') state: string, @Query('code') code: string, @Res() response: Response) {
    const connection = await this.google.callback(state, code);
    const configuredOrigin = process.env.WEB_ORIGIN?.split(',').map(value => value.trim()).find(Boolean);
    const destination = configuredOrigin ? new URL('/', configuredOrigin) : new URL('/', process.env.GOOGLE_OAUTH_REDIRECT_URI ?? 'http://localhost:3000');
    destination.searchParams.set('integration', 'google');
    destination.searchParams.set('status', 'connected');
    if (connection.workspaceId) destination.searchParams.set('workspaceId', connection.workspaceId);
    return response.redirect(303, destination.toString());
  }
}
