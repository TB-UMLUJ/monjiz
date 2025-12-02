
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
import { Loan, Transaction, UserSettings } from './types';
import { Loader2 } from 'lucide-react';
import { NotificationProvider } from './contexts/NotificationContext';

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  
  // Application State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const loadData = async () => {
      setIsLoading(true);
      try {
        const [txs, lns, stgs] = await Promise.all([
            storageService.getTransactions(),
            storageService.getLoans(),
            storageService.getSettings()
        ]);
        setTransactions(txs);
        setLoans(lns);
        setSettings(stgs);
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
    setSettings(null);
    setActiveTab('dashboard');
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
        return <LoansPage loans={loans} setLoans={setLoans} settings={settings} />;
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
    <Layout activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout}>
      <div className="animate-fade-in text-slate-900 dark:text-slate-100">
         {renderContent()}
      </div>
    </Layout>
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
