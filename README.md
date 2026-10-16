# ثبت ساعت کاری (فارسی)

وب‌اپلیکیشن راست‌چین برای ثبت ساعت شروع و پایان کار، توضیحات روزانه، مجموع ساعت ماه و محاسبه مبلغ بر اساس نرخ ساعتی. تاریخ‌ها در رابط کاربری شمسی هستند؛ دیتابیس تاریخ را به‌صورت استاندارد SQL ذخیره می‌کند.

## راه‌اندازی

1. در Supabase یک پروژه بسازید.
2. محتوای `supabase/schema.sql` را در SQL Editor اجرا کنید.
3. در Authentication → Providers → Email گزینه تأیید ایمیل (Confirm email) را خاموش کنید.
4. در Project Settings → API، آدرس پروژه و کلید عمومی anon/publishable را بردارید.
5. متغیرهای محیطی را تنظیم کنید:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. اجرا: `npm install` سپس `npm run dev`.

## انتشار در Cloudflare Pages / Vercel / Netlify

Build command: `npm run build`
Output directory: `dist`

در تنظیمات سرویس انتشار همان دو متغیر محیطی بالا را اضافه کنید.

## امنیت

کلید `service_role` را هرگز در فرانت‌اند یا GitHub قرار ندهید. سیاست‌های RLS باعث می‌شوند کاربران فقط اطلاعات خودشان را بخوانند و تغییر دهند.