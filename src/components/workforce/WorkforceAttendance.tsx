import { useCallback, useState } from 'react';
import { CalendarDays, FileUp } from 'lucide-react';
import AttendanceImport from './AttendanceImport';
import AttendanceTimecards from './AttendanceTimecards';
import { PageHeader } from './WorkforceUi';

interface Props {
  canImport: boolean;
  canAdjust: boolean;
  canViewRates: boolean;
}

type Tab = 'import' | 'timecards';

export default function WorkforceAttendance({ canImport, canAdjust, canViewRates }: Props) {
  const [tab, setTab] = useState<Tab>('timecards');
  const [range, setRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);
  const handleRangeChange = useCallback((next: { dateFrom: string; dateTo: string }) => setRange(next), []);

  return (
    <div className="space-y-5">
      <PageHeader title="Attendance" subtitle="Biometric punches from Time Master, turned into day credits, overtime and night differential." />
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold sm:w-fit" role="tablist">
        {([
          ['timecards', 'Timecards', <CalendarDays key="t" size={15} />],
          ['import', 'Import', <FileUp key="i" size={15} />],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 transition-colors ${tab === id ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      {tab === 'import' ? (
        <AttendanceImport
          canImport={canImport}
          onViewTimecards={(dateFrom, dateTo) => {
            setRange({ dateFrom, dateTo });
            setTab('timecards');
          }}
        />
      ) : (
        <AttendanceTimecards canAdjust={canAdjust} canViewRates={canViewRates} range={range} onRangeChange={handleRangeChange} />
      )}
    </div>
  );
}
