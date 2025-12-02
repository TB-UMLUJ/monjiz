
import { LoanScheduleItem, LoanType } from '../types';

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
  // This handles the "Total Amount Due" mode where Profit is a fixed known number.
  // Note: We check if fixedProfitAmount is defined and >= 0. Even if 0, if this mode is intended (passed explicitly),
  // we might want to use it, but usually 0 profit falls back to 0% interest logic which is mathematically same.
  // However, to force the "Total Amount" distribution logic, we check if it's being used.
  // For safety, we assume if this is called with a specific profit amount, we use this block.
  // But to avoid breaking existing logic, we only use it if it's > 0 OR if we need to enforce 'flat' division of principal.
  // Given the new UI sends '0' as profit for interest-free, we rely on the fallback for 0.
  
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
