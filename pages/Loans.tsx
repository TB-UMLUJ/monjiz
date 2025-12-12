

import React, { useState, useEffect, useRef } from 'react';
import { Loan, LoanType, Bill, EntityLogo, Transaction, TransactionType, UserSettings, BillScheduleItem } from '../types';
import { calculateLoanSchedule, calculateDurationInMonths, getBillSchedule } from '../services/loanCalculator';
import { storageService } from '../services/storage';
import { parseLoanDetailsFromText, parseBillFromPdf, parseLoanFromPdf } from '../services/geminiService';
import { Plus, Trash2, CheckCircle, Calculator, FileText, UploadCloud, Calendar, Download, Loader2, AlertCircle, Sparkles, Wand2, X, Settings2, Edit3, ListChecks, RefreshCcw, Copy, Zap, Droplet, Wifi, Smartphone, Landmark, Receipt, Clock, Coins, Eye, TrendingDown, Hourglass, Archive, RotateCw, PlayCircle, Save, Image as ImageIcon, ChevronRight, CreditCard, RotateCcw, ArrowDown, CheckSquare, Square } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';
import { useSuccess } from '../contexts/SuccessContext';
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
const ICON_OPTIONS = ['🏠', '🚗', '⚡', '💧', '🌐', '📱', '💳', '🎓', '✈️', '💍', '🏥', '🍽️', '🏋️', '🌐', '🛒', '🧸'];

interface ManualScheduleItem {
    date: string;
    amount: number;
}

