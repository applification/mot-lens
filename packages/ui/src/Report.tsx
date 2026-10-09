import { useId, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, CircleHelp, Code2, Expand, FileText, Minus, X } from 'lucide-react';
import { chronological, dateLabel, latestDatedTests, latestTest, mileageInMiles, mileageLabel, recordedExpiry, timestamp, type Report as VehicleReport, type Test } from '@mot-lens/domain';
import './styles.css';

export interface ReportProps {
  report: VehicleReport; selectedId: string | null; expanded: boolean;
  onSelect: (test: Test) => void; onExpand: () => void; onExplain: (test: Test) => void;
  contextStatus: string; actionError: string | null; explaining: boolean; canExplain: boolean;
}
const titleCase = (value: string) => value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
function Result({ result, compact = false }: { result: Test['testResult']; compact?: boolean }) {
  const kind = result === 'PASSED' ? 'pass' : result === 'FAILED' ? 'fail' : 'unknown';
  const Icon = kind === 'pass' ? Check : kind === 'fail' ? X : Minus;
  return <span className={`result ${kind} ${compact ? 'small' : ''}`}><Icon size={compact ? 13 : 16} aria-hidden="true" />{kind === 'pass' ? 'Passed' : kind === 'fail' ? 'Failed' : result === 'AMBIGUOUS' ? 'Multiple results' : 'Not recorded'}</span>;
}

