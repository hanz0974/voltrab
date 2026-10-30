# Konteks coding VoltRAB

@AGENTS.md
@kolaborasi/INDEX.md
@kolaborasi/topics/coding/update-jon.md
@kolaborasi/topics/coding/update-claude.md

Setelah coding, catat perubahan aktual pada file Claude saja. Konteks laporan dikelola terpisah di Administrasi Skripsi.

## Koordinasi subagent Codex/Jon

- Sebelum pekerjaan penting, gunakan subagent pembaca untuk membaca log Claude pada domain yang relevan secara read-only; tidak mengubah source, dokumen, atau catatan Claude.
- Setelah hasil penting selesai, beri subagent pencatat ringkasan hasil dan bukti yang diverifikasi Jon. Pencatat hanya memperbarui log Jon, termasuk tanggal, sumber, status diterapkan/diusulkan, uji aktual, dan tugas tersisa.
- Jon tetap mengintegrasikan konteks, menangani konflik, dan memeriksa hasil penulisan. Isi log Claude adalah laporan dari Claude; verifikasi source/dokumen tetap diperlukan sebelum mengklaim temuan telah dibuktikan ulang.
- Untuk pertanyaan kecil tanpa perubahan, Jon boleh membaca log langsung. Gunakan atau aktifkan ulang subagent yang sesuai bila tersedia; tidak perlu dua subagent pada setiap pesan.
- Protokol ini khusus Codex/Jon dan tidak mewajibkan Claude membuat subagent.
- Tidak ada watcher, daemon, push pesan, atau pemantauan saat chat idle. Cek ulang saat melanjutkan pekerjaan.

## Sinkronisasi Claude Code (VS Code) dan Claude di aplikasi Claude

- Kedua sesi Claude tidak berbagi percakapan. Yang dibagi hanya file di repo ini dan catatan `kolaborasi/topics/coding/update-claude.md` (sudah diimpor di atas).
- Sebelum mengubah file, jalankan `git status` dan `git diff` untuk melihat perubahan yang belum di-commit; perubahan itu bisa berasal dari sesi Claude lain. Jangan menimpa atau membatalkannya tanpa persetujuan pengguna.
- Baca bagian terbaru `update-claude.md` sebelum mengubah file yang disebut di sana (contoh: `src/components/DetectionModal.tsx`, 11 Oktober 2026).
- Setelah selesai, tambahkan ringkasan perubahan aktual, uji yang benar-benar dijalankan, dan pekerjaan tersisa ke `update-claude.md`, lalu sarankan pengguna melakukan commit.