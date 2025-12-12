
import React, { useEffect, useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import LoansPage from './pages/Loans';
import Transactions from './pages/Transactions';
import Budget from './pages/Budget';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { storageService } from './services/storage';
import { authService } from './services/auth';
import { parseTransactionFromSMS } from './services/geminiService';
import { Loan, Transaction, UserSettings, Bill, ThemeOption, TransactionType } from './types';
import { Loader2, MessageSquarePlus, Wand2, X, CreditCard, Sparkles } from 'lucide-react';
import { NotificationProvider, useNotification } from './contexts/NotificationContext';

// Wrap AppContent to use Notification Context
const AppContent: React.FC = () => {
  const { notify } = useNotification();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  
  // Application State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  // Global Smart SMS Modal State
  const [showSmartModal, setShowSmartModal] = useState(false);
  const [smartSmsText, setSmartSmsText] = useState('');
  const [isParsingSms, setIsParsingSms] = useState(false);

  const loadData = async () => {
      setIsLoading(true);
      try {
        const [txs, lns, bls, stgs] = await Promise.all([
            storageService.getTransactions(),
            storageService.getLoans(),
            storageService.getBills(),
            storageService.getSettings()
        ]);
        setTransactions(txs);
        setLoans(lns);
        setBills(bls);
        setSettings(stgs);
        
        // Check for Salary/Recurring Deposit
        const added = await storageService.processRecurringIncomes();
        if (added > 0) {
            // Refresh transactions if new salary was added
            const freshTxs = await storageService.getTransactions();
            setTransactions(freshTxs);
        }
      } catch (e) {
          console.error("Failed to load data", e);
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
    // Check Authentication
    const isAuth = authService.isAuthenticated();
    setIsAuthenticated(isAuth);
    if (isAuth) {
        loadData();
    } else {
        setIsLoading(false);
    }
  }, []);

  // Theme Logic
  useEffect(() => {
    const root = window.document.documentElement;
    
    const getTheme = () => {
        if (settings) return settings.theme;
        return 'system'; // Default for login page or when settings not loaded
    };

    const currentTheme = getTheme();
    
    const applyTheme = () => {
      if (currentTheme === 'dark') {
        root.classList.add('dark');
      } else if (currentTheme === 'light') {
        root.classList.remove('dark');
      } else {
        // System preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    applyTheme();

    // Listen for system changes if mode is system
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (currentTheme === 'system') applyTheme();
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings?.theme]); // Dependency works even if settings is null/undefined

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    loadData();
  };

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    // Clear data to prevent a flash of old content on next login
    setTransactions([]);
    setLoans([]);
    setBills([]);
    setSettings(null);
    setActiveTab('dashboard');
  };

  const handleThemeToggle = async () => {
      if (!settings) return;
      // Toggle logic: If currently dark (or system dark), switch to light. Else dark.
      const currentIsDark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const newTheme: ThemeOption = currentIsDark ? 'light' : 'dark';
      
      const newSettings: UserSettings = { ...settings, theme: newTheme };
      
      // Optimistic update
      setSettings(newSettings);
      
      try {
        await storageService.saveSettings(newSettings);
      } catch (e) {
          console.error("Failed to save theme preference");
      }
  };

  // --- Global Smart Record Handler ---
  const handleSmartSmsSubmit = async () => {
    if (!smartSmsText || !settings) return;
    setIsParsingSms(true);

    try {
      // 1. Parse with Gemini
      const parsedData = await parseTransactionFromSMS(smartSmsText);
      
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
      if (parsedData.newBalance !== undefined && parsedData.newBalance !== null) {
          successMessage += ` وتحديث الرصيد إلى ${parsedData.newBalance}`;
      }
      notify(successMessage, 'success');
      setShowSmartModal(false);
      setSmartSmsText('');

    } catch (err) {
      console.error(err);
      notify('حدث خطأ أثناء المعالجة الذكية', 'error');
    } finally {
      setIsParsingSms(false);
    }
  };

  const renderContent = () => {
    if (!settings) return null;

    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard 
            transactions={transactions} 
            loans={loans} 
            settings={settings} 
            onNavigate={setActiveTab}
            setTransactions={setTransactions}
            setSettings={setSettings}
          />
        );
      case 'loans':
        return <LoansPage loans={loans} setLoans={setLoans} settings={settings} setSettings={setSettings} />;
      case 'transactions':
        return <Transactions transactions={transactions} setTransactions={setTransactions} settings={settings} setSettings={setSettings} />;
      case 'budget':
        return <Budget transactions={transactions} settings={settings} />;
      case 'settings':
        return <Settings settings={settings} setSettings={setSettings} />;
      default:
        return (
          <Dashboard 
            transactions={transactions} 
            loans={loans} 
            settings={settings} 
            onNavigate={setActiveTab}
            setTransactions={setTransactions}
            setSettings={setSettings}
          />
        );
    }
  };

  if (isLoading) {
      return (
          <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
              <Loader2 className="animate-spin text-slate-400" size={48} />
          </div>
      );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <>
      <Layout 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        onLogout={handleLogout} 
        settings={settings} 
        loans={loans} 
        bills={bills}
        onThemeToggle={handleThemeToggle}
        onSmartRecord={() => setShowSmartModal(true)} // Pass global modal handler
      >
        <div className="animate-fade-in text-slate-900 dark:text-slate-100">
          {renderContent()}
        </div>
      </Layout>

      {/* GLOBAL SMART SMS MODAL */}
      {showSmartModal && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => setShowSmartModal(false)}
          >
              <div 
                className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-indigo-100 dark:border-slate-700 animate-scale-in"
                onClick={(e) => e.stopPropagation()}
              >
                  <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                          <MessageSquarePlus size={24} />
                          <h3 className="font-bold text-xl">تسجيل ذكي من رسالة</h3>
                      </div>
                      <button onClick={() => setShowSmartModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500"><X size={20}/></button>
                  </div>
                  
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl mb-4 text-sm text-indigo-800 dark:text-indigo-300 flex flex-col gap-2">
                      <div className="flex gap-3">
                         <Wand2 className="shrink-0" size={20}/>
                         <p>ألصق نص الرسالة البنكية هنا (شراء، إيداع، سداد بطاقة)، وسيقوم النظام تلقائياً بتحديد النوع وتحديث الرصيد.</p>
                      </div>
                      <div className="flex gap-3 text-xs opacity-75 mt-1">
                          <CreditCard className="shrink-0" size={16}/>
                          <p>سيتم تحديث رصيد البطاقة المطابقة تلقائياً بالرصيد الجديد الموجود في الرسالة (إن وجد).</p>
                      </div>
                  </div>

                  <textarea 
                      autoFocus
                      className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 mb-4 text-slate-900 dark:text-white"
                      placeholder="مثال: بطاقة ائتمانية:سداد مبلغ:320 رصيد:367.69..."
                      value={smartSmsText}
                      onChange={e => setSmartSmsText(e.target.value)}
                  />

                  <button 
                      onClick={handleSmartSmsSubmit}
                      disabled={isParsingSms || !smartSmsText}
                      className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-70"
                  >
                      {isParsingSms ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                      {isParsingSms ? 'جاري التحليل...' : 'تحليل وإضافة العملية'}
                  </button>
              </div>
          </div>
      )}
    </>
  );
};

const App: React.FC = () => {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
};

export default App;
