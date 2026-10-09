import type { RawVehicle } from './index';

const tyre = 'Nearside Front Tyre worn close to legal limit (5.2.3 (e))';
const tests = [
  ['2019-09-20T10:10:00Z', 'PASSED', '28120', []],
  ['2020-09-18T09:42:00Z', 'PASSED', '35981', []],
  ['2021-09-17T13:05:00Z', 'PASSED', '44207', [{ type: 'ADVISORY', text: 'Offside Rear Brake pipe corroded, covered in grease or other material (1.1.11 (c))', dangerous: false }]],
  ['2022-09-16T11:15:00Z', 'PASSED', '55392', [{ type: 'ADVISORY', text: tyre, dangerous: false }]],
  ['2023-09-15T14:35:00Z', 'PASSED', '67210', []],
  ['2024-09-13T08:50:00Z', 'PASSED', '66500', [{ type: 'MINOR', text: 'Nearside Front Headlamp lens slightly defective (4.1.1 (b) (i))', dangerous: false }]],
  ['2025-09-16T12:20:00Z', 'PASSED', '76982', [{ type: 'ADVISORY', text: tyre, dangerous: false }]],
  ['2026-09-18T08:35:00Z', 'FAILED', '83410', [{ type: 'MAJOR', text: 'Offside Front Headlamp aim too low (4.1.2 (a))', dangerous: false }, { type: 'ADVISORY', text: tyre, dangerous: false }]],
  ['2026-09-18T14:10:00Z', 'PASSED', '83412', [{ type: 'ADVISORY', text: tyre, dangerous: false }]],
] satisfies [string, string, string, { type: string; text: string; dangerous: boolean }[]][];

export const sampleVehicle: RawVehicle = {
  registration: 'DEMO001', make: 'VOLKSWAGEN', model: 'GOLF', primaryColour: 'Grey', fuelType: 'Petrol', firstUsedDate: '2016-09-21',
  motTests: tests.map(([completedDate, testResult, odometerValue, defects], i) => ({
    motTestNumber: `SAMPLE-${i + 1}`, completedDate, testResult, odometerValue, odometerUnit: 'MI', odometerResultType: 'READ', dataSource: 'DVSA',
    expiryDate: testResult === 'PASSED' ? `${Number(completedDate.slice(0, 4)) + 1}-09-17` : null,
    registrationAtTimeOfTest: 'DEMO001', defects,
  })),
};
