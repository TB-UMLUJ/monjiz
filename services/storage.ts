import { supabase, DEFAULT_USER_ID } from './supabaseClient';
import { Transaction, Loan, UserSettings, TransactionType, LoanType, IncomeSource, BankCard, LoanScheduleItem, Bill, FinancialGoal, RecurringTransaction, CustomCategory, LogoPosition } from '../types';

// Helper to ensure we never send NaN or Infinity to DB
const safeNumber = (num: any): number => {
    const n = Number(num);
    return Number.isFinite(n) ? n : 0;
};

// Helper to ensure we send null for empty date strings to avoid "invalid input syntax for type date"
const safeDate = (date: any): string | null => {
    if (!date || typeof date !== 'string' || date.trim() === '') return null;
    return date;
};

// Default Fallbacks
const DEFAULT_INCOME: IncomeSource[] = [
  { id: '1', name: 'الراتب الأساسي', amount: 0, dayOfMonth: 27 }
];

const DEFAULT_CARDS: BankCard[] = [
  { id: '1', bankName: 'مصرف الراجحي', cardType: 'Visa', cardNumber: '9967', accountLast4: '1234', color: '#1e293b', logoPosition: 'top-left' }
];

const DEFAULT_SETTINGS: UserSettings = {
  currency: 'SAR',
  monthlyLimit: 5000,
  alertThreshold: 80,
  theme: 'system',
  incomeSources: DEFAULT_INCOME,
  cards: DEFAULT_CARDS,
  password: '123456',
  budgetRollover: false,
  privacyMode: false,
  customCategories: [],
  recurringTransactions: []
};

