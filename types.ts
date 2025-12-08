

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export enum LoanType {
  FLAT = 'flat',
  DECREASING = 'decreasing',
}

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string; // ISO String
  note?: string;
  cardId?: string; // Link to specific card
  // New fields for enhanced transaction tracking
  merchant?: string;
  fee?: number;
  balanceAfter?: number;
  transactionReference?: string;
  // Detailed fields
  operationKind?: string;
  cardLast4?: string;
  country?: string;
  paymentMethod?: string;
}

export interface LoanScheduleItem {
  paymentDate: string;
  paymentAmount: number;
  principalComponent: number;
  interestComponent: number;
  remainingBalance: number;
  isPaid: boolean;
}

export interface Loan {
  id: string;
  name: string;
  description?: string;
  totalAmount: number;
  startDate: string;
  durationMonths: number;
  interestRate: number; // Annual %
  type: LoanType;
  schedule: LoanScheduleItem[];
  status: 'active' | 'completed';
  contractPdf?: string; // Base64 Data URL
  icon?: string; // New: Custom icon
}

export interface BillScheduleItem {
    date: string;
    amount: number;
}

export interface Bill {
  id: string;
  name: string;
  provider: string;
  type: 'electricity' | 'water' | 'internet' | 'device_installment' | 'subscription' | 'other';
  amount: number; // Monthly Payment Amount
  hasEndDate: boolean;
  endDate?: string;
  deviceDetails?: string; 
  startDate?: string;
  durationMonths?: number; 
  lastPaymentAmount?: number;
  downPayment?: number;
  totalDebt?: number; // New: Total Contract Value / Total Debt
  isSubscription?: boolean; // New: For Netflix, etc.
  renewalDate?: string; // New: For subscriptions
  status: 'active' | 'archived'; // New: Archive support
  icon?: string; // New: Custom icon
  paidDates?: string[]; // New: Track individual paid installments (ISO Date Strings)
  customSchedule?: BillScheduleItem[]; // New: Custom schedule for variable monthly amounts
}

export interface RecurringTransaction {
  id: string;
  name: string;
  amount: number;
  type: TransactionType;
  category: string;
  dayOfMonth: number;
  active: boolean;
}

export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Budget {
  categoryId: string;
  amount: number;
  spent: number;
}

export type ThemeOption = 'system' | 'light' | 'dark';
export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface Allowance {
  id: string;
  name: string; // e.g. Housing, Transport
  amount: number;
}

export interface IncomeSource {
  id: string;
  name: string;
  amount: number; // Net Amount (Actual deposit)
  dayOfMonth: number;
  // Detailed Salary Breakdown
  basicSalary?: number;
  gosiDeduction?: number;
  allowances?: Allowance[];
}

export interface BankCard {
  id: string;
  bankName: string;
  cardNumber: string; // Last 4 digits of card
  accountLast4?: string; // Last 4 digits of account
  cardType: 'Visa' | 'Mada' | 'MasterCard' | 'Virtual'; 
  color: string; 
  balance?: number; 
  logoUrl?: string; // Optional logo URL
  logoPosition?: LogoPosition; // Position of the logo on the card
}

export interface EntityLogo {
  id: string;
  name: string;
  logoUrl: string;
}

export interface UserSettings {
  currency: string;
  monthlyLimit: number;
  alertThreshold: number; // percentage
  theme: ThemeOption;
  incomeSources: IncomeSource[];
  cards: BankCard[];
  password?: string;
  budgetRollover: boolean; // New
  privacyMode: boolean; // New: local state usually, but can persist
  customCategories: CustomCategory[]; // New
  recurringTransactions: RecurringTransaction[]; // New
}

export interface DashboardStats {
  totalBalance: number;
  monthlyExpenses: number;
  monthlyIncome: number;
  upcomingLoanPayments: number;
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  icon: string;
  color: string;
}

export interface ReportConfig {
    includeSnapshot: boolean;
    includeLoans: boolean;
    includeBills: boolean;
    includeAiAnalysis: boolean;
}