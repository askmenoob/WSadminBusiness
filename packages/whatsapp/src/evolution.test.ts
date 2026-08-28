import test from 'node:test';
import assert from 'node:assert/strict';
import { EvolutionConnectionProvider } from './evolution.js';
test('connected state resolves phone from Evolution ownerJid fallback',async()=>{
 const calls:string[]=[];const original=globalThis.fetch;
 globalThis.fetch=async(input)=>{const url=String(input);calls.push(url);if(url.includes('/instance/connectionState/'))return new Response(JSON.stringify({instance:{state:'open'}}),{status:200});if(url.includes('/instance/fetchInstances'))return new Response(JSON.stringify([{instance:{ownerJid:'60123456789@s.whatsapp.net'}}]),{status:200});return new Response('{}',{status:404});};
 try{const p=new EvolutionConnectionProvider('http://evolution','k');const state=await p.state('wsb-test');assert.equal(state.status,'CONNECTED');assert.equal(state.phoneE164,'+60123456789');assert.equal(calls.length,2);}finally{globalThis.fetch=original;}
});
test('provision configures Evolution webhook for inbound events',async()=>{
 const calls:Array<{url:string;body:any}>=[];const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{const url=String(input);const body=init?.body?JSON.parse(String(init.body)):null;calls.push({url,body});if(url.endsWith('/instance/create'))return new Response(JSON.stringify({instance:{status:'connecting'}}),{status:201});if(url.includes('/webhook/set/'))return new Response(JSON.stringify({enabled:true}),{status:201});return new Response('{}',{status:200});};
 try{const p=new EvolutionConnectionProvider('http://evolution','k',{url:'http://api:15280/api/v1/webhooks/evolution',token:'uat-token'});await p.provision('wsb-test');assert.equal(calls.length,2);assert.match(calls[1]!.url,/\/webhook\/set\/wsb-test$/);assert.equal(calls[1]!.body.webhook.headers['x-wsadmin-webhook-token'],'uat-token');assert.ok(calls[1]!.body.webhook.events.includes('MESSAGES_UPSERT'));}finally{globalThis.fetch=original;}
});
