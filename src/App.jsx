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
  const [theme, setTheme] = useState(() => window.localStorage.getItem('karsanj-theme') === 'dark' ? 'dark' : 'light');
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
  const [panelDrawerOpen, setPanelDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [profileAvatarFile, setProfileAvatarFile] = useState(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [rate, setRate] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [loading, setLoading] = useState(false);
  const configured = Boolean(supabase);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('karsanj-theme', theme);
  }, [theme]);

  useEffect(() => {
    const metadata = session?.user?.user_metadata || {};
    setProfileName(metadata.full_name || '');
    setProfilePhone(metadata.phone_number || '');
    setProfileBio(metadata.bio || '');
    setProfileAvatar(metadata.avatar_url || '');
    setProfileAvatarFile(null);
    setProfileAvatarPreview('');
  }, [session?.user?.id, session?.user?.user_metadata?.full_name, session?.user?.user_metadata?.phone_number, session?.user?.user_metadata?.bio, session?.user?.user_metadata?.avatar_url]);

  const themeToggle = <button type="button" className="theme-toggle" onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'فعال‌کردن تم روشن' : 'فعال‌کردن تم تیره'} title={theme === 'dark' ? 'تم روشن' : 'تم تیره'}>{theme === 'dark' ? '☀' : '☾'}</button>;

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
        setNotice(`خطا در دریافت حساب‌های کاری: ${error.message}`);
        return;
      }
      const available = data || [];
      setPanels(available);
      if (available.length === 0) {
        setActivePanelId('');
        setNotice('هیچ حساب کاری‌ای پیدا نشد. ابتدا migration چندپنلی را در Supabase اجرا کنید.');
        return;
      }
      const savedId = window.localStorage.getItem(`work-panel-${session.user.id}`);
      setActivePanelId(available.some(panel => panel.id === savedId) ? savedId : (available.some(panel => panel.id === activePanelId) ? activePanelId : available[0].id));
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

  async function saveProfile(e) {
    e.preventDefault();
    if (!session?.user || !supabase) return;
    setProfileBusy(true);
    setNotice('');
    let avatarUrl = profileAvatar;
    try {
      if (profileAvatarFile) {
        const file = profileAvatarFile;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          setNotice('عکس پروفایل باید با فرمت JPG، PNG یا WebP باشد.');
          setProfileBusy(false);
          return;
        }
        if (file.size > 2 * 1024 * 1024) {
          setNotice('حجم عکس پروفایل باید کمتر از ۲ مگابایت باشد.');
          setProfileBusy(false);
          return;
        }
        const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${session.user.id}/avatar-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = data.publicUrl;
      }
      const { data, error } = await supabase.auth.updateUser({
        data: {
          full_name: profileName.trim(),
          phone_number: profilePhone.trim(),
          bio: profileBio.trim(),
          avatar_url: avatarUrl
        }
      });
      if (error) throw error;
      setProfileAvatar(data.user?.user_metadata?.avatar_url || avatarUrl || '');
      setProfileAvatarFile(null);
      setProfileAvatarPreview('');
      setProfileOpen(false);
      setNotice('اطلاعات پروفایل ذخیره شد.');
    } catch (error) {
      setNotice(`ذخیره پروفایل انجام نشد: ${error.message || 'خطای نامشخص'}`);
    } finally {
      setProfileBusy(false);
    }
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
    if (!name) { setNotice('برای حساب کاری جدید یک نام وارد کنید.'); return; }
    if (!session || !supabase) return;
    setPanelBusy(true); setNotice('');
    const { data, error } = await supabase.from('work_panels').insert({ user_id: session.user.id, name }).select('id, name').single();
    setPanelBusy(false);
    if (error) { setNotice(`ساخت حساب کاری ناموفق بود: ${error.message}`); return; }
    setPanels(prev => [...prev, data]);
    setNewPanelName('');
    setActivePanelId(data.id);
    setNotice(`حساب کاری «${data.name}» ساخته شد.`);
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
    if (!name) { setNotice('نام حساب کاری نمی‌تواند خالی باشد.'); return; }
    if (!activePanelId || !session || !supabase) return;
    setPanelBusy(true); setNotice('');
    const { data, error } = await supabase.from('work_panels')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', activePanelId).eq('user_id', session.user.id)
      .select('id, name').single();
    setPanelBusy(false);
    if (error) { setNotice(`تغییر نام حساب کاری انجام نشد: ${error.message}`); return; }
    setPanels(prev => prev.map(panel => panel.id === data.id ? data : panel));
    setEditingPanelName(false);
    setNotice(`نام حساب کاری به «${data.name}» تغییر کرد.`);
  }

  async function deletePanel() {
    const current = panels.find(panel => panel.id === activePanelId);
    if (!current || !session || !supabase) return;
    if (panels.length <= 1) {
      setNotice('نمی‌توانید آخرین حساب کاری را حذف کنید؛ ابتدا یک حساب کاری جدید بسازید.');
      return;
    }
    const confirmed = window.confirm(`حساب کاری «${current.name}» و تمام سوابق ساعت کاری و نرخ‌های ذخیره‌شده در آن برای همیشه حذف شوند؟ این کار قابل بازگشت نیست.`);
    if (!confirmed) return;
    setPanelBusy(true); setNotice('');
    const { error } = await supabase.from('work_panels').delete()
      .eq('id', activePanelId).eq('user_id', session.user.id);
    setPanelBusy(false);
    if (error) { setNotice(`حذف حساب کاری انجام نشد: ${error.message}`); return; }
    const remaining = panels.filter(panel => panel.id !== activePanelId);
    setPanels(remaining);
    setActivePanelId(remaining[0].id);
    setEditingPanelName(false);
    setNotice(`حساب کاری «${current.name}» و اطلاعات مربوط به آن حذف شد.`);
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

  function getExportReport() {
    const activePanel = panels.find(panel => panel.id === activePanelId);
    return {
      panelName: activePanel?.name || 'حساب کاری',
      monthName: monthTitle(month),
      totalHours: totalHoursLabel,
      totalPay: money(totalPay),
      rows: rows.map(row => ({
        date: row.work_date || '',
        start: row.start_time || '—',
        end: row.end_time || '—',
        notes: row.notes || '',
        hours: durationLabel(row)
      }))
    };
  }

  function exportHtmlDocument() {
    const report = getExportReport();
    const esc = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
    const tableRows = report.rows.map(row => `<tr><td>${esc(row.date)}</td><td>${esc(row.start)}</td><td>${esc(row.end)}</td><td>${esc(row.notes)}</td><td>${esc(row.hours)}</td></tr>`).join('');
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش کارکرد</title><style>body{font-family:Tahoma,Arial,sans-serif;direction:rtl;padding:24px;color:#20243a}h1,h2,p{text-align:right}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #bbb;padding:8px;text-align:right}th{background:#eee}.totals{display:flex;gap:32px;margin-top:18px;font-weight:bold}</style></head><body><h1>گزارش کارکرد</h1><p>حساب کاری: ${esc(report.panelName)} | ماه: ${esc(report.monthName)}</p><div class="totals"><span>مجموع ساعت: ${esc(report.totalHours)} ساعت</span><span>مبلغ قابل پرداخت: ${esc(report.totalPay)}</span></div><table><thead><tr><th>تاریخ</th><th>ساعت شروع</th><th>ساعت پایان</th><th>توضیحات</th><th>ساعت روز</th></tr></thead><tbody>${tableRows || '<tr><td colspan="5">داده‌ای برای نمایش وجود ندارد.</td></tr>'}</tbody></table></body></html>`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportMenuOpen(false);
  }

  function exportSpreadsheet() {
    const html = exportHtmlDocument();
    downloadBlob(new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `گزارش-کارکرد-${month}.xls`);
  }

  function exportWord() {
    const html = exportHtmlDocument();
    downloadBlob(new Blob(['\\ufeff', html], { type: 'application/msword;charset=utf-8;' }), `گزارش-کارکرد-${month}.doc`);
  }

  function exportPdf() {
    const popup = window.open('', '_blank');
    if (!popup) {
      setNotice('برای ساخت PDF اجازه بازشدن پنجره جدید را بدهید.');
      setExportMenuOpen(false);
      return;
    }
    popup.document.open();
    popup.document.write(exportHtmlDocument().replace('</body>', '<script>window.onload=function(){window.print()}<\\/script></body>'));
    popup.document.close();
    setExportMenuOpen(false);
  }

  function exportImage() {
    const report = getExportReport();
    const canvas = document.createElement('canvas');
    const width = 1400;
    const rowHeight = 52;
    const topHeight = 250;
    canvas.width = width;
    canvas.height = topHeight + Math.max(report.rows.length, 1) * rowHeight + 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setNotice('ساخت تصویر در این مرورگر پشتیبانی نمی‌شود.'); return; }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#20243a';
    ctx.font = 'bold 34px Tahoma, Arial';
    ctx.fillText('گزارش کارکرد', width - 50, 55);
    ctx.font = '24px Tahoma, Arial';
    ctx.fillText(`حساب کاری: ${report.panelName}  |  ماه: ${report.monthName}`, width - 50, 105);
    ctx.font = 'bold 24px Tahoma, Arial';
    ctx.fillText(`مجموع ساعت: ${report.totalHours} ساعت`, width - 50, 155);
    ctx.fillText(`مبلغ قابل پرداخت: ${report.totalPay}`, width - 50, 195);
    const columns = [
      { title: 'تاریخ', x: 1350, w: 180 },
      { title: 'شروع', x: 1170, w: 190 },
      { title: 'پایان', x: 980, w: 190 },
      { title: 'توضیحات', x: 790, w: 480 },
      { title: 'ساعت روز', x: 310, w: 180 }
    ];
    let y = topHeight;
    ctx.fillStyle = '#eef0f8';
    ctx.fillRect(40, y, width - 80, rowHeight);
    ctx.fillStyle = '#20243a';
    ctx.font = 'bold 21px Tahoma, Arial';
    columns.forEach(col => ctx.fillText(col.title, col.x, y + 33, col.w));
    y += rowHeight;
    const imageRows = report.rows.length ? report.rows : [{ date: '—', start: '—', end: '—', notes: 'داده‌ای برای نمایش وجود ندارد', hours: '—' }];
    imageRows.forEach((row, index) => {
      ctx.fillStyle = index % 2 ? '#ffffff' : '#f8f9fc';
      ctx.fillRect(40, y, width - 80, rowHeight);
      ctx.strokeStyle = '#e0e3ed';
      ctx.beginPath(); ctx.moveTo(40, y + rowHeight); ctx.lineTo(width - 40, y + rowHeight); ctx.stroke();
      ctx.fillStyle = '#303449';
      ctx.font = '19px Tahoma, Arial';
      [row.date, row.start, row.end, row.notes, row.hours].forEach((value, i) => ctx.fillText(String(value || '—'), columns[i].x, y + 32, columns[i].w));
      y += rowHeight;
    });
    canvas.toBlob(blob => {
      if (blob) downloadBlob(blob, `گزارش-کارکرد-${month}.png`);
      else setNotice('ساخت تصویر ناموفق بود؛ دوباره تلاش کنید.');
    }, 'image/png');
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

  if (!configured) return <main className="setup-page">{themeToggle}<section className="panel setup"><h1>کارسنج</h1><p>برای فعال‌شدن ورود و ذخیره‌سازی، ابتدا پروژه Supabase را بسازید و مقادیر فایل <code>.env</code> را تنظیم کنید.</p><ol><li>در Supabase یک پروژه ایجاد کنید.</li><li>محتوای <code>supabase/schema.sql</code> را در SQL Editor اجرا کنید.</li><li>در Authentication → Providers → Email، تأیید ایمیل را خاموش کنید.</li><li>آدرس پروژه و کلید anon را در متغیرهای محیطی قرار دهید.</li></ol><p className="muted">راهنمای کامل در README پروژه قرار دارد.</p></section></main>;

  if (!session) return <main className="auth-page">{themeToggle}<form className="panel auth-card" onSubmit={submitAuth}><h1>کارسنج</h1><p className="muted">سوابق کارکرد و دستمزد ماهانه</p><div className="tabs"><button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>ورود</button><button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>ثبت‌نام</button></div><label>ایمیل<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr" /></label><label>رمز عبور<input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="حداقل ۶ کاراکتر" dir="ltr" /></label><button className="primary full" disabled={authBusy}>{authBusy ? 'در حال انجام…' : authMode === 'login' ? 'ورود به حساب' : 'ساخت حساب'}</button>{notice && <p className="notice">{notice}</p>}</form></main>;

  return <main className="app-shell"><header className="topbar"><button type="button" className="profile-trigger" onClick={() => setProfileOpen(true)} aria-haspopup="dialog" aria-expanded={profileOpen} title="پروفایل شخصی"><span className="profile-trigger-avatar">{session.user.user_metadata?.avatar_url ? <img src={session.user.user_metadata.avatar_url} alt="" /> : <span aria-hidden="true">👤</span>}</span><span className="profile-trigger-text"><strong>{session.user.user_metadata?.full_name || "پروفایل من"}</strong><small>{session.user.email}</small></span><span className="profile-trigger-chevron" aria-hidden="true">⌄</span></button><div className="brand"><div><h1>کارسنج</h1><p>مدیریت کارکرد و دستمزد</p></div></div><div className="topbar-actions">{themeToggle}<span className="active-work-account" title="حساب کاری فعال">{panels.find(panel => panel.id === activePanelId)?.name || "حساب کاری انتخاب نشده"}</span><button type="button" className="subtle panel-drawer-trigger" onClick={() => setPanelDrawerOpen(true)} aria-haspopup="dialog" aria-expanded={panelDrawerOpen}><span className="panel-trigger-icon" aria-hidden="true">☷</span><span className="panel-trigger-label">حساب‌های کاری</span><span className="panel-trigger-chevron" aria-hidden="true">‹</span></button><button className="subtle" onClick={() => supabase.auth.signOut()}>خروج</button></div></header>
    {profileOpen && <div className="profile-backdrop" onClick={() => setProfileOpen(false)}><section className="profile-drawer panel" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={e => e.stopPropagation()}><div className="profile-drawer-head"><div><h2 id="profile-title">پروفایل شخصی</h2><p className="muted">اطلاعات حساب کاربری خود را مدیریت کنید.</p></div><button type="button" className="subtle" aria-label="بستن پروفایل" onClick={() => setProfileOpen(false)}>✕</button></div><div className="profile-email-row"><span>ایمیل حساب</span><strong dir="ltr">{session.user.email}</strong></div><form className="profile-form" onSubmit={saveProfile}><div className="profile-avatar-editor"><div className="profile-avatar-preview">{profileAvatarPreview ? <img src={profileAvatarPreview} alt="پیش‌نمایش عکس پروفایل" /> : profileAvatar ? <img src={profileAvatar} alt="عکس پروفایل" /> : <span aria-hidden="true">👤</span>}</div><label className="subtle profile-upload-label">انتخاب عکس پروفایل<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0] || null; setProfileAvatarFile(file); setProfileAvatarPreview(file ? URL.createObjectURL(file) : ''); }} /></label><small>JPG، PNG یا WebP؛ حداکثر ۲ مگابایت</small></div><label>نام نمایشی<input value={profileName} onChange={e => setProfileName(e.target.value)} maxLength={80} placeholder="نامی که در پروفایل نمایش داده می‌شود" /></label><label>شماره تماس<input type="tel" value={profilePhone} onChange={e => setProfilePhone(e.target.value)} maxLength={30} placeholder="اختیاری" dir="ltr" /></label><label>درباره من<textarea value={profileBio} onChange={e => setProfileBio(e.target.value)} maxLength={300} rows={3} placeholder="چند کلمه درباره خودتان (اختیاری)" /></label><button className="primary full" disabled={profileBusy}>{profileBusy ? 'در حال ذخیره…' : 'ذخیره پروفایل'}</button>{notice && <p className="notice">{notice}</p>}</form></section></div>}
    {panelDrawerOpen && <div className="panel-drawer-backdrop" onClick={() => setPanelDrawerOpen(false)}><aside className="panel-drawer panel" role="dialog" aria-modal="true" aria-labelledby="panel-drawer-title" onClick={e => e.stopPropagation()}><div className="panel-drawer-head"><h2 id="panel-drawer-title">مدیریت حساب‌های کاری</h2><button type="button" className="subtle panel-drawer-close" aria-label="بستن" onClick={() => setPanelDrawerOpen(false)}>✕</button></div><div className="panel-switcher"><div className="panel-switcher-current"><label htmlFor="active-panel">حساب کاری</label><select id="active-panel" value={activePanelId} onChange={e => { const nextPanelId = e.target.value; setActivePanelId(nextPanelId); if (session?.user?.id) window.localStorage.setItem(`work-panel-${session.user.id}`, nextPanelId); setEditingPanelName(false); }} disabled={!panels.length || panelBusy}><option value="" disabled>انتخاب حساب کاری</option>{panels.map(panel => <option key={panel.id} value={panel.id}>{panel.name}</option>)}</select><div className="panel-management-actions">{editingPanelName ? <form className="rename-panel-form" onSubmit={renamePanel}><input value={panelNameDraft} onChange={e => setPanelNameDraft(e.target.value)} aria-label="نام جدید حساب کاری" maxLength={80} autoFocus /><button className="primary" disabled={panelBusy}>{panelBusy ? 'در حال ذخیره…' : 'ذخیره نام'}</button><button type="button" className="subtle" onClick={() => setEditingPanelName(false)} disabled={panelBusy}>لغو</button></form> : <><button type="button" className="subtle" onClick={beginRenamePanel} disabled={!activePanelId || panelBusy}>تغییر نام</button><button type="button" className="delete-panel-btn" onClick={deletePanel} disabled={!activePanelId || panelBusy || panels.length <= 1} title={panels.length <= 1 ? 'آخرین حساب کاری قابل حذف نیست' : 'حذف حساب کاری انتخاب‌شده'}>حذف حساب کاری</button></>}</div></div><form className="new-panel-form" onSubmit={createPanel}><input value={newPanelName} onChange={e => setNewPanelName(e.target.value)} placeholder="نام حساب کاری جدید" aria-label="نام حساب کاری جدید" maxLength={80} /><button className="primary" disabled={panelBusy}>{panelBusy ? 'در حال انجام…' : '＋ افزودن حساب کاری'}</button></form></div></aside></div>}
    <section className="summary-grid"><article className="panel summary"><span>ساعت کارکرد این ماه</span><strong style={{ fontFamily: 'inherit', fontSize: '1.5rem', fontWeight: 700 }}><span dir="ltr" style={{ fontSize: '1.5rem', fontFamily: 'inherit', fontWeight: 700, display: 'inline-block' }}>{totalHoursLabel}</span> ساعت</strong></article><article className="panel summary"><span>مبلغ قابل پرداخت</span><strong>{money(totalPay)}</strong></article></section>
    <section className="panel table-panel"><div className="section-head report-section-head"><div className="month-switch"><button aria-label="ماه قبل" onClick={() => setMonth(shiftJalaliMonth(month, -1))}>›</button><strong>{monthTitle(month)}</strong><button aria-label="ماه بعد" onClick={() => setMonth(shiftJalaliMonth(month, 1))}>‹</button></div><article className="rate-card rate-card-top"><form onSubmit={saveRate}><div className="rate-line"><div className="rate-input-wrap"><input id="rate" aria-label="نرخ هر ساعت به تومان" title="نرخ هر ساعت به تومان" type="number" min="0" step="1000" value={rateInput} onChange={e => setRateInput(e.target.value)} required/><label className="rate-compact-label" htmlFor="rate">نرخ هر ساعت</label></div><button className="primary">ذخیره</button></div></form></article></div>
      {notice && <div className="notice notice-bar">{notice}</div>}{loading ? <div className="empty">در حال بارگذاری اطلاعات…</div> : <div className="table-wrap"><table><thead><tr><th>تاریخ شمسی</th><th>ساعت شروع</th><th>ساعت پایان</th><th>توضیحات</th><th>ساعت روز</th><th>عملیات</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><DateSelect value={row.work_date} onChange={value => updateRow(row.id, 'work_date', value)} /></td><td><TimeSelect value={row.start_time} onChange={value => updateRow(row.id, 'start_time', value)} label="ساعت شروع"/></td><td><TimeSelect value={row.end_time} onChange={value => updateRow(row.id, 'end_time', value)} label="ساعت پایان"/></td><td><input value={row.notes || ''} onChange={e => updateRow(row.id, 'notes', e.target.value)} placeholder="اختیاری"/></td><td className="hours-cell" dir="ltr">{durationLabel(row)}</td><td><div className="row-actions"><button className="save-btn" onClick={() => saveRow(row)}>ذخیره</button><button className="delete-btn" onClick={() => deleteRow(row)}>حذف</button></div></td></tr>)}</tbody></table>{rows.length === 0 && <div className="empty">برای این ماه هنوز ردیفی ثبت نشده است.</div>}</div>}
      <div className="table-footer"><button className="primary" onClick={addRow}>＋ افزودن روز کاری</button></div>
    </section>
    <div className="report-export-area" dir="ltr"><div className="report-export-menu-wrap"><button type="button" className="subtle report-export-trigger" onClick={() => setExportMenuOpen(open => !open)} aria-expanded={exportMenuOpen}>⇩ خروجی گرفتن از گزارش</button>{exportMenuOpen && <div className="report-export-menu" dir="rtl"><button type="button" onClick={exportImage}>ذخیره به‌صورت عکس (PNG)</button><button type="button" onClick={exportPdf}>ذخیره به‌صورت PDF</button><button type="button" onClick={exportSpreadsheet}>ذخیره به‌صورت Excel</button><button type="button" onClick={exportWord}>ذخیره به‌صورت Word</button></div>}</div></div>
    <footer>اطلاعات هر حساب کاری به‌صورت جداگانه ذخیره می‌شود.</footer></main>;
}