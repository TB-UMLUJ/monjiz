

import React, { useState, useRef } from 'react';
import { Transaction, TransactionType, UserSettings, ReceiptItem, DEFAULT_CATEGORIES } from '../types';
import { storageService } from '../services/storage';
import { parseTransactionFromSMS, parseReceiptFromImage } from '../services/geminiService';
import { Trash2, Search, ArrowDownLeft, ArrowUpRight, Edit3, Save, X, Loader2, MessageSquarePlus, Wand2, Sparkles, CreditCard, AlertTriangle, Plus, Globe, Receipt, FileText, Tag, Hash, Camera, Video, ScanLine } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';
import { useSuccess } from '../contexts/SuccessContext';

interface TransactionsProps {
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings | null>>;
}

const Transactions: React.FC<TransactionsProps> = ({ transactions, setTransactions, settings, setSettings }) => {
  const { notify } = useNotification();
  const { showSuccess } = useSuccess();
  const [filter, setFilter] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Modal & Details State
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false); // New state for Add/Edit Modal

  // AI Smart Import State
  const [showSmartModal, setShowSmartModal] = useState(false);
  const [smartSmsText, setSmartSmsText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Scanner Modal State
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formTx, setFormTx] = useState({
    amount: '',
    category: '',
    note: '',
    type: TransactionType.EXPENSE,
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().split(' ')[0].substring(0, 5),
    cardId: '',
    // Detailed Fields
    merchant: '',
    fee: '',
    transactionReference: '',
    operationKind: '',
    country: '',
    paymentMethod: '',
    items: [] as ReceiptItem[]
  });

  // Combine Default and Custom Categories
  const categories = [...DEFAULT_CATEGORIES, ...(settings.customCategories?.map(c => c.name) || [])];

  const operationKinds = [
    "شراء عبر الإنترنت",
    "شراء نقاط بيع (POS)",
    "شراء مباشر",
    "حوالة داخلية واردة",
    "حوالة داخلية صادرة",
    "حوالة محلية صادرة",
    "سداد بطاقة ائتمانية",
    "تحويل بطاقة ائتمانية",
    "سحب نقدي",
    "إيداع نقدي",
    "أخرى"
  ];

  const resetForm = () => {
    const now = new Date();
    setFormTx({
      amount: '',
      category: '',
      note: '',
      type: TransactionType.EXPENSE,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0].substring(0, 5),
      cardId: '',
      merchant: '',
      fee: '',
      transactionReference: '',
      operationKind: '',
      country: '',
      paymentMethod: '',
      items: []
    });
    setEditingId(null);
  };

  const handleOpenAddModal = () => {
      resetForm();
      setShowAddModal(true);
  };

  const handleEdit = (e: React.MouseEvent, tx: Transaction) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(tx.id);
    
    const txDate = new Date(tx.date);
    
    setFormTx({
      amount: tx.amount.toString(),
      category: tx.category,
      note: tx.note || '',
      type: tx.type,
      date: txDate.toISOString().split('T')[0],
      time: txDate.toTimeString().split(' ')[0].substring(0, 5),
      cardId: tx.cardId || '',
      merchant: tx.merchant || '',
      fee: tx.fee ? tx.fee.toString() : '',
      transactionReference: tx.transactionReference || '',
      operationKind: tx.operationKind || '',
      country: tx.country || '',
      paymentMethod: tx.paymentMethod || '',
      items: tx.items || []
    });
    setShowAddModal(true); // Open modal for editing
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTx.amount || !formTx.category) return;
    setIsProcessing(true);

    try {
      let finalCardId = formTx.cardId;
      // Combine Date and Time
      const combinedDateTime = new Date(`${formTx.date}T${formTx.time}:00`).toISOString();

      // Append items list to note if items exist
      let finalNote = formTx.note;
      if (formTx.items && formTx.items.length > 0) {
          const itemsStr = formTx.items.map(i => `- ${i.name} (${i.price})`).join('\n');
          finalNote = finalNote ? `${finalNote}\n\nالأصناف:\n${itemsStr}` : `الأصناف:\n${itemsStr}`;
      }

      if (editingId) {
        // Edit Mode
        const updatedTx: Transaction = {
          id: editingId,
          amount: parseFloat(formTx.amount),
          category: formTx.category,
          type: formTx.type,
          note: finalNote,
          date: combinedDateTime,
          cardId: finalCardId || undefined,
          merchant: formTx.merchant || undefined,
          fee: formTx.fee ? parseFloat(formTx.fee) : 0,
          transactionReference: formTx.transactionReference || undefined,
          operationKind: formTx.operationKind || undefined,
          country: formTx.country || undefined,
          paymentMethod: formTx.paymentMethod || undefined,
          items: formTx.items || undefined
        };
        await storageService.updateTransaction(updatedTx);
        notify('تم تعديل العملية بنجاح', 'success');
      } else {
        // Create Mode
        const amount = parseFloat(formTx.amount);
        const fee = formTx.fee ? parseFloat(formTx.fee) : 0;
        
        // Update Balance Logic
        if (formTx.cardId) {
            const cardIndex = settings.cards.findIndex(c => c.id === formTx.cardId);
            if (cardIndex > -1) {
                const updatedCards = [...settings.cards];
                const card = updatedCards[cardIndex];
                const currentBal = card.balance || 0;
                
                // Expense: Subtract (Amount + Fee) / Income: Add
                let newBalance = currentBal;
                if (formTx.type === TransactionType.EXPENSE) {
                    newBalance = currentBal - amount - fee;
                } else {
                    newBalance = currentBal + amount;
                }

                updatedCards[cardIndex] = {
                    ...card,
                    balance: newBalance
                };
                
                const newSettings = { ...settings, cards: updatedCards };
                const savedSettings = await storageService.saveSettings(newSettings);
                setSettings(savedSettings);
            }
        }

        const tx: Transaction = {
          id: '', // Supabase generated
          amount: amount,
          category: formTx.category,
          type: formTx.type,
          note: finalNote,
          date: combinedDateTime,
          cardId: finalCardId || undefined,
          merchant: formTx.merchant || undefined,
          fee: fee,
          transactionReference: formTx.transactionReference || undefined,
          operationKind: formTx.operationKind || undefined,
          country: formTx.country || undefined,
          paymentMethod: formTx.paymentMethod || undefined,
          items: formTx.items || undefined
        };

        await storageService.saveTransaction(tx);
        showSuccess('تم إضافة العملية!', 'تم تسجيل العملية وتحديث الرصيد بنجاح.');
      }
      
      // Refresh Data
      const fresh = await storageService.getTransactions();
      setTransactions(fresh);
      resetForm();
      setShowAddModal(false); // Close Modal
    } catch (e) {
      console.error(e);
      notify('حدث خطأ أثناء حفظ العملية', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSmartSmsSubmit = async () => {
    if (!smartSmsText) return;
    setIsAnalyzing(true);

    try {
      const parsed = await parseTransactionFromSMS(smartSmsText);
      
      if (parsed) {
         let matchedCardId = '';
         let cardName = 'بطاقة غير محددة';
         let cardIndex = -1;
         
         if (parsed.cardLast4) {
             const cleanLast4 = parsed.cardLast4.replace(/\D/g, '');
             cardIndex = settings.cards.findIndex(c => 
                 (c.cardNumber && c.cardNumber.endsWith(cleanLast4)) || 
                 (c.accountLast4 && c.accountLast4.endsWith(cleanLast4))
             );

             if (cardIndex > -1) {
                 const card = settings.cards[cardIndex];
                 matchedCardId = card.id;
                 cardName = `${card.bankName} (...${cleanLast4})`;
             }
         }

         const mainAmount = parsed.amount;
         const feeAmount = parsed.fee || 0;
         
         if (cardIndex > -1) {
             const updatedCards = [...settings.cards];
             const card = updatedCards[cardIndex];
             const currentBal = card.balance || 0;
             let newBalance = currentBal;

             if (parsed.newBalance !== undefined && parsed.newBalance !== null) {
                 // Use exact balance from SMS
                 newBalance = parsed.newBalance;
             } else {
                 // Fallback to calculation
                 if (parsed.type === TransactionType.EXPENSE) {
                     newBalance -= (mainAmount + feeAmount);
                 } else {
                     newBalance += mainAmount - feeAmount;
                 }
             }

             updatedCards[cardIndex] = { ...card, balance: newBalance };
             const newSettings = { ...settings, cards: updatedCards };
             const savedSettings = await storageService.saveSettings(newSettings);
             setSettings(savedSettings);
         }

         // Enhanced Transaction Object
         const notePrefix = parsed.type === TransactionType.EXPENSE ? 'إلى:' : 'من:';
         const newTx: Transaction = {
            id: '',
            amount: mainAmount,
            type: parsed.type,
            category: parsed.category,
            date: parsed.date || new Date().toISOString(),
            note: `${notePrefix} ${parsed.merchant}`, // Use Correct prefix
            cardId: matchedCardId || undefined,
            // New Fields
            merchant: parsed.merchant,
            fee: parsed.fee,
            balanceAfter: parsed.newBalance || undefined,
            transactionReference: parsed.transactionReference,
            operationKind: parsed.operationKind,
            cardLast4: parsed.cardLast4,
            country: parsed.country,
            paymentMethod: parsed.paymentMethod
         };
         await storageService.saveTransaction(newTx);

         const fresh = await storageService.getTransactions();
         setTransactions(fresh);
         
         setShowSmartModal(false);
         setSmartSmsText('');

         showSuccess(`تم إضافة العملية`, `تم تسجيل "${parsed.merchant}" بقيمة ${parsed.amount} ريال على ${cardName}`);

      } else {
         notify('لم نتمكن من تحليل النص، يرجى التأكد من الصيغة', 'warning');
      }
    } catch (e) {
       console.error(e);
       notify('حدث خطأ أثناء المعالجة الذكية', 'error');
    } finally {
       setIsAnalyzing(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDeletingId(id);
    try {
      // 1. Get transaction details before deleting
      const txToDelete = transactions.find(t => t.id === id);
      
      // 2. Reverse Balance Logic
      if (txToDelete && txToDelete.cardId) {
          const cardIndex = settings.cards.findIndex(c => c.id === txToDelete.cardId);
          if (cardIndex > -1) {
              const updatedCards = [...settings.cards];
              const card = updatedCards[cardIndex];
              const currentBal = card.balance || 0;
              const fee = txToDelete.fee || 0;
              
              // Reverse Logic: 
              // If it was Expense, we ADD it back. 
              // If it was Income, we SUBTRACT it.
              const newBalance = txToDelete.type === TransactionType.EXPENSE 
                  ? currentBal + txToDelete.amount + fee
                  : currentBal - txToDelete.amount;

              updatedCards[cardIndex] = {
                  ...card,
                  balance: newBalance
              };
              
              const newSettings = { ...settings, cards: updatedCards };
              const savedSettings = await storageService.saveSettings(newSettings);
              setSettings(savedSettings);
              notify('تم استرجاع المبلغ وتحديث رصيد البطاقة', 'info');
          }
      }

      await storageService.deleteTransaction(id);
      const fresh = await storageService.getTransactions();
      setTransactions(fresh);
      if (editingId === id) resetForm();
      setShowAddModal(false);
      notify('تم حذف العملية', 'info');
    } catch(e) {
      console.error(e);
      notify('حدث خطأ أثناء الحذف', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // --- Camera Logic ---
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } // Prefer back camera
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setShowScannerModal(true);
    } catch (err) {
      console.error(err);
      notify("فشل الوصول للكاميرا", "error");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureImage = () => {
      if (!videoRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setCapturedImage(dataUrl);
          stopCamera();
      }
  };

  const analyzeReceipt = async () => {
      if (!capturedImage) return;
      setIsScanning(true);
      try {
          const parsed = await parseReceiptFromImage(capturedImage);
          if (parsed) {
              setFormTx(prev => ({
                  ...prev,
                  amount: parsed.total.toString(),
                  merchant: parsed.merchant,
                  date: parsed.date,
                  category: parsed.category || 'تسوق',
                  note: `إيصال: ${parsed.merchant}`,
                  items: parsed.items
              }));
              setShowScannerModal(false);
              setCapturedImage(null);
              setShowAddModal(true); // Open edit modal with filled data
              notify('تم استخراج بيانات الإيصال بنجاح', 'success');
          } else {
              notify('لم يتمكن من قراءة الإيصال بوضوح', 'warning');
          }
      } catch (e) {
          console.error(e);
          notify('حدث خطأ أثناء تحليل الإيصال', 'error');
      } finally {
          setIsScanning(false);
      }
  };

  const closeScanner = () => {
      stopCamera();
      setCapturedImage(null);
      setShowScannerModal(false);
  };

  const filteredData = transactions.filter(t => 
    t.category.includes(filter) || 
    t.note?.includes(filter) ||
    t.merchant?.includes(filter)
  );

  return (
    <div className="animate-fade-in pb-20 md:pb-0 max-w-5xl mx-auto">
      
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
                <Search className="absolute right-3 top-3.5 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="بحث في العمليات (التاجر، الملاحظات)..." 
                  className="w-full pr-10 pl-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 dark:text-slate-200 transition-all shadow-sm"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                />
          </div>
          <div className="grid grid-cols-2 md:flex gap-3 w-full md:w-auto">
               <button 
                  onClick={() => setShowSmartModal(true)}
                  className="bg-white dark:bg-slate-900 text-slate-700 dark:text-white border border-slate-200 dark:border-slate-800 px-4 py-3 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <Sparkles size={16} className="text-violet-500" />
                  <span className="hidden md:inline">تسجيل ذكي</span>
                  <span className="md:hidden">SMS</span>
                </button>
               <button 
                  onClick={startCamera}
                  className="bg-white dark:bg-slate-900 text-slate-700 dark:text-white border border-slate-200 dark:border-slate-800 px-4 py-3 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
               >
                  <Camera size={16} className="text-blue-500" />
                  <span className="hidden md:inline">ماسح الإيصالات</span>
                  <span className="md:hidden">مسح</span>
               </button>
               <button 
                  onClick={handleOpenAddModal}
                  className="col-span-2 md:col-span-1 bg-emerald-600 dark:bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 dark:hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg hover:shadow-xl shadow-slate-900/10"
                >
                  <Plus size={18} />
                  <span>إضافة عملية</span>
                </button>
          </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden min-h-[500px]">
          <div className="space-y-2 md:space-y-0 md:divide-y md:divide-slate-50 md:dark:divide-slate-800">
            {filteredData.map((tx, index) => (
              <div 
                key={tx.id}
                onClick={() => setSelectedTx(tx)}
                className="p-4 flex items-center justify-between gap-3 transition-colors animate-slide-up relative cursor-pointer group border-b border-slate-100 dark:border-slate-800 md:border-0 rounded-none hover:bg-slate-50 dark:hover:bg-slate-800/50"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* DETAILS FIRST (Right side in RTL) */}
                <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                    <div className={`p-3 rounded-full shrink-0 ${tx.type === TransactionType.INCOME ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'}`}>
                      {tx.type === TransactionType.INCOME ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm md:text-base leading-snug">
                              {tx.merchant ? tx.merchant : (tx.note || tx.category)}
                          </h4>
                          {tx.operationKind && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 whitespace-nowrap shrink-0">{tx.operationKind}</span>}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                         <span>{new Date(tx.date).toLocaleDateString('en-GB')}</span>
                         {tx.category && (tx.category !== (tx.merchant || tx.note)) && (
                             <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                                {tx.category}
                             </span>
                         )}
                         {(tx.merchant && tx.note) && <span className="text-slate-500 dark:text-slate-500 line-clamp-1">• {tx.note}</span>}
                      </div>
                      
                      {tx.cardId && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-slate-500 dark:text-slate-400 text-[10px] bg-slate-100 dark:bg-slate-800 w-fit px-2 py-0.5 rounded-full font-sans">
                            <CreditCard size={10} />
                            <span>{settings.cards.find(c => c.id === tx.cardId)?.bankName} •• {settings.cards.find(c => c.id === tx.cardId)?.cardNumber}</span>
                        </div>
                      )}
                    </div>
                </div>

                 {/* AMOUNT SECOND (Left side in RTL) */}
                 <div className="text-left shrink-0" dir="ltr">
                    <span className={`font-bold text-base md:text-lg block ${tx.type === TransactionType.INCOME ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}>
                    {tx.type === TransactionType.INCOME ? '+' : '-'}{tx.amount.toLocaleString('en-US')}
                    </span>
                    {(tx.fee || 0) > 0 && <span className="text-[10px] text-rose-500 block text-right">رسوم: {Number(tx.fee).toFixed(2)}</span>}
                </div>
              </div>
            ))}
            {filteredData.length === 0 && (
               <div className="p-12 text-center text-slate-400 animate-fade-in flex flex-col items-center gap-3">
                 <Search size={48} className="opacity-20"/>
                 <p>لا توجد عمليات تطابق البحث.</p>
                 <button onClick={handleOpenAddModal} className="text-emerald-600 font-bold text-sm hover:underline">إضافة عملية جديدة</button>
               </div>
            )}
          </div>
      </div>
      
      {/* Add / Edit Transaction Modal */}
      {showAddModal && (
        <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => setShowAddModal(false)}
        >
             <div 
                className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-6 shadow-2xl animate-scale-in border border-slate-200 dark:border-slate-800 max-h-[95vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
             >
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <h3 className="font-bold text-xl text-eerie-black dark:text-white">
                        {editingId ? 'تعديل العملية' : 'تسجيل عملية'}
                    </h3>
                    <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition-colors">
                        <X size={24}/>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4">
                        <button
                        type="button"
                        onClick={() => setFormTx({...formTx, type: TransactionType.EXPENSE})}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 ${formTx.type === TransactionType.EXPENSE ? 'bg-white dark:bg-slate-700 text-rose-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                        مصروف / فاتورة
                        </button>
                        <button
                        type="button"
                        onClick={() => setFormTx({...formTx, type: TransactionType.INCOME})}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 ${formTx.type === TransactionType.INCOME ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                        دخل / إيداع
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Amount & Fee */}
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">المبلغ</label>
                            <div className="relative">
                                <input 
                                type="number" step="0.01" required autoFocus
                                className="w-full p-3 pl-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg text-slate-900 dark:text-white transition-all"
                                placeholder="0.00"
                                value={formTx.amount}
                                onChange={e => setFormTx({...formTx, amount: e.target.value})}
                                />
                                <span className="absolute left-4 top-4 text-slate-400 text-xs font-bold">SAR</span>
                            </div>
                        </div>
                        <div className="col-span-1">
                             <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الرسوم (اختياري)</label>
                             <div className="relative">
                                <input 
                                type="number" step="0.01"
                                className="w-full p-3 pl-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-rose-500 outline-none font-bold text-slate-900 dark:text-white transition-all"
                                placeholder="0.00"
                                value={formTx.fee}
                                onChange={e => setFormTx({...formTx, fee: e.target.value})}
                                />
                                <span className="absolute left-4 top-4 text-slate-400 text-xs font-bold">SAR</span>
                             </div>
                        </div>

                        {/* Merchant */}
                        <div className="col-span-2">
                             <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الطرف الآخر (التاجر / المستفيد / المرسل)</label>
                             <div className="relative">
                                <Tag className="absolute right-3 top-3.5 text-slate-400" size={18}/>
                                <input 
                                    type="text" 
                                    className="w-full p-3 pr-10 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 dark:text-white transition-all font-medium"
                                    placeholder={formTx.type === TransactionType.EXPENSE ? "مثل: سوبرماركت، محطة وقود، محمد..." : "مثل: شركة، مكافأة..."}
                                    value={formTx.merchant}
                                    onChange={e => setFormTx({...formTx, merchant: e.target.value})}
                                />
                             </div>
                        </div>

                        {/* Category & Operation Kind */}
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">التصنيف</label>
                            <select 
                            required
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-300 transition-all font-medium"
                            value={formTx.category}
                            onChange={e => setFormTx({...formTx, category: e.target.value})}
                            >
                            <option value="">اختر تصنيف...</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="col-span-1">
                             <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">نوع العملية (تفصيلي)</label>
                             <select 
                                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-300 transition-all font-medium"
                                value={formTx.operationKind}
                                onChange={e => setFormTx({...formTx, operationKind: e.target.value})}
                             >
                                <option value="">-- نوع العملية --</option>
                                {operationKinds.map(k => <option key={k} value={k}>{k}</option>)}
                             </select>
                        </div>
                        
                        {/* Card & Payment Method */}
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الحساب / البطاقة</label>
                            <select 
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-300 transition-all text-sm font-medium"
                            value={formTx.cardId}
                            onChange={e => setFormTx({...formTx, cardId: e.target.value})}
                            >
                            <option value="">-- نقدي / غير محدد --</option>
                            {settings.cards.map(c => <option key={c.id} value={c.id}>{c.bankName} - {c.cardNumber}</option>)}
                            </select>
                        </div>
                        <div className="col-span-1">
                             <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">وسيلة الدفع</label>
                             <input 
                                type="text"
                                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-300 transition-all text-sm"
                                placeholder="مثل: Apple Pay, Mada..."
                                value={formTx.paymentMethod}
                                onChange={e => setFormTx({...formTx, paymentMethod: e.target.value})}
                             />
                        </div>

                        {/* Date & Time */}
                        <div className="col-span-1">
                             <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">التاريخ</label>
                             <input type="date" required className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl outline-none dark:text-white" value={formTx.date} onChange={e => setFormTx({...formTx, date: e.target.value})} />
                        </div>
                        <div className="col-span-1">
                             <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الوقت</label>
                             <input type="time" required className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl outline-none dark:text-white" value={formTx.time} onChange={e => setFormTx({...formTx, time: e.target.value})} />
                        </div>

                        {/* Extra Details */}
                        <div className="col-span-1">
                             <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">الدولة</label>
                             <div className="relative">
                                <Globe className="absolute right-3 top-3.5 text-slate-400" size={16}/>
                                <input type="text" className="w-full p-3 pr-10 bg-slate-50 dark:bg-slate-800 border-none rounded-xl outline-none dark:text-white text-sm" placeholder="اختياري" value={formTx.country} onChange={e => setFormTx({...formTx, country: e.target.value})} />
                             </div>
                        </div>
                        <div className="col-span-1">
                             <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">رقم مرجعي</label>
                             <div className="relative">
                                <Hash className="absolute right-3 top-3.5 text-slate-400" size={16}/>
                                <input type="text" className="w-full p-3 pr-10 bg-slate-50 dark:bg-slate-800 border-none rounded-xl outline-none dark:text-white text-sm" placeholder="اختياري" value={formTx.transactionReference} onChange={e => setFormTx({...formTx, transactionReference: e.target.value})} />
                             </div>
                        </div>

                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">ملاحظات إضافية</label>
                            <input 
                            type="text" 
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-300 transition-all text-sm"
                            placeholder="وصف مختصر..."
                            value={formTx.note}
                            onChange={e => setFormTx({...formTx, note: e.target.value})}
                            />
                        </div>

                        {/* Items List (If scanned) */}
                        {formTx.items && formTx.items.length > 0 && (
                            <div className="col-span-2 bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800">
                                <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-2">الأصناف المستخرجة:</h4>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {formTx.items.map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                                            <span>{item.name}</span>
                                            <span className="font-bold">{item.price}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 flex gap-3 border-t border-slate-100 dark:border-slate-800 mt-2">
                         {editingId && (
                             <button 
                                type="button"
                                onClick={(e) => handleDelete(e, editingId)}
                                className="px-4 py-3 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl font-bold transition-colors"
                             >
                                 <Trash2 size={20}/>
                             </button>
                         )}
                        <button type="submit" disabled={isProcessing} className={`flex-1 text-white dark:text-slate-900 py-3 rounded-xl font-bold transition-all transform active:scale-95 shadow-lg flex items-center justify-center gap-2 ${editingId ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-600 dark:bg-[#bef264] hover:bg-emerald-700 dark:hover:bg-[#a3e635]'}`}>
                        {isProcessing ? <Loader2 className="animate-spin" /> : (editingId ? <><Save size={18}/> تحديث العملية</> : <><Plus size={18}/> حفظ العملية</>)}
                        </button>
                    </div>
                </form>
             </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTx && !showAddModal && (
        <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => { setSelectedTx(null); setShowDeleteConfirm(false); }}
        >
            <div 
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl animate-scale-in border border-slate-200 dark:border-slate-800"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start">
                    <div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${selectedTx.type === TransactionType.INCOME ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                            {selectedTx.type === TransactionType.INCOME ? 'دخل' : 'مصروف'}
                        </span>
                        <h3 className="font-bold text-2xl text-slate-800 dark:text-white mt-2 leading-snug">{selectedTx.merchant || selectedTx.category}</h3>
                        <p className="text-xs text-slate-500 mt-1">{selectedTx.operationKind || selectedTx.category}</p>
                    </div>
                    <button onClick={() => { setSelectedTx(null); setShowDeleteConfirm(false); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500"><X size={20}/></button>
                </div>
                
                {/* Body */}
                <div className="p-6 space-y-4">
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-sm text-slate-500 dark:text-slate-400">المبلغ</span>
                        <div className="text-right">
                             <span className={`font-bold text-2xl ${selectedTx.type === TransactionType.INCOME ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                                {selectedTx.type === TransactionType.INCOME ? '+' : '-'}{selectedTx.amount.toLocaleString('en-US')} SAR
                             </span>
                             {(selectedTx.fee || 0) > 0 && (
                                 <p className="text-xs text-rose-500 font-bold mt-1"> + رسوم: {Number(selectedTx.fee).toFixed(2)} SAR</p>
                             )}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                         <div>
                            <p className="text-slate-400 text-xs">التاريخ</p>
                            <p className="font-bold dark:text-slate-200">{new Date(selectedTx.date).toLocaleString('ar-SA', { dateStyle: 'full', timeStyle: 'short' })}</p>
                         </div>
                         {selectedTx.country && (
                             <div>
                                <p className="text-slate-400 text-xs">الدولة</p>
                                <p className="font-bold dark:text-slate-200 flex items-center gap-1"><Globe size={12}/> {selectedTx.country}</p>
                             </div>
                         )}
                         {selectedTx.cardId && settings.cards.find(c => c.id === selectedTx.cardId) && (
                             <div className="col-span-2">
                                <p className="text-slate-400 text-xs">البطاقة المستخدمة</p>
                                <p className="font-bold dark:text-slate-200 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg w-fit mt-1">
                                    <CreditCard size={14}/>
                                    {settings.cards.find(c => c.id === selectedTx.cardId)?.bankName} •••• {settings.cards.find(c => c.id === selectedTx.cardId)?.cardNumber}
                                </p>
                            </div>
                         )}
                         {selectedTx.paymentMethod && (
                             <div>
                                <p className="text-slate-400 text-xs">وسيلة الدفع</p>
                                <p className="font-bold dark:text-slate-200">{selectedTx.paymentMethod}</p>
                             </div>
                         )}
                         {selectedTx.transactionReference && (
                             <div className="col-span-2">
                                <p className="text-slate-400 text-xs">رقم مرجعي</p>
                                <p className="font-mono text-xs bg-slate-100 dark:bg-slate-800 p-1 rounded w-fit">{selectedTx.transactionReference}</p>
                             </div>
                         )}
                    </div>

                     {selectedTx.note && (
                        <div className="text-sm bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-900/30">
                            <p className="text-amber-800 dark:text-amber-500 font-bold text-xs mb-1">ملاحظة</p>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{selectedTx.note}</p>
                        </div>
                     )}
                </div>
                
                {/* Actions */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
                    {!showDeleteConfirm ? (
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowDeleteConfirm(true)}
                                className="flex-1 py-3 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold hover:bg-rose-100 transition-colors flex items-center justify-center gap-2">
                                <Trash2 size={16}/> حذف
                            </button>
                            <button 
                                onClick={(e) => {
                                    if (selectedTx) {
                                        handleEdit(e, selectedTx);
                                        setSelectedTx(null);
                                    }
                                }}
                                className="flex-[2] py-3 bg-emerald-600 text-white dark:bg-slate-200 dark:text-slate-900 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
                                <Edit3 size={16}/> تعديل
                            </button>
                        </div>
                    ) : (
                        <div className="text-center">
                            <p className="text-sm font-bold text-rose-600 dark:text-rose-400 mb-3 flex items-center gap-2 justify-center"><AlertTriangle size={16}/> هل أنت متأكد من الحذف؟</p>
                            <p className="text-xs text-slate-500 mb-3">سيتم استرجاع المبلغ لرصيد البطاقة المرتبطة (إن وجدت).</p>
                            <div className="flex gap-3">
                                 <button 
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold">
                                    إلغاء
                                </button>
                                <button 
                                    onClick={async (e) => {
                                        if (selectedTx) {
                                            await handleDelete(e, selectedTx.id);
                                            setSelectedTx(null);
                                            setShowDeleteConfirm(false);
                                        }
                                    }}
                                    disabled={deletingId === selectedTx.id}
                                    className="flex-[2] py-3 bg-rose-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                                    {deletingId === selectedTx.id ? <Loader2 className="animate-spin"/> : <><Trash2 size={16}/> تأكيد الحذف</>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Smart SMS Modal */}
      {showSmartModal && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
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
                         <p>ألصق نص الرسالة البنكية هنا (شراء، إيداع، سداد بطاقة)، وسيقوم النظام تلقائياً بتحديد النوع واستخراج الرصيد.</p>
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
                      disabled={isAnalyzing || !smartSmsText}
                      className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-70"
                  >
                      {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                      {isAnalyzing ? 'جاري التحليل...' : 'تحليل وإضافة العملية'}
                  </button>
              </div>
          </div>
      )}

      {/* Smart Receipt Scanner Modal */}
      {showScannerModal && (
          <div 
            className="fixed inset-0 z-[70] bg-black flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
              {/* Header */}
              <div className="flex justify-between items-center p-4 bg-black/50 backdrop-blur text-white z-10">
                  <div className="flex items-center gap-2">
                      <Camera size={20} />
                      <span className="font-bold">ماسح الإيصالات الذكي</span>
                  </div>
                  <button onClick={closeScanner} className="p-2 rounded-full bg-white/10 hover:bg-white/20"><X size={20}/></button>
              </div>

              {/* Camera Area */}
              <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                  {!capturedImage ? (
                      <>
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            className="absolute inset-0 w-full h-full object-cover"
                        ></video>
                        {/* Overlay Guide */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-[80%] h-[60%] border-2 border-white/50 rounded-2xl relative">
                                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl"></div>
                                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl"></div>
                                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl"></div>
                                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-500 rounded-br-xl"></div>
                            </div>
                        </div>
                      </>
                  ) : (
                      <img src={capturedImage} alt="Captured" className="w-full h-full object-contain" />
                  )}
              </div>

              {/* Controls */}
              <div className="p-6 bg-black/80 backdrop-blur text-white flex flex-col gap-4">
                  {!capturedImage ? (
                      <div className="flex justify-center">
                          <button 
                            onClick={captureImage} 
                            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center hover:bg-white/20 transition-all"
                          >
                              <div className="w-16 h-16 bg-white rounded-full"></div>
                          </button>
                      </div>
                  ) : (
                      <div className="flex gap-4">
                          <button 
                            onClick={() => { setCapturedImage(null); startCamera(); }}
                            className="flex-1 py-3 bg-slate-700 rounded-xl font-bold"
                          >
                              إعادة التصوير
                          </button>
                          <button 
                            onClick={analyzeReceipt}
                            disabled={isScanning}
                            className="flex-1 py-3 bg-emerald-600 rounded-xl font-bold flex items-center justify-center gap-2"
                          >
                              {isScanning ? <Loader2 className="animate-spin" /> : <ScanLine size={20} />}
                              {isScanning ? 'جاري التحليل...' : 'تحليل الفاتورة'}
                          </button>
                      </div>
                  )}
                  <p className="text-center text-xs text-slate-400">
                      سيقوم الذكاء الاصطناعي باستخراج اسم المتجر، المبلغ، والتاريخ تلقائياً.
                  </p>
              </div>
          </div>
      )}
    </div>
  );
};

export default Transactions;
