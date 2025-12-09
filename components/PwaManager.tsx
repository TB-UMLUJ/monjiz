import React, { useRef, useState } from 'react';
import { Camera, Bell, X, Video, ShieldCheck, Send } from 'lucide-react';
import { pushService } from '../services/pushService';
import { useNotification } from '../contexts/NotificationContext';

const PwaManager: React.FC = () => {
  const { notify } = useNotification();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  // --- Camera Logic ---
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      notify("تم تشغيل الكاميرا بنجاح", "success");
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

  // --- Push Notification Logic ---
  const handleSubscribe = async () => {
    setIsSubscribing(true);
    try {
      await pushService.subscribeUser('https://cdn-icons-png.flaticon.com/512/2382/2382461.png');
      notify("تم الاشتراك في الإشعارات بنجاح", "success");
    } catch (err: any) {
      console.error(err);
      notify(err.message || "فشل الاشتراك في الإشعارات", "error");
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleTestNotification = async () => {
      setIsSendingTest(true);
      try {
          const res = await fetch('/api/send-notification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  title: 'اختبار منجز', 
                  body: 'إذا وصلت هذه الرسالة، فالنظام يعمل بنجاح! 🎉' 
              })
          });
          const data = await res.json();
          if (res.ok) {
              notify(`تم إرسال الإشعار بنجاح لـ ${data.results?.length} جهاز`, 'success');
          } else {
              throw new Error(data.error || 'فشل الإرسال');
          }
      } catch (e: any) {
          console.error(e);
          notify(`خطأ في الإرسال: ${e.message}`, 'error');
      } finally {
          setIsSendingTest(false);
      }
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
        <ShieldCheck className="text-indigo-500" />
        <h3 className="font-bold text-slate-900 dark:text-white">ميزات التطبيق المتقدمة (PWA)</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Notification Section */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-3">
             <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-600 dark:text-indigo-400">
               <Bell size={20} />
             </div>
             <h4 className="font-bold text-slate-800 dark:text-white">الإشعارات</h4>
          </div>
          <p className="text-xs text-slate-500 mb-4">
             اشترك لاستقبال تنبيهات عن الفواتير المستحقة وتجاوز الميزانية حتى والتطبيق مغلق.
          </p>
          <div className="flex gap-2">
              <button 
                onClick={handleSubscribe}
                disabled={isSubscribing}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-70"
              >
                {isSubscribing ? 'جاري التفعيل...' : 'تفعيل الإشعارات'}
              </button>
              <button 
                onClick={handleTestNotification}
                disabled={isSendingTest}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-70"
                title="إرسال إشعار تجريبي للكل"
              >
                <Send size={16} />
              </button>
          </div>
        </div>

        {/* Camera Section */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
           <div className="flex items-center gap-3 mb-3">
             <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-full text-emerald-600 dark:text-emerald-400">
               <Camera size={20} />
             </div>
             <h4 className="font-bold text-slate-800 dark:text-white">الكاميرا</h4>
          </div>
          <p className="text-xs text-slate-500 mb-4">
             استخدم الكاميرا لتصوير الفواتير أو العقود (تجريبي).
          </p>
          
          {!stream ? (
             <button 
               onClick={startCamera}
               className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors"
             >
               <div className="flex items-center justify-center gap-2">
                 <Video size={16}/> تشغيل الكاميرا
               </div>
             </button>
          ) : (
             <div className="relative">
                <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg bg-black mb-2 aspect-video object-cover"></video>
                <button 
                   onClick={stopCamera}
                   className="w-full py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 transition-colors flex items-center justify-center gap-2"
                >
                   <X size={16}/> إيقاف
                </button>
             </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default PwaManager;