function MileageChart({ report, selectedId, onSelect, compact }: Pick<ReportProps, 'report' | 'selectedId' | 'onSelect'> & { compact: boolean }) {
  const [unit, setUnit] = useState<'mi' | 'km'>('mi'); const description = useId();
  const dated = chronological(report.tests).filter(test => timestamp(test.completedDate) !== null);
  const entries = dated.flatMap(test => { const miles = mileageInMiles(test); const at = timestamp(test.completedDate);
    return miles === null || at === null ? [] : [{ test, value: unit === 'mi' ? miles : miles * 1.609344, at }]; });
  const times = entries.map(e => e.at); const values = entries.map(e => e.value);
  const start = Math.min(...times); const end = Math.max(...times);
  const max = Math.max(1, ...values); const ceiling = Math.ceil(max / 20000) * 20000;
  const width = 760; const height = compact ? 165 : 218; const left = 54; const right = 734; const bottom = height - 28; const top = 16;
  const x = (at: number) => end === start ? (left + right) / 2 : left + (at - start) / (end - start) * (right - left);
  const y = (value: number) => bottom - value / ceiling * (bottom - top);
  // Keep gaps for unreadable/missing readings instead of implying continuity.
  const segments: string[] = []; let points: string[] = [];
  const counts = new Map<number, number>();
  for (const test of dated) { const at = timestamp(test.completedDate); if (at !== null) counts.set(at, (counts.get(at) ?? 0) + 1); }
  for (const test of dated) {
    const entry = entries.find(e => e.test.id === test.id);
    if (!entry || (counts.get(entry.at) ?? 0) > 1) { if (points.length) segments.push(points.join(' ')); points = []; }
    else points.push(`${x(entry.at)},${y(entry.value)}`);
  }
  if (points.length) segments.push(points.join(' '));
  const years = [...new Set(entries.map(e => new Date(e.at).getUTCFullYear()))];
  const mixed = new Set(entries.map(e => e.test.odometerUnit)).size > 1;
  return <section className={`chart-section ${compact ? 'compact-chart' : ''}`} aria-label="Mileage history">
    <div className="section-heading"><div><p className="eyebrow">Mileage history</p><h2>The miles, over time</h2></div>
      <div className="segmented" aria-label="Chart mileage units"><button aria-pressed={unit === 'mi'} onClick={() => setUnit('mi')}>Miles</button><button aria-pressed={unit === 'km'} onClick={() => setUnit('km')}>Km</button></div>
    </div>
    {entries.length ? <>
      <p id={description} className="chart-description">Select a reading to explore its test. {mixed ? 'Mixed units converted for this chart (1 mi = 1.609344 km).' : unit === 'km' && entries.some(e => e.test.odometerUnit === 'MI') ? 'Miles converted to kilometres (1 mi = 1.609344 km).' : unit === 'mi' && entries.some(e => e.test.odometerUnit === 'KM') ? 'Kilometres converted to miles (1 mi = 1.609344 km).' : 'Original readings are preserved in each test.'}</p>
      <svg className="mileage-chart" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Recorded mileage in ${unit === 'mi' ? 'miles' : 'kilometres'}`} aria-describedby={description}>
        {[0, 1, 2, 3].map(i => { const v = ceiling * i / 3; return <g key={i}><line x1={left} x2={right} y1={y(v)} y2={y(v)} className="grid-line" /><text x={left - 12} y={y(v) + 4} textAnchor="end" className="axis-label">{Math.round(v / 1000)}k</text></g>; })}
        {segments.map((segment, i) => <polyline key={i} points={segment} className="mileage-line" />)}
        {entries.map(({ test, value, at }) => <g key={test.id} tabIndex={0} role="button"
          aria-label={`${dateLabel(test.completedDate, true)}: ${mileageLabel(test)}, ${test.testResult ?? 'result not recorded'}`} aria-pressed={selectedId === test.id}
          className="chart-marker"
          onClick={() => onSelect(test)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(test); } }}>
          <title>{`${dateLabel(test.completedDate, true)} · ${mileageLabel(test)} · ${test.testResult}`}</title>
          <circle cx={x(at)} cy={y(value)} r={14} className="chart-hit" />
          <circle cx={x(at)} cy={y(value)} r={selectedId === test.id ? 6 : 4} className={`chart-point ${test.testResult === 'FAILED' ? 'failed-point' : ''} ${selectedId === test.id ? 'selected-point' : ''}`} />
        </g>)}
        {years.filter((_, i) => years.length <= 6 || i % 2 === 0 || i === years.length - 1).map(year => { const first = entries.find(e => new Date(e.at).getUTCFullYear() === year);
          return first ? <text key={year} x={x(first.at)} y={height - 4} textAnchor="middle" className="axis-label">{year}</text> : null; })}
      </svg>
      {!compact && <p className="chart-note">Same-day readings may overlap on the chart. Every test is listed separately below.</p>}
      <details className="readings-table"><summary>View recorded readings as a table <FileText size={13} aria-hidden="true" /></summary>
        <div className="table-scroll"><table><caption>All tests, including missing readings. Values and units as recorded.</caption><thead><tr><th scope="col">Test date</th><th scope="col">Result</th><th scope="col">Recorded reading</th></tr></thead><tbody>{chronological(report.tests).map(test => <tr key={test.id}><td><button onClick={() => onSelect(test)}>{dateLabel(test.completedDate, true)}</button></td><td>{test.testResult ?? 'Not recorded'}</td><td>{mileageLabel(test)}</td></tr>)}</tbody></table></div>
      </details>
    </> : <p className="empty-note">No readings with a recorded date and known units are available to plot. Every available test is listed in the history.</p>}
  </section>;
}

function TestDetails({ test, report, onExplain, canExplain, explaining, contextStatus }: Pick<ReportProps, 'report' | 'onExplain' | 'canExplain' | 'explaining' | 'contextStatus'> & { test: Test }) {
  const groups = [
    { name: 'Failures', kind: 'fail', match: (type: string | null | undefined) => ['MAJOR', 'DANGEROUS', 'FAIL'].includes(type ?? '') },
    { name: 'Minor defects', kind: 'minor', match: (type: string | null | undefined) => type === 'MINOR' },
    { name: 'Advisories', kind: 'advisory', match: (type: string | null | undefined) => type === 'ADVISORY' },
    { name: 'Other recorded notes', kind: 'other', match: (type: string | null | undefined) => !['MAJOR', 'DANGEROUS', 'FAIL', 'MINOR', 'ADVISORY'].includes(type ?? '') },
  ];
  return <section className="test-detail" aria-label="Selected test details" tabIndex={-1}>
    <div className="detail-heading"><p className="eyebrow">Selected test</p><Result result={test.testResult} compact /></div>
    <h3>{dateLabel(test.completedDate)}</h3><p className="detail-time">{timestamp(test.completedDate) === null ? 'Time not available' : dateLabel(test.completedDate, true).split(',').at(-1)} · {mileageLabel(test)}</p>
    <dl className="test-meta"><div><dt>Test number</dt><dd>{test.motTestNumber ?? 'Not recorded'}</dd></div><div><dt>Test source</dt><dd>{test.dataSource ?? 'Not recorded'}</dd></div>
      {test.registrationAtTimeOfTest && test.registrationAtTimeOfTest !== report.vehicle.registration && <div><dt>Registration at test</dt><dd>{test.registrationAtTimeOfTest}</dd></div>}
      {test.expiryDate && <div><dt>Recorded expiry</dt><dd>{dateLabel(test.expiryDate)}</dd></div>}</dl>
    <p className="wording-note">Original recorded wording</p>
    {test.defects == null ? <p className="empty-note">Defect details were not supplied for this test. This does not establish that there were no defects.</p> : test.defects.length === 0 ? <p className="empty-note"><Check size={16} aria-hidden="true" /> No defects or advisories recorded in this test.</p> : groups.map(group => {
      const defects = test.defects?.filter(defect => group.match(defect.type));
      return defects?.length ? <div className={`defect-group ${group.kind}`} key={group.name}><h4>{group.name} <span>{defects.length}</span></h4><ul>{defects.map((defect, i) => <li key={i}>{(defect.dangerous || defect.type === 'DANGEROUS') && <strong className="danger-label">Dangerous · </strong>}<span>{defect.text ?? 'Wording not supplied'}</span><small>Recorded type: {defect.type ?? 'Not supplied'}</small></li>)}</ul></div> : null;
    })}
    <button className="explain-button" disabled={!canExplain || explaining} onClick={() => onExplain(test)}><CircleHelp size={16} aria-hidden="true" />{explaining ? 'Sending to the conversation…' : 'Explain this test'}<ArrowUpRight size={15} aria-hidden="true" /></button>
    {!canExplain && <p className="context-status">This host cannot send a follow-up. Ask about the test number in the conversation.</p>}
    <p className="context-status" role="status">{contextStatus}</p>
  </section>;
}

export function Report({ report, selectedId, expanded, onSelect, onExpand, onExplain, contextStatus, actionError, explaining, canExplain }: ReportProps) {
  const [filter, setFilter] = useState<'all' | 'failed'>('all');
  const latest = latestTest(report); const expiry = recordedExpiry(report);
  const latestGroup = latestDatedTests(report.tests);
  const latestResult = latestGroup.length > 1 && new Set(latestGroup.map(test => test.testResult)).size > 1 ? 'AMBIGUOUS' : latestGroup[0]?.testResult;
  const latestReadings = [...new Set(latestGroup.map(mileageLabel))];
  const selected = report.tests.find(test => test.id === selectedId);
  const tests = chronological(report.tests).reverse().filter(test => filter === 'all' || test.testResult === 'FAILED');
  const sample = report.provenance.kind === 'sample';
  const vehicleName = [report.vehicle.make, report.vehicle.model].filter(Boolean).map(v => titleCase(v ?? '')).join(' ') || 'Vehicle details not recorded';
  const firstUse = report.vehicle.firstUsedDate ?? report.vehicle.manufactureDate ?? report.vehicle.registrationDate;
  return <article className={`report ${expanded ? 'expanded' : 'inline'}`}>
    <header className="brand-row"><div className="brand"><span className="brand-mark" aria-hidden="true">◉</span> MOT <span className="brand-slash">/</span> LENS</div><span className={`data-badge ${sample ? 'sample' : ''}`}>{sample ? 'Sample report' : 'DVSA record'}</span></header>
    {sample && <p className="sample-note">A fictional vehicle to explore the app. No live vehicle was queried.</p>}
    <section className="vehicle-heading" aria-label="Vehicle summary"><div><span className="plate">{sample ? 'DEMO 001' : report.vehicle.registration ?? 'UNRECORDED'}</span><h1>{vehicleName}</h1><p className="vehicle-specs">{[firstUse ? dateLabel(firstUse).split(' ').at(-1) : 'Year not recorded', report.vehicle.fuelType ? titleCase(report.vehicle.fuelType) : 'Fuel not recorded', report.vehicle.primaryColour ? titleCase(report.vehicle.primaryColour) : 'Colour not recorded'].join(' · ')}</p></div>
      <button className="expand-button" onClick={onExpand} aria-label={expanded ? 'Return to compact report' : 'Expand vehicle report'}><Expand size={16} aria-hidden="true" /><span>{expanded ? 'Compact view' : 'Expand report'}</span></button>
    </section>
    <dl className="summary-facts"><div><dt>Latest recorded result</dt><dd><Result result={latestResult} /></dd><small>{latestGroup[0] ? dateLabel(latestGroup[0].completedDate) : 'No dated tests'}</small></div><div><dt>Recorded MOT expiry</dt><dd>{expiry ? dateLabel(expiry) : 'Not recorded'}</dd><small>{expiry ? 'From the latest passing test' : report.vehicle.motTestDueDate ? `First MOT due: ${dateLabel(report.vehicle.motTestDueDate)}` : 'Not supplied or ambiguous'}</small></div><div><dt>Latest recorded reading</dt><dd>{latest ? mileageLabel(latest) : latestReadings.length === 1 ? latestReadings[0] : latestReadings.length > 1 ? 'Multiple readings' : 'Not recorded'}</dd><small>{report.tests.length} recorded {report.tests.length === 1 ? 'test' : 'tests'}</small></div></dl>
    {latestGroup.length > 1 && <p className="empty-note">{latestGroup.length} tests share the latest timestamp. The supplied order cannot establish which test came last; inspect each record.</p>}
    <MileageChart report={report} selectedId={selectedId} onSelect={onSelect} compact={!expanded} />
    {!expanded && <button className="explore-button" onClick={onExpand}>Explore {report.tests.length ? 'the test history' : 'available records'} <span>{report.tests.length} tests <ChevronRight size={16} aria-hidden="true" /></span></button>}
    {expanded && <>
      <div className="history-layout"><section className="history-section" aria-label="Test history"><div className="section-heading"><div><p className="eyebrow">Test history</p><h2>A record of every test</h2></div><span className="count-label">{report.tests.length} tests</span></div>
        <div className="history-filters" aria-label="Filter tests"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All tests</button><button aria-pressed={filter === 'failed'} onClick={() => setFilter('failed')}>Failed tests</button></div>
        {tests.length === 0 ? <p className="empty-note">{filter === 'failed' ? 'No failed tests in the returned history.' : 'No recorded MOT tests were returned for this vehicle.'}</p> : <ol className="test-list">{tests.map(test => {
          const defectCount = test.defects?.length;
          return <li key={test.id}><button className={`test-row ${selectedId === test.id ? 'selected' : ''}`} aria-pressed={selectedId === test.id} onClick={() => onSelect(test)}><span className={`timeline-dot ${test.testResult === 'FAILED' ? 'fail-dot' : ''}`} aria-hidden="true" /><span className="row-main"><strong>{dateLabel(test.completedDate)}</strong><span>{mileageLabel(test)} <span className="row-divider">·</span> {defectCount === undefined ? 'Notes not supplied' : defectCount === 0 ? 'No recorded notes' : `${defectCount} recorded ${defectCount === 1 ? 'note' : 'notes'}`}</span><small>{timestamp(test.completedDate) === null ? test.motTestNumber ?? 'Undated test' : dateLabel(test.completedDate, true)}</small></span><Result result={test.testResult} compact /><ChevronRight size={14} className="row-chevron" aria-hidden="true" /></button></li>;
        })}</ol>}
      </section>{selected ? <TestDetails test={selected} report={report} onExplain={onExplain} canExplain={canExplain} explaining={explaining} contextStatus={contextStatus} /> : <section className="test-detail unselected"><FileText size={24} aria-hidden="true" /><h3>Look closer at a test</h3><p>Select any test to see its recorded result, mileage and original notes.</p></section>}</div>
      <section className="observations-section" aria-label="Observations"><div className="section-heading"><div><p className="eyebrow">Observations, with evidence</p><h2>Things to ask about</h2></div></div><p className="section-description">Patterns in the records. Each observation shows its basis and the tests behind it.</p>
        {report.observations.length === 0 ? <p className="empty-note">No repeated advisory wording or comparable mileage decreases were found. This does not assess the vehicle’s condition.</p> : report.observations.map((observation, i) => <div className={`observation ${observation.kind}`} key={i}><span className="observation-icon" aria-hidden="true">{observation.kind === 'mileage-decrease' ? <ArrowDownLeft size={20} /> : <FileText size={20} />}</span><div><h3>{observation.title}</h3>{observation.wording && <blockquote>{observation.wording}</blockquote>}<p>{observation.explanation}</p><div className="evidence-links">{observation.testIds.map(id => { const test = report.tests.find(test => test.id === id); return test ? <button key={id} onClick={() => onSelect(test)}>{dateLabel(test.completedDate, true)}<ArrowUpRight size={12} aria-hidden="true" /></button> : null; })}</div></div></div>)}
      </section>
    </>}
    {actionError && <p role="alert" className="action-error">{actionError}</p>}
    <aside className="record-scope">A test is a snapshot, not a vehicle condition assessment. A missing advisory in a later test does not show that it was repaired.</aside>
    <footer className="report-footer"><div className="source-details"><span>{sample ? 'Representative sample' : <a href="https://documentation.history.mot.api.gov.uk/" target="_blank" rel="noreferrer">DVSA MOT History API <ArrowUpRight size={11} aria-hidden="true" /></a>}</span><span>{sample ? 'Sample loaded' : 'Retrieved'} {dateLabel(report.provenance.retrievedAt, true)} · Cache age {report.provenance.cacheAgeSeconds}s at delivery</span>{!sample && <span>Contains public sector information licensed under <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noreferrer">OGL v3.0</a>. GB light vehicles since 2005, GB commercial vehicles since 2018, NI since 2017.</span>}</div><div className="footer-brand"><span>By <a href="https://applification.net" target="_blank" rel="noreferrer">Applification</a></span><a href="https://github.com/rufushudson/mot-lens" target="_blank" rel="noreferrer"><Code2 size={13} aria-hidden="true" /> Source code</a></div></footer>
  </article>;
}
