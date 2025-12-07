import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, UserSettings, FinancialGoal } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, AlertTriangle, Calendar, Trophy, Target, Calculator, Plus, Trash2, CheckCircle2, Crown, Zap, Save, RefreshCcw, PieChart as PieChartIcon, DollarSign } from 'lucide-react';
import { storageService } from '../services/storage';
import { useNotification } from '../contexts/NotificationContext';

interface BudgetProps {
  transactions: Transaction[];
  settings: UserSettings;
}

interface CategoryData {
  name: string;
  value: number;
}

const Budget: React.FC<BudgetProps> = ({ transactions, settings }) => {
  const { notify } = useNotification();
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: '', target: '', current: '' });
  
  // Simulator State
  const [simSaving, setSimSaving] = useState(500);
  const [simMonths, setSimMonths] = useState(12);

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    const loaded = await storageService.getGoals();
    setGoals(loaded);
  };

  // --- 1. Calculations & Logic ---
  const expenses = transactions.filter(t => t.type === 'expense');
  const totalSpent = expenses.reduce((acc, curr) => acc + curr.amount, 0);
  
  // Smart Forecasting
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const dailyAverage = dayOfMonth > 0 ? totalSpent / dayOfMonth : 0;
  const forecastedSpend = dailyAverage * daysInMonth;
  const isOverBudgetRisk = forecastedSpend > settings.monthlyLimit;

  // Total Cards Balance
  const totalCardsBalance = settings.cards.reduce((acc, card) => acc + (card.balance || 0), 0);

  // 50/30/20 Rule
  const needsCategories = ['سكن', 'فواتير وخدمات', 'طعام', 'نقل', 'صحة', 'تعليم'];
  const wantsCategories = ['تسوق', 'ترفيه', 'أخرى'];
  const savingsCategories = ['استثمار', 'تحويل بنكي']; // Assuming transfers are savings

  const ruleData = useMemo(() => {
      let needs = 0, wants = 0, savings = 0;
      expenses.forEach(t => {
          if (needsCategories.includes(t.category)) needs += t.amount;
          else if (wantsCategories.includes(t.category)) wants += t.amount;
          else savings += t.amount; // Default fallback to savings or wants? Let's put rest in wants usually, but stick to specific for now.
      });
      // Add explicit savings (if tracked as expense transfers)
      return [
          { name: 'احتياجات (50%)', value: needs, color: '#0ea5e9' }, // Blue
          { name: 'رغبات (30%)', value: wants, color: '#f59e0b' },   // Amber
          { name: 'ادخار (20%)', value: savings, color: '#10b981' }  // Emerald
      ];
  }, [expenses]);

  // Period Comparison (Mocking Last Month for Demo if no data exists)
  const comparisonData = [
      { name: 'الشهر الماضي', amount: totalSpent * 0.9 }, // Mock: 10% less
      { name: 'الشهر الحالي', amount: totalSpent }
  ];

  // Spending Calendar Logic
  const getDayIntensity = (day: number) => {
      // Filter transactions for this day
      const dailyTotal = expenses
        .filter(t => new Date(t.date).getDate() === day && new Date(t.date).getMonth() === today.getMonth())
        .reduce((sum, t) => sum + t.amount, 0);
      
      if (dailyTotal === 0) return 'bg-slate-50 dark:bg-slate-800';
      if (dailyTotal < 100) return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600';
      if (dailyTotal < 300) return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600';
      return 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 font-bold';
  };

  // Challenges (Static for now)
  const [challenges, setChallenges] = useState([
      { id: 1, name: 'أسبوع بلا قهوة', target: 7, current: 3, icon: <Zap size={18} className="text-amber-500"/> },
      { id: 2, name: 'توفير 10% من الراتب', target: 100, current: 45, icon: <Crown size={18} className="text-purple-500"/> },
      { id: 3, name: 'تحدي الـ 52 أسبوع', target: 52, current: 12, icon: <TrendingUp size={18} className="text-emerald-500"/> },
  ]);

  // --- Handlers ---
  const handleAddGoal = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newGoal.name || !newGoal.target) return;
      
      const goal: FinancialGoal = {
          id: '',
          name: newGoal.name,
          targetAmount: parseFloat(newGoal.target),
          currentAmount: parseFloat(newGoal.current) || 0,
          icon: 'target',
          color: '#10b981'
      };

      try {
          const updated = await storageService.saveGoal(goal);
          setGoals(updated);
          setShowGoalModal(false);
          setNewGoal({ name: '', target: '', current: '' });
          notify('تم إضافة الهدف بنجاح', 'success');
      } catch (e) {
          notify('خطأ في حفظ الهدف', 'error');
      }
  };

  const handleDeleteGoal = async (id: string) => {
      try {
          const updated = await storageService.deleteGoal(id);
          setGoals(updated);
          notify('تم حذف الهدف', 'info');
      } catch (e) {
          notify('خطأ في الحذف', 'error');
      }
  };

  const handleUpdateGoal = async (goal: FinancialGoal, increment: number) => {
      const updated = {...goal, currentAmount: Math.min(goal.currentAmount + increment, goal.targetAmount)};
      await storageService.updateGoal(updated);
      loadGoals();
      notify(`تم إضافة ${increment} للهدف`, 'success');
  };

  const incomeTransactions = useMemo(() => {
    return transactions
        .filter(t => t.type === 'income')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  return (
    <div className="space-y-8 pb-20 md:pb-10">
       
       {/* 1. Smart Forecasting Banner */}
       <div className={`p-6 rounded-2xl border shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 transition-colors ${isOverBudgetRisk ? 'bg-rose-50 border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/30' : 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30'}`}>
          <div className="flex items-center gap-4">
             <div className={`p-3 rounded-full ${isOverBudgetRisk ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/50' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50'}`}>
                {isOverBudgetRisk ? <AlertTriangle size={24}/> : <TrendingUp size={24}/>}
             </div>
             <div>
                <h3 className={`font-bold text-lg ${isOverBudgetRisk ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {isOverBudgetRisk ? 'تنبيه: خطر تجاوز الميزانية' : 'وضعك المالي ممتاز!'}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    بناءً على صرفك الحالي ({dailyAverage.toFixed(0)} يومياً)، متوقع أن تصل إلى <span className="font-bold">{forecastedSpend.toLocaleString('en-US')}</span> بنهاية الشهر.
                    {isOverBudgetRisk ? ` (تتجاوز الحد بـ ${(forecastedSpend - settings.monthlyLimit).toLocaleString('en-US')})` : ` (أقل من الحد بـ ${(settings.monthlyLimit - forecastedSpend).toLocaleString('en-US')})`}
                </p>
             </div>
          </div>
          <div className="text-center md:text-left min-w-[120px]">
             <p className="text-xs text-slate-500 mb-1">الميزانية المتبقية</p>
             <p className="text-2xl font-bold text-slate-800 dark:text-white">
                {totalCardsBalance.toLocaleString('en-US')}
             </p>
          </div>
       </div>

       <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
           
           {/* 2. 50/30/20 Rule Chart */}
           <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
               <div className="flex items-center gap-2 mb-6">
                   <PieChartIcon size={20} className="text-indigo-500" />
                   <h3 className="font-bold text-lg text-slate-800 dark:text-white">قاعدة 50/30/20</h3>
               </div>
               <div className="h-64">
                   <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={ruleData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {ruleData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <ReTooltip contentStyle={{ borderRadius: '12px' }} />
                            <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                   </ResponsiveContainer>
               </div>
               <div className="mt-4 space-y-3">
                   {ruleData.map(item => (
                       <div key={item.name} className="flex justify-between items-center text-sm">
                           <div className="flex items-center gap-2">
                               <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                               <span className="text-slate-600 dark:text-slate-300">{item.name}</span>
                           </div>
                           <span className="font-bold text-slate-800 dark:text-white">{item.value.toLocaleString('en-US')}</span>
                       </div>
                   ))}
               </div>
           </div>

           {/* 3. Period Comparison */}
           <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
               <div className="flex items-center gap-2 mb-6">
                   <RefreshCcw size={20} className="text-blue-500" />
                   <h3 className="font-bold text-lg text-slate-800 dark:text-white">مقارنة الفترات</h3>
               </div>
               <div className="h-64">
                   <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={comparisonData}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                           <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                           <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                           <ReTooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px'}} />
                           <Bar dataKey="amount" fill="#3b82f6" radius={[10, 10, 0, 0]} barSize={40} />
                       </BarChart>
                   </ResponsiveContainer>
               </div>
               <p className="text-sm text-slate-500 dark:text-slate-400 mt-4 text-center">
                   مصروفاتك هذا الشهر {totalSpent > comparisonData[0].amount ? 'أعلى' : 'أقل'} من الشهر الماضي بـ <span>{Math.abs(totalSpent - comparisonData[0].amount).toLocaleString('en-US')}</span>.
               </p>
           </div>
       </div>

       {/* 4. Spending Calendar */}
       <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
           <div className="flex items-center gap-2 mb-6">
               <Calendar size={20} className="text-emerald-500" />
               <h3 className="font-bold text-lg text-slate-800 dark:text-white">تقويم الصرف (شهر {today.getMonth() + 1})</h3>
           </div>
           
           <div className="grid grid-cols-7 gap-2">
               {['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map(day => (
                   <div key={day} className="text-center text-xs text-slate-400 mb-2">{day}</div>
               ))}
               {Array.from({ length: daysInMonth }).map((_, i) => {
                   const day = i + 1;
                   return (
                       <div 
                           key={day} 
                           className={`aspect-square rounded-lg flex items-center justify-center text-sm ${getDayIntensity(day)} transition-all hover:scale-105 cursor-default`}
                           title={`يوم ${day}`}
                       >
                           {day}
                       </div>
                   );
               })}
           </div>
           <div className="flex gap-4 mt-4 justify-center text-xs text-slate-500">
               <div className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-100 rounded"></div> 0</div>
               <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-100 rounded"></div> منخفض</div>
               <div className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-100 rounded"></div> متوسط</div>
               <div className="flex items-center gap-1"><div className="w-3 h-3 bg-rose-100 rounded"></div> مرتفع</div>
           </div>
       </div>

       {/* 5. Financial Goals & Challenges */}
       <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
           
           {/* Goals */}
           <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
               <div className="flex justify-between items-center mb-6">
                   <div className="flex items-center gap-2">
                       <Target size={20} className="text-rose-500" />
                       <h3 className="font-bold text-lg text-slate-800 dark:text-white">الأهداف المالية</h3>
                   </div>
                   <button onClick={() => setShowGoalModal(true)} className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-full text-slate-600 dark:text-slate-300 transition-colors">
                       <Plus size={18} />
                   </button>
               </div>
               
               {goals.length === 0 ? (
                   <div className="text-center py-8 text-slate-400">
                       <Target size={32} className="mx-auto mb-2 opacity-30" />
                       <p>لم تضف أهدافاً بعد</p>
                   </div>
               ) : (
                   <div className="space-y-4">
                       {goals.map(goal => {
                           const percentage = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
                           return (
                               <div key={goal.id} className="border border-slate-100 dark:border-slate-800 p-4 rounded-xl hover:border-emerald-200 transition-colors group">
                                   <div className="flex justify-between items-center mb-2">
                                       <h4 className="font-bold text-slate-800 dark:text-white">{goal.name}</h4>
                                       <div className="flex items-center gap-2">
                                           <span className="text-xs text-slate-500">{percentage.toFixed(0)}%</span>
                                           <button onClick={() => handleDeleteGoal(goal.id)} className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                                       </div>
                                   </div>
                                   <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
                                       <div className="bg-emerald-500 h-full transition-all" style={{ width: `${percentage}%` }}></div>
                                   </div>
                                   <div className="flex justify-between items-center text-xs">
                                       <span className="text-slate-500">{goal.currentAmount.toLocaleString('en-US')} / {goal.targetAmount.toLocaleString('en-US')}</span>
                                       <button onClick={() => handleUpdateGoal(goal, 100)} className="text-emerald-600 font-bold hover:underline">+ 100 ريال</button>
                                   </div>
                               </div>
                           );
                       })}
                   </div>
               )}
           </div>

           {/* Challenges */}
           <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
               <div className="flex items-center gap-2 mb-6">
                   <Trophy size={20} className="text-amber-500" />
                   <h3 className="font-bold text-lg text-slate-800 dark:text-white">تحديات التوفير</h3>
               </div>
               <div className="space-y-4">
                   {challenges.map(challenge => {
                       const progress = (challenge.current / challenge.target) * 100;
                       return (
                           <div key={challenge.id} className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                               <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-sm">
                                   {challenge.icon}
                               </div>
                               <div className="flex-1">
                                   <div className="flex justify-between mb-1">
                                       <span className="font-bold text-sm text-slate-800 dark:text-white">{challenge.name}</span>
                                       <span className="text-xs text-slate-500">{challenge.current}/{challenge.target}</span>
                                   </div>
                                   <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                       <div className="bg-amber-400 h-full" style={{ width: `${progress}%` }}></div>
                                   </div>
                               </div>
                               {progress >= 100 && <CheckCircle2 size={18} className="text-emerald-500" />}
                           </div>
                       );
                   })}
               </div>
           </div>
       </div>

       {/* 6. What-if Simulator */}
       <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-8 rounded-2xl shadow-xl relative overflow-hidden">
           <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center">
               <div className="flex-1">
                   <div className="flex items-center gap-3 mb-4">
                       <Calculator className="text-[#bef264]" size={28} />
                       <h3 className="text-2xl font-bold">محاكي "ماذا لو؟"</h3>
                   </div>
                   <p className="text-indigo-200 mb-6">
                       جرب تغيير مبلغ توفيرك الشهري لترى كيف سينمو مستقبلك المالي.
                   </p>
                   
                   <div className="space-y-4">
                       <div>
                           <label className="block text-sm text-indigo-300 mb-1">أوفر شهرياً (ريال)</label>
                           <input 
                               type="number" 
                               value={simSaving} 
                               onChange={(e) => setSimSaving(Number(e.target.value))}
                               className="w-full bg-white/10 border border-white/20 rounded-xl p-3 text-white outline-none focus:border-[#bef264]"
                           />
                       </div>
                       <div>
                           <label className="block text-sm text-indigo-300 mb-1">لمدة (شهر)</label>
                           <input 
                               type="range" min="1" max="60" 
                               value={simMonths} 
                               onChange={(e) => setSimMonths(Number(e.target.value))}
                               className="w-full accent-[#bef264]"
                           />
                           <div className="text-right text-sm text-[#bef264]">{simMonths} شهر ({Math.floor(simMonths/12)} سنة)</div>
                       </div>
                   </div>
               </div>

               <div className="flex-1 text-center bg-white/5 p-6 rounded-2xl border border-white/10 w-full">
                   <p className="text-sm text-indigo-300 mb-2">ستجمع مبلغ</p>
                   <h2 className="text-4xl md:text-5xl font-bold text-white mb-2">
                       {(simSaving * simMonths).toLocaleString('en-US')} <span className="text-lg text-[#bef264] font-tajawal">ريال</span>
                   </h2>
                   <p className="text-xs text-indigo-400 mt-4">
                       * هذا المبلغ لا يشمل العوائد الاستثمارية المحتملة.
                   </p>
               </div>
           </div>
           
           {/* Decor */}
           <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#bef264] rounded-full blur-[80px] opacity-20"></div>
       </div>

       {/* 7. Income History Table (Responsive Card View for Mobile) */}
       <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
           <div className="flex items-center gap-2 mb-6">
               <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                 <DollarSign size={20} />
               </div>
               <h3 className="font-bold text-lg text-slate-800 dark:text-white">سجل الدخل والرواتب</h3>
           </div>
           
           {/* Desktop Table View */}
           <div className="hidden md:block overflow-x-auto">
               <table className="w-full text-sm text-left rtl:text-right text-slate-500 dark:text-slate-400">
                   <thead className="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800">
                       <tr>
                           <th className="px-6 py-4 rounded-r-xl">التاريخ</th>
                           <th className="px-6 py-4">المصدر / التصنيف</th>
                           <th className="px-6 py-4">ملاحظات</th>
                           <th className="px-6 py-4 rounded-l-xl text-left">المبلغ</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                       {incomeTransactions.length > 0 ? (
                           incomeTransactions.map((t) => (
                               <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                   <td className="px-6 py-4 font-medium whitespace-nowrap">
                                       {/* Force English Digits and Gregorian Date */}
                                       {new Date(t.date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
                                   </td>
                                   <td className="px-6 py-4">
                                       <span className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-md text-xs font-bold border border-emerald-100 dark:border-emerald-800">
                                           {t.category}
                                       </span>
                                   </td>
                                   <td className="px-6 py-4 max-w-[200px] truncate" title={t.note}>
                                       {t.note || '-'}
                                   </td>
                                   <td className="px-6 py-4 font-bold text-emerald-600 dark:text-emerald-400 text-left ltr">
                                       +{t.amount.toLocaleString('en-US')} SAR
                                   </td>
                               </tr>
                           ))
                       ) : (
                           <tr>
                               <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                   لا يوجد سجل دخل مسجل حتى الآن
                               </td>
                           </tr>
                       )}
                   </tbody>
               </table>
           </div>

           {/* Mobile Card View */}
           <div className="md:hidden grid grid-cols-1 gap-4">
               {incomeTransactions.length > 0 ? (
                   incomeTransactions.map((t) => (
                       <div key={t.id} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                           <div className="flex justify-between items-start mb-2">
                               <div>
                                   <p className="text-xs text-slate-400 mb-1">
                                      {new Date(t.date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
                                   </p>
                                   <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded text-xs font-bold">
                                      {t.category}
                                   </span>
                               </div>
                               <div className="text-left">
                                   <p className="font-bold text-xl text-emerald-600 dark:text-emerald-400">
                                       +{t.amount.toLocaleString('en-US')}
                                   </p>
                                   <p className="text-[10px] text-slate-400">SAR</p>
                               </div>
                           </div>
                           {t.note && (
                               <div className="pt-2 border-t border-slate-200 dark:border-slate-700 mt-2">
                                   <p className="text-sm text-slate-600 dark:text-slate-300">{t.note}</p>
                               </div>
                           )}
                       </div>
                   ))
               ) : (
                   <div className="text-center py-8 text-slate-400">
                       لا يوجد سجل دخل مسجل حتى الآن
                   </div>
               )}
           </div>
       </div>

       {/* Add Goal Modal */}
       {showGoalModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-scale-in">
                   <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-white">إضافة هدف مالي جديد</h3>
                   <form onSubmit={handleAddGoal} className="space-y-4">
                       <div>
                           <label className="text-xs text-slate-500 block mb-1">اسم الهدف</label>
                           <input type="text" value={newGoal.name} onChange={e => setNewGoal({...newGoal, name: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg outline-none dark:text-white dark:border-slate-700" placeholder="مثال: شراء سيارة" required />
                       </div>
                       <div>
                           <label className="text-xs text-slate-500 block mb-1">المبلغ المطلوب</label>
                           <input type="number" value={newGoal.target} onChange={e => setNewGoal({...newGoal, target: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg outline-none dark:text-white dark:border-slate-700" placeholder="0" required />
                       </div>
                       <div>
                           <label className="text-xs text-slate-500 block mb-1">المبلغ الحالي (إن وجد)</label>
                           <input type="number" value={newGoal.current} onChange={e => setNewGoal({...newGoal, current: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg outline-none dark:text-white dark:border-slate-700" placeholder="0" />
                       </div>
                       <div className="flex gap-2 pt-2">
                           <button type="button" onClick={() => setShowGoalModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold">إلغاء</button>
                           <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold flex justify-center items-center gap-1"><Save size={16}/> حفظ</button>
                       </div>
                   </form>
               </div>
           </div>
       )}

    </div>
  );
};

export default Budget;