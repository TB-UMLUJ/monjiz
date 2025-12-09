import React, { useState, useEffect, useRef } from 'react';
import { UserSettings, IncomeSource, BankCard, ThemeOption, LogoPosition, EntityLogo, Allowance, ReportConfig, Transaction, Loan, Bill } from '../types';
import { storageService } from '../services/storage';
import { Save, Settings as SettingsIcon, DollarSign, Calendar, Trash2, UploadCloud, Calculator, Check, FileText, Printer, CheckSquare, Square, X, Download, Plus, Loader2, CreditCard, Palette, Shield, Lock, Image as ImageIcon } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';

// Libraries for PDF Generation
// @ts-ignore
import html2canvas from 'html2canvas';
// @ts-ignore
import jsPDF from 'jspdf';

interface SettingsProps {
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings | null>>;
}

const SAUDI_BANKS = ['مصرف الراجحي', 'البنك الأهلي السعودي', 'بنك الرياض', 'مصرف الإنماء', 'البنك العربي الوطني', 'البنك السعودي الأول (SAB)', 'بنك البلاد', 'بنك الجزيرة', 'البنك السعودي للاستثمار', 'بنك الخليج الدولي', 'البنك السعودي الفرنسي', 'STC Pay', 'UrPay'];
const CARD_TYPES = ['Visa', 'Mada', 'MasterCard', 'Amex'];

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

  // Report State
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
      includeSnapshot: true,
      includeLoans: true,
      includeBills: true,
      includeAiAnalysis: true
  });
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [reportData, setReportData] = useState<{transactions: Transaction[], loans: Loan[], bills: Bill[]} | null>(null);

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

  const prepareReportData = async () => {
      const [txs, lns, bls] = await Promise.all([
          storageService.getTransactions(),
          storageService.getLoans(),
          storageService.getBills()
      ]);
      setReportData({ transactions: txs, loans: lns, bills: bls });
  };

  const addSmartPageBreaks = async () => {
      const report = reportRef.current;
      if (!report) return;

      // Reset: Remove previous spacers
      report.querySelectorAll('.print-spacer').forEach(el => el.remove());
      // Force Layout Reflow
      await new Promise(r => setTimeout(r, 100));

      const PAGE_HEIGHT = 1123; // A4 Height in PX at standard web DPI (approx 96dpi for 794px width)
      const reportTop = report.getBoundingClientRect().top;

      // Select all atomic elements that shouldn't be split
      // We target: Section headers, Summary Cards, Loan Cards, and Table Rows
      const targets = Array.from(report.querySelectorAll('.report-section, .report-summary-card, .report-loan-card, tr.report-bill-row, .report-section h2')) as HTMLElement[];
      
      // Sort by vertical position to process in order
      targets.sort((a, b) => {
          const rectA = a.getBoundingClientRect();
          const rectB = b.getBoundingClientRect();
          return rectA.top - rectB.top;
      });

      for (const el of targets) {
          const rect = el.getBoundingClientRect();
          const top = rect.top - reportTop;
          const height = rect.height;

          // If the element itself is taller than a page, we can't do much (it will break inside).
          // We only fix elements that FIT on a page but happen to cross the line.
          if (height >= PAGE_HEIGHT) continue;

          const startPage = Math.floor(top / PAGE_HEIGHT);
          const endPage = Math.floor((top + height) / PAGE_HEIGHT);

          if (startPage !== endPage) {
              // Element crosses page boundary! Push it to next page.
              const nextPageY = (startPage + 1) * PAGE_HEIGHT;
              // Add a spacer. We calculate needed height to reach next page + small buffer
              const spacerHeight = nextPageY - top + 20;

              if (el.tagName === 'TR') {
                  // For tables, insert a spacer row
                  const spacer = document.createElement('tr');
                  spacer.className = 'print-spacer';
                  spacer.style.height = `${spacerHeight}px`;
                  spacer.innerHTML = '<td colspan="100" style="border:none; padding:0;"></td>';
                  el.parentElement?.insertBefore(spacer, el);
              } else {
                  // For blocks
                  const spacer = document.createElement('div');
                  spacer.className = 'print-spacer';
                  spacer.style.height = `${spacerHeight}px`;
                  spacer.style.width = '100%';
                  el.parentElement?.insertBefore(spacer, el);
              }
          }
      }
  };

  const handleGenerateReport = async () => {
      setIsGeneratingReport(true);
      
      try {
          // 1. Ensure data is loaded
          if (!reportData) await prepareReportData();

          // 2. Wait for DOM to render the hidden report
          await new Promise(resolve => setTimeout(resolve, 500));
          
          if (reportRef.current) {
              // 3. Apply Smart Page Breaks logic
              await addSmartPageBreaks();
              // Wait for spacer reflow
              await new Promise(resolve => setTimeout(resolve, 300));

              // 4. Capture Canvas
              const canvas = await html2canvas(reportRef.current, {
                  scale: 2, // High resolution
                  useCORS: true,
                  logging: false,
                  backgroundColor: '#ffffff'
              });

              // 5. Create PDF
              const imgData = canvas.toDataURL('image/png');
              // jsPDF default export usage
              const pdf = new jsPDF({
                  orientation: 'portrait',
                  unit: 'mm',
                  format: 'a4'
              });

              const imgWidth = 210; // A4 width in mm
              const pageHeight = 297; // A4 height in mm
              const imgHeight = (canvas.height * imgWidth) / canvas.width;
              
              let heightLeft = imgHeight;
              let position = 0;

              pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
              heightLeft -= pageHeight;

              // Handle multi-page
              while (heightLeft >= 0) {
                  position = heightLeft - imgHeight;
                  pdf.addPage();
                  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                  heightLeft -= pageHeight;
              }

              pdf.save(`Monjez_Report_${new Date().toISOString().split('T')[0]}.pdf`);
              notify('تم تصدير التقرير بنجاح', 'success');
              setShowReportModal(false);
          }
      } catch (e) {
          console.error(e);
          notify('حدث خطأ أثناء إنشاء التقرير', 'error');
      } finally {
          setIsGeneratingReport(false);
      }
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
          const finalUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
          const updated = await storageService.saveLogo(newLogoName, finalUrl);
          setLogos(updated);
          setNewLogoName('');
          setRawImage(null); 
          notify('تم حفظ الشعار بنجاح', 'success');
      } catch (e) { notify('فشل الحفظ', 'error'); }
  };

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
      
      const basic = Number(updatedIncomes[0].basicSalary || 0);
      const gosi = Number(updatedIncomes[0].gosiDeduction || 0);
      const totalAllowances = updatedIncomes[0].allowances.reduce((acc, curr) => acc + Number(curr.amount), 0);
      updatedIncomes[0].amount = basic + totalAllowances - gosi;

      setFormData(prev => ({ ...prev, incomeSources: updatedIncomes }));
  };

  const removeAllowance = (id: string) => {
      const updatedIncomes = [...formData.incomeSources];
      updatedIncomes[0].allowances = (updatedIncomes[0].allowances || []).filter(a => a.id !== id);
      
      const basic = Number(updatedIncomes[0].basicSalary || 0);
      const gosi = Number(updatedIncomes[0].gosiDeduction || 0);
      const totalAllowances = updatedIncomes[0].allowances.reduce((acc, curr) => acc + Number(curr.amount), 0);
      updatedIncomes[0].amount = basic + totalAllowances - gosi;

      setFormData(prev => ({ ...prev, incomeSources: updatedIncomes }));
  };

  const autoCalculateGosi = () => {
      const basic = Number(formData.incomeSources[0].basicSalary || 0);
      if (basic > 0) {
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
      const updatedSettings = await storageService.saveSettings(formData);
      setSettings(updatedSettings);
      setFormData(updatedSettings);
      setSaved(true);
      notify('تم حفظ الإعدادات بنجاح', 'success');
      setTimeout(() => setSaved(false), 3000);
    } catch(err) { notify('فشل حفظ الإعدادات', 'error'); } finally { setIsProcessing(false); }
  };

  const currentIncome: IncomeSource = formData.incomeSources[0] || { 
      id: 'default', name: 'Default', amount: 0, dayOfMonth: 1, basicSalary: 0, gosiDeduction: 0, allowances: [] 
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 md:pb-10 animate-fade-in px-2 md:px-0">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><SettingsIcon size={32} className="text-[#bef264]"/> إعدادات النظام</h2>
        
        {/* Generate Report Trigger */}
        <button 
            onClick={() => { setShowReportModal(true); prepareReportData(); }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-colors"
        >
            <Printer size={18}/>
            <span>إصدار تقرير مالي</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Salary Calculator */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
             <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                 <div className="flex items-center gap-3"><DollarSign className="text-emerald-500" /><h3 className="font-bold text-slate-900 dark:text-white">تفاصيل الراتب والدخل</h3></div>
                 <div className="bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 rounded-full text-emerald-700 dark:text-emerald-300 text-xs font-bold">يتم الإيداع تلقائياً يوم {currentIncome.dayOfMonth}</div>
             </div>
             
             <div className="flex flex-col-reverse md:grid md:grid-cols-2 gap-6">
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
                                        type="text" placeholder="نوع البدل (سكن..)" 
                                        value={allowance.name} onChange={e => updateAllowance(allowance.id, 'name', e.target.value)}
                                        className="flex-[2] min-w-0 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm outline-none dark:text-white"
                                    />
                                    <input 
                                        type="number" placeholder="المبلغ" 
                                        value={allowance.amount} onChange={e => updateAllowance(allowance.id, 'amount', Number(e.target.value))}
                                        className="flex-1 min-w-0 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm outline-none font-bold text-emerald-600 dark:text-emerald-400"
                                    />
                                    <button type="button" onClick={() => removeAllowance(allowance.id)} className="text-rose-400 hover:text-rose-500 p-1 shrink-0"><X size={16}/></button>
                                </div>
                            ))}
                        </div>
                     </div>
                 </div>
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
                             <input type="number" min="1" max="31" value={currentIncome.dayOfMonth} onChange={e => updateIncome('dayOfMonth', Number(e.target.value))} className="w-16 p-2 text-center font-bold rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 outline-none text-slate-900 dark:text-white" />
                         </div>
                     </div>
                 </div>
             </div>
        </div>
        
        {/* Theme Settings */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                <Palette className="text-purple-500" />
                <h3 className="font-bold text-slate-900 dark:text-white">المظهر والتخصيص</h3>
            </div>
            <div className="flex gap-4">
                {(['light', 'dark', 'system'] as const).map(theme => (
                    <div 
                        key={theme}
                        onClick={() => setFormData(prev => ({ ...prev, theme }))}
                        className={`flex-1 p-4 rounded-xl border cursor-pointer text-center transition-all ${formData.theme === theme ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300 ring-1 ring-purple-500' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 text-slate-500'}`}
                    >
                        <p className="font-bold text-sm capitalize">
                            {theme === 'light' ? 'فاتح' : theme === 'dark' ? 'داكن' : 'النظام'}
                        </p>
                    </div>
                ))}
            </div>
        </div>

        {/* Bank Cards Management */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
             <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                 <div className="flex items-center gap-3"><CreditCard className="text-blue-500" /><h3 className="font-bold text-slate-900 dark:text-white">البطاقات والحسابات</h3></div>
                 <button type="button" onClick={addCard} className="flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100"><Plus size={14}/> إضافة بطاقة</button>
             </div>
             
             <div className="space-y-4">
                 {formData.cards.map((card, idx) => (
                     <div key={card.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                             <div>
                                 <label className="text-xs text-slate-500 mb-1 block">اسم البنك</label>
                                 <input 
                                     type="text" 
                                     list={`banks-${idx}`}
                                     value={card.bankName} 
                                     onChange={e => updateCard(card.id, 'bankName', e.target.value)}
                                     className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                     placeholder="مصرف الراجحي..."
                                 />
                                 <datalist id={`banks-${idx}`}>
                                     {SAUDI_BANKS.map(b => <option key={b} value={b}/>)}
                                 </datalist>
                             </div>
                             <div>
                                 <label className="text-xs text-slate-500 mb-1 block">آخر 4 أرقام</label>
                                 <input 
                                     type="text" maxLength={4}
                                     value={card.cardNumber} 
                                     onChange={e => updateCard(card.id, 'cardNumber', e.target.value)}
                                     className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm outline-none font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                     placeholder="8899"
                                 />
                             </div>
                             <div>
                                 <label className="text-xs text-slate-500 mb-1 block">النوع</label>
                                 <select 
                                     value={card.cardType} 
                                     onChange={e => updateCard(card.id, 'cardType', e.target.value)}
                                     className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                 >
                                     {CARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                 </select>
                             </div>
                             <div>
                                 <label className="text-xs text-slate-500 mb-1 block">الرصيد الحالي</label>
                                 <input 
                                     type="number" 
                                     value={card.balance} 
                                     onChange={e => updateCard(card.id, 'balance', Number(e.target.value))}
                                     className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm outline-none font-bold text-emerald-600 bg-white dark:bg-slate-800"
                                     placeholder="0.00"
                                 />
                             </div>
                         </div>
                         <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                             <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">الشعار:</span>
                                {card.logoUrl ? <img src={card.logoUrl} className="w-6 h-6 object-contain" alt="logo"/> : <span className="text-xs text-slate-400 italic">تلقائي</span>}
                             </div>
                             <button type="button" onClick={() => removeCard(card.id)} className="text-rose-500 hover:text-rose-600 text-xs flex items-center gap-1 font-bold"><Trash2 size={14}/> حذف البطاقة</button>
                         </div>
                     </div>
                 ))}
             </div>
        </div>

        {/* Bank Logos Management */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
             <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                 <div className="flex items-center gap-3"><ImageIcon className="text-amber-500" /><h3 className="font-bold text-slate-900 dark:text-white">شعارات البنوك والجهات</h3></div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                     <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">إضافة شعار جديد</h4>
                     <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                         <input 
                            type="text" 
                            className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            placeholder="اسم البنك أو الجهة (مثال: STC Pay)"
                            value={newLogoName}
                            onChange={e => setNewLogoName(e.target.value)}
                         />
                         <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                             <div className="text-center text-slate-400">
                                 <UploadCloud className="mx-auto mb-1" />
                                 <span className="text-xs">رفع صورة الشعار</span>
                             </div>
                             <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
                         </label>
                     </div>
                 </div>
                 
                 <div>
                     <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">الشعارات المحفوظة</h4>
                     <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                         {logos.map(logo => (
                             <div key={logo.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                 <div className="flex items-center gap-3">
                                     <img src={logo.logoUrl} alt={logo.name} className="w-8 h-8 object-contain bg-white rounded-md p-0.5" />
                                     <span className="text-sm font-medium dark:text-white">{logo.name}</span>
                                 </div>
                                 <button type="button" onClick={() => deleteLogo(logo.id)} className="text-slate-400 hover:text-rose-500"><X size={16}/></button>
                             </div>
                         ))}
                         {logos.length === 0 && <p className="text-xs text-slate-400 text-center py-4">لا توجد شعارات محفوظة</p>}
                     </div>
                 </div>
             </div>
        </div>

        {/* Security Section */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
             <div className="flex items-center gap-3 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                 <Shield className="text-rose-500" />
                 <h3 className="font-bold text-slate-900 dark:text-white">الأمان والحماية</h3>
             </div>
             <div>
                 <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">كلمة المرور للدخول</label>
                 <div className="relative max-w-sm">
                     <Lock className="absolute right-3 top-2.5 text-slate-400" size={18}/>
                     <input 
                        type="text" 
                        value={formData.password || ''} 
                        onChange={handleChange}
                        name="password"
                        className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-rose-500 dark:text-white"
                        placeholder="••••••"
                     />
                 </div>
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

      {/* Report Generator Modal */}
      {showReportModal && (
          <div 
             className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
             onClick={() => setShowReportModal(false)}
          >
              <div 
                 className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-6 shadow-2xl animate-scale-in"
                 onClick={(e) => e.stopPropagation()}
              >
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-xl text-slate-900 dark:text-white flex items-center gap-2"><FileText className="text-indigo-500"/> تقرير مالي ذكي</h3>
                      <button onClick={() => setShowReportModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500"><X size={20}/></button>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                      <p className="text-sm text-slate-500 dark:text-slate-400">حدد الأقسام التي تود تضمينها في تقرير PDF:</p>
                      <div className="space-y-3">
                          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl cursor-pointer">
                              <input type="checkbox" checked={reportConfig.includeSnapshot} onChange={e => setReportConfig({...reportConfig, includeSnapshot: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                              <span className="font-bold text-sm text-slate-800 dark:text-slate-200">ملخص الحالة المالية</span>
                          </label>
                          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl cursor-pointer">
                              <input type="checkbox" checked={reportConfig.includeLoans} onChange={e => setReportConfig({...reportConfig, includeLoans: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                              <span className="font-bold text-sm text-slate-800 dark:text-slate-200">تفاصيل القروض والديون</span>
                          </label>
                          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl cursor-pointer">
                              <input type="checkbox" checked={reportConfig.includeBills} onChange={e => setReportConfig({...reportConfig, includeBills: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                              <span className="font-bold text-sm text-slate-800 dark:text-slate-200">الفواتير والالتزامات الشهرية</span>
                          </label>
                          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl cursor-pointer">
                              <input type="checkbox" checked={reportConfig.includeAiAnalysis} onChange={e => setReportConfig({...reportConfig, includeAiAnalysis: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                              <span className="font-bold text-sm text-slate-800 dark:text-slate-200">تحليلات الذكاء الاصطناعي</span>
                          </label>
                      </div>
                  </div>

                  <button 
                      onClick={handleGenerateReport}
                      disabled={isGeneratingReport}
                      className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-70"
                  >
                      {isGeneratingReport ? <Loader2 className="animate-spin"/> : <Download size={20}/>}
                      {isGeneratingReport ? 'جاري إنشاء التقرير...' : 'تصدير التقرير (PDF)'}
                  </button>
              </div>
          </div>
      )}

      {/* HIDDEN REPORT TEMPLATE (Rendered off-screen) */}
      {showReportModal && reportData && (
          <div className="fixed left-[-9999px] top-0 overflow-hidden pointer-events-none">
              <div 
                  ref={reportRef} 
                  className="w-[794px] min-h-[1123px] bg-white text-slate-900 p-12 font-tajawal relative flex flex-col gap-8"
                  dir="rtl"
              >
                  {/* Style for PDF page breaks */}
                  <style>{`
                      .report-section, .report-loan-card, .report-bill-row {
                          page-break-inside: avoid;
                      }
                      .print-spacer {
                          display: block;
                          background: transparent;
                          pointer-events: none;
                      }
                  `}</style>

                  {/* Watermark */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                      <img src="https://f.top4top.io/p_3619agw9o1.png" className="w-[500px]" alt="watermark"/>
                  </div>

                  {/* Header */}
                  <div className="flex justify-between items-center border-b-2 border-slate-100 pb-6 report-section">
                      <div>
                          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">تقرير مالي شامل</h1>
                          <p className="text-slate-500 text-sm">تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')}</p>
                      </div>
                      <div className="text-left">
                          <img src="https://f.top4top.io/p_3619agw9o1.png" alt="Logo" className="h-16 object-contain" />
                          <p className="text-xs text-slate-400 mt-1 font-bold">منجز - Monjez</p>
                      </div>
                  </div>

                  {/* Section 1: Snapshot */}
                  {reportConfig.includeSnapshot && (
                      <div className="space-y-4 report-section">
                          <div className="flex items-center gap-2 mb-2">
                              <div className="w-1 h-6 bg-emerald-500 rounded-full"></div>
                              <h2 className="text-xl font-bold text-slate-800">ملخص الحالة المالية</h2>
                          </div>
                          
                          {/* Financial Health Card */}
                          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex justify-between items-center report-summary-card">
                              <div>
                                  <p className="text-sm text-slate-500 mb-1">الرصيد المتاح (الكاش)</p>
                                  <h3 className="text-3xl font-bold text-slate-900">{settings.cards.reduce((acc, c) => acc + (c.balance || 0), 0).toLocaleString('en-US')} <span className="text-sm font-normal">SAR</span></h3>
                              </div>
                              <div className="w-px h-12 bg-slate-200"></div>
                              <div>
                                  <p className="text-sm text-slate-500 mb-1">إجمالي الدخل الشهري</p>
                                  <h3 className="text-2xl font-bold text-emerald-600">{reportData.transactions.filter(t => t.type === 'income').reduce((a,c) => a+c.amount, 0).toLocaleString('en-US')}</h3>
                              </div>
                              <div className="w-px h-12 bg-slate-200"></div>
                              <div>
                                  <p className="text-sm text-slate-500 mb-1">إجمالي المصروفات</p>
                                  <h3 className="text-2xl font-bold text-rose-600">{reportData.transactions.filter(t => t.type === 'expense').reduce((a,c) => a+c.amount, 0).toLocaleString('en-US')}</h3>
                              </div>
                          </div>
                      </div>
                  )}

                  {/* Section 2: Loans */}
                  {reportConfig.includeLoans && (
                      <div className="space-y-4 report-section">
                           <div className="flex items-center gap-2 mb-2">
                              <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
                              <h2 className="text-xl font-bold text-slate-800">القروض والديون النشطة</h2>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              {reportData.loans.filter(l => l.status === 'active').map(loan => {
                                  const paid = loan.schedule.filter(s=>s.isPaid).reduce((a,c)=>a+c.paymentAmount,0);
                                  const total = loan.totalAmount; // Approximate
                                  
                                  let progress = (total > 0) ? (paid/total)*100 : 0;
                                  
                                  // Handle Bridge Loans in Report
                                  const paidCount = loan.schedule.filter(s => s.isPaid).length;
                                  const totalCount = loan.schedule.length;
                                  if (paid === 0 && paidCount > 0 && totalCount > 0) {
                                      progress = (paidCount / totalCount) * 100;
                                  }

                                  return (
                                      <div key={loan.id} className="border border-slate-200 rounded-xl p-4 relative overflow-hidden report-loan-card">
                                          <div className="flex justify-between mb-2 relative z-10">
                                              <span className="font-bold text-slate-800">{loan.name}</span>
                                              <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">{Math.round(progress)}% مدفوع</span>
                                          </div>
                                          <div className="w-full bg-slate-100 h-2 rounded-full mb-2 overflow-hidden">
                                              <div className="bg-blue-500 h-full" style={{width: `${progress}%`}}></div>
                                          </div>
                                          <div className="flex justify-between text-xs text-slate-500 relative z-10">
                                              <span>متبقي: {(total - paid).toLocaleString()}</span>
                                              <span>قسط: {loan.schedule[0]?.paymentAmount.toLocaleString()}</span>
                                          </div>
                                      </div>
                                  );
                              })}
                              {reportData.loans.filter(l => l.status === 'active').length === 0 && (
                                  <p className="text-sm text-slate-400 col-span-2 text-center py-4 bg-slate-50 rounded-xl">لا توجد قروض نشطة.</p>
                              )}
                          </div>
                      </div>
                  )}

                  {/* Section 3: Bills Calendar View */}
                  {reportConfig.includeBills && (
                      <div className="space-y-4 report-section">
                           <div className="flex items-center gap-2 mb-2">
                              <div className="w-1 h-6 bg-purple-500 rounded-full"></div>
                              <h2 className="text-xl font-bold text-slate-800">الالتزامات الشهرية (الفواتير)</h2>
                          </div>
                          <div className="border border-slate-200 rounded-xl overflow-hidden">
                              <table className="w-full text-sm text-right">
                                  <thead className="bg-slate-100 text-slate-600">
                                      <tr className="report-bill-row">
                                          <th className="p-3">المزود</th>
                                          <th className="p-3">النوع</th>
                                          <th className="p-3">المبلغ</th>
                                          <th className="p-3">تاريخ الاستحقاق</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {reportData.bills.filter(b => b.status === 'active').map(bill => (
                                          <tr key={bill.id} className="report-bill-row">
                                              <td className="p-3 font-bold text-slate-800">{bill.provider}</td>
                                              <td className="p-3 text-slate-500">{bill.type}</td>
                                              <td className="p-3 font-bold text-slate-900">{bill.amount.toLocaleString()}</td>
                                              <td className="p-3 text-slate-500">{bill.startDate ? new Date(bill.startDate).getDate() : 1} من الشهر</td>
                                          </tr>
                                      ))}
                                      {reportData.bills.filter(b => b.status === 'active').length === 0 && (
                                          <tr className="report-bill-row"><td colSpan={4} className="p-4 text-center text-slate-400">لا توجد فواتير نشطة.</td></tr>
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  )}

                  {/* Section 4: AI Insights (Mocked Visual for now or dynamic) */}
                  {reportConfig.includeAiAnalysis && (
                      <div className="space-y-4 report-section">
                           <div className="flex items-center gap-2 mb-2">
                              <div className="w-1 h-6 bg-indigo-500 rounded-full"></div>
                              <h2 className="text-xl font-bold text-slate-800">توصيات المستشار الذكي</h2>
                          </div>
                          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 text-slate-700 leading-relaxed text-sm">
                              <p className="font-bold text-indigo-800 mb-2">بناءً على بياناتك المالية:</p>
                              <ul className="list-disc list-inside space-y-2">
                                  <li>معدل الادخار الحالي جيد، لكن يمكن تحسينه بتقليل المصروفات في فئة "التسوق".</li>
                                  <li>سداد القرض الأصغر أولاً سيوفر لك تدفق نقدي بمقدار {Math.round(reportData.loans[0]?.schedule[0]?.paymentAmount || 500)} ريال شهرياً.</li>
                                  <li>ينصح بإنشاء صندوق طوارئ يغطي 3 أشهر من المصاريف ({((settings.monthlyLimit || 5000) * 3).toLocaleString()} ريال).</li>
                              </ul>
                          </div>
                      </div>
                  )}

                  {/* Footer */}
                  <div className="mt-auto pt-6 border-t border-slate-200 flex justify-between items-end text-xs text-slate-400 report-section">
                      <p>تم إنشاء هذا التقرير آلياً بواسطة منصة منجز.</p>
                      <p>Monjez Financial App © 2025</p>
                  </div>
              </div>
          </div>
      )}

      {/* Image Editor Modal (Existing) */}
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