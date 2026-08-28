import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryRecipient } from './ai-business-tools.js';
test('AI reply recipient preserves group JID and normalizes direct phone',()=>{
 assert.equal(deliveryRecipient('60123456789@s.whatsapp.net'),'+60123456789');
 assert.equal(deliveryRecipient('60132195990-1508049801@g.us'),'60132195990-1508049801@g.us');
});
