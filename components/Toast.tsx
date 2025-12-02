import React from 'react';
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

interface ToastProps {
  id: string;
  message: string;
  type: NotificationType;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ id, message, type, onClose }) => {
  const icons = {
    success: <CheckCircle className="text-emerald-500" size={24} />,
    error: <AlertCircle className="text-rose-500" size={24} />,
    warning: <AlertTriangle className="text-amber-500" size={24} />,
    info: <Info className="text-blue-500" size={24} />
  };

  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-100',
    error: 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-100',
    warning: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-100',
    info: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-100'
  };

  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-md mb-3 transition-all animate-slide-up w-[90vw] md:w-auto md:min-w-[320px] max-w-sm ${styles[type]}`}>
      <div className="flex-shrink-0">
        {icons[type]}
      </div>
      <p className="flex-1 text-sm font-bold font-tajawal">{message}</p>
      <button onClick={() => onClose(id)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1">
        <X size={18} />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<{ notifications: Notification[], onRemove: (id: string) => void }> = ({ notifications, onRemove }) => {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-8 md:bottom-8 md:top-auto z-[100] flex flex-col items-center md:items-start pointer-events-none">
      {notifications.map(n => (
        <div key={n.id} className="pointer-events-auto">
            <Toast {...n} onClose={onRemove} />
        </div>
      ))}
    </div>
  );
};
