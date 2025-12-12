
import React, { createContext, useContext, useState, useCallback } from 'react';
import SuccessModal from '../components/SuccessModal';

interface SuccessContextType {
  showSuccess: (title: string, message: string) => void;
}

const SuccessContext = createContext<SuccessContextType | undefined>(undefined);

export const useSuccess = () => {
  const context = useContext(SuccessContext);
  if (!context) {
    throw new Error('useSuccess must be used within a SuccessProvider');
  }
  return context;
};

export const SuccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState({ title: '', message: '' });

  const showSuccess = useCallback((title: string, message: string) => {
    setContent({ title, message });
    setIsOpen(true);
  }, []);

  const closeSuccess = () => {
    setIsOpen(false);
  };

  return (
    <SuccessContext.Provider value={{ showSuccess }}>
      {children}
      <SuccessModal
        isOpen={isOpen}
        onClose={closeSuccess}
        title={content.title}
        message={content.message}
      />
    </SuccessContext.Provider>
  );
};
