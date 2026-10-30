# E-Sertifikat Digital Pagar Nusa

Aplikasi penerbitan sertifikat UKT untuk Pagar Nusa Rayon Pondok Pesantren Al-Amien. Dibangun dengan Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth, PostgreSQL, dan Supabase Storage.

## Kebutuhan

- Node.js 20.9 atau lebih baru
- npm
- Akun GitHub, Supabase, dan Vercel

## Menyiapkan Supabase

1. Buat proyek baru di [Supabase](https://supabase.com/dashboard). Simpan Project URL, publishable key, dan secret key di password manager.
2. Buka **SQL Editor** pada proyek Supabase.
3. Jalankan seluruh migration di `supabase/migrations/` satu per satu dalam urutan nama file berikut. Tunggu sampai satu file berhasil sebelum menjalankan file berikutnya.

   1. `202610300001_initial_schema.sql`
   2. `202610300002_certificate_draft_uniqueness.sql`
   3. `202610300003_participant_import.sql`
   4. `202610300004_certificate_issue.sql`
   5. `202610300005_generation_jobs.sql`
   6. `202610300006_generation_job_exports.sql`
   7. `20261030161744_signer_sp_kta_numbers.sql`

Migration menyiapkan tabel, kebijakan akses (RLS), fungsi, dan bucket Storage yang dibutuhkan aplikasi. Jangan jalankan migration pada database yang sudah berisi data produksi tanpa meninjau perubahan terlebih dahulu. File migration aman dijalankan ulang untuk perubahan yang memakai `IF NOT EXISTS`, tetapi pembuatan schema awal dirancang untuk database baru.

4. Di **Authentication → URL Configuration**, set **Site URL** ke alamat aplikasi yang akan dipakai. Saat lokal gunakan `http://localhost:3000`; setelah deployment ganti ke domain Vercel atau domain khusus.
5. Tambahkan URL callback berikut ke **Redirect URLs**:

   - `http://localhost:3000/auth/callback`
   - `https://<domain-aplikasi>/auth/callback`

   Ganti `<domain-aplikasi>` dengan domain aktual, misalnya domain `*.vercel.app` atau domain khusus yang dipakai.

## Menjalankan secara lokal

1. Clone repository dan masuk ke folder aplikasi:

   ```bash
   git clone https://github.com/<akun-atau-organisasi>/<nama-repository>.git
   cd <nama-repository>
   ```

2. Pasang dependensi:

   ```bash
   npm ci
   ```

3. Salin `.env.example` menjadi `.env.local`, lalu isi nilai berikut dari **Supabase → Project Settings → API Keys** dan **Project URL**:

   ```dotenv
   SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=<publishable-key>
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
   SUPABASE_SECRET_KEY=<secret-key>
   SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

   `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dipakai browser. `SUPABASE_SECRET_KEY` hanya untuk server dan skrip administrasi. **Jangan** beri awalan `NEXT_PUBLIC_` pada secret key dan jangan commit `.env.local`.

4. Untuk database Supabase yang masih baru dan belum memiliki administrator, buat akun admin pertama:

   ```bash
   npm run setup:admin
   ```

   Wizard meminta nama, email, dan kata sandi. Perintah ini hanya membuat satu administrator dan akan berhenti jika profil admin sudah ada. Jangan jalankan lagi pada database produksi yang telah memiliki admin.

5. Jalankan aplikasi:

   ```bash
   npm run dev
   ```

   Buka [http://localhost:3000](http://localhost:3000) dan masuk lewat `/login`.

6. Pemeriksaan yang tersedia:

   ```bash
   npm run lint
   npm run test:readiness
   npm run build
   ```

   `test:readiness` memerlukan `SUPABASE_URL` (atau `NEXT_PUBLIC_SUPABASE_URL`) dan `SUPABASE_SECRET_KEY` lokal.

## Menyiapkan GitHub

Pastikan `.env.local` tidak masuk ke Git. `.gitignore` mengabaikan semua file `.env*`, `.vercel`, dependensi, dan hasil build. Simpan nilai rahasia hanya di password manager dan pengaturan environment platform.

Dari folder proyek, buat commit awal lalu hubungkan repository GitHub yang sudah dibuat:

```bash
git init
git add .
git status --short
git commit -m "Siapkan aplikasi E-Sertifikat Pagar Nusa"
git branch -M main
git remote add origin https://github.com/<akun-atau-organisasi>/<nama-repository>.git
git push -u origin main
```

Sebelum `git add`, periksa `git status` dan pastikan `.env.local`, file credential, dan data pribadi tidak tercantum. Buat repository melalui GitHub, lalu pilih **private** atau **public** sesuai keputusan pemilik proyek. Periksa kembali isi repository sebelum mengubahnya menjadi publik.

## Deploy dari GitHub ke Vercel

1. Masuk ke [Vercel](https://vercel.com/dashboard) dengan akun yang akan memiliki proyek.
2. Pilih **Add New → Project**, hubungkan GitHub bila diminta, lalu pilih repository aplikasi.
3. Vercel mendeteksi Next.js secara otomatis. Pertahankan root directory di folder repository dan build command standar `next build`.
4. Pada **Environment Variables**, tambahkan variabel berikut untuk **Production** dan **Preview** bila deployment preview akan dipakai:

   | Nama | Nilai | Sifat |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL, misalnya `https://<project-ref>.supabase.co` | Publik |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key proyek | Publik |
   | `SUPABASE_SECRET_KEY` | Secret key proyek yang masih aktif | Rahasia server |
   | `NEXT_PUBLIC_SITE_URL` | URL domain aplikasi yang akan dipakai, misalnya `https://<domain-aplikasi>` | Publik |

   Secret key diperlukan kode server untuk operasi administratif. Masukkan langsung di dashboard Vercel; jangan memasukkannya ke GitHub, URL, atau file yang dikomit. Tidak perlu menambahkan `SUPABASE_SERVICE_ROLE_KEY` jika memakai `SUPABASE_SECRET_KEY`.

5. Klik **Deploy**. Setelah alamat domain tersedia, atur `NEXT_PUBLIC_SITE_URL` ke domain produksi yang benar dan lakukan redeploy supaya URL QR verifikasi mengarah ke situs publik.
6. Kembali ke Supabase **Authentication → URL Configuration**. Atur **Site URL** ke domain produksi dan tambahkan callback `https://<domain-aplikasi>/auth/callback` ke **Redirect URLs**. Tambahkan domain preview secara eksplisit jika alur reset password akan diuji pada deployment preview.
7. Uji login, reset kata sandi, halaman verifikasi QR, preview/unduh PDF, Storage tanda tangan/logo, dan job ekspor di deployment.

Vercel mengimpor repository Git dan membuat deployment dari commit yang dipilih. Mengubah environment variable memerlukan deployment ulang agar nilai baru digunakan.

## Menghubungkan Supabase melalui Vercel Marketplace (opsional)

Vercel Marketplace dapat membuat atau menghubungkan proyek Supabase dan menyinkronkan sebagian variabel Supabase ke proyek Vercel. Untuk memakai database Supabase yang sudah ada, paling sederhana tambahkan variabel aplikasi di atas secara manual. Pastikan nama variabel sesuai dengan yang dibaca aplikasi, dan tambahkan `NEXT_PUBLIC_SITE_URL` sendiri.

## Keamanan sebelum rilis

- Kunci secret Supabase yang pernah dikirim atau tersimpan di lokasi yang dapat diakses publik harus dianggap bocor. Buat secret key baru di Supabase, perbarui environment lokal/Vercel, redeploy, lalu nonaktifkan key lama setelah aplikasi berfungsi dengan key baru.
- Jangan menaruh secret key, kata sandi admin, kredensial GitHub, atau data peserta di source code, README, issue publik, atau commit.
- RLS dan pemeriksaan profil admin tetap harus aktif. Publishable key memang digunakan di browser; keamanan data bergantung pada kebijakan RLS dan pemeriksaan otorisasi server.
- Buat administrator awal hanya setelah schema migration selesai. Lindungi akun admin dengan kata sandi unik yang kuat.

## Fitur

- Login admin, pemeriksaan profil aktif di server, reset kata sandi, dan tanpa pendaftaran publik.
- Pengelolaan kegiatan UKT, peserta, hasil UKT, identitas organisasi, penandatangan, aset privat, dan template sertifikat.
- Import Excel dengan template, pratinjau validasi, deteksi duplikat, batas 500 baris per import, dan laporan kesalahan.
- Draft dan pratinjau PDF bertanda DRAFT; penerbitan PDF A4 landscape dengan nomor berurutan, QR verifikasi, hash SHA-256, dan snapshot data.
- Verifikasi publik melalui `/cek/[token]`, unduh PDF admin, serta pencabutan dan pembuatan sertifikat pengganti.
- Job penerbitan massal dengan progres dan percobaan ulang item gagal.
- Job ekspor ZIP, PDF gabungan untuk cetak, dan laporan Excel peserta serta status sertifikat per kegiatan.
- Dashboard ringkasan, audit aktivitas, RLS, dan Storage privat.

Untuk menerbitkan PDF, lengkapi data organisasi, aktifkan dua penandatangan dan unggah tanda tangan PNG, aktifkan template, serta isi `NEXT_PUBLIC_SITE_URL` dengan domain aplikasi. Job massal dan ekspor mulai berjalan setelah admin membuat job dari halaman Sertifikat.
