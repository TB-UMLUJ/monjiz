import React, { useState, useEffect, useRef } from 'react';
import { Loan, LoanType, Bill, EntityLogo, Transaction, TransactionType, UserSettings } from '../types';
import { calculateLoanSchedule, calculateDurationInMonths } from '../services/loanCalculator';
import { storageService } from '../services/storage';
import { parseLoanDetailsFromText, parseBillFromPdf } from '../services/geminiService';
import { Plus, Trash2, CheckCircle, Calculator, FileText, UploadCloud, Calendar, Download, Loader2, AlertCircle, Sparkles, Wand2, X, Settings2, Edit3, ListChecks, RefreshCcw, Copy, Zap, Droplet, Wifi, Smartphone, Landmark, Receipt, Clock, Coins, Eye, TrendingDown, Hourglass, Archive, RotateCw, PlayCircle, Save, Image as ImageIcon, ChevronRight, CreditCard } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface LoansPageProps {
  loans: Loan[];
  setLoans: React.Dispatch<React.SetStateAction<Loan[]>>;
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings | null>>;
}

const SAUDI_LENDERS = [
    'مصرف الراجحي',
    'البنك الأهلي السعودي (SNB)',
    'بنك الرياض',
    'مصرف الإنماء',
    'البنك العربي الوطني (ANB)',
    'البنك السعودي الأول (SAB)',
    'بنك البلاد',
    'بنك الجزيرة',
    'البنك السعودي للاستثمار (SAIB)',
    'بنك د360 (D360 Bank)',
    'بنك إس تي سي (STC Bank)',
    'تابي (Tabby)',
    'تمارا (Tamara)',
    'إمكان (Emkan)',
    'سلفة (Sulfah)',
    'عبداللطيف جميل للتمويل',
    'اليسر للإجارة والتمويل',
];

const LOAN_CATEGORIES = [
    'تمويل شخصي (أسهم)',
    'تمويل شخصي (سلع)',
    'تمويل عقاري',
    'تمويل سيارات',
    'بطاقة ائتمانية',
    'اشتري الآن وادفع لاحقاً (BNPL)'
];

// Common financial emojis for icon picker
const ICON_OPTIONS = ['🏠', '🚗', '⚡', '💧', '🌐', '📱', '💳', '🎓', '✈️', '💍', '🏥', '🍽️', '🏋️', '🎮', '🛒', '🧸'];

interface ManualScheduleItem {
    date: string;
    amount: number;
}

