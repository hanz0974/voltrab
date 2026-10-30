# Koordinasi coding VoltRAB

Sebelum coding, baca kolaborasi/INDEX.md dan kedua catatan di kolaborasi/topics/coding.
Source aktif menjadi acuan; jangan menganggap audit lama sebagai keadaan terbaru.
Setelah pekerjaan penting, Codex/Jon memperbarui update-jon.md; Claude memperbarui update-claude.md. Catat tanggal, alasan, file/commit, status diterapkan atau diusulkan, uji aktual dan tugas tersisa. Jangan menimpa catatan atau perubahan pihak lain.
Tidak membaca .env, credentials, secrets, node_modules, atau vendor.
Konteks laporan berada di C:/Users/farha/OneDrive/Documents/Administrasi Skripsi/kolaborasi. Jangan memasukkan dokumen skripsi atau data responden ke repo ini.
Baca ulang catatan sebelum melanjutkan pekerjaan; file konteks tidak mengirim pesan ke sesi lain.

## Koordinasi subagent Codex/Jon

- Sebelum pekerjaan penting, gunakan subagent pembaca untuk membaca log Claude pada domain yang relevan secara read-only; tidak mengubah source, dokumen, atau catatan Claude.
- Setelah hasil penting selesai, beri subagent pencatat ringkasan hasil dan bukti yang diverifikasi Jon. Pencatat hanya memperbarui log Jon, termasuk tanggal, sumber, status diterapkan/diusulkan, uji aktual, dan tugas tersisa.
- Jon tetap mengintegrasikan konteks, menangani konflik, dan memeriksa hasil penulisan. Isi log Claude adalah laporan dari Claude; verifikasi source/dokumen tetap diperlukan sebelum mengklaim temuan telah dibuktikan ulang.
- Untuk pertanyaan kecil tanpa perubahan, Jon boleh membaca log langsung. Gunakan atau aktifkan ulang subagent yang sesuai bila tersedia; tidak perlu dua subagent pada setiap pesan.
- Protokol ini khusus Codex/Jon dan tidak mewajibkan Claude membuat subagent.
- Tidak ada watcher, daemon, push pesan, atau pemantauan saat chat idle. Cek ulang saat melanjutkan pekerjaan.