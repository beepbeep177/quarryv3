import { useEffect, useState } from 'react';
import { CalendarCheck2, Save, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { friendlyDbError } from '../../lib/dbErrors';
import type { WfEmployeeRow, WfShiftRow } from '../../lib/database.types';
import { formatDate, qty } from '../../lib/workforce/format';
import { EXCEPTION_LABELS, minutesToLabel, type DayResult } from '../../lib/workforce/timecard';
import { Badge, ErrorBanner, Field, ToolbarButton } from './WorkforceUi';

interface Props {
  employee: WfEmployeeRow;
  shift: WfShiftRow | null;
  day: DayResult;
  canAdjust: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface OverrideForm {
  daysCredit: '' | '0' | '0.5' | '1';
  otHours: string;
  ndHours: string;
  reason: string;
}

function formFromDay(day: DayResult): OverrideForm {
  const override = day.override;
  return {
    daysCredit: override?.daysCredit === null || override?.daysCredit === undefined ? '' : String(override.daysCredit) as OverrideForm['daysCredit'],
    otHours: override?.otHours === null || override?.otHours === undefined ? '' : String(override.otHours),
    ndHours: override?.ndHours === null || override?.ndHours === undefined ? '' : String(override.ndHours),
    reason: override?.reason ?? '',
  };
}

function parseHours(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export default function TimecardPanel({ employee, shift, day, canAdjust, onClose, onSaved }: Props) {
  const [form, setForm] = useState<OverrideForm>(() => formFromDay(day));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(formFromDay(day));
    setError('');
  }, [day]);

  function update<K extends keyof OverrideForm>(key: K, value: OverrideForm[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  function creditFullDay() {
    setForm(previous => ({
      ...previous,
      daysCredit: '1',
      reason: previous.reason || (day.exception ? `Credited full day: ${EXCEPTION_LABELS[day.exception].toLowerCase()}` : 'Credited full day'),
    }));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!canAdjust) return;
    const otHours = parseHours(form.otHours);
    const ndHours = parseHours(form.ndHours);
    if (Number.isNaN(otHours) || Number.isNaN(ndHours) || (otHours ?? 0) < 0 || (ndHours ?? 0) < 0 || (otHours ?? 0) > 24 || (ndHours ?? 0) > 24) {
      setError('OT and ND hours must be between 0 and 24, or blank to keep the computed value.');
      return;
    }
    const daysCredit = form.daysCredit === '' ? null : Number(form.daysCredit);
    if (daysCredit === null && otHours === null && ndHours === null) {
      setError('Set at least one value to override, or remove the override.');
      return;
    }
    if (!form.reason.trim()) {
      setError('A reason is required for every timecard change.');
      return;
    }
    setSaving(true);
    setError('');
    const { error: saveError } = await supabase
      .from('wf_timecard_overrides')
      .upsert({
        employee_id: employee.id,
        work_date: day.date,
        days_credit: daysCredit,
        ot_hours: otHours,
        nd_hours: ndHours,
        reason: form.reason.trim(),
      }, { onConflict: 'employee_id,work_date' })
      .select('id');
    setSaving(false);
    if (saveError) setError(friendlyDbError(saveError));
    else onSaved();
  }

  async function handleRemove() {
    if (!canAdjust || !day.override) return;
    setSaving(true);
    const { data, error: deleteError } = await supabase
      .from('wf_timecard_overrides')
      .delete()
      .eq('employee_id', employee.id)
      .eq('work_date', day.date)
      .select('id');
    setSaving(false);
    if (deleteError || !data?.length) setError(friendlyDbError(deleteError));
    else onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
        aria-label="Timecard details"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">ID {employee.biometric_id}</p>
            <h2 className="text-base font-bold text-slate-800">{employee.full_name}</h2>
            <p className="text-sm text-slate-500">{formatDate(day.date)} · {shift?.name ?? 'No shift'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap gap-1.5">
            {day.holiday && <Badge tone={day.holiday.type === 'regular' ? 'sky' : 'violet'}>{day.holiday.type === 'regular' ? 'Regular holiday' : 'Special day'}: {day.holiday.name}</Badge>}
            {day.exception && <Badge tone={day.override ? 'slate' : 'amber'}>{EXCEPTION_LABELS[day.exception]}{day.override ? ' (overridden)' : ''}</Badge>}
            {day.override && <Badge tone="violet">Override</Badge>}
          </div>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Raw punches</h3>
            {day.punchMinutes.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No punches.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {day.punchMinutes.map((minute, index) => (
                  <span key={minute} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-sm tabular-nums text-slate-700">
                    <span className="mr-1 text-[10px] text-slate-400">{index + 1}</span>{minutesToLabel(minute)}
                  </span>
                ))}
              </div>
            )}
            {day.rawPunchCount > day.punchMinutes.length && (
              <p className="mt-1.5 text-xs text-slate-400">{day.rawPunchCount - day.punchMinutes.length} duplicate tap{day.rawPunchCount - day.punchMinutes.length === 1 ? '' : 's'} ignored.</p>
            )}
          </section>

          <section className="grid grid-cols-2 gap-2 text-sm">
            <Value label="Worked (net of break)" value={`${qty(day.workedMinutes / 60)} h`} />
            <Value label="Late (info only)" value={`${day.lateMinutes} min`} />
            <Value label="Computed day credit" value={qty(day.computed.daysCredit)} />
            <Value label="Computed OT" value={`${qty(day.computed.otHours)} h`} />
            <Value label="Computed ND" value={`${qty(day.computed.ndHours)} h`} />
            <Value label="Used for payroll" value={`${qty(day.daysCredit)} d · ${qty(day.otHours)} OT · ${qty(day.ndHours)} ND`} strong />
          </section>

          {day.exception === 'missing_out_punch' && !day.override && (
            <p className="text-xs text-amber-700">Odd number of punches: credited 0 until someone confirms what happened. The computed values above assume the first and last punch are correct.</p>
          )}

          {day.override && (
            <section className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
              <p className="font-semibold">Current override</p>
              <p className="mt-1">Reason: {day.override.reason}</p>
            </section>
          )}

          {canAdjust ? (
            <form onSubmit={handleSave} className="space-y-3 rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Override</h3>
                <button type="button" onClick={creditFullDay} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                  <CalendarCheck2 size={14} /> Credit full day
                </button>
              </div>
              <ErrorBanner message={error} />
              <p className="text-xs text-slate-500">Leave a value blank to keep the computed one.</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Days">
                  <select value={form.daysCredit} onChange={event => update('daysCredit', event.target.value as OverrideForm['daysCredit'])} className="input">
                    <option value="">Keep</option>
                    <option value="1">1</option>
                    <option value="0.5">0.5</option>
                    <option value="0">0</option>
                  </select>
                </Field>
                <Field label="OT hrs">
                  <input type="number" min="0" max="24" step="0.5" value={form.otHours} onChange={event => update('otHours', event.target.value)} className="input" placeholder="Keep" />
                </Field>
                <Field label="ND hrs">
                  <input type="number" min="0" max="24" step="0.5" value={form.ndHours} onChange={event => update('ndHours', event.target.value)} className="input" placeholder="Keep" />
                </Field>
              </div>
              <Field label="Reason (required)">
                <textarea value={form.reason} onChange={event => update('reason', event.target.value)} className="input min-h-16 resize-y" placeholder="ex. Forgot to punch out, confirmed by foreman" />
              </Field>
              <div className="flex flex-wrap justify-end gap-2">
                {day.override && <ToolbarButton tone="danger" icon={<Trash2 size={15} />} label="Remove Override" onClick={handleRemove} disabled={saving} />}
                <ToolbarButton tone="primary" type="submit" icon={<Save size={15} />} label="Save Override" disabled={saving} spinning={saving} />
              </div>
            </form>
          ) : (
            <p className="text-xs text-slate-400">You can view timecards only. Ask a manager to adjust this day.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Value({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${strong ? 'col-span-2 border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`font-semibold tabular-nums ${strong ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}
