# Web App UBM — versi GitHub (frontend) + API Apps Script (sekali deploy)

Kenapa dibagi dua?
- Tampilan & fitur di depan (index.html) tinggal di GitHub Pages.
  Revisi tampilan = edit file, push ke GitHub, Pages update otomatis.
  Tidak perlu buka Apps Script lagi.
- API (api.gs) dipasang SEKALI di Apps Script dan jarang berubah.
  Ia hanya jembatan baca/tulis ke Sheet e-RM UBM.
  Revisi API saja yang butuh deploy ulang di Apps Script.

Langkah awal (sekali saja):
1. Di Sheet e-RM UBM > Ekstensi > Apps Script, tempel api.gs (bukan Code.gs lama).
2. Deploy > Deployment baru > Aplikasi web, Jalankan sebagai: Saya,
   Yang memiliki akses: Siapa pun. Salin URL /exec-nya.
3. Di index.html, ganti ___APPS_SCRIPT_API_URL___ dengan URL /exec itu.
4. Push index.html ke repo GitHub (misal folder ubm di repo bdiHub, atau repo baru),
   aktifkan GitHub Pages dari branch tersebut. Itulah link untuk tim.

Revisi berikutnya:
- Ubah tampilan/fitur di index.html saja > push GitHub > selesai.
- Ubah struktur data/fungsi simpan > ubah api.gs > Deploy ulang di Apps Script
  (Deployment yang sama, buat versi baru), URL /exec tetap sama, jadi
  index.html di GitHub tidak perlu diubah.

Catatan keamanan: URL API dan link GitHub Pages hanya untuk Tim UBM,
jangan dipublikasikan, karena lewat API itu orang bisa menambah data ke Sheet.

## Live (per 30 Okt 2026, terverifikasi)
- Web app (GitHub Pages): https://ridgital-auto.github.io/ubm-puskesmas-babakan/
- Repo: https://github.com/ridgital-auto/ubm-puskesmas-babakan (branch main, commit pertama 905b679)
- API Apps Script (deployment versi 1, 30 Okt 2026 01:04 WITA, Jalankan sebagai ridgitalstudio, akses Siapa pun):
  https://script.google.com/macros/s/AKfycbyrd06NCIlqRu1lP37kZzEdAtNVA7rCJWisu29MWSrZZ3piagsxVdFhDk-QJeyQasJvEw/exec
- Database: Sheet "e-RM UBM Puskesmas Babakan" (ID 16h7TiyO2quO1xR7IHcHNh0fe0Gy_mrc2djFZhgThKDo), tetap privat.
- Link web app dan API hanya untuk Tim UBM, jangan dipublikasikan.
