import React, { useState, useEffect, useRef } from 'react';
import { UserSettings, IncomeSource, BankCard, LogoPosition, EntityLogo, Allowance, ReportConfig, Transaction, Loan, Bill, FinancialGoal } from '../types';
import { storageService } from '../services/storage';
import { Save, Settings as SettingsIcon, DollarSign, Calendar, Trash2, UploadCloud, Check, FileText, Printer, Square, X, Download, Plus, Loader2, CreditCard, Palette, Shield, Lock, Image as ImageIcon, Layout as LayoutIcon, Landmark, Tags, Bell, Database, HelpCircle, MessageSquare, Star, Share2, ChevronLeft, AlertTriangle } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';
import PwaManager from '../components/PwaManager';

interface SettingsProps {
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings | null>>;
  onReloadApp: () => void; // Function to trigger a full app reload
}

const SAUDI_BANKS = ['مصرف الراجحي', 'البنك الأهلي السعودي', 'بنك الرياض', 'مصرف الإنماء', 'البنك العربي الوطني', 'البنك السعودي الأول (SAB)', 'بنك البلاد', 'بنك الجزيرة', 'البنك السعودي للاستثمار', 'بنك الخليج الدولي', 'البنك السعودي الفرنسي', 'STC Pay', 'UrPay'];

// --- Helper Components ---
const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3 animate-fade-in">
    <h3 className="font-bold text-slate-500 dark:text-slate-400 px-4">{title}</h3>
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
      {children}
    </div>
  </div>
);

const SettingsItem: React.FC<{ icon: React.ReactNode; text: string; onClick?: () => void }> = ({ icon, text, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between p-4 text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors first:rounded-t-2xl last:rounded-b-2xl group"
  >
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-colors">
        {icon}
      </div>
      <span className="font-bold">{text}</span>
    </div>
    <ChevronLeft className="text-slate-400" />
  </button>
);

const SubViewContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 animate-fade-in">
    {children}
  </div>
);


// --- Sub-View Components ---

