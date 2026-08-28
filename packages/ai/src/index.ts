export const AI_WRITE_POLICY='NO_DIRECT_DATABASE_WRITES' as const;
export type AiActionDecision={intent:string;confidence:number;requiresHuman:boolean;reason:string};
export function confidenceBand(value:number){if(value>=0.9)return'HIGH';if(value>=0.7)return'MEDIUM';return'LOW';}
export * from './router.js';
export * from './openai-compatible.js';
export * from './intent.js';
export * from './confidence.js';
export * from './orchestrator.js';
export * from './security.js';
export * from './knowledge.js';
export * from './memory.js';
export * from './multimodal.js';
export * from './transcription.js';
