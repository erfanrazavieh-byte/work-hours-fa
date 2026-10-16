import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import jalaali from 'jalaali-js';
import { todayJalali, jalaliToIso, isoToJalali, shiftJalaliMonth, monthTitle, jalaliMonthBounds } from './lib/jalali';

function nextJalaliDay(value) {
  const iso = jalaliToIso(value);
  if (!iso) return todayJalali();
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return isoToJalali(date.toISOString().slice(0, 10));
}
function DateSelect({ value, onChange, label = 'تاریخ شمسی' }) {
  const [yearText = '', monthText = '', dayText = ''] = (value || '').split('-');
  const year = Number(yearText) || Number(todayJalali().slice(0, 4));
  const month = Number(monthText) || 1;
  const day = Number(dayText) || 1;
  const currentYear = Number(todayJalali().slice(0, 4));
  const years = Array.from(new Set([...Array.from({ length: 13 }, (_, i) => currentYear - 10 + i), year])).sort((a, b) => a - b);
  const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const daysInMonth = jalaali.jalaaliMonthLength(year, month);
  const setDatePart = (nextYear, nextMonth, nextDay) => {
    const safeDay = Math.min(nextDay, jalaali.jalaaliMonthLength(nextYear, nextMonth));
    onChange(`${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`);
  };
  return <div className="date-picker" aria-label={label} dir="rtl">
    <select className="date-select date-day" value={String(day)} aria-label="روز" onChange={e => setDatePart(year, month, Number(e.target.value))}>
      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(n => <option key={n} value={n}>{String(n).padStart(2, '0')}</option>)}
    </select>
    <select className="date-select date-month" value={String(month)} aria-label="ماه" onChange={e => setDatePart(year, Number(e.target.value), day)}>
      {monthNames.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
    </select>
    <select className="date-select date-year" value={String(year)} aria-label="سال" onChange={e => setDatePart(Number(e.target.value), month, day)}>
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  </div>;
}
function TimeSelect({ value, onChange, label }) {
  const [hour = '', minute = ''] = value ? value.split(':').slice(0, 2) : ['', ''];
  return <div className="time-picker" dir="ltr">
    <select className="time-select" value={hour} aria-label={label + ' ساعت'} onChange={e => onChange(e.target.value + ':' + minute)}>
      <option value="">ساعت</option>
      {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(item => <option key={item} value={item}>{item}</option>)}
    </select><span>:</span>
    <select className="time-select minute-select" value={minute} aria-label={label + ' دقیقه'} onChange={e => onChange(hour + ':' + e.target.value)}>
      <option value="">دقیقه</option>
      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(item => <option key={item} value={item}>{item}</option>)}
    </select>
  </div>;
}
const emptyRow = (workDate = todayJalali()) => ({ id: `new-${crypto.randomUUID()}`, work_date: workDate, start_time: '', end_time: '', notes: '' });
const durationMinutes = row => {
  const toMinutes = value => {
    const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value || '');
    if (!match) return null;
    const hour = Number(match[1]), minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  };
  const start = toMinutes(row.start_time), end = toMinutes(row.end_time);
  if (start === null || end === null) return 0;
  let mins = end - start;
  if (mins < 0) mins += 24 * 60;
  return mins;
};
const duration = row => durationMinutes(row) / 60;
const durationLabel = row => {
  const mins = durationMinutes(row);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
};
const faNum = n => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(n);
const money = n => `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(Math.round(n))} تومان`;

