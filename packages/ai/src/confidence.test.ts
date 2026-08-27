import test from'node:test';import assert from'node:assert/strict';import{decideConfidence}from'./confidence.js';
const base:any={intent:'BOOK',confidence:.95,language:'ms',entities:{service:'facial',date:'2026-09-01',time:'15:00',pax:null,staff:null,resource:null,location:null,budgetMinor:null},missing:[],reason:'clear'};
test('high complete intent executes',()=>assert.equal(decideConfidence(base).action,'EXECUTE'));
test('missing entity always asks clarification',()=>{const d=decideConfidence({...base,missing:['time']});assert.equal(d.action,'CLARIFY');assert.match(d.question??'',/Waktu/);});
test('medium confidence clarifies and low confidence hands off',()=>{assert.equal(decideConfidence({...base,confidence:.8}).action,'CLARIFY');assert.equal(decideConfidence({...base,confidence:.4}).action,'HANDOFF');});
test('explicit handoff never auto executes',()=>assert.equal(decideConfidence({...base,intent:'HANDOFF'}).action,'HANDOFF'));
