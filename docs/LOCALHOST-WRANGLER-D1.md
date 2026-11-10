# SSCircle Web V10.49.1.5 · Localhost untuk tim (Wrangler + D1)

> **Hanya development.** Konfigurasi `wrangler.local.toml` memakai ID database **palsu**, tanpa Cloudflare API Token/Account ID dan tanpa akses data produksi. Tidak ada migrasi/SQL yang diterapkan ke Cloudflare.

## Kenapa preview Live Server VS Code tidak bisa baca DB?

SSCircle memakai Cloudflare **Pages Functions Advanced Mode** (`_worker.js`) dan Cloudflare **D1** (`env.DB`). Ketika website dibuka dengan Live Server, `file://`, atau `python -m http.server`, browser hanya menerima HTML/CSS/JS. Tidak ada Worker yang menjalankan endpoint `/api/*`, binding `DB`, atau sesi aman. Maka Admin, pendaftaran, Cek Status, Mailbox, Profile, Voting, dan berbagai data gagal.

Untuk menjalankan full-stack-nya gunakan **Wrangler Pages Dev**, bukan Live Server.

## Persiapan Windows / VS Code

1. Pasang **Node.js LTS 20+**, akses internet untuk instalasi npm, dan VS Code.
2. Ekstrak `SSCircle-Web-Localhost-V10.49.1.5-local.3.zip` ke folder biasa, contohnya `D:\\Projects\\SSCircle-Web`. Jangan buka ZIP-nya langsung sebagai folder virtual.
3. Buka **VS Code → File → Open Folder** → folder hasil ekstrak (harus terlihat `package.json`, `_worker.js`, `wrangler.local.toml`).
4. Buka **Terminal → New Terminal**, lalu jalankan:

   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```

   Sebagai alternatif di Windows, klik dua kali `MULAI-LOCALHOST.bat`. Skrip tersebut memasang dependency melalui npm apabila belum ada.
5. Buka **http://localhost:8788**. Admin Control: **http://localhost:8788/admin.html**. Pendaftaran: `/registration`. Cek Status: `/status.html`.
6. Untuk menghentikan server tekan **Ctrl+C** di Terminal.

**Jangan** menjalankan `npm run dev` bersamaan dengan VS Code Live Server pada port berbeda dan lalu membuka port Live Server. Pastikan URL yang dibuka adalah `http://localhost:8788`.

### Login Admin localhost

Saat pertama kali dijalankan, skrip membuat `.dev.vars` berisi `SESSION_SECRET`, `ADMIN_PASSWORD`, `SSCIRCLE_LINK_SERVER_SECRET` **acak dan khusus lokal**. Buka `.dev.vars` di VS Code dan salin **nilai `ADMIN_PASSWORD`** ke form login Admin. File ini sudah diabaikan Git. Jangan pernah gunakan/commit secret asli Cloudflare.

### Data percobaan (bukan data pemain sungguhan)

Website memulai dengan form sederhana, event/voting/season contoh, dan dua pendaftaran fiktif:

| Simulasi | Kode Cek Status / login |
| --- | --- |
| Diterima | `A1B2C3D4E5F601234567` |
| Menunggu | `B1B2C3D4E5F601234567` |

Data ditulis ke SQLite D1 lokal oleh Wrangler. Perubahan lokal (termasuk pengaturan admin) tetap ada setelah terminal ditutup karena disimpan di `.wrangler/state`. Seeding awal bersifat idempoten: menjalankan ulang tidak mereset konfigurasi yang sudah diedit.

**Profile dengan password Dashboard** tetap mensyaratkan aktivasi/otorisasi sesuai logika SSCircle. Gunakan workflow Admin/Mailbox **lokal** bila ingin mengujinya, bukan akun production. Sinkronisasi akun Minecraft yang benar membutuhkan plugin server terpisah yang diarahkan ke endpoint testing; plugin production jangan diarahkan ke localhost.

## Apa yang disiapkan otomatis?

`npm run dev` melakukan:

1. Membangun folder `.local-pages` yang berisi **hanya file web publik** + `_worker.js`, `_routes.json`, `_headers`, dan aset. SQL, source plugin, `.dev.vars`, serta tools **tidak** disajikan ke browser.
2. Menyiapkan `.dev.vars` unik jika belum ada.
3. Menjalankan `dev/local-schema.sql` terhadap **D1 lokal** memakai `wrangler d1 execute --local`.
4. Mengisi contoh melalui `dev/local-seed.sql` jika belum ada.
5. Menjalankan `wrangler pages dev .local-pages` pada port `8788`, IP `127.0.0.1`, dengan binding D1 bernama `DB`, dan persistensi `.wrangler/state`.

