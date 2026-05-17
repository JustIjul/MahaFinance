import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Calendar, 
  PieChart as PieChartIcon,
  Table as TableIcon,
  Filter,
  Trash2,
  ChevronRight,
  HelpCircle,
  Settings as SettingsIcon,
  X,
  LogOut,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  isSameDay, 
  isSameWeek, 
  isSameMonth, 
  isWithinInterval, 
  subMonths, 
  startOfToday, 
  parseISO,
  format
} from 'date-fns';
import { id as localeID } from 'date-fns/locale';

import { Transaction, TransactionType, TimeRange } from './types';
import { cn, formatCurrency } from './lib/utils';
import { exportToExcel } from './lib/export';

// Firebase Imports
import { 
  auth, 
  db, 
  googleProvider, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInAnonymously,
  handleFirestoreError,
  OperationType,
  User
} from './lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  getDoc
} from 'firebase/firestore';

// --- Constants & Types ---
const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: 'daily', label: 'Harian' },
  { value: 'weekly', label: 'Mingguan' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'semester', label: 'Semester' },
  { value: 'yearly', label: 'Tahunan' },
];

const COLORS = {
  income: '#10b981', // Emerald 500
  expense: '#ef4444', // Red 500
  storage: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b']
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'settings'>('dashboard');

  // Dynamic Lists for Categories & Storage
  const [storageTypes, setStorageTypes] = useState<string[]>(['cash', 'e-wallet', 'bank', 'other']);
  const [incomeCats, setIncomeCats] = useState<string[]>([
    'Kiriman Orang Tua', 'Beasiswa', 'Kerja Part-time', 
    'Proyek/Freelance', 'Hadiah/Lomba', 'Tabungan', 'Lainnya'
  ]);
  const [expenseCats, setExpenseCats] = useState<string[]>([
    'Makan & Minum', 'Kost / Sewa Kamar', 'Transportasi', 
    'Kebutuhan Kuliah', 'Pulsa & Kuota', 'Hiburan / Self Reward', 
    'Belanja Bulanan', 'Kesehatan', 'Lainnya'
  ]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Sync Listener
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const q = query(
      collection(db, 'users', user.uid, 'transactions'),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Transaction[];
      setTransactions(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/transactions`);
    });

    const configRef = doc(db, 'users', user.uid, 'config', 'main');
    getDoc(configRef).then(docSnap => {
      if (docSnap.exists()) {
        const config = docSnap.data();
        setStorageTypes(config.storageTypes);
        setIncomeCats(config.incomeCats);
        setExpenseCats(config.expenseCats);
      } else {
        // Initialize default config for new user
        const defaultConfig = {
          storageTypes: ['cash', 'e-wallet', 'bank', 'other'],
          incomeCats: ['Kiriman Orang Tua', 'Beasiswa', 'Kerja Part-time', 'Proyek/Freelance', 'Hadiah/Lomba', 'Tabungan', 'Lainnya'],
          expenseCats: ['Makan & Minum', 'Kost / Sewa Kamar', 'Transportasi', 'Kebutuhan Kuliah', 'Pulsa & Kuota', 'Hiburan / Self Reward', 'Belanja Bulanan', 'Kesehatan', 'Lainnya']
        };
        setDoc(configRef, defaultConfig).catch(e => handleFirestoreError(e, OperationType.WRITE, configRef.path));
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Sync Categories/Storage to DB
  const updateRemoteConfig = async (newStorage?: string[], newIn?: string[], newEx?: string[]) => {
    if (!user) return;
    const configRef = doc(db, 'users', user.uid, 'config', 'main');
    try {
      await setDoc(configRef, {
        storageTypes: newStorage || storageTypes,
        incomeCats: newIn || incomeCats,
        expenseCats: newEx || expenseCats
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, configRef.path);
    }
  };

  // Form State
  const [formData, setFormData] = useState<Omit<Transaction, 'id'>>({
    type: 'expense',
    amount: 0,
    source: expenseCats[0] || 'Lainnya',
    storage: storageTypes[0] || 'cash',
    date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });

  const categories = formData.type === 'income' ? incomeCats : expenseCats;

  // Data Filtering
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      const tDate = parseISO(t.date);
      switch (timeRange) {
        case 'daily': return isSameDay(tDate, now);
        case 'weekly': return isSameWeek(tDate, now);
        case 'monthly': return isSameMonth(tDate, now);
        case 'semester': return isWithinInterval(tDate, { start: subMonths(now, 6), end: now });
        case 'yearly': return tDate.getFullYear() === now.getFullYear();
        default: return true;
      }
    });
  }, [transactions, timeRange]);

  const summary = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, balance: income - expense };
  }, [filteredTransactions]);

  // Chart Data Preparation
  const chartData = useMemo(() => {
    const data = [
      { name: 'Pemasukan', value: summary.income, color: COLORS.income },
      { name: 'Pengeluaran', value: summary.expense, color: COLORS.expense }
    ];
    return data.filter(d => d.value > 0);
  }, [summary]);

  const storageData = useMemo(() => {
    const map = new Map<string, number>();
    filteredTransactions.forEach(t => {
      const current = map.get(t.storage) || 0;
      map.set(t.storage, current + (t.type === 'income' ? t.amount : -t.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredTransactions]);

  const categoryAnalysis = useMemo(() => {
    const incomeMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();

    filteredTransactions.forEach(t => {
      if (t.type === 'income') {
        incomeMap.set(t.source, (incomeMap.get(t.source) || 0) + t.amount);
      } else {
        expenseMap.set(t.source, (expenseMap.get(t.source) || 0) + t.amount);
      }
    });

    const sortFn = (a: any, b: any) => b.value - a.value;

    return {
      income: Array.from(incomeMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort(sortFn),
      expense: Array.from(expenseMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort(sortFn),
    };
  }, [filteredTransactions]);

  // Handlers
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const newTransaction: Omit<Transaction, 'id'> = {
      ...formData,
    };
    
    const colRef = collection(db, 'users', user.uid, 'transactions');
    try {
      await addDoc(colRef, {
        ...newTransaction,
        id: Math.random().toString(36).substring(2, 9) // We use auto-id from Firestore usually but schema asks for id field
      });
      setIsModalOpen(false);
      setFormData({
        type: 'expense',
        amount: 0,
        source: expenseCats[0] || 'Lainnya',
        storage: storageTypes[0] || 'cash',
        date: format(new Date(), 'yyyy-MM-dd'),
        notes: '',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, colRef.path);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!user) return;
    if (confirm('Hapus transaksi ini?')) {
      const docRef = doc(db, 'users', user.uid, 'transactions', id);
      try {
        await deleteDoc(docRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, docRef.path);
      }
    }
  };

  const handleLogout = () => {
    if (confirm('Yakin ingin keluar?')) {
      auth.signOut();
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-emerald-700 font-bold">MahaFinance</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-[32px] shadow-2xl shadow-emerald-100 max-w-md w-full text-center"
        >
          <div className="w-20 h-20 bg-emerald-600 rounded-[24px] mx-auto mb-8 flex items-center justify-center text-white text-4xl font-black rotate-12">
            M
          </div>
          <h1 className="text-4xl font-black tracking-tight text-emerald-900 mb-4">MahaFinance</h1>
          <p className="text-gray-500 mb-10 text-sm leading-relaxed">
            Aplikasi pencatatan keuangan interaktif khusus mahasiswa. Kelola uang sakumu lebih bijak mulai sekarang.
          </p>

          <div className="space-y-4">
            <button 
              onClick={() => signInWithPopup(auth, googleProvider)}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-100 py-4 rounded-2xl font-bold text-gray-700 hover:bg-gray-50 hover:border-emerald-100 transition-all shadow-sm"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
              Lanjut dengan Google
            </button>
            
            <div className="flex items-center gap-4 py-2">
              <div className="h-[1px] bg-gray-100 flex-1"></div>
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Atau</span>
              <div className="h-[1px] bg-gray-100 flex-1"></div>
            </div>

            <button 
              onClick={() => signInAnonymously(auth)}
              className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all"
            >
              Coba Sebagai Guest
            </button>
          </div>

          <p className="mt-10 text-[10px] text-gray-400">
            Data kamu tersimpan aman di cloud dan sinkron di semua perangkat.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Sidebar Navigation (Desktop) */}
      <nav className="fixed top-0 left-0 h-full w-20 md:w-64 bg-white border-r border-[#E5E5E5] z-50 transition-all">
        <div className="p-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
              M
            </div>
            <span className="font-bold text-xl hidden md:block tracking-tight text-emerald-900">MahaFinance</span>
          </div>
        </div>

        <div className="px-3 space-y-2">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')}
            icon={<PieChartIcon size={20} />} 
            label="Dashboard" 
          />
          <NavItem 
            active={activeTab === 'transactions'} 
            onClick={() => setActiveTab('transactions')}
            icon={<TableIcon size={20} />} 
            label="Transaksi" 
          />
          <NavItem 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
            icon={<SettingsIcon size={20} />} 
            label="Pengaturan" 
          />
          <button 
            onClick={() => exportToExcel(transactions)}
            className="w-full flex items-center gap-4 px-4 py-3 text-gray-500 hover:bg-gray-50 rounded-xl transition-colors text-sm font-medium"
          >
            <Download size={20} />
            <span className="hidden md:block">Ekspor Excel</span>
          </button>
        </div>

        <div className="absolute bottom-8 left-0 w-full px-6">
          {/* Profile Widget */}
          <div className="bg-emerald-50 rounded-2xl p-4 hidden md:block mb-4">
            <div className="flex items-center gap-3 mb-3">
              {user?.photoURL ? (
                <img src={user.photoURL} className="w-8 h-8 rounded-full" alt="Profile" />
              ) : (
                <div className="w-8 h-8 bg-emerald-200 rounded-full flex items-center justify-center text-emerald-600">
                  <UserIcon size={16} />
                </div>
              )}
              <div className="overflow-hidden">
                <p className="text-[10px] font-bold text-emerald-800 truncate">{user?.displayName || (user?.isAnonymous ? 'Guest User' : 'Mahasiswa')}</p>
                <p className="text-[8px] text-emerald-600 truncate">{user?.email || 'Sync ON'}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 text-[10px] font-bold text-red-600 hover:text-red-700 transition-colors"
            >
              <LogOut size={12} /> Keluar
            </button>
          </div>

          <div className="bg-emerald-50 rounded-2xl p-4 hidden md:block">
            <p className="text-xs text-emerald-800 font-medium mb-1">Butuh bantuan?</p>
            <p className="text-[10px] text-emerald-600 leading-relaxed mb-3">Tanya konsultan finansial AI Anda.</p>
            <button className="flex items-center gap-2 text-[10px] font-bold text-emerald-700 hover:underline">
              Mulai Konsultasi <ChevronRight size={10} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pl-20 md:pl-64 pt-6 pb-20 md:pb-6 px-6 md:px-12 max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              Halo, Mahasiswa! 👋
            </h1>
            <p className="text-gray-500 text-sm">Kelola uang saku kamu dengan bijak hari ini.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-white p-1 rounded-xl border border-[#E5E5E5] shadow-sm overflow-x-auto whitespace-nowrap">
              {TIME_RANGES.map(range => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className={cn(
                    "px-4 py-1.5 text-xs font-semibold rounded-lg transition-all",
                    timeRange === range.value 
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-100" 
                      : "text-gray-500 hover:bg-gray-50"
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl shadow-lg shadow-emerald-100 transition-all flex items-center gap-2 shrink-0"
            >
              <Plus size={20} />
              <span className="hidden md:block font-bold text-sm">Tambah</span>
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard 
                title="Saldo Saat Ini" 
                value={summary.balance} 
                icon={<Wallet className="text-blue-600" />}
                trend={summary.balance >= 0 ? 'pos' : 'neg'}
              />
              <StatCard 
                title="Total Pemasukan" 
                value={summary.income} 
                icon={<TrendingUp className="text-emerald-600" />}
                type="income"
              />
              <StatCard 
                title="Total Pengeluaran" 
                value={summary.expense} 
                icon={<TrendingDown className="text-red-600" />}
                type="expense"
              />
            </div>

            {/* Charts & Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] shadow-sm">
                <h3 className="font-bold text-lg mb-6">Distribusi Keuangan</h3>
                <div className="h-64">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={8}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState message="Belum ada data untuk periode ini." />
                  )}
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] shadow-sm">
                <h3 className="font-bold text-lg mb-6 text-red-600">Top Pengeluaran</h3>
                <div className="space-y-4">
                  {categoryAnalysis.expense.length > 0 ? categoryAnalysis.expense.slice(0, 5).map((item, idx) => (
                    <div key={item.name} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-gray-600">{item.name}</span>
                        <span className="font-bold">{formatCurrency(item.value)}</span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(item.value / categoryAnalysis.expense[0].value) * 100}%` }}
                          className="h-full bg-red-500 rounded-full"
                        />
                      </div>
                    </div>
                  )) : (
                    <EmptyState message="Tidak ada pengeluaran." />
                  )}
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] shadow-sm">
                <h3 className="font-bold text-lg mb-6 text-emerald-600">Top Pemasukan</h3>
                <div className="space-y-4">
                  {categoryAnalysis.income.length > 0 ? categoryAnalysis.income.slice(0, 5).map((item, idx) => (
                    <div key={item.name} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-gray-600">{item.name}</span>
                        <span className="font-bold">{formatCurrency(item.value)}</span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(item.value / categoryAnalysis.income[0].value) * 100}%` }}
                          className="h-full bg-emerald-500 rounded-full"
                        />
                      </div>
                    </div>
                  )) : (
                    <EmptyState message="Tidak ada pemasukan." />
                  )}
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] shadow-sm">
                <h3 className="font-bold text-lg mb-6">Penyimpanan</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={storageData}>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#9CA3AF' }} />
                      <YAxis hide />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        cursor={{ fill: '#F3F4F6' }}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {storageData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={valueToColor(entry.value)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'transactions' ? (
          <div className="animate-in fade-in duration-500">
             <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm">
                <div className="p-6 border-b border-[#F3F4F6] flex justify-between items-center bg-gray-50/50">
                  <h3 className="font-bold">Riwayat Transaksi</h3>
                  <div className="text-xs text-gray-400 font-medium">Lengkap & Detail</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#F3F4F6] text-[11px] uppercase tracking-wider text-gray-400 font-bold">
                        <th className="px-6 py-4">Tanggal</th>
                        <th className="px-6 py-4">Sumber / Ket</th>
                        <th className="px-6 py-4">Tempat</th>
                        <th className="px-6 py-4">Jumlah</th>
                        <th className="px-6 py-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-[#F3F4F6]">
                      {filteredTransactions.length > 0 ? filteredTransactions.map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50 transition-colors group">
                          <td className="px-6 py-4 text-gray-500 font-medium">
                            {format(parseISO(t.date), 'dd MMM yyyy', { locale: localeID })}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold">{t.source}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5 line-clamp-1 italic">{t.notes || '-'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-gray-100 rounded-md text-[10px] font-bold uppercase text-gray-600">
                              {t.storage}
                            </span>
                          </td>
                          <td className={cn(
                            "px-6 py-4 font-bold",
                            t.type === 'income' ? "text-emerald-600" : "text-red-500"
                          )}>
                            {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => deleteTransaction(t.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors p-2"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="py-20 text-center">
                            <EmptyState message="Tidak ada transaksi ditemukan." />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
             </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Manage Storage */}
              <SettingsSection 
                title="Penyimpanan" 
                subtitle="Tambah atau hapus tempat penyimpanan uang saku"
                items={storageTypes} 
                onAdd={(item) => {
                  const news = [...storageTypes, item];
                  setStorageTypes(news);
                  updateRemoteConfig(news);
                }}
                onRemove={(item) => {
                  const news = storageTypes.filter(s => s !== item);
                  setStorageTypes(news);
                  updateRemoteConfig(news);
                }}
                placeholder="Tambah bank, e-wallet, dll..."
              />

              {/* Manage Income Categories */}
              <SettingsSection 
                title="Kategori Pemasukan" 
                subtitle="Kelola sumber-sumber dana kamu"
                items={incomeCats} 
                onAdd={(item) => {
                  const news = [...incomeCats, item];
                  setIncomeCats(news);
                  updateRemoteConfig(undefined, news);
                }}
                onRemove={(item) => {
                  const news = incomeCats.filter(s => s !== item);
                  setIncomeCats(news);
                  updateRemoteConfig(undefined, news);
                }}
                placeholder="Contoh: Beasiswa Prestasi..."
              />

              {/* Manage Expense Categories */}
              <SettingsSection 
                title="Kategori Pengeluaran" 
                subtitle="Sesuaikan dengan kebiasaan jajan kamu"
                items={expenseCats} 
                onAdd={(item) => {
                  const news = [...expenseCats, item];
                  setExpenseCats(news);
                  updateRemoteConfig(undefined, undefined, news);
                }}
                onRemove={(item) => {
                  const news = expenseCats.filter(s => s !== item);
                  setExpenseCats(news);
                  updateRemoteConfig(undefined, undefined, news);
                }}
                placeholder="Contoh: Membership Gym..."
              />
            </div>
          </div>
        )}
      </main>

      {/* Navigation Mobile */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-[#E5E5E5] px-6 py-3 flex justify-around md:hidden z-50">
        <button onClick={() => setActiveTab('dashboard')} className={cn("p-2 rounded-lg", activeTab === 'dashboard' ? "text-emerald-600 bg-emerald-50" : "text-gray-400")}>
          <PieChartIcon size={24} />
        </button>
        <button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 text-white p-3 rounded-full -mt-8 shadow-xl border-4 border-white">
          <Plus size={24} />
        </button>
        <button onClick={() => setActiveTab('settings')} className={cn("p-2 rounded-lg", activeTab === 'settings' ? "text-emerald-600 bg-emerald-50" : "text-gray-400")}>
          <SettingsIcon size={24} />
        </button>
        <button onClick={() => setActiveTab('transactions')} className={cn("p-2 rounded-lg", activeTab === 'transactions' ? "text-emerald-600 bg-emerald-50" : "text-gray-400")}>
          <TableIcon size={24} />
        </button>
      </div>

      {/* Modal Form */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <span className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                    <Plus size={20} />
                  </span>
                  Tambah Transaksi
                </h2>

                <form onSubmit={handleAddTransaction} className="space-y-5">
                  <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'income', source: incomeCats[0] || 'Lainnya' })}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all",
                        formData.type === 'income' ? "bg-white shadow-sm text-emerald-600" : "text-gray-500"
                      )}
                    >
                      Pemasukan
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'expense', source: expenseCats[0] || 'Lainnya' })}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all",
                        formData.type === 'expense' ? "bg-white shadow-sm text-red-500" : "text-gray-500"
                      )}
                    >
                      Pengeluaran
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Jumlah Uang</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">Rp</span>
                      <input
                        type="number"
                        required
                        value={formData.amount || ''}
                        onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-[#E5E5E5] rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-bold text-lg"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Kategori</label>
                      <select
                        required
                        value={formData.source}
                        onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-[#E5E5E5] rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm"
                      >
                        {categories.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Penyimpanan</label>
                      <select
                        value={formData.storage}
                        onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-[#E5E5E5] rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm"
                      >
                        {storageTypes.map(s => (
                          <option key={s} value={s}>{s.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Tanggal</label>
                    <input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-[#E5E5E5] rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Catatan</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-[#E5E5E5] rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm resize-none"
                      rows={2}
                      placeholder="Catatan opsional..."
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-100 transition-all"
                    >
                      Simpan Transaksi
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Internal Components ---

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all group",
        active 
          ? "bg-emerald-50 text-emerald-600" 
          : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
      )}
    >
      <span className={cn(
        "transition-all",
        active ? "scale-110" : "group-hover:scale-110"
      )}>{icon}</span>
      <span className="hidden md:block font-bold text-sm">{label}</span>
    </button>
  );
}

function StatCard({ title, value, icon, type, trend }: { title: string, value: number, icon: React.ReactNode, type?: TransactionType, trend?: 'pos' | 'neg' }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-white transition-colors">
          {icon}
        </div>
        {type && (
          <div className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
            type === 'income' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          )}>
            {type === 'income' ? 'Income' : 'Expense'}
          </div>
        )}
      </div>
      <h4 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">{title}</h4>
      <p className={cn(
        "text-2xl font-black tracking-tight",
        trend === 'neg' ? 'text-red-500' : ''
      )}>{formatCurrency(value)}</p>
      
      {/* Subtle background decoration */}
      <div className="absolute -right-4 -bottom-4 opacity-[0.03] rotate-12 transition-transform group-hover:scale-110">
        {icon}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center opacity-40 py-10">
      <HelpCircle size={48} className="mb-4" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

function valueToColor(value: number) {
  if (value > 0) return COLORS.income;
  if (value < 0) return COLORS.expense;
  return '#9CA3AF';
}

function SettingsSection({ title, subtitle, items, onAdd, onRemove, placeholder }: {
  title: string;
  subtitle: string;
  items: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (input.trim() && !items.includes(input.trim())) {
      onAdd(input.trim());
      setInput('');
    }
  };

  return (
    <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] shadow-sm">
      <h3 className="font-bold text-lg mb-1">{title}</h3>
      <p className="text-gray-400 text-xs mb-6">{subtitle}</p>
      
      <div className="flex gap-2 mb-6">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder}
          className="flex-1 px-4 py-2 bg-gray-50 border border-[#E5E5E5] rounded-xl text-sm outline-none focus:border-emerald-500 transition-colors"
        />
        <button 
          onClick={handleAdd}
          className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm"
        >
          Tambah
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <div key={item} className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 group">
            <span className="text-sm font-medium text-gray-600">{item}</span>
            <button 
              onClick={() => onRemove(item)}
              className="text-gray-300 hover:text-red-500 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
