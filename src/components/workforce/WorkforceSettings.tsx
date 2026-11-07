import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Clock, Edit3, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { friendlyDbError, NOT_SAVED_MESSAGE } from '../../lib/dbErrors';
import { useBusinessToday } from '../../lib/date';
import type { WfHolidayRow, WfSettingsRow, WfShiftRow } from '../../lib/database.types';
import { formatDate, money, parseAmount, weekdayShort } from '../../lib/workforce/format';
import { hhmm, LAW_ND_RATE, LAW_ND_START, LAW_OT_MULTIPLIER, LAW_SPECIAL_HOLIDAY_PREMIUM, type OtRounding } from '../../lib/workforce/types';
import ActionModal from '../ActionModal';
import ReadOnlyNotice from '../ReadOnlyNotice';
import { Badge, Card, EmptyState, ErrorBanner, Field, FormModal, LoadingRow, PageHeader, RefreshButton, SuccessBanner, ToolbarButton, WarningNote } from './WorkforceUi';

interface Props {
  canManage: boolean;
}

interface RulesForm {
  ot_multiplier: string;
  nd_rate_percent: string;
  nd_start: string;
  nd_end: string;
  special_holiday_premium_percent: string;
  punch_dedupe_minutes: string;
  min_daily_wage: string;
  default_shift_id: string;
}

interface ShiftForm {
  id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  break_start: string;
  break_minutes: string;
  half_day_min_hours: string;
  ot_rounding: OtRounding;
  crosses_midnight: boolean;
  is_active: boolean;
}

interface HolidayForm {
  id: string | null;
  holiday_date: string;
  name: string;
  type: 'regular' | 'special';
}

const ROUNDING_LABEL: Record<OtRounding, string> = {
  nearest_hour: 'Nearest hour (client)',
  floor_hour: 'Whole hours only',
  floor_half_hour: 'Half hours only',
  exact: 'Exact minutes',
};

function rulesForm(row: WfSettingsRow): RulesForm {
  return {
    ot_multiplier: String(row.ot_multiplier),
    nd_rate_percent: String(Math.round(Number(row.nd_rate) * 10000) / 100),
    nd_start: hhmm(row.nd_start),
    nd_end: hhmm(row.nd_end),
    special_holiday_premium_percent: String(Math.round(Number(row.special_holiday_premium) * 10000) / 100),
    punch_dedupe_minutes: String(row.punch_dedupe_minutes),
    min_daily_wage: String(row.min_daily_wage),
    default_shift_id: row.default_shift_id ?? '',
  };
}

function shiftForm(row?: WfShiftRow): ShiftForm {
  return {
    id: row?.id ?? null,
    name: row?.name ?? '',
    start_time: hhmm(row?.start_time ?? '07:00'),
    end_time: hhmm(row?.end_time ?? '16:00'),
    break_start: hhmm(row?.break_start ?? '12:00'),
    break_minutes: String(row?.break_minutes ?? 60),
    half_day_min_hours: String(row?.half_day_min_hours ?? 5),
    ot_rounding: row?.ot_rounding ?? 'nearest_hour',
    crosses_midnight: row?.crosses_midnight ?? false,
    is_active: row?.is_active ?? true,
  };
}

