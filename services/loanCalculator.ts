
import { LoanScheduleItem, LoanType, Bill } from '../types';

export const calculateDurationInMonths = (startDate: string, endDate: string): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let months;
  months = (end.getFullYear() - start.getFullYear()) * 12;
  months -= start.getMonth();
  months += end.getMonth();
  return months <= 0 ? 0 : months;
};

export const calculateLoanSchedule = (
  principal: number,
  annualRate: number,
  months: number,
  startDate: string,
  type: LoanType,
  fixedProfitAmount: number = 0 // Previously processingFee
): LoanScheduleItem[] => {
  const schedule: LoanScheduleItem[] = [];
  let currentBalance = principal;
  const start = new Date(startDate);

  // Guard against invalid inputs
  if (months <= 0 || principal < 0) return []; // Principal can be 0? No, usually > 0.

  // 1. Fixed Profit Logic (Priority if provided)
  if (fixedProfitAmount > 0) {
    const totalAmount = principal + fixedProfitAmount;
    const monthlyPayment = totalAmount / months;
    
    // Distribute fee precisely
    const rawMonthlyFee = fixedProfitAmount / months;
    const rawMonthlyPrincipal = principal / months;

    let feeAccumulator = 0;

    for (let i = 1; i <= months; i++) {
        const paymentDate = new Date(start);
        paymentDate.setMonth(start.getMonth() + (i - 1));

        // Adjust last month to handle rounding errors
        let monthlyFee = rawMonthlyFee;
        let monthlyPrincipal = rawMonthlyPrincipal;
        
        if (i === months) {
            monthlyFee = fixedProfitAmount - feeAccumulator;
            monthlyPrincipal = currentBalance; // Pay off remainder
        } else {
             feeAccumulator += monthlyFee;
        }

        currentBalance -= monthlyPrincipal;

        schedule.push({
            paymentDate: paymentDate.toISOString(),
            paymentAmount: monthlyPayment,
            interestComponent: monthlyFee,
            principalComponent: monthlyPrincipal,
            remainingBalance: Math.max(0, currentBalance),
            isPaid: false,
        });
    }
    return schedule;
  }

  // Flat Rate Calculation: Total Interest = Principal * Rate * Years
  // Monthly Payment = (Principal + Total Interest) / Months
  if (type === LoanType.FLAT) {
    const totalInterest = principal * (annualRate / 100) * (months / 12);
    const totalAmount = principal + totalInterest;
    const monthlyPayment = totalAmount / months;
    const monthlyInterest = totalInterest / months;
    const monthlyPrincipal = principal / months;

    for (let i = 1; i <= months; i++) {
      const paymentDate = new Date(start);
      paymentDate.setMonth(start.getMonth() + (i - 1));

      currentBalance -= monthlyPrincipal;

      schedule.push({
        paymentDate: paymentDate.toISOString(),
        paymentAmount: monthlyPayment,
        interestComponent: monthlyInterest,
        principalComponent: monthlyPrincipal,
        remainingBalance: Math.max(0, currentBalance),
        isPaid: false,
      });
    }
  } 
  // Decreasing Balance (Standard Amortization)
  else {
    const monthlyRate = annualRate / 100 / 12;

    // Handle 0% Interest Rate Edge Case (or Fixed Profit = 0)
    if (monthlyRate === 0) {
        const monthlyPayment = principal / months;
        for (let i = 1; i <= months; i++) {
            const paymentDate = new Date(start);
            paymentDate.setMonth(start.getMonth() + (i - 1));
            currentBalance -= monthlyPayment;

            schedule.push({
                paymentDate: paymentDate.toISOString(),
                paymentAmount: monthlyPayment,
                interestComponent: 0,
                principalComponent: monthlyPayment,
                remainingBalance: Math.max(0, currentBalance),
                isPaid: false,
            });
        }
    } else {
        // Standard Amortization Formula: PMT = P * r * (1 + r)^n / ((1 + r)^n - 1)
        const pmt = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);

        for (let i = 1; i <= months; i++) {
            const paymentDate = new Date(start);
            paymentDate.setMonth(start.getMonth() + (i - 1));

            const interestPayment = currentBalance * monthlyRate;
            const principalPayment = pmt - interestPayment;
            currentBalance -= principalPayment;

            schedule.push({
                paymentDate: paymentDate.toISOString(),
                paymentAmount: pmt,
                interestComponent: interestPayment,
                principalComponent: principalPayment,
                remainingBalance: Math.max(0, currentBalance),
                isPaid: false,
            });
        }
    }
  }

  return schedule;
};

