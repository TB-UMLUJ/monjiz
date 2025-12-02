
import { GoogleGenAI } from "@google/genai";
import { Transaction, Loan, TransactionType, LoanType } from "../types";

// Helper function to safely get API KEY without crashing in browser
const getApiKey = () => {
  try {
    // 1. Priority: Vite Environment Variable (Standard for Vercel + Vite)
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
        // @ts-ignore
        return import.meta.env.VITE_API_KEY;
    }

    // 2. Fallback: Standard process.env (Node/Build env)
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }

    // 3. Fallback: window.process (Our Polyfill)
    // @ts-ignore
    if (typeof window !== 'undefined' && window.process && window.process.env && window.process.env.API_KEY) {
       // @ts-ignore
       return window.process.env.API_KEY;
    }
    
  } catch (e) {
    console.warn("Failed to retrieve API KEY safely");
  }
  return '';
};

// Note: In a real app, never expose API keys on client side.
// This is strictly for the requested demo architecture.
const API_KEY = getApiKey();

export const getFinancialAdvice = async (
  transactions: Transaction[],
  loans: Loan[],
  balance: number
): Promise<string> => {
  try {
    if (!API_KEY) return "الرجاء إعداد مفتاح API (VITE_API_KEY) في إعدادات Vercel للحصول على التحليل الذكي.";

    const ai = new GoogleGenAI({ apiKey: API_KEY });

    // Prepare a summary for the AI
    const expenses = transactions
      .filter(t => t.type === 'expense')
      .slice(0, 10) // Last 10 expenses
      .map(t => `${t.category}: ${t.amount}`);
    
    const income = transactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
    const totalLoanDebt = loans.reduce((acc, curr) => acc + curr.schedule.filter(s => !s.isPaid).reduce((sAcc, sCurr) => sAcc + sCurr.remainingBalance, 0), 0);

    const prompt = `
      بصفتك مستشاراً مالياً خبيراً، قم بتحليل هذا الوضع المالي باختصار وقدم نصيحة واحدة قوية:
      - الرصيد الحالي: ${balance}
      - الدخل الشهري التقريبي: ${income}
      - إجمالي الديون المتبقية: ${totalLoanDebt}
      - آخر المصروفات: ${expenses.join(', ')}
      
      المطلوب: تحليل سريع للمخاطر ونصيحة للتحسين باللغة العربية. لا تذكر تفاصيل تقنية.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "لم يتمكن المستشار الذكي من تحليل البيانات حالياً.";

  } catch (error) {
    console.error("Gemini Error", error);
    return "حدث خطأ أثناء الاتصال بالمستشار الذكي.";
  }
};

export interface ParsedSMS {
  amount: number;
  merchant: string;
  category: string;
  cardLast4: string;
  date: string;
  type: TransactionType;
  fee?: number;
}

export const parseTransactionFromSMS = async (smsText: string): Promise<ParsedSMS | null> => {
  try {
    if (!API_KEY) throw new Error("API Key missing");

    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    const prompt = `
      Extract transaction details from this bank SMS text into JSON.
      Text: "${smsText}"
      
      Rules:
      1. Determine 'type': "expense" for purchases, payments, or outgoing transfers (like "صادرة"). "income" for deposits, salary, or incoming transfers (like "واردة").
      2. Extract 'amount' as a number (remove currency symbols). This is the main transaction amount.
      3. Extract 'merchant' or the other party's name (e.g., NAFTHAH A, نهله السناني).
      4. Extract 'cardLast4': 
         - If 'type' is "expense", this is the 4 digits of the user's card, usually after "من:" (from) or "Card:".
         - If 'type' is "income", this is the 4 digits of the user's card, usually after "الى:" (to).
         - It must be the user's card, not the other party's.
      5. Extract 'date' and convert to ISO string (YYYY-MM-DDTHH:mm:ss.sssZ).
      6. Guess 'category' from this list: ['طعام', 'نقل', 'سكن', 'فواتير وخدمات', 'تسوق', 'ترفيه', 'صحة', 'تعليم', 'راتب', 'استثمار', 'تحويل بنكي', 'استلام أموال', 'رسوم بنكية', 'أخرى']. For incoming transfers, use 'استلام أموال'.
      7. Extract 'fee' if present (look for "الرسوم" or "fee"). It must be a number. If not found, omit or set to 0.
      
      Return JSON only.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return null;
    
    return JSON.parse(text) as ParsedSMS;

  } catch (error) {
    console.error("Gemini SMS Parse Error", error);
    return null;
  }
};