const LoansPage: React.FC<LoansPageProps> = ({ loans, setLoans, settings, setSettings }) => {
  const { notify } = useNotification();
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'loans' | 'bills' | 'archive' | 'subscriptions'>('loans');
  const [bills, setBills] = useState<Bill[]>([]);
  
  // Logos
  const [knownLogos, setKnownLogos] = useState<EntityLogo[]>([]);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSmartModal, setShowSmartModal] = useState(false);
  const [showScheduleEditor, setShowScheduleEditor] = useState(false); 
  const [showAddBillModal, setShowAddBillModal] = useState(false); 
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null); // New state for bill details

  // New Calculators State
  const [showSettlementCalc, setShowSettlementCalc] = useState(false);
  const [showRefinanceCalc, setShowRefinanceCalc] = useState(false);

  // Payment Modal State
  const [paymentModal, setPaymentModal] = useState<{
      isOpen: boolean;
      type: 'loan' | 'bill';
      item: any; // Loan or Bill
      scheduleItem?: any; // For Loans
      amount: number;
      title: string;
      date: string;
  }>({
      isOpen: false,
      type: 'loan',
      item: null,
      amount: 0,
      title: '',
      date: ''
  });
  const [selectedPaymentCardId, setSelectedPaymentCardId] = useState<string>('');

  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isParsingBill, setIsParsingBill] = useState(false);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);

  // Forms
  const [fileName, setFileName] = useState('');
  const [smartText, setSmartText] = useState('');
  const [selectedLender, setSelectedLender] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [manualSchedule, setManualSchedule] = useState<ManualScheduleItem[]>([]);

  // Loan Form Data
  const [newLoan, setNewLoan] = useState({
    name: '',
    description: '',
    amount: '',
    rate: '',
    duration: '',
    startDate: new Date().toISOString().split('T')[0],
    type: LoanType.DECREASING,
    contractPdf: '',
    initialPaidAmount: '', 
    customMonthlyPayment: '',
    lastPaymentAmount: '',
    icon: ''
  });

  // Bill Form Data
  const [newBill, setNewBill] = useState<{
      provider: string;
      type: 'electricity' | 'water' | 'internet' | 'device_installment' | 'subscription' | 'other';
      amount: string;
      hasEndDate: boolean;
      endDate: string;
      deviceDetails: string;
      startDate: string;
      duration: string;
      lastAmount: string;
      downPayment: string;
      endDateMode: 'date' | 'months';
      isSubscription: boolean;
      renewalDate: string;
  }>({
      provider: '',
      type: 'electricity',
      amount: '',
      hasEndDate: false,
      endDate: '',
      deviceDetails: '',
      startDate: '',
      duration: '',
      lastAmount: '',
      downPayment: '',
      endDateMode: 'months',
      isSubscription: false,
      renewalDate: '',
  });

  useEffect(() => {
      if (activeTab === 'bills' || activeTab === 'archive' || activeTab === 'subscriptions') {
          storageService.getBills().then(setBills);
      }
      storageService.getLogos().then(setKnownLogos);
  }, [activeTab]);

  // Auto-detect Logo for Loan
  useEffect(() => {
      if (newLoan.name) {
          const match = knownLogos.find(l => l.name.toLowerCase() === newLoan.name.trim().toLowerCase() || newLoan.name.toLowerCase().includes(l.name.toLowerCase()));
          if (match && !newLoan.icon) {
              setNewLoan(prev => ({ ...prev, icon: match.logoUrl }));
          }
      }
  }, [newLoan.name, knownLogos]);

  // Helper to find logo for a bill based on provider name
  const getAutoLogo = (providerName: string) => {
      if (!providerName) return null;
      const normalized = providerName.trim().toLowerCase();
      // Try exact match first, then partial
      const match = knownLogos.find(l => l.name.toLowerCase() === normalized) 
                 || knownLogos.find(l => normalized.includes(l.name.toLowerCase()) || l.name.toLowerCase().includes(normalized));
      return match ? match.logoUrl : null;
  };

  // Early Settlement Logic (KSA Approximate)
  const calculateEarlySettlement = () => {
      if (!selectedLoan) return 0;
      const unpaidSchedule = selectedLoan.schedule.filter(s => !s.isPaid);
      const remainingPrincipal = unpaidSchedule.reduce((sum, s) => sum + s.principalComponent, 0);
      
      // KSA: Max 3 months of future profit as penalty
      const futureProfit = unpaidSchedule.reduce((sum, s) => sum + s.interestComponent, 0);
      const monthlyProfitAvg = futureProfit / unpaidSchedule.length;
      const penalty = Math.min(futureProfit, monthlyProfitAvg * 3);
      
      return remainingPrincipal + penalty;
  };

  // Debt Strategies Sorting
  const getSortedLoans = (strategy: 'snowball' | 'avalanche') => {
      const activeLoans = loans.filter(l => l.status === 'active');
      if (strategy === 'snowball') {
          return [...activeLoans].sort((a, b) => {
              const balA = a.schedule.filter(s => !s.isPaid).reduce((sum, s) => sum + s.remainingBalance, 0);
              const balB = b.schedule.filter(s => !s.isPaid).reduce((sum, s) => sum + s.remainingBalance, 0);
              return balA - balB;
          });
      } else {
          return [...activeLoans].sort((a, b) => b.interestRate - a.interestRate);
      }
  };

  const handleArchiveBill = async (e: React.MouseEvent, bill: Bill) => {
      e.preventDefault();
      e.stopPropagation();
      const updatedBill: Bill = { ...bill, status: bill.status === 'active' ? 'archived' : 'active' };
      await storageService.updateBill(updatedBill);
      const res = await storageService.getBills();
      setBills(res);
      notify(bill.status === 'active' ? 'تم أرشفة الفاتورة' : 'تم استعادة الفاتورة', 'info');
  };

  // Helper filter for tabs
  const filteredBills = bills.filter(b => {
      if (activeTab === 'subscriptions') return b.isSubscription && b.status === 'active';
      if (activeTab === 'archive') return b.status === 'archived';
      return !b.isSubscription && b.status === 'active';
  });
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 2000000) { notify("حجم الصورة كبير جداً", "error"); return; }
      setFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => setNewLoan(prev => ({ ...prev, contractPdf: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleBillPdfChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setIsParsingBill(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64Data = reader.result as string;
          try {
              const parsed = await parseBillFromPdf(base64Data);
              if (parsed) {
                  setNewBill(prev => ({
                      ...prev,
                      provider: parsed.provider || prev.provider,
                      type: parsed.type || prev.type,
                      amount: parsed.amount?.toString() || prev.amount,
                      hasEndDate: parsed.hasEndDate,
                      endDate: parsed.endDate || prev.endDate,
                      deviceDetails: parsed.deviceDetails || prev.deviceDetails,
                      startDate: parsed.startDate || prev.startDate,
                      duration: parsed.durationMonths?.toString() || prev.duration,
                      lastAmount: parsed.lastPaymentAmount?.toString() || prev.lastAmount,
                      downPayment: parsed.downPayment?.toString() || prev.downPayment,
                      endDateMode: parsed.durationMonths ? 'months' : 'date'
                  }));
                  notify('تم تحليل الفاتورة بنجاح!', 'success');
              }
          } catch (e) { notify('خطأ في معالجة الملف', 'error'); } 
          finally { setIsParsingBill(false); }
      };
      reader.readAsDataURL(file);
  };
  
  const handleSmartImport = async () => {
     if (!smartText) return;
      setIsParsing(true);
      try {
          const parsed = await parseLoanDetailsFromText(smartText);
          if (parsed) {
              let calcPaidAmount = '';
              if (parsed.paidInstallments && parsed.monthlyPayment) {
                  calcPaidAmount = (parsed.paidInstallments * parsed.monthlyPayment).toFixed(2);
              }
              let newTotalAmount: string | null = null;
              let newProfit: string | null = null;
              if (parsed.totalAmount) {
                  newTotalAmount = parsed.totalAmount.toString().replace(/,/g, '');
                  if (parsed.principal) {
                      newProfit = (parsed.totalAmount - parsed.principal).toString();
                  } else {
                      newProfit = '0'; 
                  }
              } else if (parsed.principal) {
                 newTotalAmount = parsed.principal.toString().replace(/,/g, '');
                 newProfit = '0';
              }
              setNewLoan(prev => ({
                  ...prev,
                  amount: newTotalAmount !== null ? newTotalAmount : prev.amount,
                  rate: newProfit !== null ? newProfit : prev.rate,
                  duration: parsed.durationMonths?.toString() || prev.duration,
                  startDate: parsed.startDate || prev.startDate,
                  customMonthlyPayment: parsed.monthlyPayment?.toString() || '',
                  initialPaidAmount: calcPaidAmount,
                  lastPaymentAmount: parsed.lastPaymentAmount?.toString() || ''
              }));
              if (parsed.lenderName) {
                  const foundLender = SAUDI_LENDERS.find(l => l.includes(parsed.lenderName || ''));
                  if (foundLender) setSelectedLender(foundLender);
                  else setNewLoan(prev => ({...prev, name: parsed.lenderName || ''}));
              }
              setShowSmartModal(false);
              setShowAddModal(true);
              notify('تم استخراج البيانات بنجاح', 'success');
          }
      } catch (e) { notify('حدث خطأ', 'error'); } finally { setIsParsing(false); }
  };
  
  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalInput = parseFloat(newLoan.amount.replace(/,/g, ''));
    const profitInput = parseFloat(newLoan.rate.replace(/,/g, '')) || 0;
    const duration = parseInt(newLoan.duration);
    if (!totalInput || !duration) return;

    setIsProcessing(true);
    try {
      const principal = totalInput - profitInput;
      const fixedProfit = profitInput;
      let schedule;

      if (manualSchedule.length > 0 && manualSchedule.length === duration) {
           let currentBalance = principal; 
           const feePerMonth = fixedProfit / duration; 
           schedule = manualSchedule.map((item, idx) => {
               const payment = item.amount;
               const interest = feePerMonth; 
               const principalPortion = payment - interest;
               currentBalance -= principalPortion;
               return {
                   paymentDate: new Date(item.date).toISOString(),
                   paymentAmount: payment,
                   interestComponent: interest,
                   principalComponent: principalPortion,
                   remainingBalance: Math.max(0, currentBalance),
                   isPaid: false
               };
           });
      } else {
          schedule = calculateLoanSchedule(principal, 0, duration, newLoan.startDate, newLoan.type, fixedProfit);
          const customPayment = parseFloat(newLoan.customMonthlyPayment);
          const lastPayment = parseFloat(newLoan.lastPaymentAmount);
          schedule = schedule.map((item, idx) => {
              let newItem = { ...item };
              if (!isNaN(customPayment) && customPayment > 0) {
                  if (idx < schedule.length - 1 || isNaN(lastPayment)) {
                      newItem.paymentAmount = customPayment;
                      newItem.principalComponent = customPayment - newItem.interestComponent; 
                  }
              }
              if (idx === schedule.length - 1 && !isNaN(lastPayment) && lastPayment > 0) {
                  newItem.paymentAmount = lastPayment;
                  newItem.principalComponent = lastPayment - newItem.interestComponent;
              }
              return newItem;
          });
      }

      let paidBalance = parseFloat(newLoan.initialPaidAmount) || 0;
      schedule = schedule.map(item => {
          let newItem = { ...item };
          if (paidBalance >= (newItem.paymentAmount - 1.0)) { 
              newItem.isPaid = true;
              newItem.remainingBalance = 0; 
              paidBalance -= newItem.paymentAmount;
          }
          return newItem;
      });

      const loanData: Loan = {
        id: isEditing && editingLoanId ? editingLoanId : '',
        name: newLoan.name,
        description: newLoan.description,
        totalAmount: principal, 
        interestRate: 0,
        durationMonths: duration,
        startDate: newLoan.startDate,
        type: newLoan.type,
        status: schedule.every(s => s.isPaid) ? 'completed' : 'active',
        schedule: schedule,
        contractPdf: newLoan.contractPdf,
        icon: newLoan.icon
      };

      if (isEditing) {
         await storageService.editLoanDetails(loanData);
         if (selectedLoan?.id === loanData.id) setSelectedLoan(loanData);
      } else {
         await storageService.saveLoan(loanData);
      }
      const updatedLoans = await storageService.getLoans();
      setLoans(updatedLoans);
      setShowAddModal(false);
      notify('تم الحفظ بنجاح', 'success');
    } catch (err: any) { 
        console.error("Error saving loan:", err); 
        notify('خطأ في الحفظ، تأكد من البيانات', 'error'); 
    } finally { setIsProcessing(false); }
  };
  
  const handleAddBill = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsProcessing(true);
      try {
          let name = '';
          if (newBill.type === 'device_installment') name = `${newBill.provider} - ${newBill.deviceDetails}`;
          else if (newBill.type === 'subscription') name = `${newBill.provider} - اشتراك`;
          else name = `${newBill.provider} - ${newBill.type === 'electricity' ? 'كهرباء' : newBill.type === 'water' ? 'مياه' : 'انترنت'}`;

          let calculatedEndDate = newBill.endDate;
          let calculatedDuration = newBill.duration;

          if (newBill.type === 'device_installment') {
              if (newBill.endDateMode === 'months' && newBill.startDate && newBill.duration) {
                  const start = new Date(newBill.startDate);
                  const months = parseInt(newBill.duration);
                  if (months > 0) {
                      const end = new Date(start);
                      end.setMonth(start.getMonth() + months);
                      calculatedEndDate = end.toISOString().split('T')[0];
                  }
              } else if (newBill.endDateMode === 'date' && newBill.startDate && newBill.endDate) {
                   const m = calculateDurationInMonths(newBill.startDate, newBill.endDate);
                   calculatedDuration = m.toString();
              }
          }

          const billData: Bill = {
              id: editingBillId || '',
              name: name,
              provider: newBill.provider,
              type: newBill.type,
              amount: parseFloat(newBill.amount),
              hasEndDate: newBill.hasEndDate || newBill.type === 'device_installment',
              endDate: calculatedEndDate,
              deviceDetails: newBill.deviceDetails,
              startDate: newBill.startDate,
              durationMonths: calculatedDuration ? parseInt(calculatedDuration) : undefined,
              lastPaymentAmount: newBill.lastAmount ? parseFloat(newBill.lastAmount) : undefined,
              downPayment: newBill.downPayment ? parseFloat(newBill.downPayment) : undefined,
              isSubscription: newBill.type === 'subscription',
              renewalDate: newBill.renewalDate,
              status: 'active',
              icon: '' // Will be auto-resolved from provider name in UI
          };

          if (editingBillId) await storageService.updateBill(billData);
          else await storageService.saveBill(billData);
          
          setBills(await storageService.getBills());
          setShowAddBillModal(false);
          setEditingBillId(null);
          notify('تم الحفظ بنجاح', 'success');
      } catch (e: any) { 
          console.error("Error saving bill:", e);
          const msg = e?.message || 'خطأ غير معروف';
          notify(`خطأ في الحفظ: ${msg} - تأكد من صحة التواريخ`, 'error');
      } finally { setIsProcessing(false); }
  };
  
    const deleteBill = async (id: string) => {
      try {
          const updated = await storageService.deleteBill(id);
          setBills(updated);
          if (selectedBill?.id === id) setSelectedBill(null);
          notify('تم حذف الفاتورة', 'info');
      } catch (e) { notify('خطأ في الحذف', 'error'); }
  };
  
  const handleDeleteLoan = async () => {
    if (!selectedLoan || isDeleting) return;
    setIsDeleting(true);
    try {
        await storageService.deleteLoan(selectedLoan.id);
        setLoans(await storageService.getLoans());
        setSelectedLoan(null);
        notify('تم الحذف', 'info');
    } catch(e) { notify('خطأ', 'error'); } finally { setIsDeleting(false); }
  };
  
  const handleEditClick = (loan: Loan) => {
    setIsEditing(true); setEditingLoanId(loan.id);
    const paidAmount = loan.schedule.filter(s => s.isPaid).reduce((acc, curr) => acc + curr.paymentAmount, 0);
    const principal = loan.totalAmount;
    const totalProfit = loan.schedule.reduce((acc, item) => acc + item.interestComponent, 0);
    const totalRepayment = principal + totalProfit;
    setNewLoan({
        name: loan.name, description: loan.description || '', amount: totalRepayment.toFixed(2),
        rate: totalProfit.toFixed(2), duration: loan.durationMonths.toString(), startDate: loan.startDate.split('T')[0],
        type: loan.type, contractPdf: loan.contractPdf || '', initialPaidAmount: paidAmount > 0 ? paidAmount.toString() : '',
        customMonthlyPayment: loan.schedule[0]?.paymentAmount.toFixed(2) || '', lastPaymentAmount: loan.schedule[loan.schedule.length-1]?.paymentAmount.toFixed(2) || '',
        icon: loan.icon || ''
    });
    setManualSchedule(loan.schedule.map(s => ({ date: s.paymentDate.split('T')[0], amount: s.paymentAmount })));
    setShowAddModal(true);
    if(selectedLoan) setSelectedLoan(null); 
  };

  const handleEditBill = (bill: Bill) => {
      setEditingBillId(bill.id);
      setNewBill({
          provider: bill.provider,
          type: bill.type,
          amount: bill.amount.toString(),
          hasEndDate: bill.hasEndDate,
          endDate: bill.endDate || '',
          deviceDetails: bill.deviceDetails || '',
          startDate: bill.startDate || '',
          duration: bill.durationMonths?.toString() || '',
          lastAmount: bill.lastPaymentAmount?.toString() || '',
          downPayment: bill.downPayment?.toString() || '',
          endDateMode: bill.durationMonths ? 'months' : 'date',
          isSubscription: bill.isSubscription || false,
          renewalDate: bill.renewalDate || '',
      });
      setShowAddBillModal(true);
      if (selectedBill) setSelectedBill(null);
  };

  // --- Payment Modal Logic ---
  
  const initiatePayment = (type: 'loan' | 'bill', item: any, scheduleItem?: any, amount: number = 0, date: string = '') => {
      setPaymentModal({
          isOpen: true,
          type,
          item,
          scheduleItem,
          amount,
          title: type === 'loan' ? `سداد قسط ${item.name}` : `سداد فاتورة ${item.name}`,
          date
      });
      // Default to first card if exists
      if (settings.cards.length > 0) {
          setSelectedPaymentCardId(settings.cards[0].id);
      } else {
          setSelectedPaymentCardId('cash');
      }
  };

  const confirmPayment = async () => {
      setIsProcessing(true);
      try {
          // 1. Deduct Balance (if card selected)
          if (selectedPaymentCardId !== 'cash') {
              const cardIndex = settings.cards.findIndex(c => c.id === selectedPaymentCardId);
              if (cardIndex > -1) {
                  const updatedCards = [...settings.cards];
                  const card = updatedCards[cardIndex];
                  const newBalance = (card.balance || 0) - paymentModal.amount;
                  
                  updatedCards[cardIndex] = { ...card, balance: newBalance };
                  
                  // Save Settings
                  const newSettings = { ...settings, cards: updatedCards };
                  const savedSettings = await storageService.saveSettings(newSettings);
                  setSettings(savedSettings);
              }
          }

          // 2. Record Transaction
          const tx: Transaction = {
              id: '',
              amount: paymentModal.amount,
              type: TransactionType.EXPENSE,
              category: paymentModal.type === 'loan' ? 'قروض' : 'فواتير وخدمات',
              date: new Date().toISOString(),
              note: `${paymentModal.title} (${paymentModal.date})`,
              cardId: selectedPaymentCardId !== 'cash' ? selectedPaymentCardId : undefined
          };
          await storageService.saveTransaction(tx);

          // 3. Update Item Status
          if (paymentModal.type === 'loan' && paymentModal.scheduleItem) {
               const loan = paymentModal.item as Loan;
               const scheduleItem = paymentModal.scheduleItem;
               
               const itemIndex = loan.schedule.findIndex(s => s.paymentDate === scheduleItem.paymentDate);
               if (itemIndex > -1) {
                   loan.schedule[itemIndex].isPaid = true;
                   loan.status = loan.schedule.every(s => s.isPaid) ? 'completed' : 'active';
                   
                   await storageService.updateLoan(loan);
                   const updatedLoans = await storageService.getLoans();
                   setLoans(updatedLoans);
                   if (selectedLoan?.id === loan.id) setSelectedLoan(loan);
               }
          } else if (paymentModal.type === 'bill') {
               // For bills, we just record the transaction and maybe notify success
               // If we had a last_payment_date in schema we would update it here.
               // For now, the transaction record is the "Proof" of payment.
          }

          notify('تم السداد وتسجيل العملية بنجاح', 'success');
          setPaymentModal({ ...paymentModal, isOpen: false });

      } catch (e) {
          console.error(e);
          notify('حدث خطأ أثناء عملية السداد', 'error');
      } finally {
          setIsProcessing(false);
      }
  };
  
  const handleOpenScheduleEditor = () => { setShowScheduleEditor(true); };
  const updateManualInstallment = (idx:number, val:number) => { const n = [...manualSchedule]; n[idx].amount = val; setManualSchedule(n); };
  const applyToAll = (val:number) => { setManualSchedule(manualSchedule.map(i=>({...i, amount:val}))); };
  const confirmManualSchedule = () => { setNewLoan(p=>({...p, amount: manualSchedule.reduce((s,i)=>s+i.amount,0).toFixed(2)})); setShowScheduleEditor(false); };
  
  const renderIcon = (iconString?: string, defaultIcon = <Landmark className="text-slate-400"/>) => {
      if (!iconString) return defaultIcon;
      if (iconString.startsWith('data:image')) {
          return <img src={iconString} alt="icon" className="w-full h-full rounded-2xl object-cover" />;
      }
      return <span className="text-3xl">{iconString}</span>;
  };

  const getBillIcon = (type: string, providerName: string) => {
     // 1. Try to find auto logo from provider name
     const autoLogo = getAutoLogo(providerName);
     if (autoLogo) {
          return <img src={autoLogo} alt={providerName} className="w-full h-full rounded-2xl object-cover" />;
     }
     
     // 2. Fallback to generic icons
     if(type === 'subscription') return <RotateCw className="text-purple-500 w-8 h-8"/>;
     switch(type) {
          case 'electricity': return <Zap className="text-amber-500 w-8 h-8" />;
          case 'water': return <Droplet className="text-blue-500 w-8 h-8" />;
          case 'internet': return <Wifi className="text-indigo-500 w-8 h-8" />;
          case 'device_installment': return <Smartphone className="text-slate-700 dark:text-slate-200 w-8 h-8" />;
          default: return <Receipt className="text-emerald-500 w-8 h-8" />;
      }
  };

  const IconPicker = ({ selected, onSelect }: { selected: string, onSelect: (icon: string) => void }) => {
      const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (file) {
              if (file.size > 5000000) { notify('حجم الصورة كبير جداً (max 5MB)', 'error'); return; }
              
              const reader = new FileReader();
              reader.onload = (event) => {
                  const img = new Image();
                  img.onload = () => {
                      const canvas = document.createElement('canvas');
                      const ctx = canvas.getContext('2d');
                      
                      // Target size: 150x150 is sufficient for icons
                      const maxDim = 150;
                      let width = img.width;
                      let height = img.height;
                      
                      // Calculate new dimensions maintaining aspect ratio
                      if (width > height) {
                          if (width > maxDim) {
                              height *= maxDim / width;
                              width = maxDim;
                          }
                      } else {
                          if (height > maxDim) {
                              width *= maxDim / height;
                              height = maxDim;
                          }
                      }
                      
                      canvas.width = width;
                      canvas.height = height;
                      
                      // Draw and compress
                      ctx?.drawImage(img, 0, 0, width, height);
                      // High compression (70% quality JPEG) ensures small payload
                      const dataUrl = canvas.toDataURL('image/jpeg', 0.7); 
                      onSelect(dataUrl);
                  };
                  img.src = event.target?.result as string;
              };
              reader.readAsDataURL(file);
          }
      };

      return (
      <div className="flex flex-wrap gap-2 mt-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl items-center">
          {ICON_OPTIONS.map(icon => (
              <button
                  key={icon}
                  type="button"
                  onClick={() => onSelect(icon)}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg text-2xl transition-all ${selected === icon ? 'bg-indigo-100 dark:bg-indigo-900 ring-2 ring-indigo-500 scale-110' : 'hover:bg-white dark:hover:bg-slate-700'}`}
              >
                  {icon}
              </button>
          ))}
          
          <label className={`w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer transition-all ${selected?.startsWith('data:') ? 'bg-indigo-100 dark:bg-indigo-900 ring-2 ring-indigo-500' : 'hover:bg-white dark:hover:bg-slate-700 bg-slate-200 dark:bg-slate-600'}`}>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              {selected?.startsWith('data:') ? <img src={selected} className="w-8 h-8 rounded-full object-cover"/> : <ImageIcon size={20} className="text-slate-500 dark:text-slate-300"/>}
          </label>

          <button
              type="button"
              onClick={() => onSelect('')}
              className={`w-10 h-10 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${selected === '' ? 'bg-indigo-100 dark:bg-indigo-900 ring-2 ring-indigo-500' : 'hover:bg-white dark:hover:bg-slate-700'}`}
          >
              <X size={16}/>
          </button>
      </div>
      );
  };

  // --- Bill Schedule Generator ---
  const getBillSchedule = (bill: Bill) => {
      const schedule = [];
      const today = new Date();
      
      // Scenario 1: It has a start date and duration (Installment-like)
      if (bill.startDate && bill.durationMonths && bill.durationMonths > 0) {
          const start = new Date(bill.startDate);
          for (let i = 0; i < bill.durationMonths; i++) {
              const date = new Date(start);
              date.setMonth(start.getMonth() + i);
              const isPaid = date < today; // Simple logic: if date passed, assume paid for view
              
              let amount = bill.amount;
              if (i === 0 && bill.downPayment) amount = bill.downPayment; // Simplified
              if (i === bill.durationMonths - 1 && bill.lastPaymentAmount) amount = bill.lastPaymentAmount;

              schedule.push({ date, amount, isPaid, type: 'installment' });
          }
      } 
      // Scenario 2: Subscription (Ongoing)
      else if (bill.isSubscription) {
          // Show 3 months history and 9 months future
          for (let i = -3; i <= 9; i++) {
              const date = new Date(today);
              date.setMonth(today.getMonth() + i);
              // Normalize day if possible (e.g. renewalDate)
              if (bill.renewalDate) {
                  const renewalDay = new Date(bill.renewalDate).getDate();
                  date.setDate(renewalDay);
              }
              schedule.push({ 
                  date, 
                  amount: bill.amount, 
                  isPaid: i < 0, 
                  type: 'subscription' 
              });
          }
      }
      // Scenario 3: Simple Monthly Bill
      else {
           // Show current year context
           for (let i = -1; i <= 3; i++) {
              const date = new Date(today);
              date.setMonth(today.getMonth() + i);
              schedule.push({ date, amount: bill.amount, isPaid: i < 0, type: 'monthly' });
           }
      }
      return schedule;
  };

  return (
    <div className="pb-20 md:pb-0 animate-fade-in">
      <div className="flex flex-col gap-4 mb-6">
          <div className="flex justify-between items-center">
             <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white">إدارة الالتزامات</h2>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-1 rounded-xl flex flex-wrap shadow-sm border border-slate-100 dark:border-slate-800 w-full md:w-auto self-start gap-1">
              <button onClick={() => setActiveTab('loans')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'loans' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}>القروض</button>
              <button onClick={() => setActiveTab('bills')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'bills' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}>الفواتير</button>
              <button onClick={() => setActiveTab('subscriptions')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'subscriptions' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}>الاشتراكات</button>
              <button onClick={() => setActiveTab('archive')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'archive' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}>الأرشيف</button>
          </div>
      </div>

      {activeTab === 'loans' ? (
      <>
          <div className="flex justify-end gap-2 mb-4">
                <button onClick={() => setShowSmartModal(true)} className="flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3 py-2 rounded-lg text-sm font-bold shadow-lg"><Wand2 size={16}/><span>استيراد ذكي</span></button>
                <button onClick={() => { setShowAddModal(true); setIsEditing(false); setEditingLoanId(null); setNewLoan({ name: '', description: '', amount: '', rate: '', duration: '', startDate: new Date().toISOString().split('T')[0], type: LoanType.DECREASING, contractPdf: '', initialPaidAmount: '', customMonthlyPayment: '', lastPaymentAmount: '', icon: '' }); setManualSchedule([]); }} className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-bold shadow-lg"><Plus size={16}/><span>إضافة قرض</span></button>
            </div>
            
          {loans.length > 1 && (
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-white shadow-lg flex justify-between items-center">
                  <div>
                      <h4 className="font-bold text-lg flex items-center gap-2"><TrendingDown/> استراتيجية السداد المقترحة</h4>
                      <p className="text-blue-100 text-sm mt-1">
                          بناءً على طريقة "كرة الثلج"، ابدأ بسداد <b>{getSortedLoans('snowball')[0]?.name}</b> أولاً لتحقيق انتصارات سريعة!
                      </p>
                  </div>
              </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loans.map(loan => {
                    const paid = loan.schedule.filter(s => s.isPaid).reduce((a,c)=>a+c.paymentAmount,0);
                    const total = loan.schedule.reduce((a,c)=>a+c.paymentAmount,0);
                    const remaining = total - paid;
                    const prog = total > 0 ? (paid/total)*100 : 0;
                    const nextPayment = loan.schedule.find(s => !s.isPaid);
                    const remainingMonths = loan.schedule.filter(s => !s.isPaid).length;

                    return (
                        <div key={loan.id} onClick={() => setSelectedLoan(loan)} className={`bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border cursor-pointer hover:shadow-md transition-shadow ${selectedLoan?.id === loan.id ? 'border-emerald-500 ring-1' : 'border-slate-100 dark:border-slate-800'}`}>
                            
                            {/* Updated Loan Card Header with Icon on Right & Light Bg in Dark Mode */}
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-white flex items-center justify-center border border-slate-100 dark:border-slate-300 shadow-sm shrink-0 overflow-hidden">
                                     {renderIcon(loan.icon)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-bold text-lg text-slate-800 dark:text-white truncate">{loan.name}</h3>
                                        <span className={`text-[10px] px-2 py-1 rounded-full ${loan.status === 'active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>{loan.status === 'active' ? 'نشط' : 'منتهي'}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 truncate">{loan.description || 'تمويل شخصي'}</p>
                                </div>
                            </div>

                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full mb-3 overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{width: `${prog}%`}}></div>
                            </div>
                            
                            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-4">
                                <div>
                                    <span className="block mb-0.5">المدفوع</span>
                                    <span className="font-bold text-slate-700 dark:text-slate-300 text-sm font-mono">{paid.toLocaleString('en-US')}</span>
                                </div>
                                <div className="text-left">
                                    <span className="block mb-0.5">المتبقي</span>
                                    <span className="font-bold text-rose-600 dark:text-rose-400 text-sm font-mono">{remaining.toLocaleString('en-US')}</span>
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 grid grid-cols-2 gap-3 text-xs mb-3 border border-slate-100 dark:border-slate-700">
                                 <div>
                                    <span className="block text-slate-400 mb-1">القسط القادم</span>
                                    <span className="font-bold text-base text-slate-800 dark:text-white font-mono">
                                        {nextPayment ? nextPayment.paymentAmount.toLocaleString('en-US') : '-'}
                                    </span>
                                 </div>
                                 <div className="text-left border-r border-slate-200 dark:border-slate-700 pr-3">
                                    <span className="block text-slate-400 mb-1">يستحق في</span>
                                    <span className="font-bold text-slate-800 dark:text-white font-mono">
                                        {nextPayment ? new Date(nextPayment.paymentDate).toLocaleDateString('en-GB') : 'مكتمل'}
                                    </span>
                                 </div>
                            </div>
                            
                            {/* Remaining Months Badge */}
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg p-2 flex items-center justify-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-sm">
                                <Hourglass size={16} />
                                <span>متبقي {remainingMonths} شهر</span>
                            </div>

                            <button onClick={(e)=>{e.stopPropagation(); setSelectedLoan(loan)}} className="w-full mt-3 text-xs bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 py-2.5 rounded-lg font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">عرض التفاصيل</button>
                        </div>
                    );
                })}
          </div>
      </>
      ) : (
      <div className="space-y-6">
          <div className="flex justify-end mb-4">
              <button onClick={() => { setShowAddBillModal(true); setEditingBillId(null); setNewBill({ provider: '', type: 'electricity', amount: '', hasEndDate: false, endDate: '', deviceDetails: '', startDate: '', duration: '', lastAmount: '', downPayment: '', endDateMode: 'months', isSubscription: false, renewalDate: '' }); }} className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-bold shadow-lg"><Plus size={16}/><span>إضافة جديد</span></button>
          </div>
          
          {activeTab === 'subscriptions' && (
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl mb-4 border border-purple-100 dark:border-purple-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="p-3 bg-purple-100 dark:bg-purple-800 rounded-full text-purple-600 dark:text-purple-200"><RotateCw/></div>
                      <div>
                          <h4 className="font-bold text-purple-900 dark:text-purple-100">إجمالي الاشتراكات السنوية</h4>
                          <p className="text-sm text-purple-700 dark:text-purple-300">يتم صرف مبالغ صغيرة تتراكم لتصبح كبيرة!</p>
                      </div>
                  </div>
                  <div className="text-2xl font-bold text-purple-800 dark:text-purple-200 font-mono">
                      {(filteredBills.reduce((acc, b) => acc + b.amount, 0) * 12).toLocaleString('en-US')} <span className="text-sm">/سنة</span>
                  </div>
              </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBills.map(bill => {
                  const daysLeft = bill.endDate ? Math.ceil((new Date(bill.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 999;
                  const monthsLeft = daysLeft > 0 ? Math.ceil(daysLeft / 30) : 0;
                  const isExpiringSoon = daysLeft < 30 && daysLeft > 0;
                  
                  // Calculate Estimated Remaining for installment-like bills
                  const estimatedRemaining = (bill.durationMonths || (bill.endDate ? monthsLeft : 0)) > 0 
                      ? (bill.amount * monthsLeft) 
                      : 0;

                  return (
                  <div key={bill.id} onClick={() => setSelectedBill(bill)} className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border shadow-sm relative group hover:shadow-md transition-all cursor-pointer ${bill.status === 'archived' ? 'opacity-60 grayscale' : ''} ${isExpiringSoon ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-100 dark:border-slate-800'}`}>
                      {/* Updated Bill Card Header with Icon on Right & Light Bg in Dark Mode */}
                      <div className="flex items-center gap-4 mb-4">
                          <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-white flex items-center justify-center border border-slate-100 dark:border-slate-300 shadow-sm shrink-0 overflow-hidden">
                              {getBillIcon(bill.type, bill.provider)}
                          </div>
                          <div>
                              <h4 className="font-bold text-base text-slate-900 dark:text-white">{bill.name}</h4>
                              <p className="text-xs text-slate-400">{bill.provider}</p>
                          </div>
                      </div>

                      <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl mb-3 border border-slate-100 dark:border-slate-700">
                          <span className="text-xs text-slate-500 dark:text-slate-400">القيمة</span>
                          <span className="font-bold text-xl text-slate-900 dark:text-white font-mono">{bill.amount.toFixed(2)}</span>
                      </div>
                      
                      <div className="space-y-2 pt-2 border-t border-slate-50 dark:border-slate-800">
                          {(bill.startDate || bill.endDate) && (
                              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                  {bill.startDate && <span>البداية: {new Date(bill.startDate).toLocaleDateString('en-GB')}</span>}
                                  {bill.endDate && <span>النهاية: {new Date(bill.endDate).toLocaleDateString('en-GB')}</span>}
                              </div>
                          )}
                          {bill.durationMonths && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                  <Clock size={12}/>
                                  <span>المدة: {bill.durationMonths} شهر</span>
                              </div>
                          )}
                          {bill.deviceDetails && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                  <Smartphone size={12}/>
                                  <span>{bill.deviceDetails}</span>
                              </div>
                          )}
                      </div>

                      {/* Remaining Months Badge for Bills */}
                      {(bill.endDate || bill.durationMonths) && monthsLeft > 0 && monthsLeft < 999 && (
                          <div className="mt-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg p-2 flex flex-col gap-1 items-center justify-center text-center">
                              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                                <Hourglass size={14} />
                                <span>متبقي {monthsLeft} شهر</span>
                              </div>
                              {estimatedRemaining > 0 && (
                                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                      إجمالي المتوقع: <span className="text-rose-500 dark:text-rose-400 font-mono">{estimatedRemaining.toLocaleString('en-US')}</span>
                                  </div>
                              )}
                          </div>
                      )}

                      {isExpiringSoon && (
                          <div className="mt-3 text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-900/20 p-2 rounded flex items-center gap-1">
                              <AlertCircle size={12}/>
                              ينتهي العقد خلال {daysLeft} يوم!
                          </div>
                      )}
                      {bill.renewalDate && (
                          <div className="mt-3 text-xs text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 p-2 rounded flex items-center gap-1 font-mono">
                              <Calendar size={12}/>
                              تجديد: {new Date(bill.renewalDate).toLocaleDateString('en-GB')}
                          </div>
                      )}
                  </div>
              )})}
          </div>
      </div>
      )}

      {/* Bill Details Modal with Schedule */}
      {selectedBill && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl animate-scale-in max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                         <div className="flex items-center gap-3">
                             <div className="w-14 h-14 rounded-xl bg-white dark:bg-white flex items-center justify-center border border-slate-200 shadow-sm shrink-0 overflow-hidden">
                                {getBillIcon(selectedBill.type, selectedBill.provider)}
                             </div>
                             <div>
                                <h3 className="font-bold text-xl text-slate-800 dark:text-white">
                                    {selectedBill.name}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{selectedBill.provider}</p>
                             </div>
                         </div>
                         <button onClick={() => setSelectedBill(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500"><X size={24}/></button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                         {activeTab !== 'archive' && <button onClick={(e) => {handleArchiveBill(e, selectedBill); setSelectedBill(null);}} className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1"><Archive size={14}/> أرشفة</button>}
                         {activeTab === 'archive' && <button onClick={(e) => {handleArchiveBill(e, selectedBill); setSelectedBill(null);}} className="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1"><RotateCw size={14}/> استعادة</button>}
                         <button onClick={() => { handleEditBill(selectedBill); }} className="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300 px-3 py-2 rounded-lg text-sm font-bold border border-blue-200 dark:border-blue-800 flex items-center gap-1"><Edit3 size={14}/> تعديل</button>
                         <button onClick={() => deleteBill(selectedBill.id)} className="bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300 px-3 py-2 rounded-lg text-sm font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1"><Trash2 size={14}/> حذف</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-0">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                                <span className="text-slate-400 text-xs block mb-1">المبلغ</span>
                                <span className="font-bold text-lg dark:text-white font-mono">{selectedBill.amount.toLocaleString('en-US')}</span>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                                <span className="text-slate-400 text-xs block mb-1">تاريخ البداية</span>
                                <span className="font-bold dark:text-white font-mono">{selectedBill.startDate ? new Date(selectedBill.startDate).toLocaleDateString('en-GB') : 'غير محدد'}</span>
                            </div>
                            {selectedBill.deviceDetails && (
                                <div className="col-span-2 bg-white dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                                    <span className="text-slate-400 text-xs block mb-1">تفاصيل الجهاز</span>
                                    <span className="font-bold dark:text-white flex items-center gap-2"><Smartphone size={14}/> {selectedBill.deviceDetails}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-4">
                        <h4 className="font-bold text-sm text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2"><ListChecks size={16}/> جدول الدفعات / السداد</h4>
                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                            <table className="w-full text-sm text-left rtl:text-right text-slate-500 dark:text-slate-400">
                                <thead className="text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800">
                                    <tr>
                                        <th className="px-4 py-3">التاريخ</th>
                                        <th className="px-4 py-3">المبلغ</th>
                                        <th className="px-4 py-3">الحالة / إجراء</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getBillSchedule(selectedBill).map((item, idx) => (
                                        <tr key={idx} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${item.isPaid ? 'bg-slate-50/50 dark:bg-slate-800/30' : 'bg-white dark:bg-slate-900'}`}>
                                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200 font-mono">{item.date.toLocaleDateString('en-GB')}</td>
                                            <td className="px-4 py-3 font-bold font-mono">{item.amount.toLocaleString('en-US')}</td>
                                            <td className="px-4 py-3">
                                                {item.isPaid ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"><CheckCircle size={12}/> مدفوع</span>
                                                ) : (
                                                    <button onClick={() => initiatePayment('bill', selectedBill, item, item.amount, item.date.toLocaleDateString('en-GB'))} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm hover:opacity-90">
                                                        <CreditCard size={12}/> سداد
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
          </div>
      )}

      {/* Loan Details Modal */}
      {selectedLoan && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl shadow-2xl animate-scale-in max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                         <div className="flex items-center gap-3">
                             <div className="w-12 h-12 rounded-xl bg-white dark:bg-white flex items-center justify-center border border-slate-200 shadow-sm shrink-0 overflow-hidden">
                                {renderIcon(selectedLoan.icon)}
                             </div>
                             <h3 className="font-bold text-xl text-slate-800 dark:text-white">
                                 {selectedLoan.name}
                             </h3>
                         </div>
                         <button onClick={() => setSelectedLoan(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500"><X size={24}/></button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setShowSettlementCalc(true)} className="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300 px-3 py-2 rounded-lg text-sm font-bold border border-indigo-200 dark:border-indigo-800 flex items-center gap-1"><Calculator size={14}/> حاسبة السداد المبكر</button>
                        <button onClick={() => setShowRefinanceCalc(true)} className="bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-300 px-3 py-2 rounded-lg text-sm font-bold border border-purple-200 dark:border-purple-800 flex items-center gap-1"><RefreshCcw size={14}/> إعادة التمويل</button>
                        <button onClick={() => handleEditClick(selectedLoan)} className="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300 px-3 py-2 rounded-lg text-sm font-bold border border-blue-200 dark:border-blue-800 flex items-center gap-1"><Edit3 size={14}/> تعديل</button>
                        <button onClick={handleDeleteLoan} className="bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300 px-3 py-2 rounded-lg text-sm font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1"><Trash2 size={14}/> حذف</button>
                    </div>
                    
                    {selectedLoan.schedule.length > 0 && selectedLoan.schedule[selectedLoan.schedule.length - 1].paymentAmount > (selectedLoan.schedule[0].paymentAmount * 1.5) && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                            <AlertCircle size={18}/>
                            <span>تنبيه: توجد دفعة أخيرة كبيرة بقيمة <b>{selectedLoan.schedule[selectedLoan.schedule.length - 1].paymentAmount.toLocaleString('en-US')}</b> تستحق في {new Date(selectedLoan.schedule[selectedLoan.schedule.length - 1].paymentDate).toLocaleDateString('en-GB')}. استعد لها!</span>
                        </div>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-sm text-left rtl:text-right text-slate-500 dark:text-slate-400">
                            <thead className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky top-0 shadow-sm z-10"><tr><th className="px-6 py-3">التاريخ</th><th className="px-6 py-3">القسط</th><th className="px-6 py-3">المتبقي</th><th className="px-6 py-3">الحالة / إجراء</th></tr></thead>
                            <tbody>
                                {selectedLoan.schedule.map((item, idx) => (
                                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 font-mono">{new Date(item.paymentDate).toLocaleDateString('en-GB')}</td>
                                        <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-mono">{item.paymentAmount.toFixed(2)}</td>
                                        <td className="px-6 py-4 font-mono">{item.remainingBalance.toFixed(2)}</td>
                                        <td className="px-6 py-4">
                                            {item.isPaid ? (
                                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"><CheckCircle size={12}/> مدفوع</span>
                                            ) : (
                                                <button 
                                                    onClick={() => initiatePayment('loan', selectedLoan, item, item.paymentAmount, new Date(item.paymentDate).toLocaleDateString('en-GB'))} 
                                                    className="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm hover:opacity-90"
                                                >
                                                    <CreditCard size={12}/> سداد
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {paymentModal.isOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-scale-in border border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white">تأكيد عملية السداد</h3>
                      <button onClick={() => setPaymentModal({...paymentModal, isOpen: false})} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><X size={20}/></button>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-6 text-center">
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{paymentModal.title}</p>
                      <h2 className="text-3xl font-bold text-slate-900 dark:text-white font-mono">{paymentModal.amount.toLocaleString('en-US')} <span className="text-sm">SAR</span></h2>
                  </div>

                  <div className="mb-6">
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">خصم المبلغ من</label>
                      <div className="space-y-2">
                          {settings.cards.map(card => (
                              <button
                                  key={card.id}
                                  onClick={() => setSelectedPaymentCardId(card.id)}
                                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${selectedPaymentCardId === card.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                              >
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-6 rounded bg-slate-800" style={{backgroundColor: card.color}}></div>
                                      <div className="text-right">
                                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{card.bankName}</p>
                                          <p className="text-xs text-slate-500">**** {card.cardNumber}</p>
                                      </div>
                                  </div>
                                  <span className="font-mono text-sm font-bold text-slate-600 dark:text-slate-400">{card.balance?.toLocaleString('en-US')}</span>
                              </button>
                          ))}
                          <button
                              onClick={() => setSelectedPaymentCardId('cash')}
                              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${selectedPaymentCardId === 'cash' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                          >
                              <div className="flex items-center gap-3">
                                  <div className="w-10 h-6 rounded bg-slate-400 flex items-center justify-center text-white"><Coins size={14}/></div>
                                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">نقدي / خارجي</p>
                              </div>
                              <span className="text-xs text-slate-400">لن يتم الخصم</span>
                          </button>
                      </div>
                  </div>

                  <button 
                      onClick={confirmPayment}
                      disabled={isProcessing}
                      className="w-full bg-slate-900 dark:bg-[#bef264] text-white dark:text-slate-900 py-3 rounded-xl font-bold text-lg hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                      {isProcessing ? <Loader2 className="animate-spin" /> : <CheckCircle size={20} />}
                      <span>تأكيد السداد</span>
                  </button>
              </div>
          </div>
      )}

      {/* Settlement Calculator Modal */}
      {showSettlementCalc && selectedLoan && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-scale-in">
                  <h3 className="font-bold text-lg mb-4 text-slate-900 dark:text-white">حاسبة السداد المبكر (تقريبي)</h3>
                  <div className="space-y-4 text-center">
                      <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl">
                          <p className="text-sm text-slate-500 dark:text-slate-400">المبلغ المطلوب للسداد اليوم</p>
                          <h2 className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{calculateEarlySettlement().toLocaleString('en-US')} SAR</h2>
                      </div>
                      <p className="text-xs text-slate-400">* يشمل المبلغ المتبقي من الأصل + أرباح 3 أشهر قادمة (حسب تقديرات البنك المركزي السعودي التقريبية).</p>
                  </div>
                  <button onClick={() => setShowSettlementCalc(false)} className="w-full mt-6 bg-slate-900 dark:bg-slate-700 text-white py-3 rounded-xl font-bold">إغلاق</button>
              </div>
          </div>
      )}

      {/* Add Bill/Subscription Modal (REDESIGNED) */}
      {showAddBillModal && (
          <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 animate-fade-in my-4 md:my-8 border border-slate-200 dark:border-slate-800 relative">
                   <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div>
                          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{editingBillId ? 'تعديل الفاتورة/الالتزام' : 'إضافة التزام جديد'}</h3>
                          <p className="text-xs text-slate-500">أضف فواتيرك، اشتراكاتك، أو أقساط الأجهزة</p>
                      </div>
                      <button onClick={() => setShowAddBillModal(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                   </div>
                   
                   {/* PDF Upload Section (Compact) */}
                   <div className="mb-6 flex gap-4 items-center p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 group relative overflow-hidden">
                      <input type="file" accept="application/pdf" onChange={handleBillPdfChange} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                      <div className="p-3 bg-white dark:bg-slate-700 rounded-full shadow-sm text-emerald-500">
                           {isParsingBill ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                      </div>
                      <div className="flex-1">
                          <p className="text-sm font-bold text-slate-800 dark:text-white">تعبئة تلقائية من الفاتورة</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">ارفع ملف PDF وسيتم استخراج البيانات</p>
                      </div>
                      <div className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1.5 rounded-lg flex items-center gap-1 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                          <Wand2 size={12} />
                          استيراد
                      </div>
                   </div>
                   
                  <form onSubmit={handleAddBill} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Left Column: Basic Info */}
                          <div className="space-y-4">
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1.5">نوع الالتزام</label>
                                  <div className="relative">
                                      <select className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 appearance-none" value={newBill.type} onChange={e=>setNewBill({...newBill, type: e.target.value as any})}>
                                          <option value="electricity">⚡ فاتورة كهرباء</option>
                                          <option value="water">💧 فاتورة مياه</option>
                                          <option value="internet">🌐 انترنت / اتصالات</option>
                                          <option value="subscription">🔄 اشتراك شهري/سنوي</option>
                                          <option value="device_installment">📱 أقساط جهاز</option>
                                          <option value="other">📄 أخرى</option>
                                      </select>
                                      <ChevronRight className="absolute left-3 top-3.5 text-slate-400 rotate-90" size={16}/>
                                  </div>
                              </div>
                              
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1.5">المزود / اسم الشركة</label>
                                  <input type="text" className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400" value={newBill.provider} onChange={e=>setNewBill({...newBill, provider: e.target.value})} placeholder="مثال: STC, Netflix, الكهرباء..." required/>
                                  <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1"><Sparkles size={10}/> سيتم جلب الشعار تلقائياً بناءً على الاسم</p>
                              </div>
                          </div>

                          {/* Right Column: Amount & Icon Preview */}
                          <div className="space-y-4">
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1.5">المبلغ الدوري</label>
                                  <div className="relative">
                                      <input type="number" step="0.01" className="w-full p-3 pl-12 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white font-bold text-lg outline-none focus:ring-2 focus:ring-emerald-500" value={newBill.amount} onChange={e=>setNewBill({...newBill, amount: e.target.value})} required placeholder="0.00"/>
                                      <span className="absolute left-4 top-4 text-xs font-bold text-slate-400">SAR</span>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Dynamic Sections based on Type */}
                      {newBill.type === 'device_installment' && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4 animate-slide-up">
                             <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2 mb-2">
                                <Smartphone size={16} className="text-slate-500"/>
                                <h4 className="font-bold text-sm text-slate-700 dark:text-slate-200">تفاصيل عقد الجهاز</h4>
                             </div>
                             
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">اسم الجهاز</label>
                                <input type="text" value={newBill.deviceDetails} onChange={e=>setNewBill({...newBill, deviceDetails: e.target.value})} className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg dark:text-white focus:border-emerald-500 outline-none" placeholder="iPhone 15 Pro Max..."/>
                             </div>

                             <div className="grid grid-cols-2 gap-4">
                                 <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ البداية</label>
                                    <input type="date" value={newBill.startDate} onChange={e=>setNewBill({...newBill, startDate: e.target.value})} className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg dark:text-white focus:border-emerald-500 outline-none"/>
                                 </div>
                                 <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">الدفعة الأولى (إن وجدت)</label>
                                    <input type="number" value={newBill.downPayment} onChange={e=>setNewBill({...newBill, downPayment: e.target.value})} className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg dark:text-white focus:border-emerald-500 outline-none" placeholder="0"/>
                                 </div>
                             </div>
                             
                             <div>
                                 <label className="block text-xs font-bold text-slate-500 mb-2">طريقة تحديد النهاية</label>
                                 <div className="flex gap-2 p-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 w-fit">
                                    <button type="button" onClick={()=>setNewBill({...newBill, endDateMode: 'months'})} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${newBill.endDateMode === 'months' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300' : 'text-slate-500'}`}>عدد الأشهر</button>
                                    <button type="button" onClick={()=>setNewBill({...newBill, endDateMode: 'date'})} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${newBill.endDateMode === 'date' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300' : 'text-slate-500'}`}>تاريخ انتهاء</button>
                                 </div>
                             </div>

                             {newBill.endDateMode === 'months' ? (
                                 <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">المدة (شهر)</label>
                                    <input type="number" value={newBill.duration} onChange={e=>setNewBill({...newBill, duration: e.target.value})} className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg dark:text-white focus:border-emerald-500 outline-none" placeholder="12, 24..."/>
                                 </div>
                             ) : (
                                 <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ نهاية العقد</label>
                                    <input type="date" value={newBill.endDate} onChange={e=>setNewBill({...newBill, endDate: e.target.value})} className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg dark:text-white focus:border-emerald-500 outline-none"/>
                                 </div>
                             )}
                        </div>
                      )}

                      {newBill.type === 'subscription' && (
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4 animate-slide-up">
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ التجديد القادم</label>
                                  <input type="date" className="w-full p-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" value={newBill.renewalDate} onChange={e=>setNewBill({...newBill, renewalDate: e.target.value})} />
                              </div>
                          </div>
                      )}

                      <div className="flex gap-3 pt-2">
                          <button type="button" onClick={() => setShowAddBillModal(false)} className="flex-1 text-slate-600 dark:text-slate-300 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-bold transition-colors">إلغاء</button>
                          <button type="submit" className="flex-[2] bg-slate-900 dark:bg-[#bef264] text-white dark:text-slate-900 py-3 rounded-xl font-bold hover:shadow-lg hover:-translate-y-0.5 transition-all flex justify-center items-center gap-2">
                              <Save size={18} />
                              <span>حفظ الالتزام</span>
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
      
      {/* Smart Import Modal */}
      {showSmartModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-scale-in">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Wand2 className="text-indigo-500"/> استيراد ذكي</h3>
                      <button onClick={() => setShowSmartModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl mb-4 text-sm text-indigo-800 dark:text-indigo-200">
                      ألصق نص تفاصيل القرض من رسالة البنك أو تطبيق البنك هنا، وسيقوم النظام بتعبئة البيانات تلقائياً.
                  </div>

                  <textarea 
                      autoFocus
                      className="w-full h-40 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 mb-4 text-slate-900 dark:text-white text-sm"
                      placeholder={`مثال:\nمبلغ التمويل: 100,000\nالقسط الشهري: 2,500\nالمدة: 60 شهر\nتاريخ البداية: 2024-01-01`}
                      value={smartText}
                      onChange={e => setSmartText(e.target.value)}
                  />

                  <button 
                      onClick={handleSmartImport}
                      disabled={isParsing || !smartText}
                      className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-70"
                  >
                      {isParsing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                      {isParsing ? 'جاري التحليل...' : 'تحليل واستيراد'}
                  </button>
              </div>
          </div>
      )}

      {/* Manual Schedule Editor Modal */}
      {showScheduleEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-scale-in max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">تخصيص الدفعات يدوياً</h3>
                    <button onClick={() => setShowScheduleEditor(false)} className="text-slate-400"><X size={20}/></button>
                </div>

                <div className="flex gap-2 mb-4">
                    <input type="number" id="applyAllInput" placeholder="مبلغ لتعميمه" className="flex-1 p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg outline-none text-sm"/>
                    <button onClick={() => {
                        const val = parseFloat((document.getElementById('applyAllInput') as HTMLInputElement).value);
                        if (val) applyToAll(val);
                    }} className="bg-slate-200 dark:bg-slate-700 px-3 py-2 rounded-lg text-xs font-bold">تطبيق على الكل</button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {manualSchedule.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-sm border-b border-slate-50 dark:border-slate-800 pb-2">
                            <span className="w-8 text-slate-400 font-mono">#{idx+1}</span>
                            <span className="w-24 text-slate-600 dark:text-slate-300 text-xs font-mono">{item.date}</span>
                            <input 
                                type="number" 
                                value={item.amount} 
                                onChange={(e) => updateManualInstallment(idx, parseFloat(e.target.value))}
                                className="flex-1 p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg outline-none font-bold text-emerald-600 dark:text-emerald-400 text-center"
                            />
                        </div>
                    ))}
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-slate-400">المجموع الكلي</p>
                        <p className="font-bold text-lg text-slate-900 dark:text-white font-mono">{manualSchedule.reduce((a,b)=>a+b.amount,0).toLocaleString('en-US')}</p>
                    </div>
                    <button onClick={confirmManualSchedule} className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700">اعتماد الجدول</button>
                </div>
            </div>
        </div>
      )}
      
      {/* Add Loan Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl p-4 md:p-6 animate-scale-in my-4 md:my-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
               <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                 {isEditing ? <Edit3 size={24}/> : <Plus size={24}/>}
                 {isEditing ? 'تعديل تفاصيل القرض' : 'إضافة قرض جديد'}
               </h3>
               <button onClick={() => {setShowAddModal(false); setIsEditing(false); setEditingLoanId(null);}} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                 <X size={24} />
               </button>
            </div>

            <form onSubmit={handleAddLoan} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Basic Info */}
                 <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">جهة التمويل</label>
                      <div className="relative">
                          <input 
                            list="lenders" 
                            required
                            type="text" 
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white"
                            placeholder="مثال: مصرف الراجحي"
                            value={selectedLender || newLoan.name}
                            onChange={(e) => { setSelectedLender(e.target.value); setNewLoan({...newLoan, name: e.target.value}); }}
                          />
                          <datalist id="lenders">
                              {SAUDI_LENDERS.map(l => <option key={l} value={l} />)}
                          </datalist>
                      </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">نوع التمويل</label>
                        <select 
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white"
                            value={selectedCategory}
                            onChange={(e) => { setSelectedCategory(e.target.value); setNewLoan({...newLoan, description: e.target.value}); }}
                        >
                            <option value="">اختر النوع...</option>
                            {LOAN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">إجمالي مبلغ السداد (شامل الأرباح)</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          required
                          className="w-full p-3 pl-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-lg font-bold dark:text-white"
                          placeholder="0.00"
                          value={newLoan.amount}
                          onChange={(e) => setNewLoan({...newLoan, amount: e.target.value})}
                        />
                        <span className="absolute left-4 top-3.5 text-slate-400 font-bold text-sm">SAR</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">المبلغ الكلي الذي ستدفعه للبنك بنهاية المدة.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">أيقونة رمزية (اختياري)</label>
                      <IconPicker selected={newLoan.icon} onSelect={(icon) => setNewLoan({...newLoan, icon})} />
                    </div>
                 </div>

                 {/* Terms Info */}
                 <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">مبلغ الربح / الرسوم (الإجمالي)</label>
                        <div className="relative">
                            <input 
                              type="text" 
                              className="w-full p-3 pl-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-lg font-bold dark:text-white"
                              placeholder="0.00"
                              value={newLoan.rate}
                              onChange={(e) => setNewLoan({...newLoan, rate: e.target.value})}
                            />
                            <span className="absolute left-4 top-3.5 text-slate-400 font-bold text-sm">SAR</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">إجمالي الأرباح التي سيأخذها البنك (أو رسوم التمويل).</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">المدة (شهر)</label>
                          <input 
                            type="number" 
                            required
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-lg font-bold dark:text-white"
                            placeholder="60"
                            value={newLoan.duration}
                            onChange={(e) => {
                                setNewLoan({...newLoan, duration: e.target.value});
                                if (manualSchedule.length > 0) setManualSchedule([]); // Reset manual if duration changes
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">بداية القسط</label>
                          <input 
                            type="date" 
                            required
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                            value={newLoan.startDate}
                            onChange={(e) => setNewLoan({...newLoan, startDate: e.target.value})}
                          />
                        </div>
                    </div>
                    
                    {/* Manual Schedule Button */}
                    {newLoan.duration && parseInt(newLoan.duration) > 0 && (
                        <button 
                            type="button" 
                            onClick={() => {
                                if (manualSchedule.length === 0) {
                                    // Pre-fill with evenly distributed amounts
                                    const total = parseFloat(newLoan.amount.replace(/,/g,'')) || 0;
                                    const months = parseInt(newLoan.duration);
                                    const monthly = total / months;
                                    const start = new Date(newLoan.startDate);
                                    const drafts = Array.from({length: months}).map((_, i) => {
                                        const d = new Date(start);
                                        d.setMonth(start.getMonth() + i);
                                        return {
                                            date: d.toISOString().split('T')[0],
                                            amount: parseFloat(monthly.toFixed(2))
                                        };
                                    });
                                    setManualSchedule(drafts);
                                }
                                handleOpenScheduleEditor();
                            }}
                            className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700"
                        >
                            <ListChecks size={16}/> {manualSchedule.length > 0 ? 'تعديل الجدول اليدوي' : 'تخصيص الدفعات يدوياً'}
                        </button>
                    )}
                 </div>
              </div>
              
              {/* Advanced Fields Toggle */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">المبلغ المدفوع مسبقاً (إن وجد)</label>
                          <input 
                            type="number"
                            step="0.01" 
                            className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg outline-none text-sm dark:text-white dark:border-slate-700"
                            placeholder="مثال: 5000"
                            value={newLoan.initialPaidAmount}
                            onChange={(e) => setNewLoan({...newLoan, initialPaidAmount: e.target.value})}
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">قيمة القسط الشهري (مخصص)</label>
                          <input 
                            type="number"
                            step="0.01" 
                            className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg outline-none text-sm dark:text-white dark:border-slate-700"
                            placeholder="مثال: 2450.50"
                            value={newLoan.customMonthlyPayment}
                            onChange={(e) => setNewLoan({...newLoan, customMonthlyPayment: e.target.value})}
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">الدفعة الأخيرة (إن وجدت)</label>
                          <input 
                            type="number"
                            step="0.01" 
                            className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg outline-none text-sm dark:text-white dark:border-slate-700"
                            placeholder="مثال: 35000"
                            value={newLoan.lastPaymentAmount}
                            onChange={(e) => setNewLoan({...newLoan, lastPaymentAmount: e.target.value})}
                          />
                      </div>
                  </div>
              </div>

              {/* Upload Contract */}
              <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center relative group hover:border-emerald-400 transition-colors">
                  <input type="file" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                  <div className="flex flex-col items-center justify-center gap-2">
                     <UploadCloud className="text-slate-400 group-hover:text-emerald-500 transition-colors" size={32} />
                     <p className="text-sm font-bold text-slate-600 dark:text-slate-300">ارفع عقد التمويل (PDF/Image)</p>
                     <p className="text-xs text-slate-400">{fileName || 'اختياري: للحفظ بالأرشيف فقط'}</p>
                  </div>
              </div>

              <button 
                type="submit" 
                disabled={isProcessing}
                className="w-full bg-slate-900 dark:bg-[#bef264] text-white dark:text-slate-900 py-4 rounded-xl font-bold text-lg hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                <span>{isEditing ? 'تحديث القرض' : 'حفظ القرض'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default LoansPage;