Konfigurasi ini secara sengaja **tidak** memuat `pages_build_output_dir` untuk deployment produksi. Gunakan ZIP Cloudflare production yang sudah terpisah untuk deployment web normal, **bukan** ZIP source localhost.

## Uji koneksi database

Buka alamat berikut di browser:

`http://localhost:8788/api/health`

Hasil yang diharapkan:

```json
{
  "release": "10.49.1.5",
  "status": "ready",
  "checks": {
    "data": "ready",
    "playerSession": "ready",
    "adminLogin": "ready",
    "minecraftLink": "ready"
  }
}
```

Output aktual mengandung field `services` dan `supportCode` tambahan. Perintah inspeksi database lokal:

```powershell
npm run local:check
npm run local:init
npm test
```

`npm run local:check` membaca jumlah record dari **DB lokal**. `npm run local:init` membangun ulang file publik dan membuat tabel/data yang belum ada; tidak menghapus record hasil pengujian. `npm test` menjalankan tes Node (termasuk integrasi D1 lokal yang disimulasikan dengan SQLite), tidak memerlukan login Cloudflare.

### VS Code Task (opsional)

Terminal → Run Task → `SSCircle: Preview Localhost (Wrangler + D1)`.

## Kalau localhost masih gagal

| Masalah | Pemeriksaan / solusi |
| --- | --- |
| `npm` tidak dikenali | Instal Node.js LTS, restart VS Code. |
| Wrangler tidak ditemukan | Jalankan `npm install` dari folder yang mempunyai `package.json`. |
| `/api/health` = 404 | Salah URL/port atau halaman dibuka lewat Live Server, bukan Wrangler. |
| `checks.data = binding-missing` | Pastikan script local.3 menggunakan `--d1 DB=DB` pada Pages dan `wrangler.local.toml` berisi `preview_database_id = \"DB\"`. |
| `checks.data = schema-missing` | Hentikan Wrangler dan jalankan `npm run local:init` lalu `npm run dev`. |
| `checks.data = query-failed` | Periksa error terminal; `npm run local:check` harus bisa menghitung record. |
| `playerSession/adminLogin = unavailable` | Periksa `.dev.vars` ada, nama variabel benar, lalu restart Wrangler. |
| `Profile` diarahkan ke Cek Status | Itu normal sebelum login dengan kode yang `accepted`. |
| `Profile` meminta password Dashboard | Akun lokal belum diaktivasi untuk secure session; lakukan alur aktivasi lokal. |
| Media R2 tidak ada | Localhost memakai `MEDIA_MODE=D1` sehingga upload gambar baru tersimpan di D1 lokal; file R2 production tidak otomatis tersedia. |
| Website tampil tetapi masih menunjukkan data lama | Tutup server Live Server, buka port 8788, Ctrl+Shift+R; cookies dan DB lokal dipisahkan dari production. |
| Port 8788 dipakai | Tutup proses lama, atau ganti `--port 8788` di `scripts/local-dev.mjs` untuk dev saja. |

## Bagaimana kalau collaborator ingin melihat data yang sama seperti website online?

**Secara default tidak bisa dan tidak seharusnya otomatis.** Localhost menggunakan **database D1 lokal terpisah**, sehingga tidak menyalin pendaftar, password, Mailbox, statistik, atau pengaturan production. Cloudflare mendokumentasikan bahwa `wrangler pages dev` untuk Pages menggunakan D1 lokal, bukan D1 remote. Jangan membuat fitur proxy database production publik hanya agar preview terlihat sama.

Jika benar-benar perlu menguji perubahan berdasarkan data nyata:

1. Pemilik menyiapkan **database D1 staging** terpisah di Cloudflare. Jangan berikan token D1 Edit production kepada collaborator.
2. Tinjau dan **anonimkan data** sebelum membuat export SQL untuk lokal. Hapus token, password, kode aktivasi, data pribadi, percakapan Mailbox, dan informasi sensitif lain; gunakan data fiktif bila bisa.
3. Impor export sanitasi ke D1 lokal dengan perintah Wrangler `d1 execute` yang memakai `--local` dan konfigurasi `wrangler.local.toml`, **tanpa `--remote`**. Impor manual hanya setelah meninjau isinya dan jangan commit SQL berisi record.
4. Jika collaborator hanya perlu melihat struktur/jumlah tabel staging, pakai Inspector D1 GitHub yang sudah disediakan proyek melalui Actions, bukan akses production langsung.

**Tidak ada sinkronisasi dua arah GitHub ↔ D1**: Git menyimpan source/migrasi, sedangkan D1 menyimpan record. Editing database lokal tidak mengubah database Cloudflare.

## File penting

