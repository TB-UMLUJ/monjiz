
import React from 'react';
import { Transaction, Loan, UserSettings, FinancialGoal } from '../types';
import { Trophy, Star, TrendingUp, CheckCircle, Lock, Target } from 'lucide-react';

interface AchievementsProps {
  transactions: Transaction[];
  loans: Loan[];
  settings: UserSettings;
  goals: FinancialGoal[];
}

const Achievements: React.FC<AchievementsProps> = ({ transactions, loans, settings, goals }) => {
  
  // Logic to calculate achievements
  const paidLoans = loans.filter(l => l.status === 'completed').length;
  
  // FIX: Calculate total debt by summing principal component of UNPAID installments
  const totalDebt = loans.reduce((acc, l) => {
      const unpaid = l.schedule.filter(s => !s.isPaid).reduce((s, i) => s + i.principalComponent, 0);
      return acc + unpaid;
  }, 0);

  const savingsGoalsMet = goals.filter(g => g.currentAmount >= g.targetAmount).length;
  const hasEmergencyFund = goals.some(g => g.name.includes('طوارئ') && g.currentAmount > 0);
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

  const badges = [
    {
      id: 'first_step',
      title: 'بداية الطريق',
      description: 'سجلت أول عملية مالية',
      icon: <Star size={24} className="text-yellow-500" />,
      achieved: transactions.length > 0,
      color: 'bg-yellow-100 border-yellow-200'
    },
    {
      id: 'debt_free',
      title: 'محرر من الديون',
      description: 'سددت قرضاً بالكامل',
      icon: <CheckCircle size={24} className="text-emerald-500" />,
      achieved: paidLoans > 0,
      color: 'bg-emerald-100 border-emerald-200'
    },
    {
      id: 'saver',
      title: 'موفر بارع',
      description: 'وفرت أكثر من 20% من دخلك',
      icon: <TrendingUp size={24} className="text-blue-500" />,
      achieved: savingsRate >= 20,
      color: 'bg-blue-100 border-blue-200'
    },
    {
      id: 'goal_getter',
      title: 'قناص الأهداف',
      description: 'حققت هدفاً مالياً',
      icon: <Target size={24} className="text-purple-500" />,
      achieved: savingsGoalsMet > 0,
      color: 'bg-purple-100 border-purple-200'
    },
    {
      id: 'emergency_ready',
      title: 'مستعد للطوارئ',
      description: 'بدأت صندوق الطوارئ',
      icon: <Trophy size={24} className="text-amber-600" />,
      achieved: hasEmergencyFund,
      color: 'bg-amber-100 border-amber-200'
    }
  ];

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="text-amber-500" size={20} />
        <h3 className="font-bold text-lg text-slate-800 dark:text-white">إنجازاتك المالية</h3>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {badges.map(badge => (
          <div 
            key={badge.id} 
            className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all ${badge.achieved ? badge.color : 'bg-slate-50 border-slate-100 dark:bg-slate-800 dark:border-slate-700 opacity-60 grayscale'}`}
          >
            <div className={`mb-2 p-2 rounded-full bg-white dark:bg-slate-900 shadow-sm`}>
              {badge.achieved ? badge.icon : <Lock size={20} className="text-slate-400" />}
            </div>
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1">{badge.title}</h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{badge.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Achievements;
