

import { GoogleGenAI } from "@google/genai";
import { Transaction, Loan, TransactionType, LoanType, ReceiptItem } from "../types";

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

export const getSavingsAnalysis = async (savedAmount: number, itemsCleared: string[]): Promise<string> => {
  try {
    if (!API_KEY) return "الرجاء إعداد مفتاح API.";

    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const prompt = `
      المستخدم يخطط لسداد أو إلغاء الالتزامات التالية: [${itemsCleared.join(', ')}].
      هذا سيوفر له مبلغ شهري قدره: ${savedAmount} ريال.

      بصفتك مستشاراً مالياً ذكياً:
      1. هنئه على هذه الخطوة.
      2. اقترح عليه أفضل طريقة لاستثمار هذا المبلغ الفائض (${savedAmount}) شهرياً (مثلاً: صندوق طوارئ، استثمار في الأسهم، أو ادخار لتقاعد).
      3. كن مختصراً ومحفزاً جداً باللغة العربية.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "تحليل التوفير غير متاح حالياً.";
  } catch (error) {
    console.error("Gemini Savings Analysis Error", error);
    return "حدث خطأ في خدمة الذكاء الاصطناعي.";
  }
};

export interface ParsedSMS {
  amount: number;
  merchant: string;
  category: string;
  cardLast4?: string;
  date: string;
  type: TransactionType;
  fee?: number;
  newBalance?: number; // Added to support balance update from SMS
  transactionReference?: string;
  operationKind?: string; // New: Detailed Type
  country?: string; // New
  paymentMethod?: string; // New
}

export interface ParsedReceipt {
  merchant: string;
  total: number;
  date: string;
  items: ReceiptItem[];
  category: string;
}

export const parseReceiptFromImage = async (base64Image: string): Promise<ParsedReceipt | null> => {
  try {
    if (!API_KEY) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    // Remove prefix if present
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const prompt = `
      Analyze this receipt image and extract the following details into JSON:
      - merchant: (Store name)
      - total: (Total amount paid)
      - date: (Date of purchase in ISO YYYY-MM-DD format, use today if not found)
      - items: Array of { name: string, price: number } for each line item.
      - category: Infer category (e.g., Food, Groceries, Shopping, Electronics).

      Return strictly JSON.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
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

    return JSON.parse(text) as ParsedReceipt;

  } catch (error) {
    console.error("Gemini Receipt Parse Error", error);
    return null;
  }
};

