# BEKIUZ BUILD

**BEKIUZ BUILD** — foydalanuvchi o‘zbek tilida yozgan uy talabidan konseptual qavat rejasini va qurilish materiallari miqdorini tayyorlaydigan AI yordamchi.

## MVP imkoniyatlari

- “7 metr eni, 5 metr bo‘yi, beton plita 30 sm, 3 xona va shifer tom” kabi oddiy matndan o‘lchamlarni aniqlash.
- Netlify server funksiyasi orqali mavjud Bekiuz AI xizmatiga ulanib, xona nomlari va joylashuvini tavsiya qilish.
- AI xona rejasini SVG chizma shaklida ko‘rsatish va yuklab olish.
- Beton plita hajmini (m³) va taxminiy massasini (tonna) hisoblash.
- Devor hajmi, g‘isht soni, tom yuzasi va shifer/profnastil listlari miqdorini taxmin qilish.
- Hisobotni chop etish yoki PDF sifatida saqlash.
- Moslashuvchan, o‘zbek tilidagi mobilga mos interfeys; 3D demo model olib tashlangan.

## AI qanday ulanadi?

Brauzer `/.netlify/functions/ai-plan` funksiyasiga so‘rov yuboradi. Netlify funksiyasi server tomonidan mavjud Bekiuz AI Worker’ning `/api/chat` endpointiga murojaat qiladi. **AI kaliti brauzerga joylanmaydi va Netlify’da alohida Gemini kaliti shart emas.** AI serveridagi bepul limit tugashi yoki server vaqtincha ishlamasligi mumkin; shu holatda foydalanuvchiga xatolik ko‘rsatiladi.

## Material hisobining farazlari

Beton zichligi uchun 2.4 t/m³, devor g‘ishti uchun taxminan 394 dona/m³ va 5% zaxira, tom qoplamasi uchun taxminiy qiyalik, 30 sm karniz, 10% zaxira hamda bir listning foydali qoplash maydoni olinadi. Eshik va deraza o‘lchamlari standart taxmin. Natijalar dastlabki miqdoriy bahodir; mahalliy material o‘lchamlari va quruvchi hisoblari bilan solishtirish kerak.

Beton plita qalinligini foydalanuvchi kiritgan qiymat bo‘yicha matematik hisoblaymiz, ammo 30 sm plita har qanday uy uchun to‘g‘ri degani emas. Grunt, poydevor, armatura, ustun/to‘sin, tom konstruksiyasi va boshqa xavfsizlikka oid yechimlarni malakali muhandis belgilashi kerak. Chizma konseptual, tasdiqlangan ishchi loyiha emas.

## Sayt va repozitoriylar

- Netlify sayti: https://delightful-stroopwafel-31f3ff.netlify.app/
- Netlify boshqaruvi: https://app.netlify.com/projects/delightful-stroopwafel-31f3ff
- Asosiy repo: https://github.com/bekiuz/BEKIUZ_BUILD
- Netlify’dan import qilingan repo: https://github.com/bekiuz/bekiuz_build-1098e
- AI xizmati: https://github.com/bekiuz/bekiuz-ai

## Build

`node scripts/build.mjs` statik sayt fayllarini `dist/` ichiga nusxalaydi. Netlify Functions `netlify/functions/` papkasida qoladi va alohida server tomonida ishga tushadi.
