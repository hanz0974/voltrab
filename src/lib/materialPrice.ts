/**
 * Aturan harga material VoltRAB.
 *
 * Harga satuan komponen yang dipakai dalam estimasi biaya material hanya
 * memuat rincian kelompok "B. Bahan" pada Analisis Harga Satuan Pekerjaan
 * (AHSP). Tenaga kerja (A), peralatan (C), serta biaya umum dan keuntungan
 * tetap tercatat pada detail AHSP sebagai perhitungan tambahan, tetapi tidak
 * dijumlahkan ke dalam harga material.
 */

/** Mengecek apakah sebuah rincian AHSP termasuk kelompok bahan (material). */
export const isMaterialDetail = (jenis: string | null | undefined): boolean =>
  typeof jenis === 'string' && /^\s*B\b|bahan/i.test(jenis);

/** Menjumlahkan harga seluruh rincian bahan pada satu komponen. */
export const sumMaterialCost = (
  rows: ReadonlyArray<{ jenis?: string | null; jumlah_harga?: number | string | null }>,
): number =>
  rows.reduce(
    (sum, row) => (isMaterialDetail(row.jenis) ? sum + (Number(row.jumlah_harga) || 0) : sum),
    0,
  );
