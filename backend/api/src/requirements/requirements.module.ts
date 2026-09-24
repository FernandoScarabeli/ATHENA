import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { RequirementsController, WorkspaceController } from './requirements.controller';
import { RequirementsService } from './requirements.service';
import { AiSuggestionService } from '../ai/ai-suggestion.service';
import { AiAnalysisJobService } from '../ai/ai-analysis-job.service';
import { AI_PROVIDER, AiProvider } from '../ai/ai.provider';
import { OllamaProvider } from '../ai/ollama.provider';
import { IntegrationCrypto } from '../integrations/crypto.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { GithubAdapter } from '../integrations/github.adapter';
import { GithubService } from '../integrations/github.service';
import { GoogleAdapter } from '../integrations/google.adapter';
import { GoogleCredentialsService } from '../integrations/google-credentials.service';
import { GoogleService } from '../integrations/google.service';
import { GoogleOAuthController } from '../integrations/google.controller';
import { GoogleSyncService } from '../integrations/google-sync.service';

@Module({
  imports: [AuthModule, JwtModule.register({})],
  providers: [RequirementsService, AiSuggestionService, AiAnalysisJobService, IntegrationCrypto, IntegrationsService, GithubAdapter, GithubService, GoogleAdapter, GoogleCredentialsService, GoogleService, GoogleSyncService, { provide: AI_PROVIDER, useFactory: (): AiProvider | null => { const configured = (process.env.AI_PROVIDER ?? 'disabled').trim().toLowerCase(); return configured === 'ollama' ? new OllamaProvider() : null; } }],
  exports: [AiSuggestionService, AiAnalysisJobService, IntegrationsService, GithubService, GoogleService, GoogleSyncService],
  controllers: [RequirementsController, WorkspaceController, GoogleOAuthController],
})
export class RequirementsModule {}
