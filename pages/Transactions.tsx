

import React, { useState } from 'react';
import { Transaction, TransactionType, UserSettings } from '../types';
import { storageService } from '../services/storage';
import { parseTransactionFromSMS } from '../services/geminiService';
import { Trash2, Search, ArrowDownLeft, ArrowUpRight, Edit3, Save, X, Loader2, MessageSquarePlus, Wand2, Sparkles, CreditCard } from 'lucide-react';
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
    'راتب', 'استثمار', 'تحويل بنكي', 'استلام أموال', 'رسوم بنكية', 'أخرى'
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
    // Scroll to top to see form
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

                // Ensure we use the valid ID from the refreshed settings
                // We try to find the card that matches the one we just updated.
                // Since we preserve IDs now in storageService, the ID *should* be the same.
                // But just in case it was a new card that got a UUID assigned, we might need logic.
                // However, user selects from existing list, so ID exists.
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

             if (parsed.type === TransactionType.EXPENSE) {
                 newBalance -= (mainAmount + feeAmount);
             } else {
                 newBalance += mainAmount - feeAmount;
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
            note: `آلي: ${parsed.merchant}`,
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

         let successMessage = `تم إضافة ${parsed.type === 'expense' ? 'مصروف' : 'دخل'} على ${cardName}`;
         if (feeAmount > 0) {
             successMessage += ` مع رسوم ${feeAmount} ريال.`;
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 animate-fade-in pb-20 md:pb-0">
      {/* Input Form */}
      <div className="lg:col-span-1">
        <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 sticky top-8 transition-all">
          
          {/* Smart Add Button */}
          {!editingId && (
            <button 
              onClick={() => setShowSmartModal(true)}
              className="w-full mb-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white py-3 px-4 rounded-xl font-bold text-sm hover:shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
            >
              <Sparkles size={18} className="text-yellow-300" />
              <span>تسجيل ذكي (لصق رسالة نصية)</span>
            </button>
          )}

          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-slate-800 dark:text-white">
              {editingId ? 'تعديل العملية' : 'تسجيل يدوياً'}
            </h3>
            {editingId && (
              <div className="flex gap-2">
                 <button 
                   type="button"
                   onClick={(e) => handleDelete(e, editingId)} 
                   disabled={deletingId === editingId}
                   className="text-xs text-white bg-rose-500 px-3 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 hover:bg-rose-600 transition-colors shadow-sm w-20 disabled:opacity-50"
                 >
                   {deletingId === editingId ? <Loader2 size={14} className="animate-spin"/> : <><Trash2 size={14}/> حذف</>}
                 </button>
                 <button 
                   type="button"
                   onClick={resetForm} 
                   className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                 >
                   <X size={14}/> إلغاء
                 </button>
              </div>
            )}
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
             <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mb-4">
                <button
                  type="button"
                  onClick={() => setFormTx({...formTx, type: TransactionType.EXPENSE})}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-300 ${formTx.type === TransactionType.EXPENSE ? 'bg-white dark:bg-slate-700 text-rose-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  مصروف / فاتورة
                </button>
                <button
                  type="button"
                  onClick={() => setFormTx({...formTx, type: TransactionType.INCOME})}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-300 ${formTx.type === TransactionType.INCOME ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  دخل / إيداع
                </button>
             </div>

             <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">المبلغ</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-lg text-slate-900 dark:text-white transition-all"
                  placeholder="0.00"
                  value={formTx.amount}
                  onChange={e => setFormTx({...formTx, amount: e.target.value})}
                />
             </div>

             <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">التصنيف</label>
                <select 
                   required
                   className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-300 transition-all"
                   value={formTx.category}
                   onChange={e => setFormTx({...formTx, category: e.target.value})}
                >
                  <option value="">اختر تصنيف...</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
             </div>

             <div className="animate-slide-up" style={{ animationDelay: '0.25s' }}>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">خصم من البطاقة (اختياري)</label>
                <select 
                   className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-300 transition-all text-sm"
                   value={formTx.cardId}
                   onChange={e => setFormTx({...formTx, cardId: e.target.value})}
                >
                  <option value="">-- بدون تحديد --</option>
                  {settings.cards.map(c => <option key={c.id} value={c.id}>{c.bankName} - {c.cardNumber}</option>)}
                </select>
             </div>

             <div className="animate-slide-up" style={{ animationDelay: '0.3s' }}>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">ملاحظة (اختياري)</label>
                <input 
                  type="text" 
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-slate-700 dark:text-slate-300 transition-all"
                  placeholder="وصف مختصر، رقم الفاتورة..."
                  value={formTx.note}
                  onChange={e => setFormTx({...formTx, note: e.target.value})}
                />
             </div>

             <button type="submit" disabled={isProcessing} className={`w-full text-white dark:text-slate-900 py-3 rounded-xl font-bold transition-all transform active:scale-95 shadow-lg flex items-center justify-center gap-2 ${editingId ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 dark:bg-[#bef264] hover:bg-slate-800 dark:hover:bg-[#a3e635]'}`}>
               {isProcessing ? <Loader2 className="animate-spin" /> : (editingId ? <><Save size={18}/> تحديث العملية</> : 'حفظ العملية')}
             </button>
          </form>
        </div>
      </div>

      {/* List */}
      <div className="lg:col-span-2">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden min-h-[500px] animate-fade-in">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex gap-4 items-center">
             <div className="relative flex-1">
                <Search className="absolute right-3 top-3 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="بحث في العمليات، الفواتير، التحويلات..." 
                  className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 text-slate-700 dark:text-slate-200 transition-all"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                />
             </div>
          </div>
          
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {filteredData.map((tx, index) => (
              <div 
                key={tx.id} 
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex justify-between items-center transition-colors animate-slide-up relative"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                 <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                    <div className={`p-3 rounded-full shrink-0 ${tx.type === TransactionType.INCOME ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'}`}>
                      {tx.type === TransactionType.INCOME ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm md:text-base truncate">{tx.category}</h4>
                      <p className="text-xs text-slate-400 truncate max-w-[150px] md:max-w-none font-mono">
                         {new Date(tx.date).toLocaleDateString('en-GB')} • {tx.note || 'بدون وصف'}
                         {tx.cardId && (
                            <span className="flex items-center gap-1 mt-1 text-slate-500 font-sans">
                                <CreditCard size={10} />
                                {settings.cards.find(c => c.id === tx.cardId)?.cardNumber || '****'}
                            </span>
                         )}
                      </p>
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-3 md:gap-4 shrink-0">
                    <span className={`font-bold font-mono text-base md:text-lg ${tx.type === TransactionType.INCOME ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}>
                       {tx.type === TransactionType.INCOME ? '+' : '-'}{tx.amount.toLocaleString('en-US')}
                    </span>
                    
                    <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={(e) => handleEdit(e, tx)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          title="تعديل"
                        >
                          <Edit3 size={18} />
                        </button>
                        <button 
                          type="button"
                          onClick={(e) => handleDelete(e, tx.id)}
                          disabled={deletingId === tx.id}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="حذف"
                        >
                          {deletingId === tx.id ? <Loader2 size={18} className="animate-spin text-rose-500" /> : <Trash2 size={18} />}
                        </button>
                    </div>
                 </div>
              </div>
            ))}
            {filteredData.length === 0 && (
               <div className="p-12 text-center text-slate-400 animate-fade-in">
                 لا توجد عمليات تطابق البحث.
               </div>
            )}
          </div>
        </div>
      </div>

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
                         <p>ألصق نص الرسالة البنكية هنا، وسيقوم النظام تلقائياً بتحديد النوع (مصروف/دخل)، التصنيف، المبلغ، والتاريخ.</p>
                      </div>
                      <div className="flex gap-3 text-xs opacity-75 mt-1">
                          <CreditCard className="shrink-0" size={16}/>
                          <p>سيتم أيضاً تحديث رصيد البطاقة المطابقة تلقائياً إذا وجدت.</p>
                      </div>
                  </div>

                  <textarea 
                      autoFocus
                      className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 mb-4 text-slate-900 dark:text-white"
                      placeholder="مثال: تم خصم مبلغ 120 ريال من حسابك لدى مطعم..."
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
