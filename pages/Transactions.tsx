

import React, { useState } from 'react';
import { Transaction, TransactionType, UserSettings } from '../types';
import { storageService } from '../services/storage';
import { parseTransactionFromSMS } from '../services/geminiService';
import { Trash2, Search, ArrowDownLeft, ArrowUpRight, Edit3, Save, X, Loader2, MessageSquarePlus, Wand2, Sparkles, CreditCard, AlertTriangle, Plus } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';

interface TransactionsProps {
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings | null>>;
}

const Transactions: React.FC<TransactionsProps> = ({ transactions, setTransactions, settings, setSettings }) => {
  const { notify } = useNotification();
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

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formTx, setFormTx] = useState({
    amount: '',
    category: '',
    note: '',
    type: TransactionType.EXPENSE,
    date: new Date().toISOString(),
    cardId: ''
  });

  const categories = [
    'طعام', 'نقل', 'سكن', 'فواتير وخدمات', 'تسوق', 'ترفيه', 'صحة', 'تعليم', 
    'راتب', 'استثمار', 'تحويل بنكي', 'استلام أموال', 'رسوم بنكية', 'سداد بطاقة', 'أخرى'
  ];

  const resetForm = () => {
    setFormTx({
      amount: '',
      category: '',
      note: '',
      type: TransactionType.EXPENSE,
      date: new Date().toISOString(),
      cardId: ''
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
    setFormTx({
      amount: tx.amount.toString(),
      category: tx.category,
      note: tx.note || '',
      type: tx.type,
      date: tx.date,
      cardId: tx.cardId || ''
    });
    setShowAddModal(true); // Open modal for editing
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTx.amount || !formTx.category) return;
    setIsProcessing(true);

    try {
      let finalCardId = formTx.cardId;

      if (editingId) {
        // Edit Mode
        const updatedTx: Transaction = {
          id: editingId,
          amount: parseFloat(formTx.amount),
          category: formTx.category,
          type: formTx.type,
          note: formTx.note,
          date: formTx.date,
          cardId: finalCardId || undefined
        };
        await storageService.updateTransaction(updatedTx);
        notify('تم تعديل العملية بنجاح', 'success');
      } else {
        // Create Mode
        const amount = parseFloat(formTx.amount);
        
        // Update Balance Logic
        if (formTx.cardId) {
            const cardIndex = settings.cards.findIndex(c => c.id === formTx.cardId);
            if (cardIndex > -1) {
                const updatedCards = [...settings.cards];
                const card = updatedCards[cardIndex];
                const currentBal = card.balance || 0;
                
                // Expense: Subtract / Income: Add
                const newBalance = formTx.type === TransactionType.EXPENSE ? currentBal - amount : currentBal + amount;

                updatedCards[cardIndex] = {
                    ...card,
                    balance: newBalance
                };
                
                const newSettings = { ...settings, cards: updatedCards };
                
                // CRITICAL: Save settings first and get fresh IDs/Data
                const savedSettings = await storageService.saveSettings(newSettings);
                setSettings(savedSettings);
            }
        }

        const tx: Transaction = {
          id: '', // Supabase generated
          amount: amount,
          category: formTx.category,
          type: formTx.type,
          note: formTx.note,
          date: new Date().toISOString(),
          cardId: finalCardId || undefined
        };

        await storageService.saveTransaction(tx);
        notify('تم إضافة العملية وتحديث الرصيد', 'success');
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

             if (parsed.newBalance !== undefined) {
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

         const newTx: Transaction = {
            id: '',
            amount: mainAmount,
            type: parsed.type,
            category: parsed.category,
            date: parsed.date || new Date().toISOString(),
            note: `من: ${parsed.merchant}`, // Use "From:" as requested
            cardId: matchedCardId || undefined
         };
         await storageService.saveTransaction(newTx);

         if (feeAmount > 0) {
            const feeTx: Transaction = {
                id: '',
                amount: feeAmount,
                type: TransactionType.EXPENSE,
                category: 'رسوم بنكية',
                date: parsed.date || new Date().toISOString(),
                note: `رسوم: ${parsed.merchant}`,
                cardId: matchedCardId || undefined
            };
            await storageService.saveTransaction(feeTx);
         }

         const fresh = await storageService.getTransactions();
         setTransactions(fresh);
         
         setShowSmartModal(false);
         setSmartSmsText('');

         let successMessage = `تم إضافة العملية على ${cardName}`;
         if (parsed.newBalance !== undefined) {
             successMessage += ` وتحديث الرصيد إلى ${parsed.newBalance}`;
         }
         notify(successMessage, 'success');

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
              
              // Reverse Logic: 
              // If it was Expense, we ADD it back. 
              // If it was Income, we SUBTRACT it.
              const newBalance = txToDelete.type === TransactionType.EXPENSE 
                  ? currentBal + txToDelete.amount 
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

  const filteredData = transactions.filter(t => 
    t.category.includes(filter) || 
    t.note?.includes(filter)
  );

  return (
    <div className="animate-fade-in pb-20 md:pb-0 max-w-5xl mx-auto">
      
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
                <Search className="absolute right-3 top-3.5 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="بحث في العمليات..." 
                  className="w-full pr-10 pl-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 dark:text-slate-200 transition-all shadow-sm"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                />
          </div>
          <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
               <button 
                  onClick={() => setShowSmartModal(true)}
                  className="bg-white dark:bg-slate-900 text-slate-700 dark:text-white border border-slate-200 dark:border-slate-800 px-4 py-3 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <Sparkles size={16} className="text-violet-500" />
                  <span>تسجيل ذكي</span>
                </button>
               <button 
                  onClick={handleOpenAddModal}
                  className="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg hover:shadow-xl shadow-emerald-500/20"
                >
                  <Plus size={18} />
                  <span>إضافة عملية</span>
                </button>
          </div>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden min-h-[500px]">
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {filteredData.map((tx, index) => (
              <div 
                key={tx.id}
                onClick={(e) => {
                    // Open details if not clicking edit
                    setSelectedTx(tx);
                }}
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 transition-colors animate-slide-up relative cursor-pointer group"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-center gap-3 md:gap-4 w-full sm:w-auto">
                    <div className={`p-3 rounded-full shrink-0 ${tx.type === TransactionType.INCOME ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'}`}>
                      {tx.type === TransactionType.INCOME ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm md:text-base">{tx.category}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-400 whitespace-normal">
                         <span>{new Date(tx.date).toLocaleDateString('en-GB')}</span>
                         {tx.note && <span>• {tx.note}</span>}
                      </div>
                      {tx.cardId && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-slate-500 dark:text-slate-400 text-[10px] bg-slate-100 dark:bg-slate-800 w-fit px-2 py-0.5 rounded-full font-sans">
                            <CreditCard size={10} />
                            <span>{settings.cards.find(c => c.id === tx.cardId)?.bankName} •• {settings.cards.find(c => c.id === tx.cardId)?.cardNumber}</span>
                        </div>
                      )}
                    </div>
                </div>
                 
                <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto mt-2 sm:mt-0">
                    <span className={`font-bold text-base md:text-lg ${tx.type === TransactionType.INCOME ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}>
                       {tx.type === TransactionType.INCOME ? '+' : '-'}{tx.amount.toLocaleString('en-US')}
                    </span>
                    {/* Edit button removed from here */}
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
             <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-scale-in border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <h3 className="font-bold text-xl text-slate-800 dark:text-white">
                        {editingId ? 'تعديل العملية' : 'تسجيل يدوياً'}
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

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">المبلغ</label>
                        <div className="relative">
                            <input 
                            type="number" 
                            step="0.01"
                            required
                            autoFocus
                            className="w-full p-3 pl-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg text-slate-900 dark:text-white transition-all"
                            placeholder="0.00"
                            value={formTx.amount}
                            onChange={e => setFormTx({...formTx, amount: e.target.value})}
                            />
                            <span className="absolute left-4 top-4 text-slate-400 text-xs font-bold">SAR</span>
                        </div>
                    </div>

                    <div>
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

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">خصم من البطاقة (اختياري)</label>
                        <select 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-300 transition-all text-sm font-medium"
                        value={formTx.cardId}
                        onChange={e => setFormTx({...formTx, cardId: e.target.value})}
                        >
                        <option value="">-- بدون تحديد --</option>
                        {settings.cards.map(c => <option key={c.id} value={c.id}>{c.bankName} - {c.cardNumber}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">ملاحظة (اختياري)</label>
                        <input 
                        type="text" 
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-300 transition-all text-sm"
                        placeholder="وصف مختصر، رقم الفاتورة..."
                        value={formTx.note}
                        onChange={e => setFormTx({...formTx, note: e.target.value})}
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                         {editingId && (
                             <button 
                                type="button"
                                onClick={(e) => handleDelete(e, editingId)}
                                className="px-4 py-3 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl font-bold transition-colors"
                             >
                                 <Trash2 size={20}/>
                             </button>
                         )}
                        <button type="submit" disabled={isProcessing} className={`flex-1 text-white dark:text-slate-900 py-3 rounded-xl font-bold transition-all transform active:scale-95 shadow-lg flex items-center justify-center gap-2 ${editingId ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 dark:bg-[#bef264] hover:bg-slate-800 dark:hover:bg-[#a3e635]'}`}>
                        {isProcessing ? <Loader2 className="animate-spin" /> : (editingId ? <><Save size={18}/> تحديث العملية</> : <><Plus size={18}/> حفظ العملية</>)}
                        </button>
                    </div>
                </form>
             </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTx && !showAddModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl animate-scale-in border border-slate-200 dark:border-slate-800">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start">
                    <div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${selectedTx.type === TransactionType.INCOME ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                            {selectedTx.type === TransactionType.INCOME ? 'دخل' : 'مصروف'}
                        </span>
                        <h3 className="font-bold text-2xl text-slate-800 dark:text-white mt-2">{selectedTx.category}</h3>
                    </div>
                    <button onClick={() => { setSelectedTx(null); setShowDeleteConfirm(false); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500"><X size={20}/></button>
                </div>
                
                {/* Body */}
                <div className="p-6 space-y-4">
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                        <span className="text-sm text-slate-500 dark:text-slate-400">المبلغ</span>
                        <span className={`font-bold text-2xl ${selectedTx.type === TransactionType.INCOME ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                            {selectedTx.type === TransactionType.INCOME ? '+' : '-'}{selectedTx.amount.toLocaleString('en-US')} SAR
                        </span>
                    </div>
                    <div className="text-sm">
                        <p className="text-slate-400">التاريخ</p>
                        <p className="font-bold dark:text-slate-200">{new Date(selectedTx.date).toLocaleString('ar-SA', { dateStyle: 'full', timeStyle: 'short' })}</p>
                    </div>
                     {selectedTx.note && (
                        <div className="text-sm">
                            <p className="text-slate-400">ملاحظة</p>
                            <p className="font-bold dark:text-slate-200">{selectedTx.note}</p>
                        </div>
                     )}
                     {selectedTx.cardId && settings.cards.find(c => c.id === selectedTx.cardId) && (
                         <div className="text-sm">
                            <p className="text-slate-400">البطاقة المستخدمة</p>
                            <p className="font-bold dark:text-slate-200 flex items-center gap-2">
                                <CreditCard size={14}/>
                                {settings.cards.find(c => c.id === selectedTx.cardId)?.bankName} •••• {settings.cards.find(c => c.id === selectedTx.cardId)?.cardNumber}
                            </p>
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
                                className="flex-[2] py-3 bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900 rounded-xl text-sm font-bold hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-indigo-100 dark:border-slate-700 animate-scale-in">
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
    </div>
  );
};

export default Transactions;