export const storageService = {
  // --- Transactions ---
  getTransactions: async (): Promise<Transaction[]> => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', DEFAULT_USER_ID)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }

    return data.map((t: any) => ({
      id: t.id,
      amount: Number(t.amount),
      type: t.type as TransactionType,
      category: t.category,
      date: t.date,
      note: t.note,
      cardId: t.card_id
    }));
  },

  saveTransaction: async (transaction: Transaction): Promise<Transaction[]> => {
    const payload = {
        user_id: DEFAULT_USER_ID,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        note: transaction.note,
        date: transaction.date,
        card_id: (transaction.cardId && transaction.cardId !== '') ? transaction.cardId : null
    };

    // Verify card exists if cardId is provided to avoid FK violation
    if (payload.card_id) {
        const { count, error: countError } = await supabase
            .from('bank_cards')
            .select('*', { count: 'exact', head: true })
            .eq('id', payload.card_id);
        
        if (countError || count === 0) {
            console.warn(`Card ID ${payload.card_id} not found, saving transaction without card link.`);
            payload.card_id = null;
        }
    }

    const { error } = await supabase
      .from('transactions')
      .insert(payload);

    if (error) {
        console.error('Error saving transaction:', error);
        throw error;
    }
    return storageService.getTransactions();
  },

  updateTransaction: async (updatedTx: Transaction): Promise<Transaction[]> => {
    const payload = {
        amount: updatedTx.amount,
        category: updatedTx.category,
        type: updatedTx.type,
        note: updatedTx.note,
        date: updatedTx.date,
        card_id: (updatedTx.cardId && updatedTx.cardId !== '') ? updatedTx.cardId : null
    };

    const { error } = await supabase
      .from('transactions')
      .update(payload)
      .eq('id', updatedTx.id);

    if (error) {
        console.error('Error updating transaction:', error);
        throw error;
    }
    return storageService.getTransactions();
  },

  deleteTransaction: async (id: string): Promise<Transaction[]> => {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) console.error('Error deleting transaction:', error);
    return storageService.getTransactions();
  },

  // --- Loans ---
  getLoans: async (): Promise<Loan[]> => {
    const { data: loansData, error: loansError } = await supabase
      .from('loans')
      .select('*')
      .eq('user_id', DEFAULT_USER_ID);

    if (loansError) {
      console.error('Error fetching loans:', loansError);
      return [];
    }

    const loans: Loan[] = [];

    for (const l of loansData) {
      const { data: scheduleData } = await supabase
        .from('loan_schedule')
        .select('*')
        .eq('loan_id', l.id)
        .order('payment_date', { ascending: true });

      const schedule: LoanScheduleItem[] = (scheduleData || []).map((s: any) => ({
        paymentDate: s.payment_date,
        paymentAmount: Number(s.payment_amount),
        principalComponent: Number(s.principal_component),
        interestComponent: Number(s.interest_component),
        remainingBalance: Number(s.remaining_balance),
        isPaid: s.is_paid
      }));

      loans.push({
        id: l.id,
        name: l.name,
        description: l.description,
        totalAmount: Number(l.total_amount),
        startDate: l.start_date,
        durationMonths: l.duration_months,
        interestRate: Number(l.interest_rate),
        type: l.type as LoanType,
        status: l.status,
        schedule,
        contractPdf: l.contract_pdf,
        icon: l.icon
      });
    }

    return loans;
  },

  saveLoan: async (loan: Loan): Promise<Loan[]> => {
    const { data, error } = await supabase
      .from('loans')
      .insert({
        user_id: DEFAULT_USER_ID,
        name: loan.name,
        description: loan.description,
        total_amount: safeNumber(loan.totalAmount),
        start_date: safeDate(loan.startDate),
        duration_months: safeNumber(loan.durationMonths),
        interest_rate: safeNumber(loan.interestRate),
        type: loan.type,
        status: loan.status,
        contract_pdf: loan.contractPdf,
        icon: loan.icon
      })
      .select()
      .single();

    if (error) throw error;

    const scheduleInserts = loan.schedule.map(s => ({
      loan_id: data.id,
      payment_date: safeDate(s.paymentDate),
      payment_amount: safeNumber(s.paymentAmount),
      principal_component: safeNumber(s.principalComponent),
      interest_component: safeNumber(s.interestComponent),
      remaining_balance: safeNumber(s.remainingBalance),
      is_paid: s.isPaid
    }));

    const { error: scheduleError } = await supabase
      .from('loan_schedule')
      .insert(scheduleInserts);

    if (scheduleError) {
        await supabase.from('loans').delete().eq('id', data.id);
        throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    return storageService.getLoans();
  },

  updateLoan: async (updatedLoan: Loan): Promise<Loan[]> => {
    await supabase.from('loans').update({ status: updatedLoan.status, icon: updatedLoan.icon }).eq('id', updatedLoan.id);

    for (const item of updatedLoan.schedule) {
       await supabase.from('loan_schedule')
         .update({ is_paid: item.isPaid })
         .eq('loan_id', updatedLoan.id)
         .eq('payment_date', item.paymentDate.split('T')[0]);
    }

    return storageService.getLoans();
  },

  editLoanDetails: async (loan: Loan): Promise<Loan[]> => {
    const { error: loanError } = await supabase
      .from('loans')
      .update({
        name: loan.name,
        description: loan.description,
        total_amount: safeNumber(loan.totalAmount),
        start_date: safeDate(loan.startDate),
        duration_months: safeNumber(loan.durationMonths),
        interest_rate: safeNumber(loan.interestRate),
        type: loan.type,
        status: loan.status,
        contract_pdf: loan.contractPdf,
        icon: loan.icon
      })
      .eq('id', loan.id);

    if (loanError) throw loanError;

    const { error: deleteError } = await supabase
        .from('loan_schedule')
        .delete()
        .eq('loan_id', loan.id);
        
    if (deleteError) throw deleteError;

    const scheduleInserts = loan.schedule.map(s => ({
      loan_id: loan.id,
      payment_date: safeDate(s.paymentDate),
      payment_amount: safeNumber(s.paymentAmount),
      principal_component: safeNumber(s.principalComponent),
      interest_component: safeNumber(s.interestComponent),
      remaining_balance: safeNumber(s.remainingBalance),
      is_paid: s.isPaid
    }));

    const { error: scheduleError } = await supabase
      .from('loan_schedule')
      .insert(scheduleInserts);

    if (scheduleError) throw scheduleError;

    return storageService.getLoans();
  },

  deleteLoan: async (id: string): Promise<Loan[]> => {
    const { error: scheduleError } = await supabase
        .from('loan_schedule')
        .delete()
        .eq('loan_id', id);

    if (scheduleError) throw scheduleError;

    const { error: loanError } = await supabase
      .from('loans')
      .delete()
      .eq('id', id);

    if (loanError) throw loanError;

    return storageService.getLoans();
  },

  // --- Bills ---
  getBills: async (): Promise<Bill[]> => {
      const { data, error } = await supabase
          .from('bills')
          .select('*')
          .eq('user_id', DEFAULT_USER_ID)
          .order('created_at', { ascending: false });

      if (error) {
          console.error("Error fetching bills", error);
          return [];
      }

      return data.map((b: any) => ({
          id: b.id,
          name: b.name,
          provider: b.provider,
          type: b.type,
          amount: Number(b.amount),
          hasEndDate: b.has_end_date,
          endDate: b.end_date,
          deviceDetails: b.device_details,
          startDate: b.start_date,
          durationMonths: Number(b.duration_months),
          lastPaymentAmount: Number(b.last_payment_amount),
          downPayment: Number(b.down_payment),
          isSubscription: b.is_subscription,
          renewalDate: b.renewal_date,
          status: b.status || 'active',
          icon: b.icon
      }));
  },

  saveBill: async (bill: Bill): Promise<Bill[]> => {
      const { error } = await supabase.from('bills').insert({
          user_id: DEFAULT_USER_ID,
          name: bill.name,
          provider: bill.provider,
          type: bill.type,
          amount: safeNumber(bill.amount),
          has_end_date: bill.hasEndDate,
          end_date: bill.hasEndDate ? safeDate(bill.endDate) : null,
          device_details: bill.deviceDetails,
          start_date: safeDate(bill.startDate),
          duration_months: safeNumber(bill.durationMonths),
          last_payment_amount: safeNumber(bill.lastPaymentAmount),
          down_payment: safeNumber(bill.downPayment),
          is_subscription: bill.isSubscription,
          renewal_date: safeDate(bill.renewalDate),
          status: bill.status || 'active',
          icon: bill.icon
      });

      if (error) throw error;
      return storageService.getBills();
  },

  updateBill: async (bill: Bill): Promise<Bill[]> => {
      const { error } = await supabase.from('bills').update({
          name: bill.name,
          provider: bill.provider,
          type: bill.type,
          amount: safeNumber(bill.amount),
          has_end_date: bill.hasEndDate,
          end_date: bill.hasEndDate ? safeDate(bill.endDate) : null,
          device_details: bill.deviceDetails,
          start_date: safeDate(bill.startDate),
          duration_months: safeNumber(bill.durationMonths),
          last_payment_amount: safeNumber(bill.lastPaymentAmount),
          down_payment: safeNumber(bill.downPayment),
          is_subscription: bill.isSubscription,
          renewal_date: safeDate(bill.renewalDate),
          status: bill.status,
          icon: bill.icon
      }).eq('id', bill.id);

      if (error) throw error;
      return storageService.getBills();
  },

  deleteBill: async (id: string): Promise<Bill[]> => {
      const { error } = await supabase.from('bills').delete().eq('id', id);
      if (error) throw error;
      return storageService.getBills();
  },

  // --- Financial Goals ---
  getGoals: async (): Promise<FinancialGoal[]> => {
    const { data, error } = await supabase
      .from('financial_goals')
      .select('*')
      .eq('user_id', DEFAULT_USER_ID);
    
    if (error) return [];
    
    return data.map((g: any) => ({
        id: g.id,
        name: g.name,
        targetAmount: Number(g.target_amount),
        currentAmount: Number(g.current_amount),
        icon: g.icon,
        color: g.color
    }));
  },

  saveGoal: async (goal: FinancialGoal): Promise<FinancialGoal[]> => {
    const { error } = await supabase.from('financial_goals').insert({
        user_id: DEFAULT_USER_ID,
        name: goal.name,
        target_amount: safeNumber(goal.targetAmount),
        current_amount: safeNumber(goal.currentAmount),
        icon: goal.icon,
        color: goal.color
    });

    if (error) throw error;
    return storageService.getGoals();
  },
  
  updateGoal: async (goal: FinancialGoal): Promise<FinancialGoal[]> => {
     const { error } = await supabase.from('financial_goals').update({
         name: goal.name,
         target_amount: safeNumber(goal.targetAmount),
         current_amount: safeNumber(goal.currentAmount),
         icon: goal.icon,
         color: goal.color
     }).eq('id', goal.id);

     if (error) throw error;
     return storageService.getGoals();
  },

  deleteGoal: async (id: string): Promise<FinancialGoal[]> => {
      const { error } = await supabase.from('financial_goals').delete().eq('id', id);
      if (error) throw error;
      return storageService.getGoals();
  },

  // --- Settings ---
  getSettings: async (): Promise<UserSettings> => {
    try {
        const { data: settingsData } = await supabase.from('settings').select('*').eq('user_id', DEFAULT_USER_ID).single();
        const { data: incomeData } = await supabase.from('income_sources').select('*').eq('user_id', DEFAULT_USER_ID);
        const { data: cardsData } = await supabase.from('bank_cards').select('*').eq('user_id', DEFAULT_USER_ID);
        const { data: recurringData } = await supabase.from('recurring_transactions').select('*').eq('user_id', DEFAULT_USER_ID);
        const { data: catsData } = await supabase.from('custom_categories').select('*').eq('user_id', DEFAULT_USER_ID);
        
        // Fetch Bank Logos
        const { data: logosData } = await supabase.from('bank_logos').select('*');

        if (!settingsData) return DEFAULT_SETTINGS;

        return {
            currency: settingsData.currency || 'SAR',
            monthlyLimit: Number(settingsData.monthly_limit) || 5000,
            alertThreshold: settingsData.alert_threshold || 80,
            theme: settingsData.theme || 'system',
            budgetRollover: settingsData.budget_rollover || false,
            privacyMode: false,
            incomeSources: (incomeData || []).map((i: any) => ({
                id: i.id,
                name: i.name,
                amount: Number(i.amount),
                dayOfMonth: i.day_of_month
            })),
            cards: (cardsData || []).map((c: any) => {
                // Determine logo: user set > mapped > undefined
                const mappedLogo = logosData?.find((l: any) => c.bank_name && l.bank_name.includes(c.bank_name))?.logo_url;
                return {
                    id: c.id,
                    bankName: c.bank_name,
                    cardNumber: c.card_number,
                    accountLast4: c.account_last4,
                    cardType: c.card_type,
                    color: c.color,
                    balance: Number(c.balance),
                    logoUrl: c.logo_url || mappedLogo,
                    logoPosition: c.logo_position || 'top-left'
                };
            }),
            recurringTransactions: (recurringData || []).map((r: any) => ({
               id: r.id,
               name: r.name,
               amount: Number(r.amount),
               type: r.type,
               category: r.category,
               dayOfMonth: r.day_of_month,
               active: r.active
            })),
            customCategories: (catsData || []).map((c: any) => ({
               id: c.id,
               name: c.name,
               icon: c.icon,
               color: c.color
            }))
        };
    } catch (e) {
        console.error("Error loading settings", e);
        return DEFAULT_SETTINGS;
    }
  },

  saveSettings: async (settings: UserSettings): Promise<UserSettings> => {
    // 1. Settings Table (Upsert)
    await supabase.from('settings').upsert({
        user_id: DEFAULT_USER_ID,
        currency: settings.currency,
        monthly_limit: settings.monthlyLimit,
        alert_threshold: settings.alertThreshold,
        theme: settings.theme,
        budget_rollover: settings.budgetRollover
    });

    // 2. Bank Cards (Smart Sync to preserve UUIDs)
    // Fetch existing IDs
    const { data: existingCards } = await supabase.from('bank_cards').select('id').eq('user_id', DEFAULT_USER_ID);
    const existingIds = existingCards?.map(c => c.id) || [];
    const incomingIds = settings.cards.map(c => c.id).filter(id => id && id.length > 20); // Basic check for real UUID

    // Delete removed cards
    const toDelete = existingIds.filter(id => !incomingIds.includes(id));
    if (toDelete.length > 0) {
        await supabase.from('bank_cards').delete().in('id', toDelete);
    }

    // Upsert (Update existing or Insert new)
    for (const card of settings.cards) {
        const payload = {
            user_id: DEFAULT_USER_ID,
            bank_name: card.bankName,
            card_number: card.cardNumber,
            account_last4: card.accountLast4,
            card_type: card.cardType,
            color: card.color,
            balance: safeNumber(card.balance),
            logo_url: card.logoUrl || null,
            logo_position: card.logoPosition || 'top-left'
        };

        if (card.id && card.id.length > 20) {
            // Update existing with ID check to be safe
            await supabase.from('bank_cards').update(payload).eq('id', card.id);
        } else {
            // Insert new (DB generates UUID)
            await supabase.from('bank_cards').insert(payload);
        }
    }
    
    // 3. Other Sub-tables (Delete/Insert is fine as no FKs depend on them)
    await supabase.from('income_sources').delete().eq('user_id', DEFAULT_USER_ID);
    if (settings.incomeSources.length > 0) {
        await supabase.from('income_sources').insert(settings.incomeSources.map(i => ({
            user_id: DEFAULT_USER_ID,
            name: i.name,
            amount: safeNumber(i.amount),
            day_of_month: i.dayOfMonth
        })));
    }

    await supabase.from('recurring_transactions').delete().eq('user_id', DEFAULT_USER_ID);
    if (settings.recurringTransactions.length > 0) {
        await supabase.from('recurring_transactions').insert(settings.recurringTransactions.map(r => ({
            user_id: DEFAULT_USER_ID,
            name: r.name,
            amount: safeNumber(r.amount),
            type: r.type,
            category: r.category,
            day_of_month: r.dayOfMonth,
            active: r.active
        })));
    }

    await supabase.from('custom_categories').delete().eq('user_id', DEFAULT_USER_ID);
    if (settings.customCategories.length > 0) {
        await supabase.from('custom_categories').insert(settings.customCategories.map(c => ({
            user_id: DEFAULT_USER_ID,
            name: c.name,
            icon: c.icon,
            color: c.color
        })));
    }

    if (settings.password) {
        await supabase.from('users').update({ password_hash: settings.password }).eq('id', DEFAULT_USER_ID);
    }

    // IMPORTANT: Return fresh data to update client state with valid UUIDs
    return storageService.getSettings();
  }
};