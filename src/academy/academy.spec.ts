import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, attendanceProblem, isoWeekday, monthStart, sessionDates, summarizeAttendance } from './academy';

describe('dates', () => {
  it('knows the weekday', () => {
    assert.equal(isoWeekday('2026-11-23'), 1); // Monday
    assert.equal(isoWeekday('2026-11-29'), 7); // Sunday
    assert.equal(isoWeekday('2026-11-26'), 4); // Thursday
  });
  it('adds days across month and year ends', () => {
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  });
});

describe('sessionDates', () => {
  it('lists each matching weekday, ends included', () => {
    assert.deepEqual(sessionDates(4, '2026-11-26', '2026-12-10'), ['2026-11-26', '2026-12-03', '2026-12-10']);
  });
  it('starts on the first matching day after from', () => {
    assert.deepEqual(sessionDates(1, '2026-11-26', '2026-12-08'), ['2026-11-30', '2026-12-07']);
  });
  it('returns nothing for a backwards or too-short range', () => {
    assert.deepEqual(sessionDates(1, '2026-12-08', '2026-11-26'), []);
    assert.deepEqual(sessionDates(1, '2026-11-26', '2026-11-27'), []);
  });
});

describe('monthStart', () => {
  it('accepts a month', () => assert.equal(monthStart('2026-12'), '2026-12-01'));
  it('refuses nonsense', () => {
    for (const bad of ['2026-13', '2026-00', '2026-1', '2026-12-01', 'December']) assert.equal(monthStart(bad), null);
  });
});

describe('attendanceProblem', () => {
  it('allows today and the past', () => {
    assert.equal(attendanceProblem('2026-11-25', '2026-11-25', false), null);
    assert.equal(attendanceProblem('2026-11-18', '2026-11-25', false), null);
  });
  it('refuses the future and cancelled sessions', () => {
    assert.equal(attendanceProblem('2026-11-26', '2026-11-25', false), 'FUTURE_SESSION');
    assert.equal(attendanceProblem('2026-11-18', '2026-11-25', true), 'CANCELLED');
  });
});

describe('summarizeAttendance', () => {
  it('does not count excused sessions against a child', () => {
    const s = summarizeAttendance(['PRESENT', 'PRESENT', 'ABSENT', 'EXCUSED']);
    assert.deepEqual(s, { present: 2, absent: 1, excused: 1, percent: 67 });
  });
  it('has no percentage with nothing to count', () => {
    assert.equal(summarizeAttendance([]).percent, null);
    assert.equal(summarizeAttendance(['EXCUSED']).percent, null);
  });
});
