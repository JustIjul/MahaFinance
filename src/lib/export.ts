import * as XLSX from 'xlsx';
import { Transaction } from '../types';

export const exportToExcel = (transactions: Transaction[]) => {
  const data = transactions.map(t => ({
    'ID': t.id,
    'Tipe': t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
    'Jumlah': t.amount,
    'Sumber/Kategori': t.source,
    'Penyimpanan': t.storage,
    'Tanggal': new Date(t.date).toLocaleDateString('id-ID'),
    'Catatan': t.notes
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaksi');
  
  XLSX.writeFile(workbook, 'Data_Keuangan_MahaFinance.xlsx');
};