const GeneralSettings = ({ formData, setFormData, handleFileSelect }: { formData: UserSettings, setFormData: Function, handleFileSelect: Function }) => {
  const appLogoSrc = formData.appLogo;
  return (
    <SubViewContainer>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div>
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">شعار الموقع (النظام)</h4>
          <p className="text-xs text-slate-500 mb-4">هذا الشعار سيظهر في صفحة الدخول، القائمة الجانبية، والتقارير المطبوعة.</p>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl flex items-center justify-center bg-slate-50 dark:bg-slate-800 overflow-hidden">
              {appLogoSrc ? <img src={appLogoSrc} alt="App Logo" className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-slate-400 text-center px-1">لا يوجد شعار</span>}
            </div>
            <div className="flex-1">
              <label className="flex items-center justify-center w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm gap-2">
                <UploadCloud className="text-slate-400" size={20} />
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">رفع شعار</span>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, 'app')} />
              </label>
              {formData.appLogo && <button type="button" onClick={() => setFormData((prev: UserSettings) => ({...prev, appLogo: ''}))} className="text-xs text-rose-500 mt-2 hover:underline">إزالة الشعار</button>}
            </div>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">نمط الألوان (الثيم)</h4>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map(theme => (
              <div key={theme} onClick={() => setFormData((prev: UserSettings) => ({ ...prev, theme }))} className={`flex-1 p-3 rounded-xl border cursor-pointer text-center transition-all ${formData.theme === theme ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300 ring-1 ring-purple-500' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 text-slate-500'}`}>
                <p className="font-bold text-sm capitalize">{theme === 'light' ? 'فاتح' : theme === 'dark' ? 'داكن' : 'النظام'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SubViewContainer>
  );
};

const AccountsSettings = ({ formData, setFormData }: { formData: UserSettings, setFormData: Function }) => {
    const addCard = () => {
        const newCard: BankCard = { id: Date.now().toString(), bankName: '', cardNumber: '', accountLast4: '', cardType: 'Mada', color: '#1e293b', balance: 0, logoPosition: 'top-left' };
        setFormData((prev: UserSettings) => ({ ...prev, cards: [...prev.cards, newCard] }));
    };
    const updateCard = (id: string, field: keyof BankCard, value: any) => {
        setFormData((prev: UserSettings) => ({ ...prev, cards: prev.cards.map(c => c.id === id ? { ...c, [field]: value } : c) }));
    };
    const removeCard = (id: string) => {
        setFormData((prev: UserSettings) => ({ ...prev, cards: prev.cards.filter(c => c.id !== id) }));
    };
    return (
        <SubViewContainer>
            <div className="flex justify-end mb-4">
                 <button type="button" onClick={addCard} className="flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100"><Plus size={14}/> إضافة بطاقة</button>
            </div>
             <div className="space-y-4">
                 {formData.cards.map((card, idx) => (
                     <div key={card.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                             <div>
                                 <label className="text-xs text-slate-500 mb-1 block">اسم البنك</label>
                                 <input type="text" list={`banks-${idx}`} value={card.bankName} onChange={e => updateCard(card.id, 'bankName', e.target.value)} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white" placeholder="مصرف الراجحي..."/>
                                 <datalist id={`banks-${idx}`}>{SAUDI_BANKS.map(b => <option key={b} value={b}/>)}</datalist>
                             </div>
                             <div>
                                 <label className="text-xs text-slate-500 mb-1 block">آخر 4 أرقام</label>
                                 <input type="text" maxLength={4} value={card.cardNumber} onChange={e => updateCard(card.id, 'cardNumber', e.target.value)} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm outline-none font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white" placeholder="8899"/>
                             </div>
                             <div>
                                 <label className="text-xs text-slate-500 mb-1 block">النوع</label>
                                 <select value={card.cardType} onChange={e => updateCard(card.id, 'cardType', e.target.value as 'Visa' | 'Mada' | 'MasterCard' | 'Virtual')} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                                     {['Visa', 'Mada', 'MasterCard', 'Virtual'].map(t => <option key={t} value={t}>{t}</option>)}
                                 </select>
                             </div>
                             <div>
                                 <label className="text-xs text-slate-500 mb-1 block">الرصيد الحالي</label>
                                 <input type="number" value={card.balance || ''} onChange={e => updateCard(card.id, 'balance', Number(e.target.value))} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm outline-none font-bold text-emerald-600 bg-white dark:bg-slate-800" placeholder="0.00"/>
                             </div>
                         </div>
                         <div className="flex justify-end items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                             <button type="button" onClick={() => removeCard(card.id)} className="text-rose-500 hover:text-rose-600 text-xs flex items-center gap-1 font-bold"><Trash2 size={14}/> حذف</button>
                         </div>
                     </div>
                 ))}
             </div>
        </SubViewContainer>
    );
};

const IncomeSettings = ({ formData, setFormData }: { formData: UserSettings, setFormData: Function }) => {
    const currentIncome = formData.incomeSources[0] || { id: 'default', name: '', amount: 0, dayOfMonth: 27, basicSalary: 0, gosiDeduction: 0, allowances: [] };
    
    const updateIncome = (field: keyof IncomeSource, value: any) => {
        const updatedIncomes = [...formData.incomeSources];
        updatedIncomes[0] = { ...updatedIncomes[0], [field]: value };
        
        if (['basicSalary', 'gosiDeduction', 'allowances'].includes(field)) {
            const inc = updatedIncomes[0];
            const basic = Number(inc.basicSalary || 0);
            const gosi = Number(inc.gosiDeduction || 0);
            const totalAllowances = (inc.allowances || []).reduce((acc, curr) => acc + Number(curr.amount), 0);
            updatedIncomes[0].amount = basic + totalAllowances - gosi;
        }
        setFormData((prev: UserSettings) => ({ ...prev, incomeSources: updatedIncomes }));
    };
    const addAllowance = () => {
        const updatedIncomes = [...formData.incomeSources];
        const newAllowance: Allowance = { id: Date.now().toString(), name: '', amount: 0 };
        updatedIncomes[0].allowances = [...(updatedIncomes[0].allowances || []), newAllowance];
        setFormData((prev: UserSettings) => ({ ...prev, incomeSources: updatedIncomes }));
    };
    const updateAllowance = (id: string, field: keyof Allowance, value: any) => {
        const updatedIncomes = [...formData.incomeSources];
        const allowances = updatedIncomes[0].allowances || [];
        updatedIncomes[0].allowances = allowances.map(a => a.id === id ? { ...a, [field]: value } : a);
        updateIncome('allowances', updatedIncomes[0].allowances); // Recalculate total
    };
    const removeAllowance = (id: string) => {
        const updatedIncomes = [...formData.incomeSources];
        updatedIncomes[0].allowances = (updatedIncomes[0].allowances || []).filter(a => a.id !== id);
        updateIncome('allowances', updatedIncomes[0].allowances); // Recalculate total
    };

    return (
        <SubViewContainer>
             <div className="flex flex-col-reverse md:grid md:grid-cols-2 gap-6">
                 <div className="space-y-4">
                     <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block font-bold">الراتب الأساسي</label>
                        <input type="number" value={currentIncome.basicSalary || ''} onChange={e => updateIncome('basicSalary', Number(e.target.value))} className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 font-bold outline-none" placeholder="0.00"/>
                     </div>
                     <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                         <label className="text-xs text-slate-500 dark:text-slate-400 font-bold">خصم التأمينات (GOSI)</label>
                         <input type="number" value={currentIncome.gosiDeduction || ''} onChange={e => updateIncome('gosiDeduction', Number(e.target.value))} className="w-full p-3 mt-2 rounded-xl bg-white dark:bg-slate-700 text-rose-500 font-bold outline-none" placeholder="0.00"/>
                     </div>
                     <div>
                        <div className="flex justify-between items-center mb-2">
                             <label className="text-xs text-slate-500 dark:text-slate-400 font-bold">البدلات</label>
                             <button type="button" onClick={addAllowance} className="text-xs text-indigo-500 flex items-center gap-1"><Plus size={12}/> إضافة</button>
                        </div>
                        <div className="space-y-2">
                            {currentIncome.allowances?.map((allowance) => (
                                <div key={allowance.id} className="flex gap-2">
                                    <input type="text" placeholder="نوع البدل" value={allowance.name} onChange={e => updateAllowance(allowance.id, 'name', e.target.value)} className="flex-[2] p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm outline-none"/>
                                    <input type="number" placeholder="المبلغ" value={allowance.amount} onChange={e => updateAllowance(allowance.id, 'amount', Number(e.target.value))} className="flex-1 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm outline-none font-bold text-emerald-600"/>
                                    <button type="button" onClick={() => removeAllowance(allowance.id)} className="text-rose-400"><X size={16}/></button>
                                </div>
                            ))}
                        </div>
                     </div>
                 </div>
                 <div className="flex flex-col gap-4">
                     <div className="flex-1 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white flex flex-col justify-center items-center shadow-lg">
                         <p className="text-emerald-100 text-sm mb-2">صافي الراتب (الإيداع)</p>
                         <h2 className="text-4xl font-bold">{currentIncome.amount.toLocaleString('en-US')} <span className="text-lg">SAR</span></h2>
                     </div>
                     <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border flex items-center justify-between">
                         <label className="text-sm font-bold text-slate-700 dark:text-slate-300">يوم الإيداع</label>
                         <div className="flex items-center gap-2">
                             <Calendar size={18} className="text-slate-400"/>
                             <input type="number" min="1" max="31" value={currentIncome.dayOfMonth} onChange={e => updateIncome('dayOfMonth', Number(e.target.value))} className="w-16 p-2 text-center font-bold rounded-lg bg-white dark:bg-slate-700" />
                         </div>
                     </div>
                 </div>
             </div>
        </SubViewContainer>
    );
};

const SecuritySettings = ({ formData, setFormData }: { formData: UserSettings, setFormData: Function }) => {
    return (
        <SubViewContainer>
            <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">كلمة المرور للدخول</label>
            <div className="relative max-w-sm">
                <Lock className="absolute right-3 top-2.5 text-slate-400" size={18}/>
                <input 
                    type="password"
                    value={formData.password || ''} 
                    onChange={e => setFormData((prev: UserSettings) => ({...prev, password: e.target.value}))}
                    className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-800 border rounded-lg outline-none"
                    placeholder="••••••"
                />
            </div>
        </SubViewContainer>
    );
};

const DataSettings = ({ onReloadApp }: { onReloadApp: () => void; }) => {
    const { notify } = useNotification();
    const [isProcessing, setIsProcessing] = useState(false);
    const importFileRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        setIsProcessing(true);
        try {
            const [transactions, loans, bills, goals, settings] = await Promise.all([
                storageService.getTransactions(),
                storageService.getLoans(),
                storageService.getBills(),
                storageService.getGoals(),
                storageService.getSettings()
            ]);
            
            const exportData = {
                version: 1,
                exportedAt: new Date().toISOString(),
                data: { transactions, loans, bills, goals, settings }
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `monjez_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            notify('تم تصدير البيانات بنجاح', 'success');
        } catch(e) { notify('فشل تصدير البيانات', 'error'); } 
        finally { setIsProcessing(false); }
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result;
            if (typeof text !== 'string') return;
            
            if (!window.confirm("سيتم إضافة البيانات من الملف إلى بياناتك الحالية. قد يؤدي هذا إلى تكرار بعض السجلات. هل أنت متأكد من المتابعة؟")) {
                return;
            }
            
            setIsProcessing(true);
            try {
                const importedJson = JSON.parse(text);
                await storageService.importData(importedJson.data);
                notify('تم استيراد البيانات بنجاح! سيتم تحديث التطبيق.', 'success');
                setTimeout(onReloadApp, 1500);
            } catch (err) {
                console.error(err);
                notify('فشل استيراد الملف. تأكد من أنه ملف صحيح.', 'error');
            } finally {
                setIsProcessing(false);
            }
        };
        reader.readAsText(file);
    };

    const handleWipe = async () => {
        if (window.prompt("للتأكيد، اكتب 'حذف' في المربع أدناه:")?.toLowerCase() === 'حذف') {
             if (window.confirm("تحذير أخير! سيتم حذف جميع بياناتك نهائياً ولا يمكن التراجع عن هذا الإجراء. هل أنت متأكد؟")) {
                 setIsProcessing(true);
                 try {
                     await storageService.dangerouslyWipeAllData();
                     notify('تم حذف جميع البيانات. سيتم إعادة تشغيل التطبيق.', 'info');
                     setTimeout(() => window.location.reload(), 1500); // Full reload to clear state
                 } catch (err) { notify('حدث خطأ أثناء الحذف', 'error'); } 
                 finally { setIsProcessing(false); }
             }
        } else {
             notify('تم إلغاء عملية الحذف', 'info');
        }
    };

    return (
        <SubViewContainer>
            <div className="space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <h4 className="font-bold mb-2 text-slate-800 dark:text-white">النسخ الاحتياطي والاستعادة</h4>
                    <p className="text-xs text-slate-500 mb-4">احتفظ بنسخة من بياناتك أو استعدها من ملف. ننصح بالتصدير بشكل دوري.</p>
                    <div className="flex gap-2">
                        <button onClick={handleExport} disabled={isProcessing} className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">
                            {isProcessing ? <Loader2 className="animate-spin"/> : <Download size={16}/>} تصدير
                        </button>
                        <button onClick={() => importFileRef.current?.click()} disabled={isProcessing} className="flex-1 flex items-center justify-center gap-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-bold">
                            <UploadCloud size={16}/> استيراد
                        </button>
                        <input type="file" ref={importFileRef} onChange={handleImport} className="hidden" accept=".json"/>
                    </div>
                </div>
                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
                    <h4 className="font-bold mb-2 text-rose-800 dark:text-rose-300 flex items-center gap-2"><AlertTriangle/> منطقة الخطر</h4>
                    <p className="text-xs text-rose-600 dark:text-rose-400 mb-4">سيؤدي هذا الإجراء إلى حذف جميع بياناتك (الحسابات، العمليات، القروض) بشكل نهائي.</p>
                    <button onClick={handleWipe} disabled={isProcessing} className="w-full py-2 bg-rose-600 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                         {isProcessing ? <Loader2 className="animate-spin"/> : <Trash2 size={16}/>} مسح جميع البيانات
                    </button>
                </div>
            </div>
        </SubViewContainer>
    );
};

const AboutView = () => (
    <SubViewContainer>
        <div className="text-center">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">تطبيق منجز</h3>
            <p className="text-slate-500 text-sm mt-2">v1.0.0 - مساعدك المالي الذكي</p>
        </div>
        <p className="mt-6 text-slate-700 dark:text-slate-300 leading-relaxed text-center max-w-prose mx-auto">
            تم تصميم منجز ليكون أكثر من مجرد تطبيق لتتبع المصاريف. إنه نظام متكامل يساعدك على فهم أموالك، إدارة ديونك، والتخطيط لمستقبلك المالي بذكاء وثقة. باستخدام أحدث التقنيات، نسعى لتمكينك من اتخاذ قرارات مالية أفضل.
        </p>
    </SubViewContainer>
);

const PrivacyView = () => (
    <SubViewContainer>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">سياسة الخصوصية</h3>
        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <p>نحن في "منجز" نأخذ خصوصيتك على محمل الجد. بياناتك المالية حساسة، ونحن نتعامل معها بأعلى درجات الأمان.</p>
            <p><strong className="text-slate-800 dark:text-slate-200">تخزين البيانات:</strong> جميع بياناتك المالية تُخزن بشكل آمن في قاعدة بيانات Supabase الخاصة بك. ليس لدينا وصول إلى هذه البيانات.</p>
            <p><strong className="text-slate-800 dark:text-slate-200">الميزات الذكية:</strong> عند استخدام الميزات التي تتطلب تحليل الذكاء الاصطناعي (مثل تحليل الرسائل النصية)، يتم إرسال النص فقط إلى واجهة برمجة تطبيقات Gemini API للمعالجة، ولا يتم تخزين هذا النص من قبل Google أو منجز بعد انتهاء المعالجة.</p>
            <p>نحن لا نشارك بياناتك مع أي طرف ثالث. خصوصيتك هي أولويتنا.</p>
        </div>
    </SubViewContainer>
);

const SupportView = () => (
    <SubViewContainer>
         <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">الدعم والمساعدة</h3>
         <p className="text-sm text-slate-600 dark:text-slate-400">
             هل تواجه مشكلة أو لديك اقتراح؟ يسعدنا أن نسمع منك!
         </p>
         <a href="mailto:support@monjez.app" className="mt-4 inline-block w-full text-center py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">
             تواصل معنا عبر البريد الإلكتروني
         </a>
    </SubViewContainer>
);

const Settings: React.FC<SettingsProps> = ({ settings, setSettings, onReloadApp }) => {
  const { notify } = useNotification();
  const [formData, setFormData] = useState<UserSettings>(settings);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeView, setActiveView] = useState('main');
  const [viewTitle, setViewTitle] = useState('');

  // Sync formData when settings prop changes (e.g., after login)
  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'app') => {
      const file = e.target.files?.[0];
      if (file) {
          if (file.size > 1000000) { notify('حجم الصورة كبير جداً (1MB كحد أقصى)', 'error'); return; }
          const reader = new FileReader();
          reader.onload = () => setFormData((prev: UserSettings) => ({ ...prev, appLogo: reader.result as string }));
          reader.readAsDataURL(file);
      }
  };
  
  const handleSave = async () => {
    setIsProcessing(true);
    try {
      const updatedSettings = await storageService.saveSettings(formData);
      setSettings(updatedSettings);
      setFormData(updatedSettings);
      notify('تم حفظ التغييرات بنجاح', 'success');
      setActiveView('main');
    } catch(err) { notify('فشل حفظ الإعدادات', 'error'); } finally { setIsProcessing(false); }
  };

  const handleShare = async () => {
      if (navigator.share) {
          try {
              await navigator.share({
                  title: 'تطبيق منجز المالي',
                  text: 'اكتشف أفضل طريقة لإدارة أموالك مع تطبيق منجز!',
                  url: window.location.href
              });
          } catch(e) { console.error("Share failed", e); }
      } else {
          notify('متصفحك لا يدعم المشاركة المباشرة', 'info');
      }
  };

  const openView = (view: string, title: string) => {
    setActiveView(view);
    setViewTitle(title);
  };
  
  const renderMainView = () => (
    <div className="space-y-6">
      <SettingsSection title="أدوات">
        <SettingsItem icon={<Landmark size={24} className="text-blue-500" />} text="الحسابات والبطاقات" onClick={() => openView('accounts', 'الحسابات والبطاقات')} />
        <SettingsItem icon={<DollarSign size={24} className="text-emerald-500" />} text="الدخل والراتب" onClick={() => openView('income', 'الدخل والراتب')} />
        <SettingsItem icon={<Tags size={24} className="text-pink-500" />} text="التصنيفات" onClick={() => notify('هذه الميزة قيد التطوير', 'info')} />
      </SettingsSection>

      <SettingsSection title="إعدادات">
        <SettingsItem icon={<SettingsIcon size={24} className="text-gray-500" />} text="عام" onClick={() => openView('general', 'الإعدادات العامة')} />
        <SettingsItem icon={<Bell size={24} className="text-yellow-500" />} text="الإشعارات" onClick={() => openView('notifications', 'الإشعارات والتنبيهات')} />
        <SettingsItem icon={<Database size={24} className="text-cyan-500" />} text="البيانات" onClick={() => openView('data', 'البيانات والنسخ الاحتياطي')} />
        <SettingsItem icon={<Shield size={24} className="text-orange-500" />} text="الخصوصية والأمان" onClick={() => openView('security', 'الخصوصية والأمان')} />
      </SettingsSection>

      <SettingsSection title="مزيد ...">
        <SettingsItem icon={<HelpCircle size={24} className="text-sky-500" />} text="من نحن؟" onClick={() => openView('about', 'من نحن؟')} />
        <SettingsItem icon={<MessageSquare size={24} className="text-green-500" />} text="الدعم والمساعدة" onClick={() => openView('support', 'الدعم والمساعدة')} />
        <SettingsItem icon={<Star size={24} className="text-yellow-400" />} text="قيم التطبيق" onClick={() => notify('قريباً على متاجر التطبيقات!', 'info')} />
        <SettingsItem icon={<Share2 size={24} className="text-indigo-500" />} text="شارك التطبيق" onClick={handleShare} />
      </SettingsSection>
    </div>
  );

  const renderViewContent = () => {
    switch (activeView) {
      case 'general': return <GeneralSettings formData={formData} setFormData={setFormData} handleFileSelect={handleFileSelect} />;
      case 'accounts': return <AccountsSettings formData={formData} setFormData={setFormData} />;
      case 'income': return <IncomeSettings formData={formData} setFormData={setFormData} />;
      case 'notifications': return <SubViewContainer><PwaManager /></SubViewContainer>;
      case 'security': return <SecuritySettings formData={formData} setFormData={setFormData} />;
      case 'data': return <DataSettings onReloadApp={onReloadApp} />;
      case 'about': return <AboutView />;
      case 'privacy': return <PrivacyView />;
      case 'support': return <SupportView />;
      default: return renderMainView();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-20 md:pb-10 px-2 md:px-0">
      <div className="flex items-center gap-2 mb-4 h-9">
        {activeView !== 'main' && (
            <button onClick={() => setActiveView('main')} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors animate-fade-in">
                <ChevronLeft size={24} className="text-slate-500"/>
            </button>
        )}
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{activeView !== 'main' && viewTitle}</h2>
      </div>

      {renderViewContent()}

      {/* Save button only shows for views that need it */}
      {['general', 'accounts', 'income', 'security'].includes(activeView) && (
        <div className="flex justify-end pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
            <button 
                onClick={handleSave} 
                disabled={isProcessing}
                className="flex items-center gap-2 bg-slate-900 dark:bg-[#bef264] text-white dark:text-slate-900 px-6 py-3 rounded-xl font-bold shadow-lg"
            >
                {isProcessing ? <Loader2 className="animate-spin" /> : <Save />}
                حفظ التغييرات
            </button>
        </div>
      )}
    </div>
  );
};

const SettingsWrapper: React.FC<{ settings: UserSettings; setSettings: React.Dispatch<React.SetStateAction<UserSettings | null>> }> = ({ settings, setSettings }) => {
    const handleReload = () => {
        window.location.reload();
    };

    return <Settings settings={settings} setSettings={setSettings} onReloadApp={handleReload} />;
};


export default SettingsWrapper;