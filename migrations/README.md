# SSCircle · SQL migrations untuk D1 staging

Folder ini menyimpan **perubahan skema yang telah direview**, bukan file backup atau isi database anggota.

## Alur kerja developer

1. Lihat struktur staging melalui **Actions → SSCircle · Lihat Database D1**, mode \`overview\`.
2. Buat file SQL bernama misalnya \`migrations/v10_51_add_profile_picture.sql\`. Tulis SQL idempoten jika memungkinkan; jangan pernah berisi dump atau data pribadi production.
3. Buat branch + Pull Request. Owner harus meninjau perubahan skema dan dampak backward compatibility. Workflow di GitHub belum melakukan audit semantik terhadap perintah SQL.
4. Setelah PR di-merge ke \`main\`, pemilik yang berizin menjalankan **Actions → SSCircle D1 - Terapkan Migrasi Staging → Run workflow**, masukkan hanya nama file SQL.
5. Pastikan environment \`database-staging-write\` memiliki nama D1 staging, kredensial terpisah, dan required reviewer bila tersedia. Periksa hasil workflow, lalu jalankan inspector kembali.
6. Migrasi production **tidak disediakan otomatis**. Owner harus membuat backup, menguji staging, kemudian melakukan proses production terpisah.

**Penting:** nama database harus memuat segmen \`staging\` (misalnya \`sscircle-staging\`). Validasi nama **tidak** menjamin kredensial Cloudflare tidak mengarah ke akun production. Gunakan akun Cloudflare terpisah dan token D1 Edit khusus staging.

Saat ini folder ini sengaja belum memiliki migrasi SQL untuk membuat tabel \`minecraft_accounts\`. Struktur tabel yang benar harus diturunkan dari skema aplikasi dan diverifikasi sebelum membuat migrasi; jangan mengarang kolom ataupun menyalin data asli pengguna.
