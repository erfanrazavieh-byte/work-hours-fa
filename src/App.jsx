import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import { todayJalali, jalaliToIso, isoToJalali, shiftJalaliMonth, monthTitle, jalaliMonthBounds } from './lib/jalali';

const emptyRow = () => ({ id: `new-${crypto.randomUUID()}`, work_date: todayJalali(), start_time: '09:00', end_time: '17:00', notes: '' });
const duration = row => {
  if (!row.start_time || !row.end_time) return 0;
  const [sh, sm] = row.start_time.split(':').map(Number), [eh, em] = row.end_time.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
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
    if (!session || !supabase) return;
    let active = true;
    async function load() {
      setLoading(true); setNotice('');
      const { start, end } = jalaliMonthBounds(month);
      const [entryResult, profileResult] = await Promise.all([
        supabase.from('work_entries').select('*').gte('work_date', start).lt('work_date', end).order('work_date', { ascending: true }),
        supabase.from('profiles').select('hourly_rate').eq('id', session.user.id).maybeSingle()
      ]);
      if (!active) return;
      if (entryResult.error) setNotice(`خطا در دریافت اطلاعات: ${entryResult.error.message}`);
      else setRows((entryResult.data || []).map(r => ({ ...r, work_date: isoToJalali(r.work_date) })));
      if (!profileResult.error && profileResult.data) {
        setRate(String(profileResult.data.hourly_rate ?? 0));
        setRateInput(String(profileResult.data.hourly_rate ?? 0));
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [session, month]);

  const totalHours = useMemo(() => rows.reduce((sum, row) => sum + duration(row), 0), [rows]);
  const totalPay = totalHours * (Number(rate) || 0);

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
  function addRow() { setRows(prev => [...prev, emptyRow()]); }

  async function saveRow(row) {
    if (!session || !supabase) return;
    const isoDate = jalaliToIso(row.work_date);
    if (!isoDate) { setNotice('تاریخ شمسی معتبر وارد کنید؛ نمونه: ۱۴۰۵-۰۷-۲۴ (با اعداد انگلیسی).'); return; }
    if (!row.start_time || !row.end_time) { setNotice('ساعت شروع و پایان را وارد کنید.'); return; }
    const payload = { user_id: session.user.id, work_date: isoDate, start_time: row.start_time, end_time: row.end_time, notes: row.notes || '' };
    const result = row.id.startsWith('new-')
      ? await supabase.from('work_entries').insert(payload).select().single()
      : await supabase.from('work_entries').update(payload).eq('id', row.id).select().single();
    if (result.error) setNotice(`ذخیره نشد: ${result.error.message}`);
    else {
      setRows(prev => prev.map(r => r.id === row.id ? { ...result.data, work_date: isoToJalali(result.data.work_date) } : r));
      setNotice('ردیف ذخیره شد.');
    }
  }

  async function deleteRow(row) {
    if (row.id.startsWith('new-')) { setRows(prev => prev.filter(r => r.id !== row.id)); return; }
    const result = await supabase.from('work_entries').delete().eq('id', row.id);
    if (result.error) setNotice(`حذف انجام نشد: ${result.error.message}`);
    else { setRows(prev => prev.filter(r => r.id !== row.id)); setNotice('ردیف حذف شد.'); }
  }

  async function saveRate(e) {
    e.preventDefault();
    const numeric = Number(rateInput);
    if (!Number.isFinite(numeric) || numeric < 0) { setNotice('نرخ ساعتی باید عددی مثبت یا صفر باشد.'); return; }
    const result = await supabase.from('profiles').upsert({ id: session.user.id, hourly_rate: numeric });
    if (result.error) setNotice(`نرخ ذخیره نشد: ${result.error.message}`);
    else { setRate(String(numeric)); setNotice('نرخ ساعتی ذخیره شد.'); }
  }

  if (!configured) return <main className="setup-page"><section className="panel setup"><div className="brand-mark">س</div><h1>ثبت ساعت کاری</h1><p>برای فعال‌شدن ورود و ذخیره‌سازی، ابتدا پروژه Supabase را بسازید و مقادیر فایل <code>.env</code> را تنظیم کنید.</p><ol><li>در Supabase یک پروژه ایجاد کنید.</li><li>محتوای <code>supabase/schema.sql</code> را در SQL Editor اجرا کنید.</li><li>در Authentication → Providers → Email، تأیید ایمیل را خاموش کنید.</li><li>آدرس پروژه و کلید anon را در متغیرهای محیطی قرار دهید.</li></ol><p className="muted">راهنمای کامل در README پروژه قرار دارد.</p></section></main>;

  if (!session) return <main className="auth-page"><form className="panel auth-card" onSubmit={submitAuth}><div className="brand-mark">س</div><h1>ثبت ساعت کاری</h1><p className="muted">سوابق کارکرد و دستمزد ماهانه</p><div className="tabs"><button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>ورود</button><button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>ثبت‌نام</button></div><label>ایمیل<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr" /></label><label>رمز عبور<input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="حداقل ۶ کاراکتر" dir="ltr" /></label><button className="primary full" disabled={authBusy}>{authBusy ? 'در حال انجام…' : authMode === 'login' ? 'ورود به حساب' : 'ساخت حساب'}</button>{notice && <p className="notice">{notice}</p>}</form></main>;

  return <main className="app-shell"><header className="topbar"><div className="brand"><div className="brand-mark small">س</div><div><h1>ثبت ساعت کاری</h1><p>مدیریت کارکرد و دستمزد</p></div></div><button className="subtle" onClick={() => supabase.auth.signOut()}>خروج</button></header>
    <section className="summary-grid"><article className="panel summary"><span>ساعت کارکرد این ماه</span><strong>{faNum(totalHours)} <small>ساعت</small></strong></article><article className="panel summary"><span>مبلغ قابل پرداخت</span><strong>{money(totalPay)}</strong></article><article className="panel rate-card"><form onSubmit={saveRate}><label htmlFor="rate">نرخ هر ساعت (تومان)</label><div className="rate-line"><input id="rate" type="number" min="0" step="1000" value={rateInput} onChange={e => setRateInput(e.target.value)} required/><button className="primary">ذخیره نرخ</button></div><small>این نرخ برای محاسبه همه ماه‌ها استفاده می‌شود.</small></form></article></section>
    <section className="panel table-panel"><div className="section-head"><div><h2>گزارش کارکرد</h2><p className="muted">تاریخ‌ها را به شمسی وارد کنید.</p></div><div className="month-switch"><button aria-label="ماه قبل" onClick={() => setMonth(shiftJalaliMonth(month, -1))}>›</button><strong>{monthTitle(month)}</strong><button aria-label="ماه بعد" onClick={() => setMonth(shiftJalaliMonth(month, 1))}>‹</button></div></div>
      {notice && <div className="notice notice-bar">{notice}</div>}{loading ? <div className="empty">در حال بارگذاری اطلاعات…</div> : <div className="table-wrap"><table><thead><tr><th>تاریخ شمسی</th><th>ساعت شروع</th><th>ساعت پایان</th><th>توضیحات</th><th>ساعت روز</th><th>عملیات</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><input className="date-input" value={row.work_date} onChange={e => updateRow(row.id, 'work_date', e.target.value)} placeholder="۱۴۰۵-۰۷-۲۴" dir="ltr" aria-label="تاریخ شمسی"/></td><td><input type="time" value={row.start_time || ''} onChange={e => updateRow(row.id, 'start_time', e.target.value)}/></td><td><input type="time" value={row.end_time || ''} onChange={e => updateRow(row.id, 'end_time', e.target.value)}/></td><td><input value={row.notes || ''} onChange={e => updateRow(row.id, 'notes', e.target.value)} placeholder="اختیاری"/></td><td className="hours-cell">{faNum(duration(row))}</td><td><div className="row-actions"><button className="save-btn" onClick={() => saveRow(row)}>ذخیره</button><button className="delete-btn" onClick={() => deleteRow(row)}>حذف</button></div></td></tr>)}</tbody></table>{rows.length === 0 && <div className="empty">برای این ماه هنوز ردیفی ثبت نشده است.</div>}</div>}
      <div className="table-footer"><button className="primary" onClick={addRow}>＋ افزودن روز کاری</button><span>جمع ساعات: <b>{faNum(totalHours)}</b></span></div>
    </section><footer>اطلاعات هر حساب به‌صورت جداگانه ذخیره می‌شود.</footer></main>;
}