import test from 'node:test';
import assert from 'node:assert/strict';
import {validDailyDate,shiftDailyDate,todayDate} from './daily.js';

test('date navigation handles months, years and leap days',()=>{
  assert.equal(shiftDailyDate('2026-11-01',-1),'2026-10-31');
  assert.equal(shiftDailyDate('2026-12-31',1),'2027-01-01');
  assert.equal(shiftDailyDate('2028-02-28',1),'2028-02-29');
  assert.equal(shiftDailyDate('2026-02-28',1),'2026-03-01');
  for(const value of ['',null,'2026-02-29','2026-13-01','2026-2-01','0000-01-01']) assert.equal(validDailyDate(value),false);
  assert.equal(shiftDailyDate('0001-01-01',-1),null);
  assert.equal(shiftDailyDate('9999-12-31',1),null);
});

test('today uses Taipei date across UTC midnight boundaries',()=>{
  assert.equal(todayDate(new Date('2026-10-31T16:30:00Z')),'2026-11-01');
  assert.equal(todayDate(new Date('2026-11-01T15:59:00Z')),'2026-11-01');
});