export interface ParsedLoan {
    principal: number;
    interestRate: number;
    durationMonths: number;
    startDate: string;
    monthlyPayment: number;
    paidInstallments: number;
    totalAmount: number; // Principal + Interest
    lenderName?: string;
    lastPaymentAmount?: number;
}

export const parseLoanDetailsFromText = async (text: string): Promise<ParsedLoan | null> => {
    try {
        if (!API_KEY) throw new Error("API Key missing");
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const prompt = `
            Extract loan details from the following text (which might be from a contract or app screenshot) into JSON.
            Text: "${text}"

            Required Fields to Extract (use null if not found):
            - principal: (The main loan amount / المبلغ الرئيسي)
            - totalAmount: (The total amount to be paid including profit / الربح الإجمالي + المبلغ الرئيسي, OR sometimes called 'total amount')
            - interestRate: (Annual percentage / معدل الربح)
            - durationMonths: (Number of months / مدة التمويل)
            - startDate: (Start date of installments / تاريخ البدء, convert to YYYY-MM-DD)
            - monthlyPayment: (Installment amount / مبلغ الدفعة)
            - paidInstallments: (How many months already paid / عدد الدفعات المدفوعة)
            - lenderName: (Bank name inferred from text or context, e.g., Rajhi, SNB)
            - lastPaymentAmount: (If the last payment is different / الدفعة الأخيرة)

            Notes: 
            - If "Profit Amount" (الربح الإجمالي) is present but "Interest Rate" is missing, estimate the rate.
            - If dates are in Hijri or non-standard, convert to closest Gregorian YYYY-MM-DD.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        const jsonText = response.text;
        if (!jsonText) return null;

        return JSON.parse(jsonText) as ParsedLoan;

    } catch (error) {
        console.error("Gemini Loan Parse Error", error);
        return null;
    }
};

export interface ParsedBill {
  provider: string;
  type: 'electricity' | 'water' | 'internet' | 'device_installment' | 'other';
  amount: number;
  hasEndDate: boolean;
  endDate?: string;
  deviceDetails?: string;
  startDate?: string;
  durationMonths?: number;
  lastPaymentAmount?: number;
  downPayment?: number;
}

export const parseBillFromPdf = async (base64Pdf: string): Promise<ParsedBill | null> => {
  try {
    if (!API_KEY) throw new Error("API Key missing");

    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    // Remove Data URL prefix if present
    const cleanBase64 = base64Pdf.split(',')[1] || base64Pdf;

    const prompt = `
      Analyze this bill/contract PDF and extract the following details into JSON.
      
      Fields:
      - provider: (e.g., STC, Mobily, Saudi Electricity, Water Company)
      - type: One of ['electricity', 'water', 'internet', 'device_installment', 'other']
      - amount: (Monthly payment amount or total bill amount)
      - hasEndDate: (boolean, true if it's an installment plan or contract with expiry)
      - endDate: (YYYY-MM-DD, if available)
      - deviceDetails: (If it's a device installment, extract device name e.g., iPhone 15)
      - startDate: (YYYY-MM-DD, start of contract/installment)
      - durationMonths: (Total number of months for installments)
      - lastPaymentAmount: (If the last installment is different)
      - downPayment: (Initial upfront payment made at the start / الدفعة الأولى, if applicable)

      Logic:
      - If it mentions "Installment" or "Aqsat" or specific device names (iPhone, Samsung), set type to 'device_installment'.
      - If it is a utility bill, usually hasEndDate is false unless it is a fixed term contract.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: cleanBase64
          }
        },
        { text: prompt }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return null;

    return JSON.parse(text) as ParsedBill;

  } catch (error) {
    console.error("Gemini PDF Parse Error", error);
    return null;
  }
};
