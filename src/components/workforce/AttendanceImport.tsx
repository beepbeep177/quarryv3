import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileUp, Fingerprint, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { friendlyDbError } from '../../lib/dbErrors';
import type { WfAttendanceImportRow } from '../../lib/database.types';
import { paginate } from '../../lib/pagination';
import { parseTimeMasterPages, toImportPayload, type BiometricParseResult } from '../../lib/workforce/biometricParser';
import { formatDateTime, formatPeriod } from '../../lib/workforce/format';
import ActionModal from '../ActionModal';
import Pagination from '../Pagination';
import ReadOnlyNotice from '../ReadOnlyNotice';
import { Badge, Card, EmptyState, ErrorBanner, LoadingRow, StatCard, SuccessBanner, ToolbarButton, WarningNote } from './WorkforceUi';

const PAGE_SIZE = 8;

interface ImportSummary {
  import_id: string;
  date_from: string | null;
  date_to: string | null;
  employees: number;
  employees_created: number;
  punches: number;
  punches_inserted: number;
  punches_skipped: number;
}

interface Preview {
  fileName: string;
  sha256: string;
  result: BiometricParseResult;
  newIds: string[];
  duplicateOf: WfAttendanceImportRow | null;
}

interface Props {
  canImport: boolean;
  onViewTimecards: (dateFrom: string, dateTo: string) => void;
}

