

import React, { useMemo, useState, useEffect } from 'react';
import { Transaction, Loan, UserSettings, BankCard, TransactionType } from '../types';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid 
} from 'recharts';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  TrendingUp, 
  Sparkles,
  Zap,
  Send,
  Download,
  X,
  Loader2,
  MessageSquarePlus,
  Wand2,
  Activity,
  ShieldCheck,
  BarChart3,
  CreditCard,
  MoreHorizontal
} from 'lucide-react';
import { getFinancialAdvice, parseTransactionFromSMS } from '../services/geminiService';
import { storageService } from '../services/storage';
import { useNotification } from '../contexts/NotificationContext';

interface DashboardProps {
  transactions: Transaction[];
  loans: Loan[];
  settings: UserSettings;
  onNavigate: (tab: string) => void;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings | null>>;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  transactions, 
  loans, 
  settings, 
  onNavigate,
  setTransactions,
  setSettings
}) => {
  const { notify } = useNotification();
  const [aiAdvice, setAiAdvice] = useState<string>('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  // Touch State for Swiping
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Modal State
  const [modalConfig, setModalConfig] = useState<{isOpen: boolean, type: 'transfer' | 'receive' | 'smart_sms'}>({
    isOpen: false, type: 'transfer'
  });
  const [amount, setAmount] = useState('');
  const [party, setParty] = useState('');
  
  // Smart SMS State
  const [smsText, setSmsText] = useState('');
  const [isParsingSms, setIsParsingSms] = useState(false);

  // --- Calculations ---
  const totalRealizedIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalRealizedIncome - totalExpense;
  const savings = totalRealizedIncome * 0.2; 
  const investments = totalRealizedIncome * 0.15;

  // New Features Calculations
  const totalDebt = loans.reduce((acc, curr) => acc + curr.schedule.filter(s => !s.isPaid).reduce((sum, s) => sum + s.remainingBalance, 0), 0);
  
  // Financial Health Score
  const incomeDebtRatio = totalRealizedIncome > 0 ? (totalDebt / (totalRealizedIncome * 12)) : 1; 
  const savingsRate = totalRealizedIncome > 0 ? savings / totalRealizedIncome : 0;
  let healthScore = 50; // Base
  healthScore += savingsRate * 100; // Add up to 20-30 points
  healthScore -= Math.min(incomeDebtRatio * 10, 40); // Deduct for high debt
  healthScore = Math.min(Math.max(Math.round(healthScore), 0), 100);

  // Safe-to-Spend (Updated to sum of all card balances)
  const safeToSpend = settings.cards.reduce((acc, card) => acc + (card.balance || 0), 0);

  // Top Expenses
  const topExpenses = useMemo(() => {
      const map = new Map<string, number>();
      transactions.filter(t => t.type === 'expense').forEach(t => {
          map.set(t.category, (map.get(t.category) || 0) + t.amount);
      });
      return Array.from(map.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(e => ({ name: e[0], value: e[1] }));
  }, [transactions]);


  // Defensively reset card index if it becomes invalid
  useEffect(() => {
    if (activeCardIndex >= settings.cards.length && settings.cards.length > 0) {
      setActiveCardIndex(0);
    }
  }, [settings.cards, activeCardIndex]);

  // Swipe Handlers
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (settings.cards.length <= 1) return;

    if (isLeftSwipe) {
       // Next Card (Cyclic)
       setActiveCardIndex((prev) => (prev + 1) % settings.cards.length);
    }
    if (isRightSwipe) {
       // Prev Card (Cyclic)
       setActiveCardIndex((prev) => (prev - 1 + settings.cards.length) % settings.cards.length);
    }
  };

  const chartData = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days.map((day, i) => ({
      name: day.substring(0, 3), // Short English days for chart X-Axis
      income: Math.floor(Math.random() * 2000) + 1000,
      expense: Math.floor(Math.random() * 1500) + 500,
    }));
  }, [transactions]);

  const COLORS = ['#10b981', '#bef264', '#0f172a', '#64748b', '#cbd5e1'];

  const handleAiConsult = async () => {
    setIsLoadingAi(true);
    const advice = await getFinancialAdvice(transactions, loans, balance);
    setAiAdvice(advice);
    setIsLoadingAi(false);
    notify('تم تحديث التحليل الذكي بنجاح', 'info');
  };

  const activeCard: BankCard = settings.cards[activeCardIndex] || { 
    id: 'virtual',
    bankName: 'Virtual Card', 
    cardNumber: '0000', 
    cardType: 'Virtual', 
    color: '#1e293b',
    logoPosition: 'top-left'
  };

  const getLogoClasses = (pos?: string) => {
      // Removed opacity-20 and made it fully clear. Centered but size adjusted.
      const base = "absolute object-contain z-0 pointer-events-none transition-all duration-300 opacity-100";
      return `${base} w-48 h-48 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`;
  };

    const openModal = (type: 'transfer' | 'receive' | 'smart_sms') => {
    setModalConfig({ isOpen: true, type });
    setAmount('');
    setParty('');
    setSmsText('');
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalConfig.type === 'smart_sms') {
       handleSmartSmsSubmit();
       return;
    }

    if (!amount || !party) return;
    setIsProcessing(true);
    
    const val = parseFloat(amount);
    const isTransfer = modalConfig.type === 'transfer';
    
    // 1. Create Transaction Record
    const newTx: Transaction = {
      id: '', // Supabase generates ID
      amount: val,
      type: isTransfer ? TransactionType.EXPENSE : TransactionType.INCOME,
      category: isTransfer ? 'تحويل بنكي' : 'استلام أموال',
      date: new Date().toISOString(),
      note: isTransfer ? `تحويل إلى: ${party}` : `استلام من: ${party}`
    };

    // 2. Update Card Balance
    const currentCardBalance = activeCard.balance ?? 0;
    const newBalance = isTransfer ? currentCardBalance - val : currentCardBalance + val;

    const updatedCards = settings.cards.map((c, idx) => {
      if (idx === activeCardIndex) {
        return { ...c, balance: newBalance };
      }
      return c;
    });

    const updatedSettings = { ...settings, cards: updatedCards };

    try {
      // 3. Save to Storage (Async)
      const savedSettings = await storageService.saveSettings(updatedSettings);
      setSettings(savedSettings);

      // Save Transaction
      await storageService.saveTransaction(newTx);
      
      // 4. Update State
      const freshTransactions = await storageService.getTransactions();
      setTransactions(freshTransactions);
      
      notify(isTransfer ? 'تم إجراء التحويل بنجاح' : 'تم استلام المبلغ بنجاح', 'success');
    } catch (err) {
      notify('حدث خطأ أثناء تنفيذ العملية', 'error');
    }

    // 5. Close Modal
    setIsProcessing(false);
    setModalConfig({ ...modalConfig, isOpen: false });
  };

  const handleSmartSmsSubmit = async () => {
    if (!smsText) return;
    setIsParsingSms(true);

    try {
      // 1. Parse with Gemini
      const parsedData = await parseTransactionFromSMS(smsText);
      
      if (!parsedData) {
        notify('لم يتمكن النظام من قراءة الرسالة، تأكد من الصيغة', 'error');
        setIsParsingSms(false);
        return;
      }

      // 2. Find matching card
      let targetCardIndex = -1;
      if (parsedData.cardLast4) {
          const cleanLast4 = parsedData.cardLast4.replace(/\D/g, '');
          targetCardIndex = settings.cards.findIndex(c => 
              (c.cardNumber && c.cardNumber.endsWith(cleanLast4)) || 
              (c.accountLast4 && c.accountLast4.endsWith(cleanLast4))
          );
      }
      
      // Fallback to first card if not found, but warn user
      if (targetCardIndex === -1 && settings.cards.length > 0) {
        targetCardIndex = 0; // Default to first card
        if (parsedData.cardLast4) {
             notify(`لم يتم العثور على بطاقة تنتهي بـ ${parsedData.cardLast4}، تم استخدام البطاقة الافتراضية`, 'warning');
        }
      }

      const targetCard = targetCardIndex >= 0 ? settings.cards[targetCardIndex] : undefined;

      // 3. Create Transaction with Enhanced Fields
      const newTx: Transaction = {
        id: '',
        amount: parsedData.amount,
        type: parsedData.type,
        category: parsedData.category,
        date: parsedData.date || new Date().toISOString(),
        note: `من: ${parsedData.merchant}`,
        merchant: parsedData.merchant,
        fee: parsedData.fee,
        balanceAfter: parsedData.newBalance || undefined,
        transactionReference: parsedData.transactionReference,
        cardId: targetCard ? targetCard.id : undefined,
        // Map new fields
        operationKind: parsedData.operationKind,
        cardLast4: parsedData.cardLast4,
        country: parsedData.country,
        paymentMethod: parsedData.paymentMethod
      };

      // 4. Update Balance
      if (targetCard) {
        let newBalance = targetCard.balance || 0;

        if (parsedData.newBalance !== undefined && parsedData.newBalance !== null) {
           // Use the balance directly from SMS
           newBalance = parsedData.newBalance;
        } else {
           // Fallback calculation if not present in SMS
           if (parsedData.type === TransactionType.EXPENSE) {
               newBalance -= parsedData.amount;
               if (parsedData.fee) newBalance -= parsedData.fee;
           } else {
               newBalance += parsedData.amount;
           }
        }

        const updatedCards = [...settings.cards];
        updatedCards[targetCardIndex] = { ...targetCard, balance: newBalance };
        const updatedSettings = { ...settings, cards: updatedCards };
        
        // Save Settings
        const savedSettings = await storageService.saveSettings(updatedSettings);
        setSettings(savedSettings);
      }

      // 5. Save Transaction
      await storageService.saveTransaction(newTx);

      const freshTransactions = await storageService.getTransactions();
      setTransactions(freshTransactions);

      let successMessage = `تم إضافة العملية "${parsedData.merchant}" بنجاح`;
      if (parsedData.newBalance !== undefined) {
          successMessage += ` وتحديث الرصيد إلى ${parsedData.newBalance}`;
      }
      notify(successMessage, 'success');
      setModalConfig({ ...modalConfig, isOpen: false });

    } catch (err) {
      console.error(err);
      notify('حدث خطأ أثناء المعالجة الذكية', 'error');
    } finally {
      setIsParsingSms(false);
    }
  };


  return (
    <div className="space-y-6 relative pb-20 md:pb-0">
      
      {/* Page Title & AI Action */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-2">
        <div>
           <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">نظرة عامة</h2>
           <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-1">مرحباً عمر، إليك ملخص وضعك المالي اليوم.</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <button 
             onClick={handleAiConsult}
             disabled={isLoadingAi}
             className="flex items-center justify-center gap-2 bg-slate-900 dark:bg-[#bef264] text-white dark:text-slate-900 px-5 py-3 rounded-xl hover:bg-slate-800 dark:hover:bg-[#a3e635] transition-all shadow-lg shadow-slate-900/20 disabled:opacity-70 font-bold w-full md:w-auto"
          >
             <Sparkles size={18} className={isLoadingAi ? "animate-spin" : "text-[#bef264] dark:text-slate-900"} />
             <span>{isLoadingAi ? 'جاري التحليل...' : 'تحليل مالي'}</span>
          </button>
        </div>
      </div>

      {/* AI Advice Banner */}
      {aiAdvice && (
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-3xl text-white shadow-xl animate-fade-in relative overflow-hidden">
          <div className="relative z-10">
             <div className="flex items-center gap-2 mb-2 opacity-90">
                <Sparkles size={18} />
                <span className="font-bold text-sm uppercase tracking-wider">نصيحة المستشار الذكي</span>
             </div>
             <p className="text-base md:text-lg font-medium leading-relaxed max-w-3xl">{aiAdvice}</p>
          </div>
          <div className="absolute top-0 left-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl -ml-10 -mt-10"></div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Column (Main Stats & Chart) */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* New Financial Health & Safe-to-Spend Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                      <h4 className="text-sm font-bold text-slate-500 mb-1">نقاط الصحة المالية</h4>
                      <div className="flex items-center gap-2">
                          <Activity className={healthScore > 70 ? 'text-emerald-500' : 'text-amber-500'} />
                          <span className={`text-2xl font-bold ${healthScore > 70 ? 'text-emerald-500' : 'text-amber-500'}`}>{healthScore}/100</span>
                      </div>
                  </div>
                  <div className="w-16 h-16 rounded-full border-4 border-slate-100 dark:border-slate-800 flex items-center justify-center relative">
                      <div className={`absolute inset-0 rounded-full border-4 ${healthScore > 70 ? 'border-emerald-500' : 'border-amber-500'}`} style={{clipPath: `inset(0 0 ${100 - healthScore}% 0)`}}></div>
                      <span className="text-xs font-bold text-slate-400">{healthScore}%</span>
                  </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                      <h4 className="text-sm font-bold text-slate-500 mb-1">قابل للصرف (الآن)</h4>
                      <p className="text-xs text-slate-400 mb-2">إجمالي أرصدة البطاقات</p>
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white sensitive-data">{safeToSpend.toLocaleString('en-US')} {settings.currency}</h3>
                  </div>
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-full text-indigo-500">
                      <ShieldCheck size={24} />
                  </div>
              </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
             {/* Income */}
             <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between group hover:border-[#bef264] transition-colors cursor-pointer" onClick={() => onNavigate('transactions')}>
                <div>
                   <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-full group-hover:bg-[#bef264]/20 transition-colors">
                        <Wallet size={18} className="text-slate-900 dark:text-white" />
                      </div>
                      <span className="font-medium text-sm">الدخل</span>
                   </div>
                   <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white sensitive-data">{totalRealizedIncome.toLocaleString('en-US')} {settings.currency}</h3>
                </div>
                <div className="flex flex-col items-end">
                   <span className="bg-[#bef264] text-slate-900 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <ArrowUpRight size={14} />
                      1.78%
                   </span>
                   <span className="text-xs text-slate-400 mt-1">عن الشهر الماضي</span>
                </div>
             </div>

             {/* Expense */}
             <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between group hover:border-rose-200 transition-colors cursor-pointer" onClick={() => onNavigate('transactions')}>
                <div>
                   <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-2">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-full group-hover:bg-rose-50 dark:group-hover:bg-rose-900/20 transition-colors">
                        <ArrowDownLeft size={18} className="text-slate-900 dark:text-white" />
                      </div>
                      <span className="font-medium text-sm">المصروفات</span>
                   </div>
                   <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white sensitive-data">{totalExpense.toLocaleString('en-US')} {settings.currency}</h3>
                </div>
                <div className="flex flex-col items-end">
                   <span className="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <ArrowUpRight size={14} />
                      2.45%
                   </span>
                   <span className="text-xs text-slate-400 mt-1">عن الشهر الماضي</span>
                </div>
             </div>
          </div>

          {/* Cashflow Chart */}
          <div className="bg-white dark:bg-slate-900 p-4 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800">
             <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
                <div>
                   <h3 className="text-xl font-bold text-slate-900 dark:text-white">التدفق النقدي</h3>
                   <p className="text-sm text-slate-400">إجمالي الرصيد <span className="text-emerald-500 font-bold sensitive-data">{balance.toLocaleString('en-US')} {settings.currency}</span></p>
                </div>
             </div>
             
             <div className="h-[250px] md:h-[300px] w-full sensitive-data">
                <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#bef264" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#bef264" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0f172a" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" strokeOpacity={0.1} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
                      />
                      <Area type="monotone" dataKey="income" stroke="#bef264" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                      <Area type="monotone" dataKey="expense" stroke="#0f172a" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
                   </AreaChart>
                </ResponsiveContainer>
             </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
           
           {/* Where Did My Money Go? (Top 3) */}
           <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800">
               <div className="flex items-center gap-2 mb-4">
                   <BarChart3 size={20} className="text-indigo-500" />
                   <h3 className="font-bold text-lg text-slate-900 dark:text-white">أين ذهبت أموالي؟</h3>
               </div>
               
               <div className="space-y-4">
                   {topExpenses.length > 0 ? topExpenses.map((item, idx) => (
                       <div key={idx} className="relative">
                           <div className="flex justify-between text-sm mb-1">
                               <span className="font-bold text-slate-700 dark:text-slate-200">{item.name}</span>
                               <span className="text-slate-500 sensitive-data">{item.value.toLocaleString('en-US')}</span>
                           </div>
                           <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                               <div 
                                 className="h-full rounded-full transition-all" 
                                 style={{ width: `${(item.value / totalExpense) * 100}%`, backgroundColor: COLORS[idx % COLORS.length] }}
                               ></div>
                           </div>
                       </div>
                   )) : <p className="text-center text-slate-400 text-sm py-4">لا توجد مصاريف مسجلة</p>}
               </div>
           </div>

           {/* Cards Widget (Redesigned) */}
           <div 
              className="relative w-full aspect-[1.586] rounded-2xl overflow-hidden shadow-2xl transition-transform duration-300 hover:scale-[1.02] select-none touch-pan-y text-white font-tajawal" 
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
           >
               {/* 1. Gradient Background */}
               <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-blue-600 to-teal-400"></div>

               {/* 2. Abstract Curves / Wave Overlay */}
               <div className="absolute inset-0 opacity-20 pointer-events-none">
                  <svg viewBox="0 0 400 250" className="w-full h-full" preserveAspectRatio="none">
                      <path d="M0,100 C100,50 200,150 400,100 L400,250 L0,250 Z" fill="white" fillOpacity="0.1"/>
                      <path d="M0,150 C150,100 250,200 400,150 L400,250 L0,250 Z" fill="white" fillOpacity="0.1"/>
                      <path d="M0,0 L400,0 L400,250 C300,200 100,200 0,250 Z" fill="url(#grad1)" fillOpacity="0.05"/>
                  </svg>
               </div>

               {/* Logo Watermark (Fully Opaque Now) */}
               {activeCard.logoUrl && (
                  <img src={activeCard.logoUrl} alt="Bank Logo" className={getLogoClasses(activeCard.logoPosition)} />
               )}

               {/* Card Content - Updated Layout for Full Visibility */}
                <div className="relative z-10 p-6 flex flex-col h-full justify-between text-white">
                    {/* Top Row */}
                    <div className="flex justify-between items-start w-full">
                        {/* Right Side (RTL) - Bank Name + Balance */}
                        <div className="text-right">
                             <h4 className="font-bold text-lg drop-shadow-sm">{activeCard.bankName || 'Debit Card'}</h4>
                             <p className="text-[10px] opacity-80 mt-1">الرصيد</p>
                             <h3 className="text-2xl font-bold sensitive-data tracking-tight drop-shadow-md">
                               {settings.currency} {(activeCard.balance ?? 0).toLocaleString('en-US')}
                             </h3>
                        </div>

                        {/* Left Side (RTL) - Card Holder */}
                        <div className="text-left">
                             <p className="text-[10px] opacity-70 uppercase tracking-widest mb-0.5">HOLDER</p>
                             <p className="font-bold text-lg sensitive-data drop-shadow-sm truncate max-w-[150px]">عمر محمد</p>
                        </div>
                    </div>

                    {/* Bottom Row - Card Number Centered */}
                    <div className="flex justify-center items-end mt-auto mb-2">
                        <p className="font-bold text-2xl tracking-widest sensitive-data drop-shadow-md" dir="ltr">
                           {activeCard.cardNumber ? `•••• ${activeCard.cardNumber}` : '•••• 0000'}
                        </p>
                    </div>
                </div>


                {/* Pagination Dots */}
                {settings.cards.length > 1 && (
                    <div className="flex justify-center gap-1.5 absolute bottom-2 left-1/2 -translate-x-1/2 z-20">
                        {settings.cards.map((card, idx) => (
                            <button 
                            key={card.id || idx} 
                            onClick={() => setActiveCardIndex(idx)}
                            className={`w-1.5 h-1.5 rounded-full transition-all ${idx === activeCardIndex ? 'bg-white w-3' : 'bg-white/40'}`}
                            />
                        ))}
                    </div>
                )}
           </div>
           
           {/* Action Buttons */}
           <div className="flex gap-3 mb-4">
                <button onClick={() => openModal('transfer')} className="flex-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white py-3 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 shadow-sm border border-slate-100 dark:border-slate-800">
                    <Send size={16} className="text-[#bef264]" /> تحويل
                </button>
                <button onClick={() => openModal('receive')} className="flex-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white py-3 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 shadow-sm border border-slate-100 dark:border-slate-800">
                    <Download size={16} className="text-emerald-500" /> استلام
                </button>
            </div>

           {/* Recent Activities (Timeline) */}
           <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white">النشاطات</h3>
                  <MoreHorizontal size={20} className="text-slate-400 cursor-pointer" />
               </div>
               
               <div className="space-y-6 relative before:absolute before:right-4 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100 dark:before:bg-slate-800">
                  <div className="relative pr-8">
                     <div className="absolute right-0 top-1 w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 border-4 border-white dark:border-slate-900 flex items-center justify-center z-10">
                        <Zap size={14} className="text-amber-500" />
                     </div>
                     <p className="text-xs text-slate-400 mb-1">11:45 AM</p>
                     <p className="text-sm font-medium text-slate-800 dark:text-slate-200">تنبيه انخفاض الرصيد</p>
                  </div>
               </div>
           </div>

        </div>
      </div>

      {/* ... (Modals remain unchanged, just ensure sensitive data in them is wrapped if needed, but modals usually have visible inputs) ... */}
       {modalConfig.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
           <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-scale-in">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="font-bold text-xl text-slate-900 dark:text-white">
                    {modalConfig.type === 'smart_sms' ? 'تسجيل ذكي (SMS)' : (modalConfig.type === 'transfer' ? 'تحويل أموال' : 'استلام أموال')}
                 </h3>
                 <button onClick={() => setModalConfig({...modalConfig, isOpen: false})} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500">
                    <X size={20} />
                 </button>
              </div>
              
              <form onSubmit={handleModalSubmit} className="space-y-4">
                 {/* Smart SMS Input */}
                 {modalConfig.type === 'smart_sms' ? (
                   <>
                      <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl mb-4 border border-indigo-100 dark:border-indigo-900/30">
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-2 flex items-center gap-1">
                          <Wand2 size={12}/>
                          ألصق رسالة البنك هنا، وسيقوم النظام بتصنيفها وتحديث الرصيد تلقائياً.
                        </p>
                        <textarea
                          autoFocus
                          value={smsText}
                          onChange={e => setSmsText(e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 rounded-lg p-3 text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                          placeholder="مثال: بطاقة ائتمانية:سداد مبلغ:320 رصيد:367.69..."
                        />
                      </div>
                      <button 
                        type="submit" 
                        disabled={isParsingSms || !smsText}
                        className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-transform active:scale-95 flex items-center justify-center gap-2 shadow-lg disabled:opacity-70"
                      >
                         {isParsingSms ? <Loader2 className="animate-spin" size={16}/> : <Wand2 size={16} />}
                         {isParsingSms ? 'جاري التحليل...' : 'معالجة الرسالة'}
                      </button>
                   </>
                 ) : (
                   /* Transfer / Receive Inputs */
                   <>
                     <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">المبلغ ({settings.currency})</label>
                        <input 
                          type="number" 
                          autoFocus
                          required
                          className="w-full text-3xl font-bold bg-transparent outline-none border-b-2 border-slate-100 dark:border-slate-700 focus:border-[#bef264] py-2 text-slate-900 dark:text-white text-center"
                          placeholder="0.00"
                          value={amount}
                          onChange={e => setAmount(e.target.value)}
                        />
                     </div>
                     
                     <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          {modalConfig.type === 'transfer' ? 'إلى المستفيد' : 'من'}
                        </label>
                        <input 
                          type="text" 
                          required
                          className="w-full bg-slate-50 dark:bg-slate-800 p-3 rounded-xl outline-none text-slate-900 dark:text-white text-sm"
                          placeholder={modalConfig.type === 'transfer' ? 'الاسم أو رقم الحساب' : 'الشركة أو الشخص'}
                          value={party}
                          onChange={e => setParty(e.target.value)}
                        />
                     </div>

                     <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl flex items-center gap-3">
                        <div className="w-10 h-8 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                           <CreditCard size={16} className="text-slate-500" />
                        </div>
                        <div>
                           <p className="text-xs text-slate-400">من الحساب</p>
                           <p className="text-xs font-bold text-slate-800 dark:text-slate-200 sensitive-data">{activeCard.bankName} •••• {activeCard.cardNumber}</p>
                        </div>
                     </div>

                     <button 
                       type="submit" 
                       disabled={isProcessing}
                       className={`w-full py-3.5 rounded-xl font-bold text-sm text-slate-900 transition-transform active:scale-95 flex items-center justify-center gap-2 mt-4 shadow-lg disabled:opacity-70 ${modalConfig.type === 'transfer' ? 'bg-[#bef264] hover:bg-[#a3e635]' : 'bg-white hover:bg-slate-50 border border-slate-200'}`}
                     >
                        {isProcessing ? <Loader2 className="animate-spin" size={16}/> : (modalConfig.type === 'transfer' ? <Send size={16} /> : <Download size={16} />)}
                        {modalConfig.type === 'transfer' ? 'تأكيد التحويل' : 'تأكيد الاستلام'}
                     </button>
                   </>
                 )}
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;