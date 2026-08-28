import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAiProviderRegistryFromEnv } from './openai-compatible.js';
import { createTranscriptionProviderFromEnv } from './transcription.js';
test('AI providers can load OpenAI key from secret file',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wsb-ai-secret-')),file=join(dir,'key');writeFileSync(file,'sk-test-secret-file\n');
 const before={key:process.env.OPENAI_API_KEY,file:process.env.OPENAI_API_KEY_FILE,groq:process.env.GROQ_API_KEY};
 try{delete process.env.OPENAI_API_KEY;delete process.env.GROQ_API_KEY;process.env.OPENAI_API_KEY_FILE=file;assert.equal(createAiProviderRegistryFromEnv().get('OPENAI').name,'OPENAI');assert.equal(createTranscriptionProviderFromEnv()?.name,'OPENAI');}
 finally{if(before.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before.key;if(before.file===undefined)delete process.env.OPENAI_API_KEY_FILE;else process.env.OPENAI_API_KEY_FILE=before.file;if(before.groq===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=before.groq;rmSync(dir,{recursive:true,force:true});}
});
