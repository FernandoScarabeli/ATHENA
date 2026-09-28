import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { RequirementsController, WorkspaceController } from './requirements.controller';
import { RequirementsService } from './requirements.service';
import { IntegrationCrypto } from '../integrations/crypto.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { GithubAdapter } from '../integrations/github.adapter';
import { GithubService } from '../integrations/github.service';
import { GoogleAdapter } from '../integrations/google.adapter';
import { GoogleCredentialsService } from '../integrations/google-credentials.service';
import { GoogleService } from '../integrations/google.service';
import { GoogleOAuthController } from '../integrations/google.controller';
import { GoogleSyncService } from '../integrations/google-sync.service';
import { OpenProjectAdapter } from '../integrations/openproject.adapter';
import { OpenProjectService } from '../integrations/openproject.service';
import { IntegrationMappingsService } from '../integrations/integration-mappings.service';
import { ExternalTasksService } from '../integrations/external-tasks.service';
import { IntegrationActivityService } from '../integrations/integration-activity.service';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';

@Module({
  imports: [AuthModule, JwtModule.register({})],
  providers: [RequirementsService, AccessService, IntegrationCrypto, IntegrationsService, GithubAdapter, GithubService, GoogleAdapter, GoogleCredentialsService, GoogleService, GoogleSyncService, OpenProjectAdapter, OpenProjectService, IntegrationMappingsService, ExternalTasksService, IntegrationActivityService],
  exports: [IntegrationsService, GithubService, GoogleService, GoogleSyncService],
  controllers: [RequirementsController, WorkspaceController, AccessController, GoogleOAuthController],
})
export class RequirementsModule {}