- `wrangler.local.toml`: konfigurasi D1 **lokal saja** (database_id sintetis).
- `.dev.vars`: dibuat otomatis, private, jangan di-commit.
- `scripts/local-dev.mjs`: init D1, env secret, preview Wrangler.
- `scripts/build-local.mjs`: output `.local-pages`, tanpa source/private file.
- `dev/local-schema.sql`: tabel legacy SSCircle untuk pengembangan.
- `dev/local-seed.sql`: data contoh fiktif.
- `.vscode/tasks.json`: tombol Run Task di VS Code.
- `MULAI-LOCALHOST.bat`: startup alternatif Windows.
- `.wrangler/state`: DB local persistent, diabaikan Git.

## Batasan verifikasi

Pengujian Node/SQLite lokal dilakukan terhadap Worker asli, termasuk sesi, form, status, admin, dan pendaftaran. **Saya belum menjalankan `wrangler pages dev` sungguhan pada lingkungan ini** karena instalasi paket Wrangler dari npm membutuhkan jaringan, yang tidak tersedia pada lingkungan eksekusi saat pengerjaan. Perintah telah disusun berdasarkan dokumentasi Cloudflare; uji runtime terakhir harus dilakukan di PC pengguna/collaborator.

## Perbaikan khusus Wrangler 4.160.0 (local.2)

Mulai Wrangler 4.160.0, `d1 execute --local --preview` gagal dengan pesan `Cannot use --preview without --remote`. Script `scripts/local-dev.mjs` sudah direvisi agar perintah `d1 execute` hanya menggunakan **`--local`** dan path persistensi yang sama dengan `pages dev`.

- **Jangan hapus** `preview_database_id = "DB"` dari `wrangler.local.toml`: field itu *konfigurasi binding* untuk Pages, tidak sama dengan opsi CLI `--preview`.
- **Jangan tambahkan** `--remote`: itu dapat menargetkan database Cloudflare, bukan database lokal.
- Setelah mengganti source, tidak perlu menghapus `node_modules`, folder `.wrangler/state`, atau file `.dev.vars`. Buka terminal pada root project dan jalankan `npm.cmd run dev`.
- Jika Wrangler menampilkan `schema-missing`, jalankan `npm.cmd run local:init`, lalu `npm.cmd run local:check` dan `npm.cmd run dev`.
- `--yes` ditambahkan untuk impor file SQL idempoten sehingga tidak meminta konfirmasi berulang saat development.


## Perbaikan kedua Wrangler 4.160.0: custom `--config` ditolak pada Pages (local.3)

Jika data contoh sudah berhasil dimuat (`8 commands` dan `3 commands`), tetapi startup berakhir dengan:

```
Pages does not support custom paths for the Wrangler configuration file.
```

Penyebab: Wrangler menerima `--config wrangler.local.toml` pada perintah `d1 execute`,
namun menolak path custom pada `pages dev`. **Jangan mengganti `wrangler.local.toml` dengan
konfigurasi production** dan jangan memakai `--remote`.

File `scripts/local-dev.mjs` local.3 memakai opsi yang berbeda untuk dua perintah:

- `d1 execute DB --local --config wrangler.local.toml --persist-to .wrangler/state`: tetap memakai D1 sintetis lokal dengan ID penyimpanan `DB`.
- `pages dev .local-pages --d1 DB=DB --binding MEDIA_MODE=D1 --binding STORAGE_LIMIT_MB=500 --persist-to .wrangler/state`: tidak memakai `--config`. Database yang dibaca Pages adalah DB lokal yang sama.

**Di VS Code Windows:** ganti hanya `scripts/local-dev.mjs` dengan versi local.3, lalu jalankan:

```powershell
npm.cmd run dev
```

Tidak perlu `npm install` lagi, tidak perlu menghapus folder `.wrangler/state`, tidak perlu
menyalin/membuat database baru atau mengubah `.dev.vars`. Jika halaman terbuka tapi status
`data` belum ready, jalankan `npm.cmd run local:check` untuk memastikan tabel lokal berisi data.

**Opsi darurat tanpa mengganti script:** sesudah langkah SQL sukses, hentikan proses yang gagal,
dan jalankan perintah Pages Dev langsung dari root proyek:

```powershell
npm.cmd exec -- wrangler pages dev .local-pages --d1 DB=DB --binding MEDIA_MODE=D1 --binding STORAGE_LIMIT_MB=500 --ip 127.0.0.1 --port 8788 --persist-to .wrangler/state
```

**Keamanan:** script local.3 menolak menjalankan mode lokal jika menemukan `wrangler.toml`,
`wrangler.json`, atau `wrangler.jsonc` lain di root, sebab Pages dapat memuat konfigurasi
tersebut secara otomatis. Simpan file konfigurasi production di luar folder development,
bukan menghapus data production.
