import { describe, expect, it } from 'vitest';
import { chronological, makeReport, mileageInMiles, mileageLabel, normalizeRegistration, observations, recordedExpiry, latestTest, dateLabel, type Test } from '../src/index';
const test = (id: string, fields: Partial<Test> = {}): Test => ({ id, completedDate: '2026-01-01T10:00:00Z', odometerValue: '10000', odometerUnit: 'MI', odometerResultType: 'READ', testResult: 'PASSED', ...fields });

describe('record accuracy', () => {
  it('formats retrieval timestamps with fractional seconds and legacy date separators', () => {
    expect(dateLabel('2026-10-09T13:36:22.123Z', true)).toBe('9 Oct 2026, 14:36');
    expect(dateLabel('2020.01.10 09:00:00', true)).toBe('10 Jan 2020, 09:00');
  });
  it('sorts across sources, preserves same-day and identical-time tests and keeps undated records', () => {
    const result = chronological([test('undated', { completedDate: null, dataSource: 'CVS' }), test('pass', { completedDate: '2026-01-01T14:00:00Z' }), test('fail', { completedDate: '2026-01-01T09:00:00Z', testResult: 'FAILED' }), test('equal', { completedDate: '2026-01-01T14:00:00Z' }), test('old', { completedDate: '2025-01-01T12:00:00Z', dataSource: 'DVA NI' })]);
    expect(result.map(test => test.id)).toEqual(['old', 'fail', 'pass', 'equal', 'undated']);
  });
  it('preserves readings, zero, units and non-read reasons; converts only valid comparable readings', () => {
    expect(mileageInMiles(test('km', { odometerValue: '16093.44', odometerUnit: 'KM' }))).toBeCloseTo(10000, 8);
    expect(mileageLabel(test('km', { odometerValue: '16093.44', odometerUnit: 'KM' }))).toBe('16,093.44 km');
    expect(mileageInMiles(test('zero', { odometerValue: '0' }))).toBe(0);
    expect(mileageInMiles(test('missing-unit', { odometerUnit: null }))).toBeNull();
    expect(mileageLabel(test('unreadable', { odometerResultType: 'UNREADABLE' }))).toBe('Unreadable');
    expect(mileageInMiles(test('bad', { odometerValue: '-12' }))).toBeNull();
  });
  it('compares mixed units correctly and links actual decreases without diagnosing them', () => {
    const tests = [test('a', { completedDate: '2024-01-01T10:00:00Z' }), test('b', { completedDate: '2025-01-01T10:00:00Z', odometerValue: '20000', odometerUnit: 'KM' }), test('c', { completedDate: '2026-01-01T10:00:00Z', odometerValue: '11000' })];
    const result = observations(tests);
    expect(result.map(v => v.testIds)).toEqual([['b', 'c']]);
    expect(result[0]?.explanation).toContain('20,000 km'); expect(result[0]?.explanation).toContain('11,000 mi');
    expect(result[0]?.explanation).toContain('1 mi = 1.609344 km');
  });
  it('does not impose an order on identical timestamps or bridge a missing reading', () => {
    expect(observations([test('a'), test('b', { odometerValue: '9999' })])).toEqual([]);
    expect(observations([test('a', { completedDate: '2024-01-01' }), test('b', { completedDate: '2025-01-01', odometerValue: null }), test('c', { odometerValue: '9999' })])).toEqual([]);
  });
  it('does not flag equal mixed-unit readings because of floating-point rounding', () => {
    expect(observations([test('mi', { completedDate: '2025-01-01', odometerValue: '15625' }), test('km', { odometerValue: '25146', odometerUnit: 'KM' })])).toEqual([]);
  });
  it('matches advisory wording only after case/whitespace normalization; deduplicates within a test', () => {
    const result = observations([test('a', { defects: [{ type: 'ADVISORY', text: 'Tyre   worn' }, { type: 'ADVISORY', text: 'Tyre worn' }] }), test('b', { defects: [] }), test('c', { defects: [{ type: 'ADVISORY', text: 'tyre worn' }, { type: 'ADVISORY', text: 'Tyre has damage' }] })]);
    expect(result).toEqual([{ kind: 'repeated-advisory', title: 'Advisory wording recorded in 2 tests', wording: 'Tyre   worn', testIds: ['a', 'c'], explanation: expect.stringContaining('absence from another test is not evidence of repair') }]);
  });
  it('separates latest result and recorded expiry, and never invents an expiry from dates', () => {
    const report = makeReport({ vehicle: { registration: 'AB12CDE', motTests: [test('a', { completedDate: '2025-01-01', expiryDate: '2026-01-01' }), test('b', { completedDate: '2026-01-01', testResult: 'FAILED' })] }, kind: 'dvsa', retrievedAt: '2026-01-01T00:00:00Z' });
    expect(latestTest(report)?.testResult).toBe('FAILED'); expect(recordedExpiry(report)).toBe('2026-01-01');
    expect(recordedExpiry(makeReport({ vehicle: { motTests: [test('a')] }, kind: 'sample', retrievedAt: '2026-01-01T00:00:00Z' }))).toBeNull();
  });
  it('accepts older/NI/dateless plates but rejects path injection and non-registrations', () => {
    expect([' ab12 cde ', 'A1', 'AZ1234', '123 ABC'].map(normalizeRegistration)).toEqual(['AB12CDE', 'A1', 'AZ1234', '123ABC']);
    expect(['../../etc', 'ABCDEFG', '1234', '<script>'].map(normalizeRegistration)).toEqual([null, null, null, null]);
  });
  it('does not choose an arbitrary latest result or mileage predecessor from tied records', () => {
    const tied = [test('old', { completedDate: '2025-01-01' }), test('pass', { odometerValue: '12000' }), test('fail', { odometerValue: '9000', testResult: 'FAILED' })];
    const report = makeReport({ vehicle: { motTests: tied }, kind: 'sample', retrievedAt: '2026-01-01T00:00:00Z' });
    expect(latestTest(report)).toBeUndefined();
    expect(observations([...tied, test('next', { completedDate: '2027-01-01', odometerValue: '10000' })])).toEqual([]);
  });
});
