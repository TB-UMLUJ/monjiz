
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Wallet, 
  Banknote, 
  PieChart, 
  Settings, 
  Search,
  Bell,
  LogOut,
  Crown,
  User,
  X,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Moon,
  Sun
} from 'lucide-react';
import { UserSettings, Loan, Bill } from '../types';
import { getBillSchedule } from '../services/loanCalculator';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  settings?: UserSettings | null; // Receive settings to get the logo
  loans?: Loan[]; // Pass loans for notifications
  bills?: Bill[]; // Pass bills for notifications
  onThemeToggle?: () => void; // New prop for theme toggling
}

interface NotificationItem {
  id: string;
  title: string;
  msg: string;
  time: string;
  type: 'alert' | 'warning' | 'info' | 'success';
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, onLogout, settings, loans = [], bills = [], onThemeToggle }) => {
  const [showNotifications, setShowNotifications] = useState(false);

  // --- Dynamic Notifications Logic ---
  const notifications: NotificationItem[] = useMemo(() => {
    const list: NotificationItem[] = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    // 1. Check Loans
    loans.forEach(loan => {
       if (loan.status === 'completed') return;
       // Find upcoming or overdue installments
       loan.schedule.forEach(item => {
          if (!item.isPaid) {
              const dueDate = new Date(item.paymentDate);
              dueDate.setHours(0,0,0,0);
              
              const diffTime = dueDate.getTime() - today.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (diffDays < 0) {
                  // Overdue
                  list.push({
                      id: `loan-${loan.id}-${item.paymentDate}`,
                      title: 'تأخر سداد قرض',
                      msg: `فات موعد سداد قسط "${loan.name}" منذ ${Math.abs(diffDays)} يوم`,
                      time: dueDate.toLocaleDateString('ar-SA'),
                      type: 'alert'
                  });
              } else if (diffDays >= 0 && diffDays <= 2) {
                  // Upcoming (Today, Tomorrow, Day after)
                  list.push({
                      id: `loan-${loan.id}-${item.paymentDate}`,
                      title: 'استحقاق قرض قريب',
                      msg: diffDays === 0 ? `قسط "${loan.name}" يستحق اليوم!` : `قسط "${loan.name}" يستحق خلال ${diffDays} يوم`,
                      time: dueDate.toLocaleDateString('ar-SA'),
                      type: 'warning'
                  });
              }
          }
       });
    });

    // 2. Check Bills
    bills.forEach(bill => {
        if (bill.status === 'archived') return;
        const schedule = getBillSchedule(bill);
        
        schedule.forEach(item => {
            if (!item.isPaid) {
                const dueDate = new Date(item.date);
                dueDate.setHours(0,0,0,0);
                
                // Skip future dates far away for overdue check context
                // But for bills, we check simple diff
                const diffTime = dueDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                // Only consider reasonable history for bills (e.g., last 30 days overdue) to avoid clutter
                if (diffDays < 0 && diffDays > -30) {
                     list.push({
                        id: `bill-${bill.id}-${item.date.toISOString()}`,
                        title: 'فاتورة متأخرة',
                        msg: `فات موعد سداد "${bill.name}"`,
                        time: dueDate.toLocaleDateString('ar-SA'),
                        type: 'alert'
                    });
                } else if (diffDays >= 0 && diffDays <= 2) {
                     list.push({
                        id: `bill-${bill.id}-${item.date.toISOString()}`,
                        title: 'استحقاق فاتورة',
                        msg: diffDays === 0 ? `فاتورة "${bill.name}" تستحق اليوم!` : `فاتورة "${bill.name}" تستحق خلال ${diffDays} يوم`,
                        time: dueDate.toLocaleDateString('ar-SA'),
                        type: 'warning'
                    });
                }
            }
        });
    });

    // Sort: Alerts first, then by date
    return list.sort((a, b) => {
        if (a.type === 'alert' && b.type !== 'alert') return -1;
        if (a.type !== 'alert' && b.type === 'alert') return 1;
        return 0;
    });
  }, [loans, bills]);

  const hasUnread = notifications.length > 0;

  const menuItems = [
    { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'transactions', label: 'المصاريف', icon: Wallet },
    { id: 'loans', label: 'القروض', icon: Banknote },
    { id: 'budget', label: 'الميزانية', icon: PieChart },
    { id: 'settings', label: 'الإعدادات', icon: Settings },
  ];

  const handleLogoutClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onLogout();
  };
  
  // Use appLogo from settings, if not available, it will be handled in JSX to show a placeholder
  const logoSrc = settings?.appLogo;
  
  // Check if current theme is dark
  const isDark = settings?.theme === 'dark';

  return (
    <div className="min-h-screen bg-ghost-white dark:bg-[#0f172a] flex font-tajawal text-eerie-black dark:text-slate-100 transition-colors duration-300">
      
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-72 bg-white dark:bg-slate-900 h-screen sticky top-0 border-l border-slate-100 dark:border-slate-800 px-6 py-8 z-40 transition-colors">
        <div className="flex items-center justify-center mb-10 px-2">
           {logoSrc ? (
             <img 
               src={logoSrc} 
               alt="Logo" 
               className="h-20 w-auto object-contain"
             />
           ) : (
             <div className="flex flex-col items-center justify-center text-eerie-black dark:text-white">
                 <div className="bg-[#bef264] p-3 rounded-2xl mb-2 shadow-sm">
                    <Wallet size={32} className="text-slate-900" />
                 </div>
                 <span className="font-bold text-xl tracking-tight">مواءمة</span>
             </div>
           )}
        </div>
        
        <nav className="flex-1 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-200 group ${
                  isActive 
                    ? 'bg-emerald-600 dark:bg-[#bef264] text-white dark:text-slate-900 font-bold shadow-sm' 
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-emerald-700 dark:hover:text-white'
                }`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-white dark:text-slate-900' : 'text-slate-400 dark:text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-white'} />
                <span className="text-base">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Pro Card in Sidebar */}
        <div className="mt-auto pt-6">
          <div className="bg-eerie-black dark:bg-slate-800 text-white p-5 rounded-3xl relative overflow-hidden group cursor-pointer hover:shadow-xl transition-all border border-slate-800 dark:border-slate-700">
             <div className="absolute top-0 right-0 w-24 h-24 bg-[#bef264] rounded-full blur-2xl opacity-20 -mr-10 -mt-10 group-hover:opacity-30 transition-opacity"></div>
             <div className="relative z-10">
               <div className="bg-white/10 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
                 <Crown size={20} className="text-[#bef264]" />
               </div>
               <h4 className="font-bold text-lg mb-1">العضوية الذهبية</h4>
               <p className="text-xs text-slate-400 mb-4 leading-relaxed">احصل على خدمات بنكية حصرية وتحليلات متقدمة.</p>
               <button onClick={() => alert('هذه الميزة متاحة في النسخة الكاملة.')} className="w-full bg-[#bef264] text-slate-900 py-2.5 rounded-xl text-sm font-bold hover:bg-[#a3e635] transition-colors">
                 ترقية الآن
               </button>
             </div>
          </div>
          
          <a
            href="#"
            onClick={handleLogoutClick} 
            className="flex items-center gap-3 text-slate-400 hover:text-rose-500 transition-colors mt-6 px-2 w-full hover:bg-rose-50 dark:hover:bg-rose-900/10 py-2 rounded-xl"
          >
            <LogOut size={20} />
            <span className="font-medium text-sm">تسجيل الخروج</span>
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Top Header */}
        <header className="px-4 md:px-8 py-5 flex items-center justify-between bg-ghost-white/80 dark:bg-slate-900/80 backdrop-blur-md md:bg-transparent sticky top-0 z-30 md:static border-b md:border-none border-slate-100 dark:border-slate-800 transition-colors">
           <div className="md:hidden flex items-center pt-2">
              {logoSrc ? (
                <img 
                  src={logoSrc} 
                  alt="Logo" 
                  className="h-10 w-auto object-contain"
                />
              ) : (
                <div className="flex items-center gap-2">
                    <div className="bg-[#bef264] p-1.5 rounded-lg">
                        <Wallet size={20} className="text-slate-900" />
                    </div>
                    <span className="font-bold text-lg text-slate-800 dark:text-white">مواءمة</span>
                </div>
              )}
           </div>

           {/* Search Bar (Desktop) */}
           <div className="hidden md:flex flex-1 max-w-xl bg-white dark:bg-slate-900 rounded-full px-4 py-2.5 border border-slate-200 dark:border-slate-800 focus-within:ring-2 focus-within:ring-emerald-500 dark:focus-within:ring-[#bef264] focus-within:border-transparent transition-all shadow-sm">
              <Search className="text-slate-400 ml-3" size={20} />
              <input 
                type="text" 
                placeholder="ابحث عن العمليات، القروض، التقارير..." 
                className="bg-transparent border-none outline-none w-full text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
              />
           </div>

           {/* Right Actions */}
           <div className="flex items-center gap-3 md:gap-5">
              {/* Theme Toggle (Replacement for Privacy Toggle) */}
              <button 
                onClick={onThemeToggle}
                className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${isDark ? 'bg-slate-800 border-slate-700 text-yellow-400' : 'bg-white border-slate-200 text-slate-500'}`}
                title="تغيير المظهر"
              >
                 {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={`w-10 h-10 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center border transition-all relative ${showNotifications ? 'border-emerald-500 dark:border-[#bef264] bg-slate-50 dark:bg-lime-900/20 text-emerald-600 dark:text-lime-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-white hover:shadow-md'}`}
                >
                  <Bell size={20} />
                  {hasUnread && <span className="absolute top-2 right-2.5 w-2 h-2 bg-rose-500 rounded-full border border-white dark:border-slate-800"></span>}
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div className="fixed md:absolute top-20 md:top-full left-1/2 -translate-x-1/2 md:translate-x-0 md:left-0 mt-3 w-[90vw] md:w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-2 z-50 animate-fade-in origin-top-left">
                    <div className="flex justify-between items-center p-3 mb-2 border-b border-slate-50 dark:border-slate-700">
                      <h4 className="font-bold text-sm text-eerie-black dark:text-white">الإشعارات والتنبيهات</h4>
                      <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={16}/></button>
                    </div>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {notifications.length > 0 ? (
                          notifications.map(n => (
                            <div key={n.id} className={`p-3 rounded-xl flex gap-3 ${n.type === 'alert' ? 'bg-rose-50 dark:bg-rose-900/10' : (n.type === 'warning' ? 'bg-amber-50 dark:bg-amber-900/10' : 'bg-slate-50 dark:bg-slate-700/50')}`}>
                              <div className={`mt-1`}>
                                  {n.type === 'alert' ? <AlertTriangle size={16} className="text-rose-500"/> : (n.type === 'warning' ? <Clock size={16} className="text-amber-500"/> : <CheckCircle2 size={16} className="text-emerald-500"/>)}
                              </div>
                              <div>
                                  <p className={`text-sm font-bold ${n.type === 'alert' ? 'text-rose-700 dark:text-rose-400' : (n.type === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200')}`}>{n.title}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{n.msg}</p>
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">{n.time}</p>
                              </div>
                            </div>
                          ))
                      ) : (
                          <div className="text-center py-6 text-slate-400 text-sm">
                              لا توجد تنبيهات جديدة
                          </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="hidden md:flex items-center gap-3 pl-1 pr-4 py-1 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-md transition-all group" onClick={() => onTabChange('settings')}>
                 <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 group-hover:bg-emerald-600 dark:group-hover:bg-[#bef264] group-hover:text-white dark:group-hover:text-slate-900 transition-colors">
                    <User size={16} />
                 </div>
                 <span className="text-sm font-bold text-slate-700 dark:text-slate-200 ml-2 group-hover:text-emerald-700 dark:group-hover:text-slate-100">عمر محمد</span>
              </div>
              
              <a
                href="#"
                onClick={handleLogoutClick} 
                className="md:hidden w-10 h-10 rounded-full bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-500 dark:bg-slate-800 dark:hover:bg-rose-900/20 dark:text-slate-400 dark:hover:text-rose-400 flex items-center justify-center transition-colors shadow-sm relative z-[60] cursor-pointer active:scale-90"
              >
                <LogOut size={20} />
              </a>
           </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 px-4 md:px-8 pt-6 md:pt-0 pb-32 md:pb-8 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Floating Nav - Redesigned with Glass Effect */}
      <nav className="md:hidden fixed bottom-4 inset-x-4 h-16 bg-white/70 dark:bg-slate-900/80 backdrop-blur-lg rounded-full shadow-2xl z-50 p-2 flex justify-around items-center border border-slate-200 dark:border-slate-700">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="flex-1 h-full flex justify-center items-center rounded-full"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive ? (
                <div className="flex items-center justify-center gap-2 rounded-full transition-all duration-300 ease-out bg-emerald-600 dark:bg-[#bef264] text-white dark:text-slate-900 px-5 py-2.5 shadow-md">
                  <Icon size={20} strokeWidth={2.5} />
                  <span className="text-sm font-bold whitespace-nowrap animate-fade-in">{item.label}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-full w-12 h-12 text-slate-500 dark:text-slate-300 transition-colors">
                  <Icon size={24} strokeWidth={2} />
                </div>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default Layout;
