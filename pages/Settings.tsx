import React, { useState, useEffect, useRef } from 'react';
import { UserSettings, IncomeSource, BankCard, ThemeOption, RecurringTransaction, CustomCategory, TransactionType, LogoPosition, EntityLogo, Allowance } from '../types';
import { storageService } from '../services/storage';
import { Save, Settings as SettingsIcon, BellRing, DollarSign, Calendar, Database, Trash2, Download, CreditCard, Moon, Sun, Monitor, Plus, X, Lock, Loader2, RotateCw, Tag, Wallet, Image, Move, Building2, UploadCloud, Calculator, Crop, ZoomIn, Check } from 'lucide-react';
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
  
  // Logos State
  const [logos, setLogos] = useState<EntityLogo[]>([]);
  const [newLogoName, setNewLogoName] = useState('');
  
  // Editor State
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [editorState, setEditorState] = useState({ zoom: 1, rotate: 0, x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
      loadLogos();
      // Ensure we have at least one income source object to edit
      if (!formData.incomeSources || formData.incomeSources.length === 0) {
          setFormData(prev => ({
              ...prev,
              incomeSources: [{ 
                  id: '1', name: 'الراتب الشهري', amount: 0, dayOfMonth: 27, 
                  basicSalary: 0, gosiDeduction: 0, allowances: [] 
              }]
          }));
      }
  }, []);

  const loadLogos = async () => {
      const data = await storageService.getLogos();
      setLogos(data);
  };

  // --- Image Editor Logic ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (file.size > 5000000) { notify('حجم الصورة كبير جداً', 'error'); return; }
          const reader = new FileReader();
          reader.onload = () => {
              setRawImage(reader.result as string);
              setEditorState({ zoom: 1, rotate: 0, x: 0, y: 0 }); // Reset state
          };
          reader.readAsDataURL(file);
      }
  };

  const drawCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas || !rawImage) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new window.Image();
      img.src = rawImage;
      img.onload = () => {
          // Clear
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.save();
          // Center & Transform
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((editorState.rotate * Math.PI) / 180);
          ctx.scale(editorState.zoom, editorState.zoom);
          ctx.translate(editorState.x, editorState.y);
          
          // Draw Image Centered
          ctx.drawImage(img, -img.width / 2, -img.height / 2);
          ctx.restore();
      };
  };

  useEffect(() => {
      if (rawImage) {
          drawCanvas();
      }
  }, [rawImage, editorState]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
      setIsDragging(true);
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      setDragStart({ x: clientX, y: clientY });
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      
      const dx = (clientX - dragStart.x) / editorState.zoom;
      const dy = (clientY - dragStart.y) / editorState.zoom;
      
      // Adjust dx/dy based on rotation to keep movement intuitive
      let finalDx = dx;
      let finalDy = dy;

      if (editorState.rotate === 90) { finalDx = dy; finalDy = -dx; }
      else if (editorState.rotate === 180) { finalDx = -dx; finalDy = -dy; }
      else if (editorState.rotate === 270) { finalDx = -dy; finalDy = dx; }

      setEditorState(prev => ({ ...prev, x: prev.x + finalDx, y: prev.y + finalDy }));
      setDragStart({ x: clientX, y: clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  const saveEditedLogo = async () => {
      if (!canvasRef.current || !newLogoName) { notify('الرجاء إدخال اسم الجهة', 'error'); return; }
      try {
          // Compress output
          const finalUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
          const updated = await storageService.saveLogo(newLogoName, finalUrl);
          setLogos(updated);
          setNewLogoName('');
          setRawImage(null); // Close editor
          notify('تم حفظ الشعار بنجاح', 'success');
      } catch (e) { notify('فشل الحفظ', 'error'); }
  };

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

  // --- Handlers for Salary/Income ---
  const updateIncome = (field: keyof IncomeSource, value: any) => {
      // Assuming single main income source for now, or edit the first one
      const updatedIncomes = [...formData.incomeSources];
      updatedIncomes[0] = { ...updatedIncomes[0], [field]: value };
      
      // Auto-calculate Net Amount
      if (['basicSalary', 'gosiDeduction', 'allowances'].includes(field)) {
          const inc = updatedIncomes[0];
          const basic = Number(inc.basicSalary || 0);
          const gosi = Number(inc.gosiDeduction || 0);
          const totalAllowances = (inc.allowances || []).reduce((acc, curr) => acc + Number(curr.amount), 0);
          updatedIncomes[0].amount = basic + totalAllowances - gosi;
      }
      
      setFormData(prev => ({ ...prev, incomeSources: updatedIncomes }));
  };

  const addAllowance = () => {
      const updatedIncomes = [...formData.incomeSources];
      const newAllowance: Allowance = { id: Date.now().toString(), name: '', amount: 0 };
      updatedIncomes[0].allowances = [...(updatedIncomes[0].allowances || []), newAllowance];
      setFormData(prev => ({ ...prev, incomeSources: updatedIncomes }));
  };

  const updateAllowance = (id: string, field: keyof Allowance, value: any) => {
      const updatedIncomes = [...formData.incomeSources];
      const allowances = updatedIncomes[0].allowances || [];
      updatedIncomes[0].allowances = allowances.map(a => a.id === id ? { ...a, [field]: value } : a);
      
      // Recalculate Net
      const basic = Number(updatedIncomes[0].basicSalary || 0);
      const gosi = Number(updatedIncomes[0].gosiDeduction || 0);
      const totalAllowances = updatedIncomes[0].allowances.reduce((acc, curr) => acc + Number(curr.amount), 0);
      updatedIncomes[0].amount = basic + totalAllowances - gosi;

      setFormData(prev => ({ ...prev, incomeSources: updatedIncomes }));
  };

  const removeAllowance = (id: string) => {
      const updatedIncomes = [...formData.incomeSources];
      updatedIncomes[0].allowances = (updatedIncomes[0].allowances || []).filter(a => a.id !== id);
      
      // Recalculate Net
      const basic = Number(updatedIncomes[0].basicSalary || 0);
      const gosi = Number(updatedIncomes[0].gosiDeduction || 0);
      const totalAllowances = updatedIncomes[0].allowances.reduce((acc, curr) => acc + Number(curr.amount), 0);
      updatedIncomes[0].amount = basic + totalAllowances - gosi;

      setFormData(prev => ({ ...prev, incomeSources: updatedIncomes }));
  };

  const autoCalculateGosi = () => {
      const basic = Number(formData.incomeSources[0].basicSalary || 0);
      if (basic > 0) {
          // KSA Standard: 9.75% (9% GOSI + 0.75% Saned) approx
          const gosi = Math.round(basic * 0.0975);
          updateIncome('gosiDeduction', gosi);
      }
  };

  const deleteLogo = async (id: string) => {
      try {
          const updated = await storageService.deleteLogo(id);
          setLogos(updated);
          notify('تم الحذف', 'info');
      } catch(e) { notify('فشل الحذف', 'error'); }
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

  const currentIncome: IncomeSource = formData.incomeSources[0] || { 
      id: 'default',
      name: 'Default',
      amount: 0, 
      dayOfMonth: 1, 
      basicSalary: 0, 
      gosiDeduction: 0, 
      allowances: [] 
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 md:pb-10 animate-fade-in px-2 md:px-0">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><SettingsIcon size={32} className="text-[#bef264]"/> إعدادات النظام</h2>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Salary Calculator (New Detailed Section) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
             <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                 <div className="flex items-center gap-3"><DollarSign className="text-emerald-500" /><h3 className="font-bold text-slate-900 dark:text-white">تفاصيل الراتب والدخل</h3></div>
                 <div className="bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 rounded-full text-emerald-700 dark:text-emerald-300 text-xs font-bold">يتم الإيداع تلقائياً يوم {currentIncome.dayOfMonth}</div>
             </div>
             
             {/* Mobile View: flex-col-reverse ensures the "Result" (2nd div) appears at top on mobile */}
             <div className="flex flex-col-reverse md:grid md:grid-cols-2 gap-6">
                 
                 {/* Inputs Column */}
                 <div className="space-y-4">
                     <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block font-bold">الراتب الأساسي</label>
                        <div className="relative">
                            <input 
                                type="number" 
                                value={currentIncome.basicSalary || ''} 
                                onChange={e => updateIncome('basicSalary', Number(e.target.value))} 
                                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-emerald-500 pl-12"
                                placeholder="0.00"
                            />
                            <span className="absolute left-4 top-3.5 text-slate-400 text-xs">SAR</span>
                        </div>
                     </div>

                     <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                         <div className="flex justify-between items-center mb-2">
                            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold">خصم التأمينات (GOSI)</label>
                            <button type="button" onClick={autoCalculateGosi} className="text-[10px] text-indigo-500 hover:underline flex items-center gap-1"><Calculator size={10}/> حساب تلقائي (9.75%)</button>
                         </div>
                         <div className="relative">
                            <input 
                                type="number" 
                                value={currentIncome.gosiDeduction || ''} 
                                onChange={e => updateIncome('gosiDeduction', Number(e.target.value))} 
                                className="w-full p-3 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-rose-500 font-bold outline-none focus:ring-2 focus:ring-rose-500 pl-12"
                                placeholder="0.00"
                            />
                             <span className="absolute left-4 top-3.5 text-slate-400 text-xs">SAR</span>
                         </div>
                     </div>

                     <div>
                        <div className="flex justify-between items-center mb-2">
                             <label className="text-xs text-slate-500 dark:text-slate-400 font-bold">البدلات والإضافات</label>
                             <button type="button" onClick={addAllowance} className="text-xs text-indigo-500 flex items-center gap-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-2 py-1 rounded"><Plus size={12}/> إضافة بدل</button>
                        </div>
                        <div className="space-y-2">
                            {(!currentIncome.allowances || currentIncome.allowances.length === 0) && (
                                <p className="text-xs text-slate-400 text-center py-2 italic">لا توجد بدلات مضافة</p>
                            )}
                            {currentIncome.allowances?.map((allowance, idx) => (
                                <div key={allowance.id} className="flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="نوع البدل (سكن..)" 
                                        value={allowance.name}
                                        onChange={e => updateAllowance(allowance.id, 'name', e.target.value)}
                                        className="flex-[2] min-w-0 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm outline-none dark:text-white"
                                    />
                                    <input 
                                        type="number" 
                                        placeholder="المبلغ" 
                                        value={allowance.amount}
                                        onChange={e => updateAllowance(allowance.id, 'amount', Number(e.target.value))}
                                        className="flex-1 min-w-0 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm outline-none font-bold text-emerald-600 dark:text-emerald-400"
                                    />
                                    <button type="button" onClick={() => removeAllowance(allowance.id)} className="text-rose-400 hover:text-rose-500 p-1 shrink-0"><X size={16}/></button>
                                </div>
                            ))}
                        </div>
                     </div>
                 </div>

                 {/* Result & Date Column */}
                 <div className="flex flex-col gap-4">
                     <div className="flex-1 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white flex flex-col justify-center items-center shadow-lg relative overflow-hidden min-h-[160px]">
                         <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                         <p className="text-emerald-100 text-sm mb-2 font-medium">صافي الراتب (الذي سيتم إيداعه)</p>
                         <h2 className="text-4xl font-bold tracking-tight mb-1">{currentIncome.amount.toLocaleString('en-US')} <span className="text-lg font-tajawal">SAR</span></h2>
                         <p className="text-xs text-emerald-100 opacity-80 mt-2 text-center">
                             أساسي ({currentIncome.basicSalary?.toLocaleString('en-US')}) + بدلات ({(currentIncome.allowances || []).reduce((a,c)=>a+Number(c.amount),0).toLocaleString('en-US')}) - تأمينات ({currentIncome.gosiDeduction?.toLocaleString('en-US')})
                         </p>
                     </div>

                     <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                         <label className="text-sm font-bold text-slate-700 dark:text-slate-300">يوم الإيداع الشهري (ميلادي)</label>
                         <div className="flex items-center gap-2">
                             <Calendar size={18} className="text-slate-400"/>
                             <input 
                                type="number" 
                                min="1" max="31"
                                value={currentIncome.dayOfMonth}
                                onChange={e => updateIncome('dayOfMonth', Number(e.target.value))}
                                className="w-16 p-2 text-center font-bold rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 outline-none text-slate-900 dark:text-white"
                             />
                         </div>
                     </div>
                 </div>
             </div>
        </div>

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

        {/* Institution Logos Management */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
             <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                 <div className="flex items-center gap-3"><Building2 className="text-emerald-500" /><h3 className="font-bold text-slate-900 dark:text-white">إدارة شعارات الجهات</h3></div>
             </div>
             
             {/* Add New Logo */}
             <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700 mb-6">
                 <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">إضافة شعار جديد</h4>
                 <div className="flex flex-col md:flex-row gap-4 items-end">
                     <div className="flex-1 w-full">
                         <label className="text-xs text-slate-500 mb-1 block">اسم الجهة (مطابق تماماً لما تكتبه في الفاتورة/القرض)</label>
                         <input type="text" value={newLogoName} onChange={e=>setNewLogoName(e.target.value)} placeholder="مثال: مصرف الراجحي، STC..." className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none" />
                     </div>
                     <div className="w-full md:w-auto">
                        <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${rawImage ? 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900/30' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500'}`}>
                            <UploadCloud size={16} />
                            <span className="text-xs font-bold">رفع صورة</span>
                            <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                        </label>
                     </div>
                 </div>
             </div>

             {/* List Logos */}
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                 {logos.map(logo => (
                     <div key={logo.id} className="relative group bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-3 flex flex-col items-center gap-2">
                         <div className="w-12 h-12 rounded-full overflow-hidden bg-white flex items-center justify-center border border-slate-100 shadow-sm">
                             <img src={logo.logoUrl} alt={logo.name} className="w-full h-full object-cover" />
                         </div>
                         <span className="text-xs font-bold text-center text-slate-700 dark:text-slate-300 truncate w-full">{logo.name}</span>
                         <button type="button" onClick={() => deleteLogo(logo.id)} className="absolute top-1 right-1 p-1 bg-rose-100 text-rose-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                     </div>
                 ))}
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
                                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">رقم البطاقة (آخر 4)</label>
                                <input 
                                    type="text" maxLength={4} 
                                    value={card.cardNumber} 
                                    onChange={e => updateCard(card.id, 'cardNumber', e.target.value)}
                                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-sm outline-none"
                                />
                             </div>
                             <div>
                                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">الرصيد الحالي</label>
                                <input 
                                    type="number"
                                    step="0.01" 
                                    value={card.balance} 
                                    onChange={e => updateCard(card.id, 'balance', Number(e.target.value))}
                                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-sm outline-none"
                                />
                             </div>
                        </div>
                        <div className="flex items-end gap-3">
                             <div className="flex-1">
                                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">لون البطاقة</label>
                                <input 
                                    type="color" 
                                    value={card.color} 
                                    onChange={e => updateCard(card.id, 'color', e.target.value)}
                                    className="w-full h-9 p-0 border-0 rounded-lg cursor-pointer"
                                />
                             </div>
                             <button type="button" onClick={() => removeCard(card.id)} className="flex-1 text-xs text-rose-500 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-300 p-2 rounded-lg font-bold hover:bg-rose-100 transition-colors h-9">حذف</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Security Section */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4"><Lock className="text-rose-500" /><h3 className="font-bold text-slate-900 dark:text-white">الأمان</h3></div>
            <div>
              <label className="text-sm block mb-1 text-slate-600 dark:text-slate-300">كلمة المرور الجديدة</label>
              <input 
                type="password" 
                name="password" 
                value={formData.password || ''} 
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#bef264]"
                placeholder="اتركه فارغاً لعدم التغيير"
              />
            </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={isProcessing}
            className="flex items-center gap-2 bg-slate-900 dark:bg-[#bef264] text-white dark:text-slate-900 px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all disabled:opacity-70"
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Save />}
            {saved ? 'تم الحفظ!' : 'حفظ التغييرات'}
          </button>
        </div>
      </form>

      {/* Image Editor Modal */}
      {rawImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-6 shadow-2xl animate-scale-in">
                <h3 className="font-bold text-lg mb-4 text-slate-900 dark:text-white">تعديل الشعار</h3>
                <div 
                    className="relative w-full aspect-square bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden cursor-move"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchMove={handleMouseMove}
                    onTouchEnd={handleMouseUp}
                >
                    <canvas ref={canvasRef} width={300} height={300} className="w-full h-full"></canvas>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                    <div>
                        <label className="block text-xs mb-1 text-slate-500">تكبير/تصغير</label>
                        <input type="range" min="0.5" max="3" step="0.1" value={editorState.zoom} onChange={e => setEditorState(p => ({ ...p, zoom: Number(e.target.value) }))} className="w-full accent-[#bef264]" />
                    </div>
                    <div>
                        <label className="block text-xs mb-1 text-slate-500">تدوير</label>
                        <input type="range" min="0" max="360" step="90" value={editorState.rotate} onChange={e => setEditorState(p => ({ ...p, rotate: Number(e.target.value) }))} className="w-full accent-[#bef264]" />
                    </div>
                </div>
                <div className="flex gap-2 mt-6">
                    <button type="button" onClick={() => setRawImage(null)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-bold">إلغاء</button>
                    <button type="button" onClick={saveEditedLogo} className="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-bold flex items-center justify-center gap-2"><Check size={16}/> اعتماد</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