export default function AttendanceImport({ canImport, onViewTimecards }: Props) {
  const [history, setHistory] = useState<WfAttendanceImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data, error: historyError } = await supabase
      .from('wf_attendance_imports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (historyError) setError(`Could not load import history. ${historyError.message}`);
    else setHistory(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const pagedHistory = useMemo(() => paginate(history, page, PAGE_SIZE), [history, page]);

  async function handleFile(file: File) {
    setError('');
    setSummary(null);
    setPreview(null);
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setError('Choose the PDF exported from Time Master Timekeeping System.');
      return;
    }
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      // pdf.js is only loaded here, the first time someone imports a file.
      const { extractPdfLines, sha256Hex } = await import('../../lib/workforce/pdfText');
      const [sha256, pages] = await Promise.all([sha256Hex(buffer), extractPdfLines(buffer)]);
      const result = parseTimeMasterPages(pages);
      if (result.records.length === 0) {
        setError('No employee pages were found in this PDF. Make sure it is the Time Master attendance report (not a scanned image).');
        return;
      }
      const ids = result.records.map(record => record.biometricId);
      const [existing, duplicate] = await Promise.all([
        supabase.from('wf_employees').select('biometric_id').in('biometric_id', ids),
        supabase.from('wf_attendance_imports').select('*').eq('file_sha256', sha256).maybeSingle(),
      ]);
      if (existing.error) {
        setError(friendlyDbError(existing.error));
        return;
      }
      const known = new Set((existing.data ?? []).map(row => row.biometric_id));
      setPreview({
        fileName: file.name,
        sha256,
        result,
        newIds: ids.filter(id => !known.has(id)),
        duplicateOf: duplicate.data ?? null,
      });
    } catch (caught) {
      setError(`Could not read this PDF. ${caught instanceof Error ? caught.message : ''}`.trim());
    } finally {
      setParsing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleConfirm() {
    if (!preview || !canImport) return;
    setImporting(true);
    setError('');
    const { data, error: importError } = await supabase.rpc('wf_import_punches', {
      p_file_name: preview.fileName,
      p_file_sha256: preview.sha256,
      p_records: toImportPayload(preview.result.records),
      p_page_count: preview.result.pageCount,
      p_unparsed_pages: preview.result.unparsedPages.length,
    });
    setImporting(false);
    setConfirmOpen(false);
    if (importError) {
      setError(friendlyDbError(importError));
      return;
    }
    setSummary(data as unknown as ImportSummary);
    setPreview(null);
    await fetchHistory();
  }

  const newRecords = preview ? preview.result.records.filter(record => preview.newIds.includes(record.biometricId)) : [];

  return (
    <div className="space-y-5">
      {!canImport && <ReadOnlyNotice message="Your account can view attendance only. Ask a manager to import biometric files." />}
      <ErrorBanner message={error} />
      {summary && (
        <div className="space-y-2">
          <SuccessBanner message={`Imported ${summary.punches_inserted} new punches for ${summary.employees} employees${summary.employees_created ? ` (${summary.employees_created} new employee${summary.employees_created === 1 ? '' : 's'} created without a rate)` : ''}.${summary.punches_skipped ? ` ${summary.punches_skipped} punches were already on file and were skipped.` : ''}`} />
          {summary.date_from && summary.date_to && (
            <ToolbarButton tone="primary" icon={<CheckCircle2 size={16} />} label="Review Timecards" onClick={() => onViewTimecards(summary.date_from!, summary.date_to!)} />
          )}
        </div>
      )}

      {canImport && (
        <Card title="Import Biometric PDF" subtitle="The file is read in this browser. Nothing is saved until you confirm.">
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) handleFile(file); }} />
              <ToolbarButton tone="primary" icon={<FileUp size={16} />} label={parsing ? 'Reading PDF...' : 'Choose PDF'} onClick={() => fileInput.current?.click()} disabled={parsing || importing} spinning={parsing} />
              <p className="text-xs text-slate-500">Time Master Timekeeping System report, one employee per page. Employees are matched by biometric ID.</p>
            </div>

            {preview && (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{preview.fileName}</p>
                    <p className="text-xs text-slate-500">{preview.result.dateFrom && preview.result.dateTo ? formatPeriod(preview.result.dateFrom, preview.result.dateTo) : 'No dates found'}</p>
                  </div>
                  <button type="button" onClick={() => setPreview(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200" aria-label="Discard preview"><X size={16} /></button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Employees found" value={String(preview.result.records.length)} />
                  <StatCard label="New employees" value={String(preview.newIds.length)} tone={preview.newIds.length ? 'amber' : 'slate'} detail="Created without a rate" />
                  <StatCard label="Punches" value={String(preview.result.punchCount)} tone="emerald" />
                  <StatCard label="Unparsed pages" value={`${preview.result.unparsedPages.length} of ${preview.result.pageCount}`} tone={preview.result.unparsedPages.length ? 'amber' : 'slate'} />
                </div>
                {preview.duplicateOf && (
                  <WarningNote>This exact file was already imported on {formatDateTime(preview.duplicateOf.created_at)} and will be rejected. Punches are never imported twice.</WarningNote>
                )}
                {newRecords.length > 0 && (
                  <WarningNote>
                    New employees (set their rate and shift in Employees before payroll):{' '}
                    {newRecords.slice(0, 12).map(record => `${record.name || 'No name'} (ID ${record.biometricId})`).join(', ')}
                    {newRecords.length > 12 ? `, and ${newRecords.length - 12} more` : ''}
                  </WarningNote>
                )}
                {preview.result.unparsedPages.length > 0 && (
                  <WarningNote>
                    Pages not read: {preview.result.unparsedPages.map(page => `p.${page.page} (${page.reason})`).join('; ')}
                  </WarningNote>
                )}
                {preview.result.warnings.length > 0 && (
                  <WarningNote>
                    <p className="font-semibold">Check these lines:</p>
                    <ul className="mt-1 list-disc pl-4">
                      {preview.result.warnings.slice(0, 8).map(warning => <li key={warning}>{warning}</li>)}
                    </ul>
                    {preview.result.warnings.length > 8 && <p>…and {preview.result.warnings.length - 8} more.</p>}
                  </WarningNote>
                )}
                <div className="flex justify-end">
                  <ToolbarButton tone="primary" icon={<Upload size={16} />} label="Confirm Import" onClick={() => setConfirmOpen(true)} disabled={!!preview.duplicateOf || preview.result.punchCount === 0 || importing} />
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card title="Import History" subtitle="Each file can only be imported once.">
        {loading ? <LoadingRow label="Loading imports..." /> : history.length === 0 ? (
          <EmptyState icon={<Fingerprint size={34} />} title="No imports yet" detail="Imported biometric files will appear here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Imported</th>
                    <th className="px-4 py-3 text-left">File</th>
                    <th className="px-4 py-3 text-left">Period</th>
                    <th className="px-4 py-3 text-right">Employees</th>
                    <th className="px-4 py-3 text-right">New</th>
                    <th className="px-4 py-3 text-right">Punches</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedHistory.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(row.created_at)}</td>
                      <td className="max-w-56 truncate px-4 py-3 font-medium text-slate-700" title={row.file_name}>{row.file_name}</td>
                      <td className="px-4 py-3 text-slate-600">{row.date_from && row.date_to ? formatPeriod(row.date_from, row.date_to) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.employee_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.employees_created ? <Badge tone="amber">{row.employees_created}</Badge> : 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.punches_inserted}
                        {row.punch_count > row.punches_inserted && <span className="text-xs text-slate-400"> / {row.punch_count}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.date_from && row.date_to && (
                          <button type="button" onClick={() => onViewTimecards(row.date_from!, row.date_to!)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">Timecards</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={history.length} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ActionModal
        open={confirmOpen && !!preview}
        title="Import Attendance"
        description="Punches are saved permanently and cannot be edited. Corrections are made with timecard overrides."
        variant="success"
        confirmLabel="Import"
        loading={importing}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      >
        {preview && (
          <p className="text-sm text-slate-600">
            Import <span className="font-semibold text-slate-900">{preview.result.punchCount}</span> punches for{' '}
            <span className="font-semibold text-slate-900">{preview.result.records.length}</span> employees
            {preview.newIds.length > 0 && <> and create <span className="font-semibold text-slate-900">{preview.newIds.length}</span> new employee records</>}?
          </p>
        )}
      </ActionModal>
    </div>
  );
}