// --- Bill Schedule Generator (Moved from Loans.tsx) ---
export interface BillScheduleItemComputed {
    date: Date;
    amount: number;
    isPaid: boolean;
    type: 'down_payment' | 'installment' | 'subscription' | 'monthly';
}

export const getBillSchedule = (bill: Bill): BillScheduleItemComputed[] => {
      const schedule: BillScheduleItemComputed[] = [];
      const today = new Date();
      
      // Scenario 1: It has a start date and duration (Installment-like)
      if (bill.startDate && bill.durationMonths && bill.durationMonths > 0) {
          const start = new Date(bill.startDate);
          
          // --- Down Payment Logic ---
          if (bill.downPayment && bill.downPayment > 0) {
               const downPaymentDate = new Date(start);
               const dpDateStr = downPaymentDate.toISOString().split('T')[0];
               schedule.push({
                   date: downPaymentDate, // Down payment is usually at start date
                   amount: bill.downPayment,
                   isPaid: (bill.paidDates || []).includes(dpDateStr),
                   type: 'down_payment'
               });
          }

          // --- Installments Logic ---
          // Use Custom Schedule if exists
          if (bill.customSchedule && bill.customSchedule.length > 0) {
              bill.customSchedule.forEach(item => {
                  const d = new Date(item.date);
                  const dateStr = item.date;
                  const isPaid = (bill.paidDates || []).includes(dateStr);
                  schedule.push({ date: d, amount: item.amount, isPaid, type: 'installment' });
              });
          } else {
              // Standard Generation
              const monthlyAmount = bill.amount;
              for (let i = 0; i < bill.durationMonths; i++) {
                  const date = new Date(start);
                  date.setMonth(start.getMonth() + i + 1); // Installments start next month
                  
                  const dateStr = date.toISOString().split('T')[0];
                  const isPaid = (bill.paidDates || []).includes(dateStr);
                  
                  let amount = monthlyAmount;
                  if (i === bill.durationMonths - 1 && bill.lastPaymentAmount) amount = bill.lastPaymentAmount;

                  schedule.push({ date, amount, isPaid, type: 'installment' });
              }
          }
      } 
      // Scenario 2: Subscription (Ongoing)
      else if (bill.isSubscription) {
          // Show 3 months history and 9 months future
          for (let i = -3; i <= 9; i++) {
              const date = new Date(today);
              date.setMonth(today.getMonth() + i);
              // Normalize day if possible (e.g. renewalDate)
              if (bill.renewalDate) {
                  const renewalDay = new Date(bill.renewalDate).getDate();
                  date.setDate(renewalDay);
              }
              const dateStr = date.toISOString().split('T')[0];
              const isPaid = (bill.paidDates || []).includes(dateStr);
              
              schedule.push({ 
                  date, 
                  amount: bill.amount, 
                  isPaid, 
                  type: 'subscription' 
              });
          }
      }
      // Scenario 3: Simple Monthly Bill
      else {
           // Show current year context
           for (let i = -1; i <= 3; i++) {
              const date = new Date(today);
              date.setMonth(today.getMonth() + i);
              const dateStr = date.toISOString().split('T')[0];
              const isPaid = (bill.paidDates || []).includes(dateStr);
              schedule.push({ date, amount: bill.amount, isPaid, type: 'monthly' });
           }
      }
      return schedule;
  };
