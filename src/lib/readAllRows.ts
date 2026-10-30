interface RowPage<T> {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
}

/** Fetch an ordered query completely; never publish an incomplete price input. */
export async function readAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<RowPage<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  let total: number | undefined;

  do {
    const { data, error, count } = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(`Data harga gagal dimuat: ${error.message}`);
    if (count === null || (total !== undefined && count !== total)) {
      throw new Error('Data harga berubah atau jumlah baris tidak tersedia. Silakan coba lagi.');
    }
    total = count;
    if (!data || (data.length === 0 && rows.length < total)) {
      throw new Error('Data harga belum lengkap. Silakan coba lagi.');
    }
    rows.push(...data);
    if (rows.length > total) throw new Error('Jumlah baris data harga tidak konsisten.');
  } while (rows.length < total);

  return rows;
}
