

import React, { useState } from 'react';
import { UserSettings, IncomeSource, BankCard, ThemeOption, RecurringTransaction, CustomCategory, TransactionType, LogoPosition } from '../types';
import { storageService } from '../services/storage';
import { Save, Settings as SettingsIcon, BellRing, DollarSign, Calendar, Database, Trash2, Download, CreditCard, Moon, Sun, Monitor, Plus, X, Lock, Loader2, RotateCw, Tag, Wallet, Image, Move } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';

interface SettingsProps {
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings | null>>;
}

const SAUDI_BANKS = ['مصرف الراجحي', 'البنك الأهلي السعودي', 'بنك الرياض', 'مصرف الإنماء', 'البنك العربي الوطني', 'البنك السعودي الأول (SAB)', 'بنك البلاد', 'بنك الجزيرة', 'البنك السعودي للاستثمار', 'بنك الخليج الدولي', 'البنك السعودي الفرنسي', 'STC Pay', 'UrPay'];
const CARD_TYPES = ['Visa', 'Mada', 'MasterCard', 'Amex'];
const LOGO_POSITIONS: { value: LogoPosition, label: string }[] = [
    { value: 'top-left', label: 'أعلى اليسار' },
    { value: 'top-right', label: 'أعلى اليمين' },
    { value: 'bottom-left', label: 'أسفل اليسار' },
    { value: 'bottom-right', label: 'أسفل اليمين' },
    { value: 'center', label: 'المنتصف' }
];