export default function WorkforceSettings({ canManage }: Props) {
  const today = useBusinessToday();
  const [settings, setSettings] = useState<WfSettingsRow | null>(null);
  const [form, setForm] = useState<RulesForm | null>(null);
  const [shifts, setShifts] = useState<WfShiftRow[]>([]);
  const [holidays, setHolidays] = useState<WfHolidayRow[]>([]);
  const [year, setYear] = useState(today.slice(0, 4));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingRules, setSavingRules] = useState(false);
  const [shiftEdit, setShiftEdit] = useState<ShiftForm | null>(null);
  const [holidayEdit, setHolidayEdit] = useState<HolidayForm | null>(null);
  const [modalError, setModalError] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'shift'; row: WfShiftRow } | { kind: 'holiday'; row: WfHolidayRow } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    const [settingsResult, shiftResult, holidayResult] = await Promise.all([
      supabase.from('wf_settings').select('*').limit(1).maybeSingle(),
      supabase.from('wf_shifts').select('*').order('name'),
      supabase.from('wf_holidays').select('*').order('holiday_date'),
    ]);
    const problem = settingsResult.error ?? shiftResult.error ?? holidayResult.error;
    if (problem) setError(`Could not load settings. ${problem.message}`);
    setSettings(settingsResult.data);
    setForm(settingsResult.data ? rulesForm(settingsResult.data) : null);
    setShifts(shiftResult.data ?? []);
    setHolidays(holidayResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const years = useMemo(() => [...new Set([today.slice(0, 4), ...holidays.map(holiday => holiday.holiday_date.slice(0, 4))])].sort(), [holidays, today]);
  const yearHolidays = useMemo(() => holidays.filter(holiday => holiday.holiday_date.startsWith(year)), [holidays, year]);

  const lawWarnings = useMemo(() => {
    if (!form) return [];
    const warnings: string[] = [];
    const ot = parseAmount(form.ot_multiplier);
    const ndRate = parseAmount(form.nd_rate_percent) / 100;
    const premium = parseAmount(form.special_holiday_premium_percent) / 100;
    if (ot < LAW_OT_MULTIPLIER) warnings.push(`Overtime is paid at ×${ot}. The Labor Code minimum for ordinary-day overtime is ×${LAW_OT_MULTIPLIER} (+25%).`);
    if (ndRate < LAW_ND_RATE) warnings.push(`Night differential is ${Math.round(ndRate * 100)}%. The legal minimum is ${LAW_ND_RATE * 100}% of the hourly rate.`);
    if (form.nd_start > LAW_ND_START) warnings.push(`Night differential starts at ${form.nd_start}. The legal window starts at ${LAW_ND_START}.`);
    if (form.nd_end < '06:00') warnings.push(`Night differential ends at ${form.nd_end}. The legal window ends at 06:00.`);
    if (premium < LAW_SPECIAL_HOLIDAY_PREMIUM) warnings.push(`Work on special days is paid +${Math.round(premium * 100)}%. The legal premium is +${LAW_SPECIAL_HOLIDAY_PREMIUM * 100}%.`);
    return warnings;
  }, [form]);

  async function saveRules(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || !settings || !form) return;
    const dedupe = Math.round(parseAmount(form.punch_dedupe_minutes));
    if (!form.nd_start || !form.nd_end) return setError('Enter the night differential window.');
    if (dedupe > 120) return setError('Duplicate-tap window must be 120 minutes or less.');
    setSavingRules(true);
    setError('');
    setNotice('');
    const { data, error: saveError } = await supabase
      .from('wf_settings')
      .update({
        ot_multiplier: parseAmount(form.ot_multiplier),
        nd_rate: parseAmount(form.nd_rate_percent) / 100,
        nd_start: form.nd_start,
        nd_end: form.nd_end,
        special_holiday_premium: parseAmount(form.special_holiday_premium_percent) / 100,
        punch_dedupe_minutes: dedupe,
        min_daily_wage: parseAmount(form.min_daily_wage),
        default_shift_id: form.default_shift_id || null,
      })
      .eq('id', settings.id)
      .select('*');
    setSavingRules(false);
    if (saveError || !data?.length) {
      setError(saveError ? friendlyDbError(saveError) : NOT_SAVED_MESSAGE);
      return;
    }
    setSettings(data[0]);
    setForm(rulesForm(data[0]));
    setNotice('Pay rules saved. Draft payrolls use the new rules the next time they are computed; locked payrolls keep their saved amounts.');
  }

  async function saveShift(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canManage || !shiftEdit) return;
    if (!shiftEdit.name.trim()) return setModalError('Enter a shift name.');
    const halfDay = parseAmount(shiftEdit.half_day_min_hours);
    if (!(halfDay > 0)) return setModalError('Half-day threshold must be more than zero hours.');
    setModalSaving(true);
    setModalError('');
    const payload = {
      name: shiftEdit.name.trim(),
      start_time: shiftEdit.start_time,
      end_time: shiftEdit.end_time,
      break_start: shiftEdit.break_start,
      break_minutes: Math.round(parseAmount(shiftEdit.break_minutes)),
      half_day_min_hours: halfDay,
      ot_rounding: shiftEdit.ot_rounding,
      crosses_midnight: shiftEdit.crosses_midnight,
      is_active: shiftEdit.is_active,
    };
    const result = shiftEdit.id
      ? await supabase.from('wf_shifts').update(payload).eq('id', shiftEdit.id).select('id')
      : await supabase.from('wf_shifts').insert(payload).select('id');
    setModalSaving(false);
    if (result.error || !result.data?.length) {
      setModalError(result.error ? friendlyDbError(result.error) : NOT_SAVED_MESSAGE);
      return;
    }
    setShiftEdit(null);
    await fetchData();
  }

  async function saveHoliday(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canManage || !holidayEdit) return;
    if (!holidayEdit.holiday_date || !holidayEdit.name.trim()) return setModalError('Enter the date and name.');
    setModalSaving(true);
    setModalError('');
    const payload = { holiday_date: holidayEdit.holiday_date, name: holidayEdit.name.trim(), type: holidayEdit.type };
    const result = holidayEdit.id
      ? await supabase.from('wf_holidays').update(payload).eq('id', holidayEdit.id).select('id')
      : await supabase.from('wf_holidays').insert(payload).select('id');
    setModalSaving(false);
    if (result.error || !result.data?.length) {
      setModalError(result.error?.code === '23505' ? 'There is already a holiday on that date.' : result.error ? friendlyDbError(result.error) : NOT_SAVED_MESSAGE);
      return;
    }
    setYear(payload.holiday_date.slice(0, 4));
    setHolidayEdit(null);
    await fetchData();
  }

  async function confirmDelete() {
    if (!canManage || !deleteTarget) return;
    setModalSaving(true);
    const table = deleteTarget.kind === 'shift' ? 'wf_shifts' : 'wf_holidays';
    const { data, error: deleteError } = await supabase.from(table).delete().eq('id', deleteTarget.row.id).select('id');
    setModalSaving(false);
    if (deleteError || !data?.length) {
      setError(friendlyDbError(deleteError));
    } else {
      await fetchData();
    }
    setDeleteTarget(null);
  }

  function updateRules<K extends keyof RulesForm>(key: K, value: string) {
    setForm(previous => (previous ? { ...previous, [key]: value } : previous));
  }

  const disabled = !canManage;

  return (
    <div className="space-y-5">
      <PageHeader title="Pay Rules & Holidays" subtitle="Defaults match the client's current manual payroll. Every rule can be changed here.">
        <RefreshButton loading={loading} onClick={fetchData} />
      </PageHeader>
      {!canManage && <ReadOnlyNotice />}
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {loading ? <LoadingRow label="Loading settings..." /> : (
        <>
          <Card title="Pay Rules" subtitle="Used by timecards and payroll.">
            {form ? (
              <form onSubmit={saveRules} className="space-y-4 p-5">
                {!form.default_shift_id && (
                  <WarningNote>No default shift: employees created by an attendance import get no shift, and all their days are credited 0 until one is assigned in Employees.</WarningNote>
                )}
                {lawWarnings.length > 0 && (
                  <WarningNote>
                    <p className="font-semibold">These rules follow the client's practice but differ from the Labor Code:</p>
                    <ul className="mt-1 list-disc pl-4">{lawWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
                  </WarningNote>
                )}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="OT Multiplier" helper={`Law ×${LAW_OT_MULTIPLIER}`}>
                    <input type="number" min="0" step="0.01" value={form.ot_multiplier} onChange={event => updateRules('ot_multiplier', event.target.value)} className="input" disabled={disabled} />
                  </Field>
                  <Field label="Night Diff %" helper="Of hourly rate">
                    <input type="number" min="0" step="0.5" value={form.nd_rate_percent} onChange={event => updateRules('nd_rate_percent', event.target.value)} className="input" disabled={disabled} />
                  </Field>
                  <Field label="Night Diff Starts" helper={`Law ${LAW_ND_START}`}>
                    <input type="time" value={form.nd_start} onChange={event => updateRules('nd_start', event.target.value)} className="input" disabled={disabled} />
                  </Field>
                  <Field label="Night Diff Ends">
                    <input type="time" value={form.nd_end} onChange={event => updateRules('nd_end', event.target.value)} className="input" disabled={disabled} />
                  </Field>
                  <Field label="Special Day Premium %" helper="Worked special days">
                    <input type="number" min="0" step="1" value={form.special_holiday_premium_percent} onChange={event => updateRules('special_holiday_premium_percent', event.target.value)} className="input" disabled={disabled} />
                  </Field>
                  <Field label="Duplicate Tap Window" helper="Minutes">
                    <input type="number" min="0" max="120" step="1" value={form.punch_dedupe_minutes} onChange={event => updateRules('punch_dedupe_minutes', event.target.value)} className="input" disabled={disabled} />
                  </Field>
                  <Field label="Minimum Daily Wage" helper="Warning only">
                    <input type="number" min="0" step="0.01" value={form.min_daily_wage} onChange={event => updateRules('min_daily_wage', event.target.value)} className="input" disabled={disabled} />
                  </Field>
                  <Field label="Default Shift" helper="For new employees">
                    <select value={form.default_shift_id} onChange={event => updateRules('default_shift_id', event.target.value)} className="input" disabled={disabled}>
                      <option value="">None (new employees flagged)</option>
                      {shifts.filter(shift => shift.is_active || shift.id === form.default_shift_id).map(shift => <option key={shift.id} value={shift.id}>{shift.name}</option>)}
                    </select>
                  </Field>
                </div>
                <p className="text-xs text-slate-500">
                  Regular holidays are paid 100% to daily workers who worked at least one day in the period; working on a regular holiday also earns the day (200%).
                  The minimum wage default (₱{money(600)}) is the Tarlac non-agriculture rate under Wage Order RBIII-26. Update it when a new wage order takes effect.
                </p>
                {canManage && (
                  <div className="flex justify-end">
                    <ToolbarButton tone="primary" type="submit" icon={<Save size={16} />} label="Save Pay Rules" disabled={savingRules} spinning={savingRules} />
                  </div>
                )}
              </form>
            ) : <EmptyState icon={<Clock size={30} />} title="Settings row missing" detail="Run the Workforce migration to create the default pay rules." />}
          </Card>

          <Card
            title="Shifts"
            subtitle="Early arrival earns nothing. OT starts at the later of shift end or 8 hours + break after the effective start."
            actions={canManage && <ToolbarButton icon={<Plus size={16} />} label="Add Shift" onClick={() => { setModalError(''); setShiftEdit(shiftForm()); }} />}
          >
            {shifts.length === 0 ? <EmptyState icon={<Clock size={30} />} title="No shifts" detail="Add a shift and assign it to employees." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 text-left">Shift</th>
                      <th className="px-4 py-3 text-left">Hours</th>
                      <th className="px-4 py-3 text-left">Break</th>
                      <th className="px-4 py-3 text-left">Half Day Below</th>
                      <th className="px-4 py-3 text-left">OT Rounding</th>
                      {canManage && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shifts.map(shift => (
                      <tr key={shift.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {shift.name} {!shift.is_active && <Badge tone="slate">Inactive</Badge>}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-600">{hhmm(shift.start_time)}–{hhmm(shift.end_time)}{shift.crosses_midnight ? ' (next day)' : ''}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-600">{shift.break_minutes} min from {hhmm(shift.break_start)}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-600">{shift.half_day_min_hours} h</td>
                        <td className="px-4 py-3 text-slate-600">{ROUNDING_LABEL[shift.ot_rounding]}</td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              <button type="button" onClick={() => { setModalError(''); setShiftEdit(shiftForm(shift)); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Edit shift"><Edit3 size={15} /></button>
                              <button type="button" onClick={() => setDeleteTarget({ kind: 'shift', row: shift })} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete shift"><Trash2 size={15} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="Holidays"
            subtitle="Add each year's proclamation here. Nothing is pre-filled."
            actions={(
              <>
                <select value={year} onChange={event => setYear(event.target.value)} className="input w-auto" aria-label="Year">
                  {years.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
                {canManage && <ToolbarButton icon={<CalendarPlus size={16} />} label="Add Holiday" onClick={() => { setModalError(''); setHolidayEdit({ id: null, holiday_date: `${year}-01-01`, name: '', type: 'regular' }); }} />}
              </>
            )}
          >
            {yearHolidays.length === 0 ? <EmptyState icon={<CalendarPlus size={30} />} title={`No holidays for ${year}`} detail="Regular and special non-working days affect pay only after they are added here." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      {canManage && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {yearHolidays.map(holiday => (
                      <tr key={holiday.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-700">{weekdayShort(holiday.holiday_date)} {formatDate(holiday.holiday_date)}</td>
                        <td className="px-4 py-3 font-medium text-slate-700">{holiday.name}</td>
                        <td className="px-4 py-3"><Badge tone={holiday.type === 'regular' ? 'sky' : 'violet'}>{holiday.type === 'regular' ? 'Regular' : 'Special'}</Badge></td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              <button type="button" onClick={() => { setModalError(''); setHolidayEdit({ id: holiday.id, holiday_date: holiday.holiday_date, name: holiday.name, type: holiday.type }); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Edit holiday"><Edit3 size={15} /></button>
                              <button type="button" onClick={() => setDeleteTarget({ kind: 'holiday', row: holiday })} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete holiday"><Trash2 size={15} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <FormModal
        open={!!shiftEdit}
        title={shiftEdit?.id ? 'Edit Shift' : 'Add Shift'}
        onClose={() => !modalSaving && setShiftEdit(null)}
        footer={(
          <>
            <button type="button" onClick={() => setShiftEdit(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <ToolbarButton tone="primary" icon={<Save size={15} />} label="Save Shift" onClick={() => saveShift()} disabled={modalSaving} spinning={modalSaving} />
          </>
        )}
      >
        {shiftEdit && (
          <form onSubmit={saveShift} className="space-y-4">
            <ErrorBanner message={modalError} />
            <Field label="Name"><input value={shiftEdit.name} onChange={event => setShiftEdit({ ...shiftEdit, name: event.target.value })} className="input" placeholder="ex. Day 7AM-4PM" required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start"><input type="time" value={shiftEdit.start_time} onChange={event => setShiftEdit({ ...shiftEdit, start_time: event.target.value })} className="input" required /></Field>
              <Field label="End"><input type="time" value={shiftEdit.end_time} onChange={event => setShiftEdit({ ...shiftEdit, end_time: event.target.value })} className="input" required /></Field>
              <Field label="Break Starts"><input type="time" value={shiftEdit.break_start} onChange={event => setShiftEdit({ ...shiftEdit, break_start: event.target.value })} className="input" required /></Field>
              <Field label="Break Minutes"><input type="number" min="0" max="240" value={shiftEdit.break_minutes} onChange={event => setShiftEdit({ ...shiftEdit, break_minutes: event.target.value })} className="input" /></Field>
              <Field label="Full Day From" helper="Hours worked"><input type="number" min="0.5" step="0.5" value={shiftEdit.half_day_min_hours} onChange={event => setShiftEdit({ ...shiftEdit, half_day_min_hours: event.target.value })} className="input" /></Field>
              <Field label="OT Rounding">
                <select value={shiftEdit.ot_rounding} onChange={event => setShiftEdit({ ...shiftEdit, ot_rounding: event.target.value as OtRounding })} className="input">
                  {(Object.keys(ROUNDING_LABEL) as OtRounding[]).map(key => <option key={key} value={key}>{ROUNDING_LABEL[key]}</option>)}
                </select>
              </Field>
            </div>
            <p className="text-xs text-slate-500">Worked hours at or above "Full Day From" earn 1 day; anything less earns 0.5.</p>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={shiftEdit.crosses_midnight} onChange={event => setShiftEdit({ ...shiftEdit, crosses_midnight: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              Crosses midnight (early-morning punches count for the previous date)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={shiftEdit.is_active} onChange={event => setShiftEdit({ ...shiftEdit, is_active: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              Active
            </label>
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
          </form>
        )}
      </FormModal>

      <FormModal
        open={!!holidayEdit}
        title={holidayEdit?.id ? 'Edit Holiday' : 'Add Holiday'}
        onClose={() => !modalSaving && setHolidayEdit(null)}
        footer={(
          <>
            <button type="button" onClick={() => setHolidayEdit(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <ToolbarButton tone="primary" icon={<Save size={15} />} label="Save Holiday" onClick={() => saveHoliday()} disabled={modalSaving} spinning={modalSaving} />
          </>
        )}
      >
        {holidayEdit && (
          <form onSubmit={saveHoliday} className="space-y-4">
            <ErrorBanner message={modalError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date"><input type="date" value={holidayEdit.holiday_date} onChange={event => setHolidayEdit({ ...holidayEdit, holiday_date: event.target.value })} className="input" required /></Field>
              <Field label="Type">
                <select value={holidayEdit.type} onChange={event => setHolidayEdit({ ...holidayEdit, type: event.target.value as HolidayForm['type'] })} className="input">
                  <option value="regular">Regular holiday</option>
                  <option value="special">Special non-working day</option>
                </select>
              </Field>
            </div>
            <Field label="Name"><input value={holidayEdit.name} onChange={event => setHolidayEdit({ ...holidayEdit, name: event.target.value })} className="input" required /></Field>
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
          </form>
        )}
      </FormModal>

      <ActionModal
        open={!!deleteTarget}
        title={deleteTarget?.kind === 'shift' ? 'Delete Shift' : 'Delete Holiday'}
        description={deleteTarget?.kind === 'shift'
          ? 'Employees on this shift will have no shift, and their attendance will be flagged until a new shift is assigned. Consider marking it inactive instead.'
          : 'Payroll computed after this will no longer treat the date as a holiday. Locked payrolls are not changed.'}
        variant="danger"
        confirmLabel="Delete"
        loading={modalSaving}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      >
        <p className="text-sm font-semibold text-slate-800">{deleteTarget?.kind === 'shift' ? deleteTarget.row.name : deleteTarget ? `${deleteTarget.row.name} (${formatDate(deleteTarget.row.holiday_date)})` : ''}</p>
      </ActionModal>
    </div>
  );
}
