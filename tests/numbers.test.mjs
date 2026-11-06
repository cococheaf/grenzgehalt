import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNumber} from '../dist/assets/numbers.mjs';
for(const [input,expected]of [['90.000',90000],['90.000,50',90000.5],['90 000,50',90000.5],['90000.50',90000.5],['0',0],['',0]])test(`Betragseingabe ${JSON.stringify(input)}`,()=>assert.equal(parseNumber(input),expected));
for(const input of ['-5','1,2,3','1.2.3','hallo','1e5','Infinity'])test(`Ungültige Eingabe ${input}`,()=>assert.ok(Number.isNaN(parseNumber(input))));
for(const input of ['1,034','1.034','1,0345','1.0345'])test(`Dezimaler Wechselkurs ${input}`,()=>assert.equal(parseNumber(input,false),Number(input.replace(',','.'))));
