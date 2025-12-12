
import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

const SuccessModal: React.FC<SuccessModalProps> = ({ isOpen, onClose, title, message }) => {
  const [confetti, setConfetti] = useState<{ id: number; left: number; delay: number; color: string }[]>([]);

  useEffect(() => {
    if (isOpen) {
      // Generate random confetti
      const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];
      const newConfetti = Array.from({ length: 50 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      }));
      setConfetti(newConfetti);

      // Auto close after 3.5 seconds
      const timer = setTimeout(onClose, 3500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      {/* Confetti Container */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {confetti.map((c) => (
          <div
            key={c.id}
            className="absolute top-[-10px] w-3 h-3 rounded-full opacity-0 animate-confetti"
            style={{
              left: `${c.left}%`,
              backgroundColor: c.color,
              animationDelay: `${c.delay}s`,
              animationDuration: '2.5s',
            }}
          />
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2rem] p-8 text-center shadow-2xl relative animate-scale-in border border-white/20 dark:border-slate-800 transform transition-all">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
        >
            <X size={20} />
        </button>

        <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-emerald-500 rounded-full opacity-20 animate-ping"></div>
            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce-short">
                <Check size={40} className="text-white" strokeWidth={4} />
            </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {title}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
            {message}
        </p>

        <button
          onClick={onClose}
          className="mt-8 w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold hover:bg-emerald-700 transition-transform active:scale-95 shadow-lg shadow-emerald-600/20"
        >
          متابعة
        </button>
      </div>

      <style>{`
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes bounce-short {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }
        .animate-confetti {
          animation-name: confetti;
          animation-timing-function: ease-in-out;
          animation-fill-mode: forwards;
        }
        .animate-bounce-short {
            animation: bounce-short 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default SuccessModal;
