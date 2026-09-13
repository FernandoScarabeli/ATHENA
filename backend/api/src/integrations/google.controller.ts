import { Controller, Get, Query } from '@nestjs/common';
import { GoogleService } from './google.service';

/** OAuth callback is intentionally public: the one-use state authenticates and binds the flow. */
@Controller('integrations/google/oauth')
export class GoogleOAuthController {
  constructor(private readonly google: GoogleService) {}

  @Get('callback')
  callback(@Query('state') state: string, @Query('code') code: string) {
    return this.google.callback(state, code);
  }
}
