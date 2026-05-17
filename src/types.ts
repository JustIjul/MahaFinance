/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  source: string; // Sumber pemasukan atau kategori pengeluaran
  storage: string;
  date: string; // ISO format
  notes: string;
}

export type TimeRange = 'daily' | 'weekly' | 'monthly' | 'semester' | 'yearly';