export const parseTransactionFromSMS = async (smsText: string): Promise<ParsedSMS | null> => {
  try {
    if (!API_KEY) throw new Error("API Key missing");

    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    // Detailed schema provided by user
    const userSchema = {
      "TransactionTypes": [
        {
          "common_fields": {
            "وسيلة الدفع": "اختياري (بطاقة، تحويل، نقدي)",
            "الفئة": "اختياري (طعام، سكن، مواصلات، ترفيه، ادخار، استثمار)",
            "حالة العملية": "إلزامي (مكتملة، معلقة، مرفوضة)",
            "الرصيد بعد العملية": "اختياري",
            "الرسوم": "اختياري",
            "الدولة": "اختياري",
            "ملاحظات عامة": "اختياري"
          },
          "types": [
            {
              "type": "حوالة داخلية واردة",
              "fields": {
                "رقم العملية": "اختياري",
                "المبلغ": "إلزامي",
                "نوع العملية": "إلزامي (مخصوم/إضافة)",
                "التاريخ والوقت": "إلزامي",
                "من المحول": "إلزامي",
                "الحساب المستلم": "إلزامي"
              },
              "example_messages": [
                "حوالة داخلية واردة\nمبلغ:SAR 19\nالى:8973\nمن:هشام علاج\nمن:9620\nفي:25-12-3 23:24",
                "حوالة داخلية واردة\nمبلغ:SAR 79\nالى:2646\nمن:محمد بن سليم بن سلمان السكح السناني\nمن:1527\nفي:25-12-1 05:16"
              ]
            },
            {
              "type": "حوالة داخلية صادرة",
              "fields": {
                "رقم العملية": "اختياري",
                "المبلغ": "إلزامي",
                "نوع العملية": "إلزامي (مخصوم/إضافة)",
                "التاريخ والوقت": "إلزامي",
                "إلى المحول": "إلزامي",
                "الحساب المرسل": "إلزامي"
              },
              "example_messages": [
                "حوالة داخلية صادرة\nمن:8973\nمبلغ:SAR 20\nالى:عبدالله السناني\nالى:2780\nفي:25-12-6 06:28"
              ]
            },
            {
              "type": "حوالة محلية صادرة",
              "fields": {
                "رقم العملية": "اختياري",
                "المبلغ": "إلزامي",
                "التاريخ والوقت": "إلزامي",
                "إلى المحول": "إلزامي",
                "الحساب المرسل": "إلزامي"
              },
              "example_messages": [
                "حوالة محلية صادرة\nمصرف:SNB\nمن:8973\nمبلغ:SAR 100\nالى:MD SHAIDUL ISLAM\nالى:2809\nالرسوم:SAR 0.58\nفي:25-11-30 20:25",
                "حوالة محلية صادرة\nمصرف:Stc bank\nمن:8973\nمبلغ:SAR 1\nالى:رحمه الجهني\nالى:6082\nالرسوم:SAR 0.58\nفي:25-11-28 15:55"
              ]
            },
            {
              "type": "شراء عبر الإنترنت",
              "fields": {
                "المبلغ": "إلزامي",
                "التاريخ والوقت": "إلزامي",
                "البائع": "إلزامي",
                "آخر 4 أرقام البطاقة": "إلزامي",
                "نوع الشراء": "إنترنت"
              },
              "example_messages": [
                "شراء انترنت\nبطاقة:4050 ;فيزا\nمبلغ: 12.99 SAR\nلدى:APPLE.COM\nرسوم وضريبة: 0.30 SAR\nاجمالي المبلغ المستحق: 13.29 SAR\nدولة:Ireland\nرصيد:142.75 SAR\nفي:07-12-2025 02:14",
                "شراء إنترنت\nبطاقة:4050 ;فيزا\nمبلغ:70.65 SAR\nلدى:SALLA APP\nرصيد:297.04 SAR\nفي:06-12-2025 03:59",
                "شراء إنترنت\nبطاقة:4050 ;فيزا\nمبلغ:45.54 SAR\nلدى:Tamara\nرصيد:59.69 SAR\nفي:03-12-2025 02:25"
              ]
            },
            {
              "type": "شراء نقاط بيع (POS)",
              "fields": {
                "المبلغ": "إلزامي",
                "التاريخ والوقت": "إلزامي",
                "البائع": "إلزامي",
                "آخر 4 أرقام البطاقة": "إلزامي",
                "نوع الشراء": "POS"
              },
              "example_messages": [
                "شراء عبر نقاط البيع \nبطاقة:4050 ;فيزا-أثير\nلدى:aljari Um\nمبلغ:141 SAR\nرصيد:156.04 SAR\nفي:06-12-2025 20:07",
                "شراء عبر نقاط البيع \nبطاقة:4050 ;فيزا-ابل باي\nلدى:BLACK COF\nمبلغ:32.00 SAR\nرصيد:105.23 SAR\nفي:01-12-2025 22:48"
              ]
            },
            {
              "type": "شراء مباشر",
              "fields": {
                "المبلغ": "إلزامي",
                "التاريخ والوقت": "إلزامي",
                "البائع": "إلزامي",
                "آخر 4 أرقام البطاقة": "اختياري",
                "نوع الشراء": "شراء"
              },
              "example_messages": [
                "شراء\nبطاقة:7359;مدى-ابل باي\nمبلغ:SAR 7\nلدى:GOMAYAAN S\nفي:25-12-7 19:04",
                "شراء\nبطاقة:7359;مدى-أثير\nمبلغ:SAR 4.50 \nلدى:Naseem Al\nفي:25-12-7 04:27"
              ]
            },
            {
              "type": "سداد بطاقة ائتمانية",
              "fields": {
                "المبلغ": "إلزامي",
                "التاريخ والوقت": "إلزامي",
                "نوع البطاقة": "إلزامي (فيزا/ماستر)",
                "آخر 4 أرقام البطاقة": "إلزامي",
                "الرصيد بعد السداد": "اختياري"
              },
              "example_messages": [
                "بطاقة ائتمانية:سداد\nبطاقة:فيزا 4050\nمبلغ:SAR 320\nرصيد:367.69 SAR\nفي:06-12-2025 03:59"
              ]
            },
            {
              "type": "تحويل بطاقة ائتمانية",
              "fields": {
                "المبلغ": "إلزامي",
                "التاريخ والوقت": "إلزامي",
                "من البطاقة": "إلزامي",
                "إلى الحساب": "إلزامي"
              },
              "example_messages": [
                "بطاقة ائتمانية:تحويل\nمن بطاقة:4050;فيزا\nالى حساب:8973\nمبلغ:SAR 1000\nفي:25-11-27 07:12"
              ]
            }
          ]
        }
      ]
    };

    const prompt = `
      You are an expert financial data parser. Extract transaction details from the provided SMS text based on the provided JSON Schema definition.

      **Schema Definition**:
      ${JSON.stringify(userSchema, null, 2)}

      **Instructions**:
      1. Analyze the "Input SMS" below.
      2. Match it to one of the "types" in the schema.
      3. Extract values for the fields defined (e.g., amount, date, merchant, fee, balance, transaction number, card number, country, payment method).
      4. Map the extracted data to the following JSON output format:

      **Output JSON Format**:
      {
        "amount": number, (Numeric value of the main transaction amount)
        "merchant": string, (The other party name: Seller, Sender, Recipient, or 'Bank')
        "category": string, (Infer category: 'Shopping', 'Transfer', 'Bills', 'Food', 'Income', 'Credit Card Payment')
        "cardLast4": string, (Last 4 digits of card or account if found in 'fields' like 'آخر 4 أرقام البطاقة')
        "date": string, (ISO 8601 format YYYY-MM-DDTHH:mm:ss, assume current year if missing)
        "type": "income" | "expense", (See Logic below)
        "fee": number, (Transaction fee if present, else 0)
        "newBalance": number | null, (The balance *after* transaction if present)
        "transactionReference": string, (The transaction ID/Number if present)
        "operationKind": string, (The specific 'type' name from the schema, e.g., 'شراء عبر الإنترنت', 'حوالة داخلية واردة')
        "country": string, (Country name if present in 'common_fields', else null)
        "paymentMethod": string (Payment method if inferred or present, e.g. 'Card', 'Transfer', 'Cash')
      }

      **Logic for 'type' (income/expense)**:
      - "حوالة داخلية واردة" (Incoming Transfer) -> income
      - "حوالة داخلية صادرة" (Outgoing Transfer) -> expense
      - "حوالة محلية صادرة" (Local Outgoing) -> expense
      - "شراء" / "شراء عبر الإنترنت" / "شراء نقاط بيع" (Purchase) -> expense
      - "سداد بطاقة ائتمانية" (Credit Card Payment) -> income (This usually means funds added to the credit card balance)
      - "تحويل بطاقة ائتمانية" (Credit Card Transfer) -> expense (Money leaving the card)

      **Input SMS**:
      "${smsText}"
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

export const parseLoanFromPdf = async (base64Data: string): Promise<ParsedLoan | null> => {
  try {
    if (!API_KEY) throw new Error("API Key missing");
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    // Remove Data URL prefix if present
    const cleanBase64 = base64Data.split(',')[1] || base64Data;

    const prompt = `
      Analyze this loan contract or payment schedule PDF/Image (e.g., Tabby, Tamara, Bank Contract) and extract details into JSON.

      Required Fields (null if not found):
      - principal: (Original loan amount / مبلغ التمويل)
      - totalAmount: (Total to be paid including fees/profit / الإجمالي)
      - interestRate: (Annual rate / معدل النسبة السنوي, or calculate from profit)
      - durationMonths: (Number of installments / عدد الأقساط)
      - startDate: (First payment date / تاريخ أول دفعة - YYYY-MM-DD)
      - monthlyPayment: (Installment amount / قسط شهري)
      - paidInstallments: (Count of paid installments if visible / الأقساط المدفوعة)
      - lenderName: (Provider name e.g. Tabby, Tamara, Al Rajhi)
      - lastPaymentAmount: (If different)

      Notes:
      - For BNPL (Tabby/Tamara), usually there is no interest (rate=0), but check for service fees.
      - If "Down Payment" exists, consider it paid.
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

    return JSON.parse(text) as ParsedLoan;

  } catch (error) {
    console.error("Gemini Loan PDF Parse Error", error);
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