export default function App() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [month, setMonth] = useState(() => todayJalali().slice(0, 7) + '-01');
  const [rows, setRows] = useState([]);
  const [panels, setPanels] = useState([]);
  const [activePanelId, setActivePanelId] = useState('');
  const [newPanelName, setNewPanelName] = useState('');
  const [panelBusy, setPanelBusy] = useState(false);
  const [editingPanelName, setEditingPanelName] = useState(false);
  const [panelNameDraft, setPanelNameDraft] = useState('');
  const [rate, setRate] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [loading, setLoading] = useState(false);
  const configured = Boolean(supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => setSession(current));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase || !activePanelId) return;
    let active = true;
    async function load() {
      setLoading(true); setNotice(''); setRows([]);
      const { start, end } = jalaliMonthBounds(month);
      const monthStartIso = jalaliToIso(month);
      const [entryResult, monthRateResult, profileResult] = await Promise.all([
        supabase.from('work_entries').select('*').eq('panel_id', activePanelId).gte('work_date', start).lt('work_date', end).order('work_date', { ascending: true }),
        supabase.from('monthly_rates').select('hourly_rate').eq('panel_id', activePanelId).eq('month_start', monthStartIso).maybeSingle(),
        supabase.from('profiles').select('hourly_rate').eq('id', session.user.id).maybeSingle()
      ]);
      if (!active) return;
      if (entryResult.error) setNotice(`خطا در دریافت اطلاعات: ${entryResult.error.message}`);
      else setRows((entryResult.data || []).map(r => ({ ...r, work_date: isoToJalali(r.work_date) })));
      if (monthRateResult.error) {
        setNotice(`خطا در دریافت نرخ ماهانه: ${monthRateResult.error.message}`);
      } else {
        const currentRate = monthRateResult.data?.hourly_rate ?? profileResult.data?.hourly_rate ?? 0;
        setRate(String(currentRate));
        setRateInput(String(currentRate));
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [session, month, activePanelId]);

  // فقط ردیف‌های ذخیره‌شده در مجموع ماهانه و مبلغ قابل پرداخت حساب می‌شوند.
  const totalMinutes = useMemo(() => rows.filter(row => !String(row.id).startsWith('new-')).reduce((sum, row) => sum + durationMinutes(row), 0), [rows]);
  const totalHours = totalMinutes / 60;
  const totalHoursLabel = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  const totalPay = totalHours * (Number(rate) || 0);

  useEffect(() => {
    if (!session || !supabase) return;
    let active = true;
    async function loadPanels() {
      const { data, error } = await supabase.from('work_panels').select('id, name').eq('user_id', session.user.id).order('created_at', { ascending: true });
      if (!active) return;
      if (error) {
        setNotice(`خطا در دریافت پنل‌ها: ${error.message}`);
        return;
      }
      const available = data || [];
      setPanels(available);
      if (available.length === 0) {
        setActivePanelId('');
        setNotice('پنلی پیدا نشد. ابتدا migration چندپنلی را در Supabase اجرا کنید.');
        return;
      }
      const savedId = window.localStorage.getItem(`work-panel-${session.user.id}`);
      setActivePanelId(previous => available.some(panel => panel.id === previous) ? previous : (available.some(panel => panel.id === savedId) ? savedId : available[0].id));
    }
    loadPanels();
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (session && activePanelId) window.localStorage.setItem(`work-panel-${session.user.id}`, activePanelId);
  }, [session, activePanelId]);

  async function submitAuth(e) {
    e.preventDefault(); setAuthBusy(true); setNotice('');
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setAuthBusy(false);
    if (result.error) setNotice(result.error.message);
    else if (authMode === 'signup' && !result.data.session) setNotice('ثبت‌نام انجام شد؛ تنظیم تأیید ایمیل در Supabase را بررسی کنید.');
    else setNotice(authMode === 'signup' ? 'حساب ساخته شد.' : 'وارد شدید.');
  }

  function updateRow(id, key, value) { setRows(prev => prev.map(row => row.id === id ? { ...row, [key]: value } : row)); }
  function addRow() {
    const today = todayJalali();
    const selectedMonth = month.slice(0, 7);
    const todayMonth = today.slice(0, 7);
    const monthRows = rows.filter(row => row.work_date && row.work_date.slice(0, 7) === selectedMonth);
    const latestDate = monthRows.reduce((latest, row) => row.work_date > latest ? row.work_date : latest, '');

    let defaultDate;
    if (!latestDate) {
      defaultDate = selectedMonth === todayMonth ? today : `${selectedMonth}-01`;
    } else {
      const nextDate = nextJalaliDay(latestDate);
      if (nextDate.slice(0, 7) !== selectedMonth) {
        defaultDate = selectedMonth === todayMonth ? today : latestDate;
      } else {
        defaultDate = selectedMonth === todayMonth && today > nextDate ? today : nextDate;
      }
    }
    setRows(prev => [...prev, emptyRow(defaultDate)]);
  }

  async function createPanel(e) {
    e.preventDefault();
    const name = newPanelName.trim();
    if (!name) { setNotice('برای پنل جدید یک نام وارد کنید.'); return; }
    if (!session || !supabase) return;
    setPanelBusy(true); setNotice('');
    const { data, error } = await supabase.from('work_panels').insert({ user_id: session.user.id, name }).select('id, name').single();
    setPanelBusy(false);
    if (error) { setNotice(`پنل ساخته نشد: ${error.message}`); return; }
    setPanels(prev => [...prev, data]);
    setNewPanelName('');
    setActivePanelId(data.id);
    setNotice(`پنل «${data.name}» ساخته شد.`);
  }

  function beginRenamePanel() {
    const current = panels.find(panel => panel.id === activePanelId);
    if (!current) return;
    setPanelNameDraft(current.name);
    setEditingPanelName(true);
    setNotice('');
  }

  async function renamePanel(e) {
    e.preventDefault();
    const name = panelNameDraft.trim();
    if (!name) { setNotice('نام پنل نمی‌تواند خالی باشد.'); return; }
    if (!activePanelId || !session || !supabase) return;
    setPanelBusy(true); setNotice('');
    const { data, error } = await supabase.from('work_panels')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', activePanelId).eq('user_id', session.user.id)
      .select('id, name').single();
    setPanelBusy(false);
    if (error) { setNotice(`تغییر نام پنل انجام نشد: ${error.message}`); return; }
    setPanels(prev => prev.map(panel => panel.id === data.id ? data : panel));
    setEditingPanelName(false);
    setNotice(`نام پنل به «${data.name}» تغییر کرد.`);
  }

  async function deletePanel() {
    const current = panels.find(panel => panel.id === activePanelId);
    if (!current || !session || !supabase) return;
    if (panels.length <= 1) {
      setNotice('نمی‌توانید آخرین پنل را حذف کنید؛ ابتدا یک پنل جدید بسازید.');
      return;
    }
    const confirmed = window.confirm(`پنل «${current.name}» و تمام سوابق ساعت کاری و نرخ‌های ذخیره‌شده در آن برای همیشه حذف شوند؟ این کار قابل بازگشت نیست.`);
    if (!confirmed) return;
    setPanelBusy(true); setNotice('');
    const { error } = await supabase.from('work_panels').delete()
      .eq('id', activePanelId).eq('user_id', session.user.id);
    setPanelBusy(false);
    if (error) { setNotice(`حذف پنل انجام نشد: ${error.message}`); return; }
    const remaining = panels.filter(panel => panel.id !== activePanelId);
    setPanels(remaining);
    setActivePanelId(remaining[0].id);
    setEditingPanelName(false);
    setNotice(`پنل «${current.name}» و اطلاعات مربوط به آن حذف شد.`);
  }

  async function saveRow(row) {
    if (!session || !supabase) return;
    const isoDate = jalaliToIso(row.work_date);
    if (!isoDate) { setNotice('تاریخ شمسی معتبر وارد کنید؛ نمونه: ۱۴۰۵-۰۷-۲۴ (با اعداد انگلیسی).'); return; }
    if (!row.start_time || !row.end_time) { setNotice('ساعت شروع و پایان را وارد کنید.'); return; }
    const normalizeTime = value => {
      const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value || '');
      if (!match) return null;
      const hour = Number(match[1]), minute = Number(match[2]);
      return hour <= 23 && minute <= 59 ? `${match[1]}:${match[2]}` : null;
    };
    const startTime = normalizeTime(row.start_time);
    const endTime = normalizeTime(row.end_time);
    if (!startTime || !endTime) {
      setNotice('لطفاً ساعت شروع و پایان را از هر دو فهرست ساعت و دقیقه انتخاب کنید.');
      return;
    }
    const payload = { user_id: session.user.id, panel_id: activePanelId, work_date: isoDate, start_time: startTime, end_time: endTime, notes: row.notes || '' };
    const result = row.id.startsWith('new-')
      ? await supabase.from('work_entries').insert(payload).select().single()
      : await supabase.from('work_entries').update(payload).eq('id', row.id).eq('panel_id', activePanelId).select().single();
    if (result.error) setNotice(`ذخیره نشد: ${result.error.message}`);
    else {
      setRows(prev => prev.map(r => r.id === row.id ? { ...result.data, work_date: isoToJalali(result.data.work_date) } : r));
      setNotice('ردیف ذخیره شد.');
    }
  }

  async function deleteRow(row) {
    if (row.id.startsWith('new-')) { setRows(prev => prev.filter(r => r.id !== row.id)); return; }
    const result = await supabase.from('work_entries').delete().eq('id', row.id).eq('panel_id', activePanelId);
    if (result.error) setNotice(`حذف انجام نشد: ${result.error.message}`);
    else { setRows(prev => prev.filter(r => r.id !== row.id)); setNotice('ردیف حذف شد.'); }
  }

  async function saveRate(e) {
    e.preventDefault();
    const numeric = Number(rateInput);
    if (!Number.isFinite(numeric) || numeric < 0) { setNotice('نرخ ساعتی باید عددی مثبت یا صفر باشد.'); return; }
    const monthStartIso = jalaliToIso(month);
    if (!monthStartIso) { setNotice('ماه انتخاب‌شده معتبر نیست.'); return; }
    const result = await supabase.from('monthly_rates').upsert(
      { user_id: session.user.id, panel_id: activePanelId, month_start: monthStartIso, hourly_rate: numeric },
      { onConflict: 'panel_id,month_start' }
    );
    if (result.error) setNotice(`نرخ ذخیره نشد: ${result.error.message}`);
    else { setRate(String(numeric)); setNotice(`نرخ ساعتی ${monthTitle(month)} ذخیره شد.`); }
  }

  if (!configured) return <main className="setup-page"><section className="panel setup"><div className="brand-mark">س</div><h1>ثبت ساعت کاری</h1><p>برای فعال‌شدن ورود و ذخیره‌سازی، ابتدا پروژه Supabase را بسازید و مقادیر فایل <code>.env</code> را تنظیم کنید.</p><ol><li>در Supabase یک پروژه ایجاد کنید.</li><li>محتوای <code>supabase/schema.sql</code> را در SQL Editor اجرا کنید.</li><li>در Authentication → Providers → Email، تأیید ایمیل را خاموش کنید.</li><li>آدرس پروژه و کلید anon را در متغیرهای محیطی قرار دهید.</li></ol><p className="muted">راهنمای کامل در README پروژه قرار دارد.</p></section></main>;

  if (!session) return <main className="auth-page"><form className="panel auth-card" onSubmit={submitAuth}><div className="brand-mark">س</div><h1>ثبت ساعت کاری</h1><p className="muted">سوابق کارکرد و دستمزد ماهانه</p><div className="tabs"><button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>ورود</button><button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>ثبت‌نام</button></div><label>ایمیل<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr" /></label><label>رمز عبور<input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="حداقل ۶ کاراکتر" dir="ltr" /></label><button className="primary full" disabled={authBusy}>{authBusy ? 'در حال انجام…' : authMode === 'login' ? 'ورود به حساب' : 'ساخت حساب'}</button>{notice && <p className="notice">{notice}</p>}</form></main>;

  return <main className="app-shell"><header className="topbar"><div className="brand"><div className="brand-mark small">س</div><div><h1>ثبت ساعت کاری</h1><p>مدیریت کارکرد و دستمزد</p></div></div><button className="subtle" onClick={() => supabase.auth.signOut()}>خروج</button></header>
    <section className="panel panel-switcher"><div className="panel-switcher-current"><label htmlFor="active-panel">پنل محاسبات</label><select id="active-panel" value={activePanelId} onChange={e => { setActivePanelId(e.target.value); setEditingPanelName(false); }} disabled={!panels.length || panelBusy}><option value="" disabled>انتخاب پنل</option>{panels.map(panel => <option key={panel.id} value={panel.id}>{panel.name}</option>)}</select><div className="panel-management-actions">{editingPanelName ? <form className="rename-panel-form" onSubmit={renamePanel}><input value={panelNameDraft} onChange={e => setPanelNameDraft(e.target.value)} aria-label="نام جدید پنل" maxLength={80} autoFocus /><button className="primary" disabled={panelBusy}>{panelBusy ? 'در حال ذخیره…' : 'ذخیره نام'}</button><button type="button" className="subtle" onClick={() => setEditingPanelName(false)} disabled={panelBusy}>لغو</button></form> : <><button type="button" className="subtle" onClick={beginRenamePanel} disabled={!activePanelId || panelBusy}>تغییر نام</button><button type="button" className="delete-panel-btn" onClick={deletePanel} disabled={!activePanelId || panelBusy || panels.length <= 1} title={panels.length <= 1 ? 'آخرین پنل قابل حذف نیست' : 'حذف پنل انتخاب‌شده'}>حذف پنل</button></>}</div></div><form className="new-panel-form" onSubmit={createPanel}><input value={newPanelName} onChange={e => setNewPanelName(e.target.value)} placeholder="نام پنل جدید" aria-label="نام پنل جدید" maxLength={80} /><button className="primary" disabled={panelBusy}>{panelBusy ? 'در حال انجام…' : '＋ افزودن پنل'}</button></form></section>
    <section className="summary-grid"><article className="panel summary"><span>ساعت کارکرد این ماه</span><strong style={{ fontFamily: 'inherit', fontSize: '1.5rem', fontWeight: 700 }}><span dir="ltr" style={{ fontSize: '1.5rem', fontFamily: 'inherit', fontWeight: 700, display: 'inline-block' }}>{totalHoursLabel}</span> ساعت</strong></article><article className="panel summary"><span>مبلغ قابل پرداخت</span><strong>{money(totalPay)}</strong></article><article className="panel rate-card"><form onSubmit={saveRate}><label htmlFor="rate">نرخ هر ساعت (تومان)</label><div className="rate-line"><input id="rate" type="number" min="0" step="1000" value={rateInput} onChange={e => setRateInput(e.target.value)} required/><button className="primary">ذخیره نرخ</button></div><small>این نرخ فقط برای ماه انتخاب‌شده اعمال می‌شود.</small></form></article></section>
    <section className="panel table-panel"><div className="section-head"><div><h2>گزارش کارکرد</h2></div><div className="month-switch"><button aria-label="ماه قبل" onClick={() => setMonth(shiftJalaliMonth(month, -1))}>›</button><strong>{monthTitle(month)}</strong><button aria-label="ماه بعد" onClick={() => setMonth(shiftJalaliMonth(month, 1))}>‹</button></div></div>
      {notice && <div className="notice notice-bar">{notice}</div>}{loading ? <div className="empty">در حال بارگذاری اطلاعات…</div> : <div className="table-wrap"><table><thead><tr><th>تاریخ شمسی</th><th>ساعت شروع</th><th>ساعت پایان</th><th>توضیحات</th><th>ساعت روز</th><th>عملیات</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><DateSelect value={row.work_date} onChange={value => updateRow(row.id, 'work_date', value)} /></td><td><TimeSelect value={row.start_time} onChange={value => updateRow(row.id, 'start_time', value)} label="ساعت شروع"/></td><td><TimeSelect value={row.end_time} onChange={value => updateRow(row.id, 'end_time', value)} label="ساعت پایان"/></td><td><input value={row.notes || ''} onChange={e => updateRow(row.id, 'notes', e.target.value)} placeholder="اختیاری"/></td><td className="hours-cell" dir="ltr">{durationLabel(row)}</td><td><div className="row-actions"><button className="save-btn" onClick={() => saveRow(row)}>ذخیره</button><button className="delete-btn" onClick={() => deleteRow(row)}>حذف</button></div></td></tr>)}</tbody></table>{rows.length === 0 && <div className="empty">برای این ماه هنوز ردیفی ثبت نشده است.</div>}</div>}
      <div className="table-footer"><button className="primary" onClick={addRow}>＋ افزودن روز کاری</button></div>
    </section><footer>اطلاعات هر حساب به‌صورت جداگانه ذخیره می‌شود.</footer></main>;
}