const Settings: React.FC<SettingsProps> = ({ settings, setSettings }) => {
  const { notify } = useNotification();
  const [formData, setFormData] = useState<UserSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // --- Handlers for Bank Cards ---
  const addCard = () => {
      const newCard: BankCard = { 
          id: Date.now().toString(), 
          bankName: 'مصرف الراجحي', 
          cardNumber: '0000', 
          accountLast4: '0000',
          cardType: 'Mada', 
          color: '#1e293b',
          balance: 0,
          logoPosition: 'top-left'
      };
      setFormData(prev => ({ ...prev, cards: [...prev.cards, newCard] }));
  };

  const updateCard = (id: string, field: keyof BankCard, value: any) => {
      setFormData(prev => ({ ...prev, cards: prev.cards.map(c => c.id === id ? { ...c, [field]: value } : c) }));
  };

  const removeCard = (id: string) => {
      setFormData(prev => ({ ...prev, cards: prev.cards.filter(c => c.id !== id) }));
  };

  // --- Handlers for Recurring ---
  const addRecurring = () => {
      const newRec: RecurringTransaction = { id: Date.now().toString(), name: '', amount: 0, type: TransactionType.EXPENSE, category: '', dayOfMonth: 1, active: true };
      setFormData(prev => ({ ...prev, recurringTransactions: [...prev.recurringTransactions, newRec] }));
  };
  const updateRecurring = (id: string, field: keyof RecurringTransaction, value: any) => {
      setFormData(prev => ({ ...prev, recurringTransactions: prev.recurringTransactions.map(r => r.id === id ? { ...r, [field]: value } : r) }));
  };
  const removeRecurring = (id: string) => {
      setFormData(prev => ({ ...prev, recurringTransactions: prev.recurringTransactions.filter(r => r.id !== id) }));
  };

  // --- Handlers for Custom Categories ---
  const addCategory = () => {
      const newCat: CustomCategory = { id: Date.now().toString(), name: '', icon: 'tag', color: '#10b981' };
      setFormData(prev => ({ ...prev, customCategories: [...prev.customCategories, newCat] }));
  };
  const updateCategory = (id: string, field: keyof CustomCategory, value: any) => {
      setFormData(prev => ({ ...prev, customCategories: prev.customCategories.map(c => c.id === id ? { ...c, [field]: value } : c) }));
  };
  const removeCategory = (id: string) => {
      setFormData(prev => ({ ...prev, customCategories: prev.customCategories.filter(c => c.id !== id) }));
  };

  // Standard Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : (name === 'currency' ? value : Number(value))
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      // Must await and capture the returned settings, as IDs (like Cards) are regenerated
      const updatedSettings = await storageService.saveSettings(formData);
      setSettings(updatedSettings);
      setFormData(updatedSettings);
      
      setSaved(true);
      notify('تم حفظ الإعدادات بنجاح', 'success');
      setTimeout(() => setSaved(false), 3000);
    } catch(err) { notify('فشل حفظ الإعدادات', 'error'); } finally { setIsProcessing(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 md:pb-10 animate-fade-in px-2 md:px-0">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><SettingsIcon size={32} className="text-[#bef264]"/> إعدادات النظام</h2>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Theme & General */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
           <div className="flex items-center gap-3 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4"><Sun className="text-amber-500" /><h3 className="font-bold text-slate-900 dark:text-white">المظهر والعامة</h3></div>
           <div className="space-y-4">
               <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {(['light', 'dark', 'system'] as ThemeOption[]).map((t) => (
                      <button key={t} type="button" onClick={() => setFormData({...formData, theme: t})} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.theme === t ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow' : 'text-slate-500 dark:text-slate-400'}`}>{t === 'light' ? 'نهاري' : t === 'dark' ? 'ليلي' : 'النظام'}</button>
                  ))}
               </div>
               <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                   <div><h4 className="font-bold text-sm text-slate-900 dark:text-white">تدوير الميزانية</h4><p className="text-xs text-slate-400">نقل المتبقي من الميزانية للشهر القادم تلقائياً</p></div>
                   <input type="checkbox" checked={formData.budgetRollover} onChange={e => setFormData({...formData, budgetRollover: e.target.checked})} className="w-6 h-6 accent-emerald-500 rounded cursor-pointer" />
               </div>
               <div>
                  <label className="text-sm block mb-1 text-slate-600 dark:text-slate-300">العملة</label>
                  <select name="currency" value={formData.currency} onChange={handleChange} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#bef264]">
                      <option value="SAR">ريال سعودي (SAR)</option><option value="USD">دولار أمريكي (USD)</option><option value="AED">درهم إماراتي (AED)</option>
                  </select>
               </div>
               <div>
                  <label className="text-sm block mb-1 text-slate-600 dark:text-slate-300">الحد الشهري للميزانية</label>
                  <input type="number" name="monthlyLimit" value={formData.monthlyLimit} onChange={handleChange} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#bef264]" />
               </div>
           </div>
        </div>

        {/* Bank Cards Section (Restored) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3"><Wallet className="text-blue-500" /><h3 className="font-bold text-slate-900 dark:text-white">البطاقات والحسابات</h3></div>
                <button type="button" onClick={addCard} className="text-xs bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 px-3 py-1 rounded-full font-bold flex gap-1 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"><Plus size={14}/> إضافة</button>
            </div>
            <div className="space-y-4">
                {formData.cards.map((card, index) => (
                    <div key={card.id || index} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">البنك</label>
                                <select 
                                    value={card.bankName} 
                                    onChange={e => updateCard(card.id, 'bankName', e.target.value)}
                                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-sm outline-none"
                                >
                                    {SAUDI_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">النوع</label>
                                <select 
                                    value={card.cardType} 
                                    onChange={e => updateCard(card.id, 'cardType', e.target.value)}
                                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-sm outline-none"
                                >
                                    {CARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">آخر 4 أرقام (البطاقة)</label>
                                <input 
                                    type="text" maxLength={4} 
                                    value={card.cardNumber} 
                                    onChange={e => updateCard(card.id, 'cardNumber', e.target.value)} 
                                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-sm outline-none font-mono"
                                />
                             </div>
                             <div>
                                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">آخر 4 أرقام (الحساب)</label>
                                <input 
                                    type="text" maxLength={4} 
                                    value={card.accountLast4} 
                                    onChange={e => updateCard(card.id, 'accountLast4', e.target.value)} 
                                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-sm outline-none font-mono"
                                />
                             </div>
                        </div>

                        {/* Logo Customization */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                             <div>
                                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1"><Image size={10}/> رابط الشعار (اختياري)</label>
                                <input 
                                    type="text"
                                    value={card.logoUrl || ''} 
                                    onChange={e => updateCard(card.id, 'logoUrl', e.target.value)} 
                                    placeholder="https://..."
                                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-xs outline-none"
                                />
                             </div>
                             <div>
                                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1"><Move size={10}/> موقع الشعار</label>
                                <select 
                                    value={card.logoPosition || 'top-left'} 
                                    onChange={e => updateCard(card.id, 'logoPosition', e.target.value)}
                                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-xs outline-none"
                                >
                                    {LOGO_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                             </div>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                             <div className="flex items-center gap-2">
                                 <label className="text-xs text-slate-500 dark:text-slate-400">لون البطاقة</label>
                                 <input type="color" value={card.color} onChange={e => updateCard(card.id, 'color', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"/>
                             </div>
                             <div className="flex items-center gap-4">
                                 <div className="flex items-center gap-2">
                                     <label className="text-xs text-slate-500 dark:text-slate-400">الرصيد الافتتاحي</label>
                                     <input 
                                        type="number" 
                                        value={card.balance} 
                                        onChange={e => updateCard(card.id, 'balance', Number(e.target.value))} 
                                        className="w-24 p-1 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-sm"
                                     />
                                 </div>
                                 <button type="button" onClick={() => removeCard(card.id)} className="text-rose-500 hover:text-rose-600 p-2"><Trash2 size={18}/></button>
                             </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Recurring Transactions */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
             <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                 <div className="flex items-center gap-3"><RotateCw className="text-purple-500" /><h3 className="font-bold text-slate-900 dark:text-white">العمليات المتكررة</h3></div>
                 <button type="button" onClick={addRecurring} className="text-xs bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300 px-3 py-1 rounded-full font-bold flex gap-1 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"><Plus size={14}/> إضافة</button>
             </div>
             <div className="space-y-3">
                 {formData.recurringTransactions.map(rec => (
                     <div key={rec.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 p-3 rounded-xl">
                         <input type="text" value={rec.name} onChange={e=>updateRecurring(rec.id, 'name', e.target.value)} placeholder="الاسم (إيجار، راتب)" className="md:col-span-4 p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"/>
                         <input type="number" value={rec.amount} onChange={e=>updateRecurring(rec.id, 'amount', Number(e.target.value))} placeholder="المبلغ" className="md:col-span-2 p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"/>
                         <input type="number" value={rec.dayOfMonth} onChange={e=>updateRecurring(rec.id, 'dayOfMonth', Number(e.target.value))} placeholder="يوم" className="md:col-span-2 p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"/>
                         <select value={rec.type} onChange={e=>updateRecurring(rec.id, 'type', e.target.value)} className="md:col-span-2 p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"><option value="expense">مصروف</option><option value="income">دخل</option></select>
                         <div className="md:col-span-2 flex justify-end gap-3 items-center">
                             <input type="checkbox" checked={rec.active} onChange={e=>updateRecurring(rec.id, 'active', e.target.checked)} className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"/>
                             <button type="button" onClick={()=>removeRecurring(rec.id)} className="text-rose-500 hover:text-rose-600"><Trash2 size={18}/></button>
                         </div>
                     </div>
                 ))}
             </div>
        </div>

        {/* Custom Categories */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
             <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                 <div className="flex items-center gap-3"><Tag className="text-pink-500" /><h3 className="font-bold text-slate-900 dark:text-white">تصنيفات مخصصة</h3></div>
                 <button type="button" onClick={addCategory} className="text-xs bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300 px-3 py-1 rounded-full font-bold flex gap-1 hover:bg-pink-100 dark:hover:bg-pink-900/50 transition-colors"><Plus size={14}/> إضافة</button>
             </div>
             <div className="space-y-3">
                 {formData.customCategories.map(cat => (
                     <div key={cat.id} className="flex gap-2 items-center bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 p-3 rounded-xl">
                         <input type="text" value={cat.name} onChange={e=>updateCategory(cat.id, 'name', e.target.value)} placeholder="اسم التصنيف" className="flex-1 p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none"/>
                         <input type="color" value={cat.color} onChange={e=>updateCategory(cat.id, 'color', e.target.value)} className="w-10 h-10 p-0 border-none bg-transparent cursor-pointer rounded"/>
                         <button type="button" onClick={()=>removeCategory(cat.id)} className="text-rose-500 hover:text-rose-600 p-2"><Trash2 size={18}/></button>
                     </div>
                 ))}
             </div>
        </div>

        <button type="submit" disabled={isProcessing} className="w-full bg-slate-900 dark:bg-[#bef264] text-white dark:text-slate-900 py-4 rounded-xl font-bold flex justify-center items-center gap-2 hover:shadow-lg transition-all active:scale-95 disabled:opacity-70 disabled:hover:scale-100">
           {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={20} />}
           <span>{saved ? 'تم الحفظ!' : 'حفظ التغييرات'}</span>
        </button>
      </form>
    </div>
  );
};

export default Settings;