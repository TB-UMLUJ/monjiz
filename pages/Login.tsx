import React, { useState } from 'react';
import { authService } from '../services/auth';
import { Lock, ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
        const isValid = await authService.login(password);
        if (isValid) {
          onLoginSuccess();
        } else {
          // This is now only for incorrect password
          setError('كلمة المرور غير صحيحة. يرجى المحاولة مرة أخرى.');
        }
    } catch (e) {
        if (e instanceof Error) {
            switch(e.message) {
                case 'DATABASE_NOT_CONFIGURED':
                    setError('خطأ: إعدادات قاعدة البيانات غير مكتملة. يرجى مراجعة متغيرات البيئة (VITE_SUPABASE_URL/KEY) في Vercel.');
                    break;
                case 'DATABASE_CONNECTION_FAILED':
                    setError('فشل الاتصال بقاعدة البيانات. تأكد من صحة المفاتيح وصلاحيات الوصول للشبكة.');
                    break;
                case 'USER_NOT_FOUND':
                     setError('خطأ في الإعداد: لم يتم العثور على المستخدم الافتراضي. يرجى التأكد من تشغيل سكربت قاعدة البيانات.');
                     break;
                default:
                    setError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى لاحقاً.');
            }
        } else {
            setError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى لاحقاً.');
        }
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 font-tajawal overflow-hidden transition-colors bg-slate-50 dark:bg-[#020617]" dir="rtl">
      
      {/* Background Ambience (Light Mode) */}
      <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-emerald-200/40 blur-[120px] dark:hidden pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-blue-200/40 blur-[120px] dark:hidden pointer-events-none" />

      {/* Background Ambience (Dark Mode) */}
      <div className="hidden dark:block absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-emerald-950/40 blur-[100px] pointer-events-none" />
      <div className="hidden dark:block absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-[#bef264]/5 blur-[100px] pointer-events-none" />

      {/* Glass Card */}
      <div className="relative z-10 w-full max-w-md bg-white/80 dark:bg-slate-950/90 backdrop-blur-xl border border-white/50 dark:border-slate-800 rounded-[2.5rem] shadow-2xl dark:shadow-black/70 p-8 md:p-12 animate-scale-in">
        
        <div className="flex flex-col items-center mb-10">
          <div className="mb-8 relative group">
             <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-[#bef264] rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
             <img 
               src="https://f.top4top.io/p_3619agw9o1.png" 
               alt="Logo" 
               className="h-28 w-auto object-contain relative z-10 drop-shadow-sm" 
             />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2 tracking-tight">مرحباً بعودتك</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
             سجل دخولك لمتابعة محفظتك المالية
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="animate-slide-up" style={{animationDelay: '0.1s'}}>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 mr-1">كلمة المرور</label>
            <div className="relative group">
               <div className="absolute right-4 top-4 text-slate-400 group-focus-within:text-emerald-500 dark:group-focus-within:text-[#bef264] transition-colors z-10">
                 <Lock size={20} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="w-full pr-12 pl-4 py-4 bg-slate-50 dark:bg-black/40 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:border-emerald-500 dark:focus:border-[#bef264] outline-none transition-all text-right text-slate-900 dark:text-white placeholder:text-slate-400 font-bold tracking-widest text-lg shadow-inner"
                placeholder="••••••"
              />
            </div>
            {error && (
                <div className="flex items-center gap-2 mt-3 text-rose-500 text-xs font-bold bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 p-3 rounded-xl animate-fade-in">
                    <ShieldCheck size={14}/>
                    {error}
                </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-900 dark:bg-[#bef264] text-white dark:text-slate-950 py-4 rounded-2xl font-bold text-lg hover:bg-slate-800 dark:hover:bg-[#a3e635] hover:shadow-lg hover:-translate-y-1 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none animate-slide-up shadow-xl shadow-slate-200 dark:shadow-none" style={{animationDelay: '0.2s'}}
          >
            {isLoading ? <Loader2 className="animate-spin" /> : (
              <>
                  <span>تسجيل الدخول</span>
                  <ArrowLeft size={20} />
              </>
            )}
          </button>
        </form>
        
        <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800/50 text-center animate-fade-in" style={{animationDelay: '0.3s'}}>
           <p className="text-xs font-medium text-slate-400 dark:text-slate-600">نظام منجز المالي © 2025</p>
        </div>
      </div>
    </div>
  );
};

export default Login;