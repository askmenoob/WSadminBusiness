import test from 'node:test'; import assert from 'node:assert/strict'; import { assertPositiveMinutes } from './index.js';
test('booking duration requires positive integer minutes',()=>{assert.equal(assertPositiveMinutes(30,'duration'),30);assert.throws(()=>assertPositiveMinutes(0,'duration'));});