const LoansPage: React.FC<LoansPageProps> = ({ loans, setLoans, settings, setSettings }) => {
  const { notify } = useNotification();
  const { showSuccess } = useSuccess();
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'loans' | 'bills' | 'archive' | 'subscriptions'>('loans');
  const [bills, setBills] = useState<Bill[]>([]);
  
  // Logos
  const [knownLogos, setKnownLogos] = useState<EntityLogo[]>([]);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSmartModal, setShowSmartModal] = useState(false);
  const [showScheduleEditor, setShowScheduleEditor] = useState(false); 
  const [scheduleEditorMode, setScheduleEditorMode] = useState<'loan' | 'bill'>('loan');
  const [showAddBillModal, setShowAddBillModal] = useState(false); 
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null); // New state for bill details

  // New Calculators State
  const [showSettlementCalc, setShowSettlementCalc] = useState(false);
  const [showRefinanceCalc, setShowRefinanceCalc] = useState(false);

  // Bulk Payment State
  const [selectedScheduleItems, setSelectedScheduleItems] = useState<string[]>([]); // Array of Date strings

  // Payment Modal State
  const [paymentModal, setPaymentModal] = useState<{
      isOpen: boolean;
      type: 'loan' | 'bill' | 'refund' | 'bulk'; // Added bulk
      item: any; // Loan or Bill
      scheduleItem?: any; // For Loans/Bills single payment
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
      amount: string; // This is monthly amount
      hasEndDate: boolean;
      endDate: string;
      deviceDetails: string;
      startDate: string;
      duration: string;
      lastAmount: string;
      downPayment: string;
      totalDebt: string; // New field for total debt
      endDateMode: 'date' | 'months';
      isSubscription: boolean;
      renewalDate: string;
      customSchedule?: BillScheduleItem[]; // New: For custom bill schedule
      icon: string; // New: To store auto-detected or manually set icon
      description: string; // New: Description field
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
      totalDebt: '',
      endDateMode: 'months',
      isSubscription: false,
      renewalDate: '',
      customSchedule: undefined,
      icon: '',
      description: ''
  });

  // Helper for smart currency formatting (e.g. 132.775 ألف)
  const formatSmart = (val: number) => {
      if (val >= 1000) {
          return `${(val / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} ألف`;
      }
      return `${val.toLocaleString('en-US', { maximumFractionDigits: 2 })} ريال`;
  };

  // Clear selections when closing modals
  useEffect(() => {
      if (!selectedLoan && !selectedBill) {
          setSelectedScheduleItems([]);
      }
  }, [selectedLoan, selectedBill]);

  // Helper to find logo with robust matching (User Input <-> Stored Name)
  const findMatchingLogo = (query: string): EntityLogo | undefined => {
      if (!query) return undefined;
      const q = query.trim().toLowerCase();
      return knownLogos.find(l => {
          const n = l.name.trim().toLowerCase();
          // Check if query contains name OR name contains query (e.g. "Tabby" in "Tabby Installment" OR "Al Rajhi" in "Rajhi")
          return q.includes(n) || n.includes(q);
      });
  };

  // Auto-calculate Total Debt for Bill when Amount/Duration changes
  useEffect(() => {
      // Only auto-calc if NOT editing a bill that already has a custom schedule (to prevent overwrite)
      // And only if type is installment
      if (!editingBillId && newBill.type === 'device_installment' && (!newBill.customSchedule || newBill.customSchedule.length === 0)) {
          const monthly = parseFloat(newBill.amount) || 0;
          const months = parseFloat(newBill.duration) || 0;
          const down = parseFloat(newBill.downPayment) || 0;
          
          if (monthly > 0 && months > 0) {
              const total = (monthly * months) + down;
              setNewBill(prev => ({ ...prev, totalDebt: total.toFixed(2) }));
          }
      }
  }, [newBill.amount, newBill.duration, newBill.downPayment, newBill.type, editingBillId]);

  useEffect(() => {
      if (activeTab === 'bills' || activeTab === 'archive' || activeTab === 'subscriptions') {
          storageService.getBills().then(setBills);
      }
      storageService.getLogos().then(setKnownLogos);
  }, [activeTab]);

  // Auto-detect Logo for Loan
  useEffect(() => {
      if (newLoan.name && !newLoan.icon) {
          const match = findMatchingLogo(newLoan.name);
          if (match) {
              setNewLoan(prev => ({ ...prev, icon: match.logoUrl }));
          }
      }
  }, [newLoan.name, knownLogos]);

  // Auto-detect Logo for Bill
  useEffect(() => {
      if (newBill.provider && !newBill.icon) {
          const match = findMatchingLogo(newBill.provider);
          if (match) {
              setNewBill(prev => ({ ...prev, icon: match.logoUrl }));
          }
      }
  }, [newBill.provider, knownLogos]);

  // Helper to get logo URL (prioritizes instance icon, then lookup)
  const getDisplayLogo = (icon: string | undefined, name: string) => {
      if (icon && icon.length > 0) return icon;
      const match = findMatchingLogo(name);
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
     if (!smartText && !newLoan.contractPdf) return;
      setIsParsing(true);
      try {
          let parsed: any = null;
          
          if (newLoan.contractPdf) {
              parsed = await parseLoanFromPdf(newLoan.contractPdf);
          } else if (smartText) {
              parsed = await parseLoanDetailsFromText(smartText);
          }

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
                  // Try to find lender in standard list
                  const foundLender = SAUDI_LENDERS.find(l => l.includes(parsed.lenderName || ''));
                  const nameToUse = foundLender || parsed.lenderName || '';
                  setNewLoan(prev => ({...prev, name: nameToUse}));
                  
                  // Auto-detect logo here as well immediately
                  const match = findMatchingLogo(nameToUse);
                  if (match) setNewLoan(prev => ({...prev, icon: match.logoUrl}));
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
        icon: newLoan.icon // Save detected icon
      };

      if (isEditing) {
         await storageService.editLoanDetails(loanData);
         if (selectedLoan?.id === loanData.id) setSelectedLoan(loanData);
         notify('تم تحديث بيانات القرض', 'success');
      } else {
         await storageService.saveLoan(loanData);
         showSuccess('تهانينا!', 'تم إضافة القرض بنجاح.');
      }
      const updatedLoans = await storageService.getLoans();
      setLoans(updatedLoans);
      setShowAddModal(false);
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

          // FIX: If we have a custom schedule (e.g. device installment), we MUST update the dates 
          // inside it to align with the new Start Date.
          let finalCustomSchedule = newBill.customSchedule;

          if (newBill.startDate && finalCustomSchedule && finalCustomSchedule.length > 0) {
            const start = new Date(newBill.startDate);
            finalCustomSchedule = finalCustomSchedule.map((item, idx) => {
                const d = new Date(start);
                // Default rule: Installments start 1 month after contract start
                // Or if we want to be safe, assume monthly steps
                d.setMonth(start.getMonth() + idx + 1); 
                return {
                    ...item,
                    date: d.toISOString().split('T')[0]
                };
            });
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
              totalDebt: newBill.totalDebt ? parseFloat(newBill.totalDebt) : undefined,
              isSubscription: newBill.type === 'subscription',
              renewalDate: newBill.renewalDate,
              status: 'active',
              icon: newBill.icon, // Save detected icon
              description: newBill.description,
              paidDates: [],
              customSchedule: finalCustomSchedule
          };
          
          if (editingBillId) {
             const existing = bills.find(b => b.id === editingBillId);
             if (existing) billData.paidDates = existing.paidDates;
          }

          if (editingBillId) {
              await storageService.updateBill(billData);
              notify('تم تحديث الفاتورة', 'success');
          } else {
              await storageService.saveBill(billData);
              showSuccess('تم!', 'تم إضافة الالتزام الجديد بنجاح.');
          }
          
          setBills(await storageService.getBills());
          setShowAddBillModal(false);
          setEditingBillId(null);
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
          totalDebt: bill.totalDebt?.toString() || '',
          endDateMode: bill.durationMonths ? 'months' : 'date',
          isSubscription: bill.isSubscription || false,
          renewalDate: bill.renewalDate || '',
          customSchedule: bill.customSchedule,
          icon: bill.icon || '',
          description: bill.description || ''
      });
      setShowAddBillModal(true);
      if (selectedBill) setSelectedBill(null);
  };

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

  const initiateUndoPayment = (item: any, scheduleItem: any, amount: number) => {
      setPaymentModal({
          isOpen: true,
          type: 'refund',
          item,
          scheduleItem,
          amount,
          title: `تراجع عن سداد: ${item.name}`,
          date: scheduleItem.date instanceof Date ? scheduleItem.date.toLocaleDateString('en-GB') : new Date(scheduleItem.paymentDate).toLocaleDateString('en-GB')
      });
      if (settings.cards.length > 0) {
          setSelectedPaymentCardId(settings.cards[0].id);
      } else {
          setSelectedPaymentCardId('cash');
      }
  };

  const initiateBulkPayment = (type: 'loan' | 'bill', item: any) => {
      if (selectedScheduleItems.length === 0) return;

      // Calculate Total
      let total = 0;
      if (type === 'loan') {
          const loan = item as Loan;
          total = loan.schedule
              .filter(s => selectedScheduleItems.includes(s.paymentDate) && !s.isPaid)
              .reduce((sum, s) => sum + s.paymentAmount, 0);
      } else {
          const bill = item as Bill;
          const schedule = getBillSchedule(bill);
          total = schedule
              .filter(s => selectedScheduleItems.includes(s.date.toISOString().split('T')[0]) && !s.isPaid)
              .reduce((sum, s) => sum + s.amount, 0);
      }
      
      if (total === 0) {
          notify('العناصر المحددة مدفوعة بالفعل أو القيمة صفر', 'warning');
          return;
      }

      setPaymentModal({
          isOpen: true,
          type: 'bulk',
          item,
          amount: total,
          title: `سداد دفعات متعددة: ${item.name}`,
          date: `${selectedScheduleItems.length} أقساط`
      });
      if (settings.cards.length > 0) {
          setSelectedPaymentCardId(settings.cards[0].id);
      } else {
          setSelectedPaymentCardId('cash');
      }
  };

  const confirmPayment = async () => {
      setIsProcessing(true);
      try {
          if (paymentModal.type === 'refund') {
              // --- Handle Refund (Undo) ---
              // 1. Add Balance to Card
              if (selectedPaymentCardId !== 'cash') {
                  const cardIndex = settings.cards.findIndex(c => c.id === selectedPaymentCardId);
                  if (cardIndex > -1) {
                      const updatedCards = [...settings.cards];
                      const card = updatedCards[cardIndex];
                      const newBalance = (card.balance || 0) + paymentModal.amount; // Add back
                      updatedCards[cardIndex] = { ...card, balance: newBalance };
                      
                      const newSettings = { ...settings, cards: updatedCards };
                      const savedSettings = await storageService.saveSettings(newSettings);
                      setSettings(savedSettings);
                  }
              }

              // 2. Record Refund Transaction
              const tx: Transaction = {
                  id: '',
                  amount: paymentModal.amount,
                  type: TransactionType.INCOME, // Money coming back
                  category: 'استرداد / تصحيح',
                  date: new Date().toISOString(),
                  note: `تراجع عن سداد: ${paymentModal.item.name}`,
                  cardId: selectedPaymentCardId !== 'cash' ? selectedPaymentCardId : undefined
              };
              await storageService.saveTransaction(tx);
              
              // NEW: Update Bill OR Loan State (Undo)
              if (paymentModal.item.provider) { // It is a bill
                   const bill = paymentModal.item as Bill;
                   if (paymentModal.scheduleItem) {
                       const dateStr = paymentModal.scheduleItem.date.toISOString().split('T')[0];
                       bill.paidDates = (bill.paidDates || []).filter(d => d !== dateStr);
                       await storageService.updateBill(bill);
                       setBills(await storageService.getBills());
                       if (selectedBill?.id === bill.id) setSelectedBill({...bill});
                   }
              } else {
                   // Loan Undo Logic
                   const loan = paymentModal.item as Loan;
                   const scheduleItem = paymentModal.scheduleItem;
                   const itemIndex = loan.schedule.findIndex(s => s.paymentDate === scheduleItem.paymentDate);
                   if (itemIndex > -1) {
                       loan.schedule[itemIndex].isPaid = false;
                       loan.status = 'active'; 
                       await storageService.updateLoan(loan);
                       const updatedLoans = await storageService.getLoans();
                       setLoans(updatedLoans);
                       if (selectedLoan?.id === loan.id) setSelectedLoan(updatedLoans.find(l=>l.id===loan.id) || null);
                   }
              }

              notify('تم التراجع عن السداد وتسجيل العملية استرداد', 'success');

          } else {
              // --- Handle Payment (Single or Bulk) ---
              // 1. Deduct Balance (if card selected)
              if (selectedPaymentCardId !== 'cash') {
                  const cardIndex = settings.cards.findIndex(c => c.id === selectedPaymentCardId);
                  if (cardIndex > -1) {
                      const updatedCards = [...settings.cards];
                      const card = updatedCards[cardIndex];
                      const newBalance = (card.balance || 0) - paymentModal.amount;
                      
                      updatedCards[cardIndex] = { ...card, balance: newBalance };
                      
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
                  category: paymentModal.type === 'loan' || paymentModal.type === 'bulk' ? 'قروض' : 'فواتير وخدمات',
                  date: new Date().toISOString(),
                  note: paymentModal.type === 'bulk' ? `سداد مجمع (${selectedScheduleItems.length} أقساط) لـ ${paymentModal.item.name}` : `${paymentModal.title} (${paymentModal.date})`,
                  cardId: selectedPaymentCardId !== 'cash' ? selectedPaymentCardId : undefined
              };
              await storageService.saveTransaction(tx);

              // 3. Update Item Status (Bulk or Single)
              
              if (paymentModal.type === 'bulk') {
                  // --- BULK UPDATE ---
                  if (paymentModal.item.provider) {
                      // Bill Bulk
                      const bill = paymentModal.item as Bill;
                      const currentPaid = bill.paidDates || [];
                      // Add only unique dates
                      const newPaid = [...new Set([...currentPaid, ...selectedScheduleItems])];
                      bill.paidDates = newPaid;
                      
                      await storageService.updateBill(bill);
                      setBills(await storageService.getBills());
                      if (selectedBill?.id === bill.id) setSelectedBill({...bill});

                  } else {
                      // Loan Bulk
                      const loan = paymentModal.item as Loan;
                      let updatedCount = 0;
                      loan.schedule.forEach(s => {
                          if (selectedScheduleItems.includes(s.paymentDate) && !s.isPaid) {
                              s.isPaid = true;
                              updatedCount++;
                          }
                      });
                      if (updatedCount > 0) {
                          loan.status = loan.schedule.every(s => s.isPaid) ? 'completed' : 'active';
                          await storageService.updateLoan(loan);
                          const updatedLoans = await storageService.getLoans();
                          setLoans(updatedLoans);
                          if (selectedLoan?.id === loan.id) setSelectedLoan(updatedLoans.find(l=>l.id===loan.id) || null);
                      }
                  }
                  setSelectedScheduleItems([]); // Clear selection after payment

              } else if (paymentModal.type === 'loan' && paymentModal.scheduleItem) {
                  const loan = paymentModal.item as Loan;
                  const scheduleItem = paymentModal.scheduleItem;
                  
                  const itemIndex = loan.schedule.findIndex(s => s.paymentDate === scheduleItem.paymentDate);
                  if (itemIndex > -1) {
                      loan.schedule[itemIndex].isPaid = true;
                      loan.status = loan.schedule.every(s => s.isPaid) ? 'completed' : 'active';
                      
                      await storageService.updateLoan(loan);
                      const updatedLoans = await storageService.getLoans();
                      setLoans(updatedLoans);
                      if (selectedLoan?.id === loan.id) setSelectedLoan(updatedLoans.find(l=>l.id===loan.id) || null);
                  }
              }
              // NEW: Update Bill State (Pay)
              else if (paymentModal.type === 'bill' && paymentModal.scheduleItem) {
                  const bill = paymentModal.item as Bill;
                  const dateStr = paymentModal.scheduleItem.date.toISOString().split('T')[0];
                  const currentPaid = bill.paidDates || [];
                  if (!currentPaid.includes(dateStr)) {
                      bill.paidDates = [...currentPaid, dateStr];
                      await storageService.updateBill(bill);
                      setBills(await storageService.getBills());
                      if (selectedBill?.id === bill.id) setSelectedBill({...bill}); 
                  }
              }

              // USE SHOW SUCCESS instead of Notify for Payments (Big action)
              showSuccess('تم السداد بنجاح!', 'تم تسجيل العملية وتحديث الرصيد.');
          }

          setPaymentModal({ ...paymentModal, isOpen: false });

      } catch (e) {
          console.error(e);
          notify('حدث خطأ أثناء العملية', 'error');
      } finally {
          setIsProcessing(false);
      }
  };

  // --- Bulk Selection Handlers ---
  const toggleSelection = (dateStr: string) => {
      setSelectedScheduleItems(prev => {
          if (prev.includes(dateStr)) return prev.filter(d => d !== dateStr);
          return [...prev, dateStr];
      });
  };

  const selectAllUnpaid = (items: {dateStr: string, isPaid: boolean}[]) => {
      const unpaidDates = items.filter(i => !i.isPaid).map(i => i.dateStr);
      // If all unpaid are already selected, deselect all. Otherwise, select all unpaid.
      const allSelected = unpaidDates.every(d => selectedScheduleItems.includes(d));
      
      if (allSelected) {
          setSelectedScheduleItems([]);
      } else {
          setSelectedScheduleItems(unpaidDates);
      }
  };
  
  const handleOpenScheduleEditor = (mode: 'loan' | 'bill') => {
    setScheduleEditorMode(mode);

    if (mode === 'loan') {
        const duration = parseInt(newLoan.duration) || 0;
        if (duration <= 0) { notify('حدد المدة أولاً', 'error'); return; }

        // If schedule is empty or duration changed, regenerate based on current form
        if (manualSchedule.length === 0 || manualSchedule.length !== duration) {
            const total = parseFloat(newLoan.amount.replace(/,/g, '')) || 0;
            const monthly = total > 0 ? total / duration : 0;
            const start = new Date(newLoan.startDate);
            
            const newSchedule = Array.from({ length: duration }).map((_, i) => {
                const d = new Date(start);
                d.setMonth(start.getMonth() + i);
                return {
                    date: d.toISOString().split('T')[0],
                    amount: parseFloat(monthly.toFixed(2))
                };
            });
            setManualSchedule(newSchedule);
        }
    } else {
        // Bill Mode
        const duration = parseInt(newBill.duration) || 0;
        if (duration <= 0) { notify('حدد المدة بالأشهر أولاً', 'error'); return; }
        if (!newBill.startDate) { notify('حدد تاريخ البداية أولاً', 'error'); return; }

        // Load existing custom schedule if editing and duration matches
        if (newBill.customSchedule && newBill.customSchedule.length === duration) {
            setManualSchedule(newBill.customSchedule.map(i => ({...i}))); // Clone
        } else {
            // Generate new based on amount
            const monthly = parseFloat(newBill.amount) || 0;
            const start = new Date(newBill.startDate);
            const newSchedule = Array.from({ length: duration }).map((_, i) => {
                const d = new Date(start);
                d.setMonth(start.getMonth() + i + 1); // Bills usually start month after
                return {
                    date: d.toISOString().split('T')[0],
                    amount: parseFloat(monthly.toFixed(2))
                };
            });
            setManualSchedule(newSchedule);
        }
    }
    setShowScheduleEditor(true); 
  };
  
  const updateManualInstallment = (idx:number, val:number) => { const n = [...manualSchedule]; n[idx].amount = val; setManualSchedule(n); };
  const applyToAll = (val:number) => { setManualSchedule(manualSchedule.map(i=>({...i, amount:val}))); };
  
  const confirmManualSchedule = () => { 
      // Update total loan/bill amount to match the sum of manual installments
      const totalSum = manualSchedule.reduce((s,i)=>s+i.amount,0);

      if (scheduleEditorMode === 'loan') {
         setNewLoan(p=>({...p, amount: totalSum.toFixed(2)})); 
         notify(`تم تحديث الجدول وإجمالي القرض إلى ${totalSum.toFixed(2)}`, 'success');
      } else {
         // Bill Mode
         // Update Bill state with new schedule and total debt
         const down = parseFloat(newBill.downPayment) || 0;
         const totalWithDown = totalSum + down;
         setNewBill(p => ({
             ...p,
             customSchedule: manualSchedule, // Save the array
             totalDebt: totalWithDown.toFixed(2) // Update total debt
         }));
         notify(`تم تحديث جدول الفاتورة وإجمالي الدين إلى ${totalWithDown.toFixed(2)}`, 'success');
      }

      setShowScheduleEditor(false); 
  };
  
  const renderIcon = (iconString?: string, defaultIcon = <Landmark className="text-slate-400"/>) => {
      if (!iconString) return defaultIcon;
      if (iconString.startsWith('data:image') || iconString.startsWith('http')) {
          return <img src={iconString} alt="icon" className="w-full h-full rounded-2xl object-cover" />;
      }
      return <span className="text-3xl">{iconString}</span>;
  };

  const getBillIcon = (type: string, providerName: string, icon?: string) => {
     // 1. Prefer explicitly saved icon
     if (icon && icon.length > 0) {
         return <img src={icon} alt={providerName} className="w-full h-full rounded-2xl object-cover" />;
     }

     // 2. Try to find auto logo from provider name
     const autoLogo = getDisplayLogo(undefined, providerName);
     if (autoLogo) {
          return <img src={autoLogo} alt={providerName} className="w-full h-full rounded-2xl object-cover" />;
     }
     
     // 3. Fallback to generic icons
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
                <button onClick={() => setShowSmartModal(true)} className="flex items-center justify-center gap-2 bg-emerald-600 dark:bg-emerald-600 text-white dark:text-white px-3 py-2 rounded-lg text-sm font-bold shadow-lg"><Wand2 size={16}/><span>استيراد ذكي</span></button>
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
                    
                    let prog = total > 0 ? (paid/total)*100 : 0;
                    
                    // Handle Bridge Loans (Paid amount is 0, but installments are marked paid)
                    const paidCount = loan.schedule.filter(s => s.isPaid).length;
                    const totalCount = loan.schedule.length;
                    if (paid === 0 && paidCount > 0 && totalCount > 0) {
                        prog = (paidCount / totalCount) * 100;
                    }

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
                                    <div className="flex justify-between items-start gap-2">
                                        <h3 className="font-bold text-lg text-slate-800 dark:text-white leading-snug">{loan.name}</h3>
                                        <span className={`text-[10px] px-2 py-1 rounded-full shrink-0 ${loan.status === 'active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>{loan.status === 'active' ? 'نشط' : 'منتهي'}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed mt-1">{loan.description || 'تمويل شخصي'}</p>
                                </div>
                            </div>

                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full mb-3 overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{width: `${prog}%`}}></div>
                            </div>
                            
                            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-4">
                                <div>
                                    <span className="block mb-0.5">المدفوع</span>
                                    <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">{formatSmart(paid)}</span>
                                </div>
                                <div className="text-left">
                                    <span className="block mb-0.5">المتبقي</span>
                                    <span className="font-bold text-rose-600 dark:text-rose-400 text-sm">{formatSmart(remaining)}</span>
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 grid grid-cols-2 gap-3 text-xs mb-3 border border-slate-100 dark:border-slate-700">
                                 <div>
                                    <span className="block text-slate-400 mb-1">القسط القادم</span>
                                    <span className="font-bold text-base text-slate-800 dark:text-white">
                                        {nextPayment ? formatSmart(nextPayment.paymentAmount) : '-'}
                                    </span>
                                 </div>
                                 <div className="text-left border-r border-slate-200 dark:border-slate-700 pr-3">
                                    <span className="block text-slate-400 mb-1">يستحق في</span>
                                    <span className="font-bold text-slate-800 dark:text-white">
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
              <button onClick={() => { setShowAddBillModal(true); setEditingBillId(null); setNewBill({ provider: '', type: 'electricity', amount: '', hasEndDate: false, endDate: '', deviceDetails: '', startDate: '', duration: '', lastAmount: '', downPayment: '', totalDebt: '', endDateMode: 'months', isSubscription: false, renewalDate: '', customSchedule: undefined, icon: '', description: '' }); }} className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-bold shadow-lg"><Plus size={16}/><span>إضافة جديد</span></button>
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
                  <div className="text-2xl font-bold text-purple-800 dark:text-purple-200">
                      {formatSmart(filteredBills.reduce((acc, b) => acc + b.amount, 0) * 12)} <span className="text-sm">/سنة</span>
                  </div>
              </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBills.map(bill => {
                  const daysLeft = bill.endDate ? Math.ceil((new Date(bill.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 999;
                  const isExpiringSoon = daysLeft < 30 && daysLeft > 0;
                  
                  // Use robust schedule calculation
                  const schedule = getBillSchedule(bill);
                  
                  let totalAmount = 0;
                  let paidAmount = 0;
                  let monthsLeft = 0;
                  let estimatedRemaining = 0;
                  let prog = 0;
                  
                  if (bill.isSubscription) {
                      totalAmount = bill.amount * 12; // Show annual projection for scale
                      paidAmount = 0; // Not relevant for subscription progress bar context usually
                      estimatedRemaining = bill.amount; // Monthly payment
                      monthsLeft = 0; 
                  } else if (schedule.length > 0) {
                      totalAmount = schedule.reduce((acc, curr) => acc + curr.amount, 0);
                      // Fallback: If totalDebt is explicitly set and larger than calculated, use it? 
                      // No, rely on schedule components for consistency.
                      
                      paidAmount = schedule.filter(s => s.isPaid).reduce((acc, curr) => acc + curr.amount, 0);
                      estimatedRemaining = Math.max(0, totalAmount - paidAmount);
                      
                      const totalInstallments = schedule.filter(s => s.type === 'installment').length;
                      const paidInstallments = schedule.filter(s => s.type === 'installment' && s.isPaid).length;
                      monthsLeft = Math.max(0, totalInstallments - paidInstallments);
                      
                      if (totalAmount > 0) prog = (paidAmount / totalAmount) * 100;
                  } else if (bill.endDate) {
                      // Fallback for Date-only bills (legacy)
                       const totalDaysLeft = Math.ceil((new Date(bill.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                       monthsLeft = Math.max(0, Math.ceil(totalDaysLeft / 30));
                       estimatedRemaining = monthsLeft * bill.amount;
                       totalAmount = estimatedRemaining; // Approximate
                  } else {
                       totalAmount = bill.amount;
                       estimatedRemaining = bill.amount;
                  }

                  // --- NEXT PAYMENT DATE LOGIC ---
                  let nextPaymentDateStr = '-';
                  if (bill.customSchedule && bill.customSchedule.length > 0) {
                      // Sort by date just in case
                      const sorted = [...bill.customSchedule].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                      const next = sorted.find(s => !(bill.paidDates || []).includes(s.date) && new Date(s.date) >= new Date(new Date().setHours(0,0,0,0)));
                      const firstUnpaid = sorted.find(s => !(bill.paidDates || []).includes(s.date));
                      
                      if (next) nextPaymentDateStr = new Date(next.date).toLocaleDateString('en-GB');
                      else if (firstUnpaid) nextPaymentDateStr = new Date(firstUnpaid.date).toLocaleDateString('en-GB') + ' (متأخر)';
                      else nextPaymentDateStr = 'مكتمل';
                  } else {
                      let day = 1;
                      if (bill.startDate) day = new Date(bill.startDate).getDate();
                      else if (bill.renewalDate) day = new Date(bill.renewalDate).getDate();
                      
                      const today = new Date();
                      let targetDate = new Date(today.getFullYear(), today.getMonth(), day);
                      if (targetDate < new Date(new Date().setHours(0,0,0,0))) {
                          targetDate.setMonth(targetDate.getMonth() + 1);
                      }
                      nextPaymentDateStr = targetDate.toLocaleDateString('en-GB');
                  }

                  let statusLabel = bill.status === 'active' ? 'نشط' : 'مؤرشف';
                  let statusColor = bill.status === 'active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500';

                  if (bill.status === 'active' && bill.durationMonths && monthsLeft === 0) {
                      statusLabel = 'مكتمل';
                      statusColor = 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
                  }

                  const borderClass = isExpiringSoon ? 'border-amber-400 ring-1 ring-amber-400' : (selectedBill?.id === bill.id ? 'border-emerald-500 ring-1' : 'border-slate-100 dark:border-slate-800');

                  return (
                  <div key={bill.id} onClick={() => setSelectedBill(bill)} className={`bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border cursor-pointer hover:shadow-md transition-shadow ${borderClass} ${bill.status === 'archived' ? 'opacity-60 grayscale' : ''}`}>
                      
                      {/* Header */}
                      <div className="flex items-center gap-4 mb-4">
                          <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-white flex items-center justify-center border border-slate-100 dark:border-slate-300 shadow-sm shrink-0 overflow-hidden">
                              {getBillIcon(bill.type, bill.provider, bill.icon)}
                          </div>
                          <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-2">
                                  <h3 className="font-bold text-lg text-slate-800 dark:text-white leading-snug">{bill.name}</h3>
                                  <span className={`text-[10px] px-2 py-1 rounded-full shrink-0 ${statusColor}`}>{statusLabel}</span>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed mt-1">{bill.description || bill.provider}</p>
                          </div>
                      </div>

                      {/* Progress Bar (Only if duration/contract exists) */}
                      {(bill.durationMonths || bill.endDate) ? (
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full mb-3 overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{width: `${prog}%`}}></div>
                          </div>
                      ) : (
                          <div className="w-full h-2.5 mb-3"></div> // Spacer
                      )}
                      
                      {/* Stats */}
                      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-4">
                          <div>
                              <span className="block mb-0.5">{(bill.durationMonths || bill.totalDebt) ? 'القيمة / المدفوع' : 'القسط الشهري'}</span>
                              <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                                 {(bill.durationMonths || bill.totalDebt) ? formatSmart(paidAmount) : formatSmart(bill.amount)}
                              </span>
                          </div>
                          <div className="text-left">
                              <span className="block mb-0.5">{(bill.durationMonths || bill.totalDebt) ? 'المتبقي (دين)' : 'المتوقع (متبقي)'}</span>
                              <span className="font-bold text-rose-600 dark:text-rose-400 text-sm">
                                  {formatSmart(estimatedRemaining)}
                              </span>
                          </div>
                      </div>
                      
                      {/* Next Payment Grid */}
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 grid grid-cols-2 gap-3 text-xs mb-3 border border-slate-100 dark:border-slate-700">
                              <div>
                              <span className="block text-slate-400 mb-1">القسط القادم</span>
                              <span className="font-bold text-base text-slate-800 dark:text-white">
                                  {formatSmart(bill.amount)}
                              </span>
                              </div>
                              <div className="text-left border-r border-slate-200 dark:border-slate-700 pr-3">
                              <span className="block text-slate-400 mb-1">يستحق في</span>
                              <span className="font-bold text-slate-800 dark:text-white">
                                  {nextPaymentDateStr}
                              </span>
                              </div>
                      </div>
                      
                      {/* Bottom Badge */}
                      {(bill.durationMonths || (monthsLeft > 0 && monthsLeft < 999)) ? (
                          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg p-2 flex items-center justify-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-sm">
                              <Hourglass size={16} />
                              <span>متبقي {monthsLeft} شهر</span>
                          </div>
                      ) : (
                          <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg p-2 flex items-center justify-center gap-2 text-slate-500 font-bold text-sm">
                              <Calendar size={16} />
                              <span>دوري / مستمر</span>
                          </div>
                      )}

                      {isExpiringSoon && (
                          <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 font-bold text-center">
                              ينتهي العقد خلال {daysLeft} يوم!
                          </div>
                      )}

                      <button onClick={(e)=>{e.stopPropagation(); setSelectedBill(bill)}} className="w-full mt-3 text-xs bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 py-2.5 rounded-lg font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">عرض التفاصيل</button>
                  </div>
              )})}
          </div>
      </div>
      )}

      {/* Loan Details Modal (Restored) */}
      {selectedLoan && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => setSelectedLoan(null)}
          >
            <div 
                className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl animate-scale-in max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                         <div className="flex items-center gap-3">
                             <div className="w-14 h-14 rounded-xl bg-white dark:bg-white flex items-center justify-center border border-slate-200 shadow-sm shrink-0 overflow-hidden">
                                {renderIcon(selectedLoan.icon)}
                             </div>
                             <div>
                                <h3 className="font-bold text-xl text-slate-800 dark:text-white">
                                    {selectedLoan.name}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{selectedLoan.description}</p>
                             </div>
                         </div>
                         <button onClick={() => setSelectedLoan(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500"><X size={24}/></button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                         <button onClick={() => handleEditClick(selectedLoan)} className="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300 px-3 py-2 rounded-lg text-sm font-bold border border-blue-200 dark:border-blue-800 flex items-center gap-1"><Edit3 size={14}/> تعديل</button>
                         <button onClick={handleDeleteLoan} className="bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300 px-3 py-2 rounded-lg text-sm font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1"><Trash2 size={14}/> حذف</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-0">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                                <span className="text-slate-400 text-xs block mb-1">إجمالي المبلغ (شامل الأرباح)</span>
                                <span className="font-bold text-lg dark:text-white">
                                    {formatSmart(selectedLoan.schedule.reduce((a, c) => a + c.paymentAmount, 0))}
                                </span>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                                <span className="text-slate-400 text-xs block mb-1">المتبقي</span>
                                <span className="font-bold text-lg text-rose-600 dark:text-rose-400">
                                    {formatSmart(selectedLoan.schedule.filter(s => !s.isPaid).reduce((a,c)=>a+c.paymentAmount,0))}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="p-4">
                        <h4 className="font-bold text-sm text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2"><ListChecks size={16}/> جدول السداد</h4>
                        
                        {/* Bulk Action Bar (Floating) */}
                        {selectedScheduleItems.length > 0 && (
                            <div className="sticky top-0 z-10 bg-indigo-600 text-white p-3 rounded-xl mb-3 flex items-center justify-between shadow-lg animate-slide-up">
                                <div className="text-sm font-bold">
                                    تم تحديد {selectedScheduleItems.length} أقساط
                                </div>
                                <button 
                                    onClick={() => initiateBulkPayment('loan', selectedLoan)}
                                    className="bg-white text-indigo-700 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-50"
                                >
                                    سداد الكل
                                </button>
                            </div>
                        )}

                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                            <table className="w-full text-sm text-left rtl:text-right text-slate-500 dark:text-slate-400">
                                <thead className="text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800">
                                    <tr>
                                        <th className="px-4 py-3 w-10">
                                            <button onClick={() => selectAllUnpaid(selectedLoan.schedule.map(s => ({dateStr: s.paymentDate, isPaid: s.isPaid})))} className="flex items-center justify-center">
                                                {selectedLoan.schedule.some(s => !s.isPaid && selectedScheduleItems.includes(s.paymentDate)) ? <CheckSquare size={16} className="text-indigo-600"/> : <Square size={16} />}
                                            </button>
                                        </th>
                                        <th className="px-4 py-3">#</th>
                                        <th className="px-4 py-3">التاريخ</th>
                                        <th className="px-4 py-3">المبلغ</th>
                                        <th className="px-4 py-3">الحالة</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedLoan.schedule.map((item, idx) => (
                                        <tr key={idx} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${selectedScheduleItems.includes(item.paymentDate) ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
                                            <td className="px-4 py-3">
                                                {!item.isPaid && (
                                                    <button onClick={() => toggleSelection(item.paymentDate)} className="text-slate-400 hover:text-indigo-600">
                                                        {selectedScheduleItems.includes(item.paymentDate) ? <CheckSquare size={16} className="text-indigo-600"/> : <Square size={16}/>}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-medium">{idx + 1}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {new Date(item.paymentDate).toLocaleDateString('en-GB')}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                                {item.paymentAmount.toLocaleString('en-US')}
                                            </td>
                                            <td className="px-4 py-3">
                                                {item.isPaid ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex items-center text-emerald-600 text-xs font-bold gap-1 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">
                                                            <CheckCircle size={12}/> مدفوع
                                                        </span>
                                                        <button 
                                                            onClick={() => initiateUndoPayment(selectedLoan, item, item.paymentAmount)}
                                                            className="text-xs text-slate-400 hover:text-rose-500 underline"
                                                        >
                                                            تراجع
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button 
                                                        onClick={() => initiatePayment('loan', selectedLoan, item, item.paymentAmount, new Date(item.paymentDate).toLocaleDateString('en-GB'))}
                                                        className="bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white px-3 py-1 rounded-lg text-xs font-bold hover:opacity-90"
                                                    >
                                                        سداد
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

      {/* Bill Details Modal with Schedule */}
      {selectedBill && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelectedBill(null)}
          >
            <div 
                className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl animate-scale-in max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                         <div className="flex items-center gap-3">
                             <div className="w-14 h-14 rounded-xl bg-white dark:bg-white flex items-center justify-center border border-slate-200 shadow-sm shrink-0 overflow-hidden">
                                {getBillIcon(selectedBill.type, selectedBill.provider, selectedBill.icon)}
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

                    {selectedBill.description && (
                        <div className="text-sm bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">
                             <strong>ملاحظات:</strong> {selectedBill.description}
                        </div>
                    )}
                    
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
                                <span className="text-slate-400 text-xs block mb-1">القسط الشهري</span>
                                <span className="font-bold text-lg dark:text-white">{formatSmart(selectedBill.amount)}</span>
                            </div>
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                                <span className="text-slate-400 text-xs block mb-1">تاريخ البداية</span>
                                <span className="font-bold dark:text-white">{selectedBill.startDate ? new Date(selectedBill.startDate).toLocaleDateString('en-GB') : 'غير محدد'}</span>
                            </div>
                             {selectedBill.totalDebt && (
                                <div className="col-span-2 bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800">
                                    <span className="text-indigo-500 text-xs block mb-1 font-bold">إجمالي قيمة العقد/الدين</span>
                                    <span className="font-bold text-lg text-indigo-700 dark:text-indigo-300">{formatSmart(selectedBill.totalDebt)}</span>
                                </div>
                            )}
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
                        
                         {/* Bulk Action Bar (Floating) for Bills */}
                        {selectedScheduleItems.length > 0 && (
                            <div className="sticky top-0 z-10 bg-indigo-600 text-white p-3 rounded-xl mb-3 flex items-center justify-between shadow-lg animate-slide-up">
                                <div className="text-sm font-bold">
                                    تم تحديد {selectedScheduleItems.length} فواتير
                                </div>
                                <button 
                                    onClick={() => initiateBulkPayment('bill', selectedBill)}
                                    className="bg-white text-indigo-700 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-50"
                                >
                                    سداد الكل
                                </button>
                            </div>
                        )}

                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                            <table className="w-full text-sm text-left rtl:text-right text-slate-500 dark:text-slate-400">
                                <thead className="text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800">
                                    <tr>
                                        <th className="px-4 py-3 w-10">
                                            <button onClick={() => selectAllUnpaid(getBillSchedule(selectedBill).map(s => ({dateStr: s.date.toISOString().split('T')[0], isPaid: s.isPaid})))} className="flex items-center justify-center">
                                                {getBillSchedule(selectedBill).some(s => !s.isPaid && selectedScheduleItems.includes(s.date.toISOString().split('T')[0])) ? <CheckSquare size={16} className="text-indigo-600"/> : <Square size={16} />}
                                            </button>
                                        </th>
                                        <th className="px-4 py-3">التاريخ</th>
                                        <th className="px-4 py-3">المبلغ</th>
                                        <th className="px-4 py-3">الحالة / إجراء</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getBillSchedule(selectedBill).map((item, idx) => (
                                        <tr key={idx} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${item.type === 'down_payment' ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''} ${selectedScheduleItems.includes(item.date.toISOString().split('T')[0]) ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
                                            <td className="px-4 py-3">
                                                {!item.isPaid && (
                                                    <button onClick={() => toggleSelection(item.date.toISOString().split('T')[0])} className="text-slate-400 hover:text-indigo-600">
                                                        {selectedScheduleItems.includes(item.date.toISOString().split('T')[0]) ? <CheckSquare size={16} className="text-indigo-600"/> : <Square size={16}/>}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {item.type === 'down_payment' && <span className="text-xs text-indigo-500 block">دفعة أولى</span>}
                                                {new Date(item.date).toLocaleDateString('en-GB')}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                                {item.amount.toLocaleString('en-US')}
                                            </td>
                                            <td className="px-4 py-3">
                                                {item.isPaid ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex items-center text-emerald-600 text-xs font-bold gap-1 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">
                                                            <CheckCircle size={12}/> مدفوع
                                                        </span>
                                                        <button 
                                                            onClick={() => initiateUndoPayment(selectedBill, item, item.amount)}
                                                            className="text-xs text-slate-400 hover:text-rose-500 underline"
                                                        >
                                                            تراجع
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button 
                                                        onClick={() => initiatePayment('bill', selectedBill, item, item.amount, new Date(item.date).toLocaleDateString('en-GB'))}
                                                        className="bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white px-3 py-1 rounded-lg text-xs font-bold hover:opacity-90"
                                                    >
                                                        سداد
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

      {/* Add Bill Modal - Restored and Enhanced */}
      {showAddBillModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => setShowAddBillModal(false)}
          >
              <div 
                className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-xl text-slate-900 dark:text-white">{editingBillId ? 'تعديل الفاتورة' : 'إضافة فاتورة/التزام'}</h3>
                      <button onClick={() => setShowAddBillModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500"><X size={20}/></button>
                  </div>

                  <form onSubmit={handleAddBill} className="space-y-4">
                        {/* Auto-fill from PDF */}
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800 mb-4">
                            <label className="flex items-center justify-between cursor-pointer w-full">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white dark:bg-indigo-900 rounded-lg flex items-center justify-center text-indigo-500">
                                        {isParsingBill ? <Loader2 className="animate-spin" size={20}/> : <FileText size={20}/>}
                                    </div>
                                    <div className="text-left">
                                        <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-200">تعبئة تلقائية من الفاتورة</h4>
                                        <p className="text-xs text-indigo-600 dark:text-indigo-400">ارفع ملف PDF وسيتم استخراج البيانات</p>
                                    </div>
                                </div>
                                <input type="file" accept=".pdf" onChange={handleBillPdfChange} className="hidden" />
                                <div className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">رفع</div>
                            </label>
                        </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1">نوع الالتزام</label>
                                <select 
                                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none dark:text-white"
                                    value={newBill.type}
                                    onChange={e => setNewBill({...newBill, type: e.target.value as any})}
                                >
                                    <option value="electricity">كهرباء</option>
                                    <option value="water">مياه</option>
                                    <option value="internet">انترنت / اتصالات</option>
                                    <option value="device_installment">أقساط أجهزة (جوالات..)</option>
                                    <option value="subscription">اشتراك دوري (نتفلكس..)</option>
                                    <option value="other">أخرى</option>
                                </select>
                          </div>
                          <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1">مزود الخدمة / الشركة</label>
                                <div className="relative">
                                    <input 
                                        type="text" required 
                                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none dark:text-white pl-12" 
                                        placeholder="مثال: STC, Tabby, Tamara..."
                                        value={newBill.provider}
                                        onChange={e => setNewBill({...newBill, provider: e.target.value})}
                                    />
                                    {newBill.icon && (
                                        <div className="absolute left-3 top-3 w-6 h-6 rounded-full overflow-hidden border border-slate-200 dark:border-slate-600">
                                            <img src={newBill.icon} alt="logo" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </div>
                          </div>

                          <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات / تفاصيل (اختياري)</label>
                                <input 
                                    type="text" 
                                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none dark:text-white" 
                                    placeholder="مثال: فاتورة المنزل القديم، رسوم اشتراك..."
                                    value={newBill.description}
                                    onChange={e => setNewBill({...newBill, description: e.target.value})}
                                />
                          </div>
                          
                          {/* Device Installment Specifics */}
                          {newBill.type === 'device_installment' && (
                              <div className="col-span-2">
                                  <label className="block text-xs font-bold text-slate-500 mb-1">تفاصيل الجهاز</label>
                                  <input 
                                      type="text" 
                                      className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none dark:text-white" 
                                      placeholder="مثال: iPhone 15 Pro Max"
                                      value={newBill.deviceDetails}
                                      onChange={e => setNewBill({...newBill, deviceDetails: e.target.value})}
                                  />
                              </div>
                          )}

                          <div className="col-span-2">
                              <label className="block text-xs font-bold text-slate-500 mb-1">القسط الشهري (المبلغ)</label>
                              <div className="relative">
                                  <input 
                                      type="number" step="0.01" required 
                                      className="w-full p-3 pl-12 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none font-bold text-lg dark:text-white" 
                                      placeholder="0.00"
                                      value={newBill.amount}
                                      onChange={e => setNewBill({...newBill, amount: e.target.value})}
                                  />
                                  <span className="absolute left-4 top-4 text-slate-400 text-xs font-bold">SAR</span>
                              </div>
                          </div>

                          <div className="col-span-2">
                              <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ البداية</label>
                              <input 
                                  type="date" required 
                                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none dark:text-white" 
                                  value={newBill.startDate}
                                  onChange={e => setNewBill({...newBill, startDate: e.target.value})}
                              />
                          </div>
                          
                          {newBill.type !== 'subscription' && (
                              <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                                  <div className="flex gap-4 mb-3">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                          <input 
                                              type="radio" name="endDateMode" 
                                              checked={newBill.endDateMode === 'months'} 
                                              onChange={() => setNewBill({...newBill, endDateMode: 'months'})} 
                                          />
                                          <span className="text-sm dark:text-slate-300">بالأشهر (المدة)</span>
                                      </label>
                                      <label className="flex items-center gap-2 cursor-pointer">
                                          <input 
                                              type="radio" name="endDateMode" 
                                              checked={newBill.endDateMode === 'date'} 
                                              onChange={() => setNewBill({...newBill, endDateMode: 'date'})} 
                                          />
                                          <span className="text-sm dark:text-slate-300">بتاريخ النهاية</span>
                                      </label>
                                  </div>
                                  
                                  {newBill.endDateMode === 'months' ? (
                                      <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">المدة (شهر)</label>
                                          <input 
                                              type="number" 
                                              className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 outline-none dark:text-white"
                                              placeholder="12, 24, 36..."
                                              value={newBill.duration}
                                              onChange={e => setNewBill({...newBill, duration: e.target.value})}
                                          />
                                      </div>
                                  ) : (
                                      <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ النهاية</label>
                                          <input 
                                              type="date" 
                                              className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 outline-none dark:text-white"
                                              value={newBill.endDate}
                                              onChange={e => setNewBill({...newBill, endDate: e.target.value})}
                                          />
                                      </div>
                                  )}
                              </div>
                          )}

                          {/* New Fields: Total Debt and Down Payment */}
                          {(newBill.type === 'device_installment' || newBill.endDateMode === 'months') && (
                              <>
                                 <div className="col-span-2 grid grid-cols-2 gap-4">
                                     <div>
                                         <label className="block text-xs font-bold text-slate-500 mb-1">الدفعة الأولى (مقدم)</label>
                                         <input 
                                              type="number" 
                                              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none dark:text-white"
                                              placeholder="0"
                                              value={newBill.downPayment}
                                              onChange={e => setNewBill({...newBill, downPayment: e.target.value})}
                                         />
                                     </div>
                                     <div>
                                         <label className="block text-xs font-bold text-slate-500 mb-1">إجمالي العقد/الدين</label>
                                         <input 
                                              type="number" 
                                              className="w-full p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 outline-none font-bold text-indigo-700 dark:text-indigo-300"
                                              placeholder="يحسب تلقائياً"
                                              value={newBill.totalDebt}
                                              onChange={e => setNewBill({...newBill, totalDebt: e.target.value})}
                                         />
                                     </div>
                                 </div>
                                 <div className="col-span-2">
                                     <button 
                                        type="button"
                                        onClick={() => handleOpenScheduleEditor('bill')}
                                        className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                     >
                                         <ListChecks size={16}/>
                                         تخصيص الدفعات يدوياً
                                     </button>
                                     <p className="text-[10px] text-slate-400 mt-1 text-center">يمكنك تعديل مبلغ كل شهر على حدة</p>
                                 </div>
                              </>
                          )}
                          
                          {/* Subscription Specifics */}
                          {newBill.type === 'subscription' && (
                              <div className="col-span-2">
                                  <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ التجديد القادم</label>
                                  <input 
                                      type="date" 
                                      className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none dark:text-white" 
                                      value={newBill.renewalDate}
                                      onChange={e => setNewBill({...newBill, renewalDate: e.target.value})}
                                  />
                              </div>
                          )}
                      </div>

                      <button type="submit" disabled={isProcessing} className="w-full bg-emerald-600 dark:bg-[#bef264] text-white dark:text-slate-900 py-4 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
                          {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                          {editingBillId ? 'تحديث الفاتورة' : 'حفظ الفاتورة'}
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* Manual Schedule Editor Modal (Shared for Loan and Bill) */}
      {showScheduleEditor && (
          <div 
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => setShowScheduleEditor(false)}
          >
              <div 
                className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-scale-in max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                   <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white">تعديل جدول الدفعات</h3>
                      <button onClick={() => setShowScheduleEditor(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500"><X size={20}/></button>
                  </div>
                  
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl mb-4 border border-indigo-100 dark:border-indigo-800">
                      <p className="text-xs text-indigo-800 dark:text-indigo-300 mb-2 font-bold">تطبيق مبلغ موحد على الجميع</p>
                      <div className="flex gap-2">
                          <input type="number" id="applyAllAmount" className="flex-1 p-2 rounded-lg border border-indigo-200 dark:border-indigo-700 outline-none text-sm dark:bg-slate-800 dark:text-white" placeholder="المبلغ..." />
                          <button 
                            type="button" 
                            onClick={() => {
                                const val = parseFloat((document.getElementById('applyAllAmount') as HTMLInputElement).value);
                                if (val > 0) applyToAll(val);
                            }}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700"
                          >
                              تطبيق
                          </button>
                      </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                      {manualSchedule.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg">
                              <span className="text-xs text-slate-500 w-8 font-bold">{idx + 1}</span>
                              <span className="text-xs text-slate-400 w-24">{new Date(item.date).toLocaleDateString('en-GB')}</span>
                              <input 
                                  type="number" 
                                  value={item.amount} 
                                  onChange={(e) => updateManualInstallment(idx, parseFloat(e.target.value))}
                                  className="flex-1 p-1 bg-transparent border-b border-slate-300 dark:border-slate-600 outline-none font-bold text-slate-800 dark:text-white text-center"
                              />
                              <span className="text-xs text-slate-400">SAR</span>
                          </div>
                      ))}
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <div>
                          <p className="text-xs text-slate-500">الإجمالي الجديد</p>
                          <p className="font-bold text-lg text-slate-900 dark:text-white">{manualSchedule.reduce((a,c)=>a+c.amount,0).toFixed(2)}</p>
                      </div>
                      <button onClick={confirmManualSchedule} className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors">
                          اعتماد الجدول
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {/* Add Loan Modal (Restored) */}
      {showAddModal && (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => setShowAddModal(false)}
        >
             <div 
                className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-6 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <h3 className="font-bold text-xl text-slate-800 dark:text-white">
                        {isEditing ? 'تعديل القرض / الالتزام' : 'إضافة قرض جديد'}
                    </h3>
                    <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500">
                        <X size={24}/>
                    </button>
                </div>
                
                <form onSubmit={handleAddLoan} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                             <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">جهة التمويل (اسم البنك)</label>
                             <div className="relative">
                                <input 
                                    type="text" required 
                                    list="lenders"
                                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white font-bold"
                                    placeholder="اختر أو اكتب اسم البنك..."
                                    value={newLoan.name}
                                    onChange={e => setNewLoan({...newLoan, name: e.target.value})}
                                />
                                <datalist id="lenders">
                                    {SAUDI_LENDERS.map(l => <option key={l} value={l} />)}
                                </datalist>
                             </div>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الغرض من القرض / التفاصيل</label>
                            <input 
                                type="text" 
                                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                                placeholder="مثال: ترميم منزل، شراء سيارة، تمويل شخصي..."
                                value={newLoan.description}
                                onChange={e => setNewLoan({...newLoan, description: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">إجمالي المبلغ (شامل الأرباح)</label>
                            <input 
                                type="text" required 
                                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white font-bold text-lg"
                                placeholder="0.00"
                                value={newLoan.amount}
                                onChange={e => setNewLoan({...newLoan, amount: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">إجمالي الربح (اختياري)</label>
                            <input 
                                type="text"
                                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                                placeholder="0.00"
                                value={newLoan.rate}
                                onChange={e => setNewLoan({...newLoan, rate: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">المدة (أشهر)</label>
                            <input 
                                type="number" required 
                                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                                placeholder="60"
                                value={newLoan.duration}
                                onChange={e => setNewLoan({...newLoan, duration: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">تاريخ البداية</label>
                            <input 
                                type="date" required 
                                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white"
                                value={newLoan.startDate}
                                onChange={e => setNewLoan({...newLoan, startDate: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                         <div className="flex justify-between items-center mb-2">
                             <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">خيارات متقدمة</h4>
                             <button type="button" onClick={() => handleOpenScheduleEditor('loan')} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100">تخصيص الدفعات يدوياً</button>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">الدفعة الأخيرة (إن وجدت)</label>
                                <input type="number" className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 outline-none" placeholder="0.00" value={newLoan.lastPaymentAmount} onChange={e => setNewLoan({...newLoan, lastPaymentAmount: e.target.value})} />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">مبلغ تم سداده مسبقاً</label>
                                <input type="number" className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 outline-none" placeholder="0.00" value={newLoan.initialPaidAmount} onChange={e => setNewLoan({...newLoan, initialPaidAmount: e.target.value})} />
                             </div>
                         </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">أيقونة</label>
                        <IconPicker selected={newLoan.icon} onSelect={(icon) => setNewLoan({...newLoan, icon})} />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                         {isEditing && (
                             <button type="button" onClick={handleDeleteLoan} disabled={isDeleting} className="px-4 py-3 bg-rose-50 text-rose-600 rounded-xl font-bold hover:bg-rose-100 transition-colors">
                                 {isDeleting ? <Loader2 className="animate-spin"/> : <Trash2 size={20}/>}
                             </button>
                         )}
                        <button type="submit" disabled={isProcessing} className="flex-1 bg-emerald-600 dark:bg-[#bef264] text-white dark:text-slate-900 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
                            {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={18}/>}
                            {isEditing ? 'حفظ التغييرات' : 'إضافة القرض'}
                        </button>
                    </div>
                </form>
             </div>
        </div>
      )}

      {/* Payment Modal (Shared) */}
      {paymentModal.isOpen && (
        <div 
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => setPaymentModal({...paymentModal, isOpen: false})}
        >
             <div 
                className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-scale-in"
                onClick={(e) => e.stopPropagation()}
             >
                 <div className="text-center mb-6">
                     <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${paymentModal.type === 'refund' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                         {paymentModal.type === 'refund' ? <RotateCcw size={32}/> : <CheckCircle size={32}/>}
                     </div>
                     <h3 className="font-bold text-xl text-slate-900 dark:text-white">{paymentModal.title}</h3>
                     <p className="text-sm text-slate-500 mt-1">{paymentModal.amount.toLocaleString('en-US')} SAR</p>
                 </div>
                 
                 <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl mb-6">
                     <label className="block text-xs font-bold text-slate-500 mb-2">
                        {paymentModal.type === 'refund' ? 'استرجاع إلى' : 'خصم من'}
                     </label>
                     <select 
                        className="w-full p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg outline-none text-sm"
                        value={selectedPaymentCardId}
                        onChange={e => setSelectedPaymentCardId(e.target.value)}
                     >
                         {settings.cards.map(c => (
                             <option key={c.id} value={c.id}>{c.bankName} - {c.cardNumber} ({c.balance?.toLocaleString()} SAR)</option>
                         ))}
                         <option value="cash">نقدي / أخرى</option>
                     </select>
                 </div>

                 <div className="flex gap-3">
                     <button onClick={() => setPaymentModal({...paymentModal, isOpen: false})} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold">إلغاء</button>
                     <button onClick={confirmPayment} disabled={isProcessing} className="flex-1 py-3 bg-emerald-600 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold flex justify-center items-center gap-2">
                         {isProcessing && <Loader2 className="animate-spin" size={16}/>}
                         {paymentModal.type === 'refund' ? 'تأكيد التراجع' : 'تأكيد السداد'}
                     </button>
                 </div>
             </div>
        </div>
      )}
      
      {/* Smart Import Modal */}
      {showSmartModal && (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => setShowSmartModal(false)}
        >
             <div 
                className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                 <div className="flex justify-between items-center mb-4">
                     <h3 className="font-bold text-xl text-slate-800 dark:text-white flex items-center gap-2"><Sparkles className="text-indigo-500"/> استيراد ذكي</h3>
                     <button onClick={() => setShowSmartModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500"><X size={20}/></button>
                 </div>
                 <div className="space-y-4">
                     <div>
                         <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">لصق نص من تطبيق البنك / العقد</label>
                         <textarea 
                             className="w-full h-32 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white text-sm"
                             placeholder="مثال: تمويل شخصي بمبلغ 100,000 ريال، القسط الشهري 1,850 ريال..."
                             value={smartText}
                             onChange={e => setSmartText(e.target.value)}
                         />
                     </div>
                     <div className="flex items-center gap-2 text-xs text-slate-400">
                         <span className="bg-slate-200 dark:bg-slate-700 w-full h-[1px]"></span>
                         <span>أو</span>
                         <span className="bg-slate-200 dark:bg-slate-700 w-full h-[1px]"></span>
                     </div>
                     <div>
                         <label className="flex items-center justify-center w-full h-16 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                             <div className="flex items-center gap-2 text-slate-500">
                                 <UploadCloud size={20}/>
                                 <span className="text-sm font-bold">رفع صورة العقد / الجدول (PDF/Image)</span>
                             </div>
                             <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileChange} />
                         </label>
                         {fileName && <p className="text-xs text-emerald-600 mt-2 text-center font-bold">{fileName}</p>}
                     </div>
                     <button 
                         onClick={handleSmartImport}
                         disabled={isParsing || (!smartText && !newLoan.contractPdf)}
                         className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                     >
                         {isParsing ? <Loader2 className="animate-spin"/> : <Wand2 size={18}/>}
                         {isParsing ? 'جاري التحليل...' : 'تحليل واستخراج البيانات'}
                     </button>
                 </div>
             </div>
        </div>
      )}

    </div>
  );
};

export default LoansPage;