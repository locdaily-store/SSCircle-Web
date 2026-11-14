/* Shared starter tutorials. Content is plain text and can be customized from Admin Control. */
'use strict';
window.SSCircleGettingStartedDefaults = {
  enabled:true,
  title:'How to Play',
  subtitle:'Panduan memulai petualanganmu di SSCircle, dari pendaftaran hingga akun Minecraft terhubung.',
  sections:[
    {id:'registration',title:'Cara Mendaftar',summary:'Dari formulir hingga keputusan pendaftaran.',icon:'01',steps:[
      {title:'Buka Registration',text:'Buka halaman Registration dan pastikan pendaftaran sedang dibuka. Baca ketentuan sebelum mengisi formulir.',href:'/registration.html',linkLabel:'Buka Registration'},
      {title:'Isi formulir dengan benar',text:'Isi semua pertanyaan wajib. Pertanyaan dapat disesuaikan oleh admin, jadi baca petunjuk pada setiap kolom.'},
      {title:'Simpan kode pendaftaran',text:'Setelah formulir dikirim, simpan kode pendaftaran. Jangan membagikannya kepada orang lain.'},
      {title:'Periksa hasil seleksi',text:'Buka Cek Status dan masukkan kode pendaftaran. Status dapat berupa menunggu, diterima, atau ditolak.',href:'/status.html',linkLabel:'Cek Status'}]},
    {id:'account',title:'Aktivasi Akun Website',summary:'Mengaktifkan Profile dan membuat password Dashboard.',icon:'02',steps:[
      {title:'Pastikan pendaftaran diterima',text:'Periksa status pendaftaran. Akses anggota hanya tersedia sesuai status dan kebijakan server.',href:'/status.html',linkLabel:'Periksa status'},
      {title:'Baca petunjuk Mail Box',text:'Jika tersedia, buka Mail Box untuk membaca instruksi aktivasi dan kode yang diberikan. Hindari membagikan kode aktivasi.'},
      {title:'Buat password Dashboard',text:'Buka Profile dan ikuti petunjuk aktivasi akun menggunakan kode yang sesuai. Buat password yang kuat dan unik.',href:'/my-sscircle',linkLabel:'Buka Profile'},
      {title:'Masuk dan kelola keamanan',text:'Gunakan password Dashboard untuk masuk, mengelola sesi, preferensi profil, dan akun Minecraft.'}]},
    {id:'link',title:'Hubungkan Akun Minecraft',summary:'Panduan Java Premium, Non-Premium, dan Bedrock.',icon:'03',steps:[
      {title:'Masuk ke Profile',text:'Login ke Dashboard dan buka Pengaturan Akun → Minecraft Account.',href:'/my-sscircle',linkLabel:'Buka Pengaturan Akun'},
      {title:'Bergabung ke server Minecraft',text:'Masuk menggunakan akun Minecraft yang ingin dihubungkan. Identitas Java Premium, Non-Premium, dan Bedrock harus sesuai dengan akun asli.'},
      {title:'Ikuti proses pairing yang tersedia',text:'Gunakan instruksi kode atau verifikasi yang benar-benar ditampilkan oleh website dan plugin server. Jangan memasukkan kode ke situs lain.'},
      {title:'Verifikasi status sinkronisasi',text:'Pastikan akun muncul sebagai terhubung di Profile. Statistik akan mengikuti data yang berhasil dikirimkan server.'}]},
    {id:'play',title:'Bergabung & Mulai Bermain',summary:'Persiapan Minecraft, Discord, dan peraturan server.',icon:'04',steps:[
      {title:'Baca aturan SSCircle',text:'Pelajari Server Rules dan syarat keanggotaan yang berlaku.',href:'/rules.html',linkLabel:'Baca Server Rules'},
      {title:'Periksa informasi server di Discord',text:'IP address, versi Minecraft, dan informasi pembukaan server diumumkan melalui Discord komunitas. Jangan menganggap alamat atau versi lama masih berlaku.',href:'https://discord.gg/vQQSgY2GRS',linkLabel:'Buka Discord'},
      {title:'Pilih edisi Minecraft yang sesuai',text:'Java Premium, Non-Premium, dan Bedrock dapat memiliki prosedur login yang berbeda. Ikuti informasi terbaru dari admin.'},
      {title:'Gabung dan mulai petualangan',text:'Setelah koneksi berhasil, ikuti aturan server dan mulailah berinteraksi dengan komunitas.'}]},
    {id:'community',title:'Fitur Komunitas',summary:'Profile, statistik, teman, Achievement, Event, dan Voting.',icon:'05',steps:[
      {title:'Jelajahi Member Dashboard',text:'Lihat profil, status keanggotaan, perjalanan dan statistik Minecraft pada halaman Profile.',href:'/my-sscircle',linkLabel:'Lihat Profile'},
      {title:'Bangun koneksi',text:'Gunakan fitur komunitas untuk mencari anggota dan mengelola Friends sesuai pengaturan privasi.'},
      {title:'Ikuti event dan voting',text:'Pantau jadwal kegiatan komunitas, ikuti voting jika memenuhi syarat, dan ajukan event bila fitur tersedia.',href:'/events.html',linkLabel:'Lihat Event'},
      {title:'Kumpulkan pencapaian',text:'Lihat penghargaan yang didapat dari aktivitas dan pencapaian komunitas pada Member Dashboard.'}]},
    {id:'help',title:'Bantuan & Masalah Umum',summary:'Solusi kendala login, pendaftaran, dan sinkronisasi.',icon:'06',steps:[
      {title:'Tidak bisa login?',text:'Periksa kode pendaftaran dan password Dashboard. Jangan menyamakan keduanya; fungsinya berbeda.',href:'/status.html',linkLabel:'Buka Cek Status'},
      {title:'Akun Minecraft tidak terhubung?',text:'Pastikan sedang memakai akun Minecraft yang benar dan mengikuti instruksi pairing terbaru. Jangan membagikan kode verifikasi.'},
      {title:'Statistik belum muncul?',text:'Statistik memerlukan koneksi server dan plugin sinkronisasi yang aktif. Periksa kembali setelah server tersedia.'},
      {title:'Masih mengalami kendala?',text:'Hubungi admin melalui Discord SSCircle Community dengan penjelasan masalah tanpa menyertakan password atau kode rahasia.',href:'https://discord.gg/vQQSgY2GRS',linkLabel:'Hubungi komunitas'}]}
  ],
  faq:[
    {question:'Apakah harus sudah diterima untuk membuat akun Dashboard?',answer:'Ikuti ketentuan aktivasi yang diberikan website setelah pendaftaran diterima. Kode pendaftaran untuk Cek Status berbeda dari password Dashboard.'},
    {question:'Di mana mendapatkan IP server Minecraft?',answer:'Informasi alamat dan versi server dibagikan melalui Discord resmi SSCircle Community sesuai jadwal pembukaan.'},
    {question:'Apakah Java Non-Premium dan Bedrock didukung?',answer:'SSCircle menyiapkan alur untuk Java Premium, Non-Premium, dan Bedrock. Dukungan efektif bergantung konfigurasi server yang sedang aktif.'},
    {question:'Kenapa statistik Minecraft belum terlihat?',answer:'Statistik baru tersedia setelah akun berhasil terhubung dan plugin server mengirim data sinkronisasi.'},
    {question:'Kode verifikasi Minecraft harus diberikan ke siapa?',answer:'Jangan berikan kode pairing atau password kepada orang lain. Masukkan hanya ke antarmuka resmi SSCircle sesuai petunjuk yang tampil.'}
  ]
};