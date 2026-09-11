import { z } from 'zod';
export const ImpactResponseSchema=z.object({summary:z.string(),items:z.array(z.object({requirementId:z.string().uuid(),severity:z.enum(['LOW','MEDIUM','HIGH']),rationale:z.string().min(1),suggestedRelationType:z.enum(['RELATED_TO','DEPENDS_ON','BLOCKS','CONFLICTS_WITH']).optional()}))});
export type ImpactResponse=z.infer<typeof ImpactResponseSchema>; export interface AiProvider { embed(text:string):Promise<number[]>; analyseImpact(input:unknown):Promise<ImpactResponse>; }
