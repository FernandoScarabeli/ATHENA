import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtCookieGuard } from "../common/auth";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { AuthController, InviteController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { InviteService } from "./invite.service";
import { PasswordPolicyService } from "./password-policy.service";
import { TransactionalEmailService } from "./transactional-email.service";
@Module({
  imports: [JwtModule.register({})],
  providers: [
    AuthService,
    InviteService,
    TransactionalEmailService,
    PasswordPolicyService,
    AuthRateLimitService,
    JwtCookieGuard,
  ],
  controllers: [AuthController, InviteController],
  exports: [JwtCookieGuard, JwtModule],
})
export class AuthModule {}
