import test from 'node:test';
import assert from 'node:assert/strict';
import { EvolutionConnectionProvider } from './evolution.js';
test('connected state resolves phone from Evolution ownerJid fallback',async()=>{
 const calls:string[]=[];const original=globalThis.fetch;
 globalThis.fetch=async(input)=>{const url=String(input);calls.push(url);if(url.includes('/instance/connectionState/'))return new Response(JSON.stringify({instance:{state:'open'}}),{status:200});if(url.includes('/instance/fetchInstances'))return new Response(JSON.stringify([{instance:{ownerJid:'60123456789@s.whatsapp.net'}}]),{status:200});return new Response('{}',{status:404});};
 try{const p=new EvolutionConnectionProvider('http://evolution','k');const state=await p.state('wsb-test');assert.equal(state.status,'CONNECTED');assert.equal(state.phoneE164,'+60123456789');assert.equal(calls.length,2);}finally{globalThis.fetch=original;}
});
