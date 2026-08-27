import test from 'node:test'; import assert from 'node:assert/strict'; import { AI_WRITE_POLICY, confidenceBand } from './index.js';
test('AI write policy stays service-only',()=>assert.equal(AI_WRITE_POLICY,'NO_DIRECT_DATABASE_WRITES'));
test('confidence bands require clarification/handoff thresholds',()=>{assert.equal(confidenceBand(.95),'HIGH');assert.equal(confidenceBand(.75),'MEDIUM');assert.equal(confidenceBand(.4),'LOW');});
