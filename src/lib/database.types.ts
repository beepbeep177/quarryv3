export interface Database {
  public: {
    Tables: {
      customers: {
        Row: Customer;
        Insert: Omit<Customer, 'id' | 'created_at'>;
        Update: Partial<Omit<Customer, 'id' | 'created_at'>>;
      };
      trucks: {
        Row: Truck;
        Insert: Omit<Truck, 'id' | 'created_at'>;
        Update: Partial<Omit<Truck, 'id' | 'created_at'>>;
      };
      pricing: {
        Row: Pricing;
        Insert: Omit<Pricing, 'id' | 'created_at'>;
        Update: Partial<Omit<Pricing, 'id' | 'created_at'>>;
      };
      transactions: {
        Row: Transaction;
        Insert: Omit<Transaction, 'id' | 'created_at' | 'volume_m3' | 'amount' | 'total_amount'>;
        Update: Partial<Omit<Transaction, 'id' | 'created_at' | 'volume_m3' | 'amount' | 'total_amount'>>;
      };
      expense_categories: {
        Row: ExpenseCategory;
        Insert: Omit<ExpenseCategory, 'id' | 'created_at'>;
        Update: Partial<Omit<ExpenseCategory, 'id' | 'created_at'>>;
      };
      expenses: {
        Row: Expense;
        Insert: Omit<Expense, 'id' | 'created_at'>;
        Update: Partial<Omit<Expense, 'id' | 'created_at'>>;
      };
    };
  };
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  address: string;
  created_at: string;
}

export interface Truck {
  id: string;
  plate_number: string;
  driver_name: string;
  capacity_m3: number;
  created_at: string;
}

export interface Pricing {
  id: string;
  material_type: string;
  unit_price: number;
  effective_date: string;
  created_at: string;
}

export type PaymentMode = 'CASH' | 'P.O' | 'OFFSET';
export type TransactionStatus = 'PENDING' | 'PAID';

export interface Transaction {
  id: string;
  transaction_date: string;
  customer_id: string;
  truck_id: string;
  dr_number: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  volume_m3: number;
  unit_price: number;
  amount: number;
  dr_capitol: number;
  passway: number;
  kulot: number;
  total_amount: number;
  payment_mode: PaymentMode;
  status: TransactionStatus;
  notes: string;
  created_at: string;
}

export interface TransactionWithRelations extends Transaction {
  customers: Customer | null;
  trucks: Truck | null;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  user_id: string | null;
  is_default: boolean;
  order: number;
  created_at: string;
}

export interface Expense {
  id: string;
  expense_date: string;
  category_id: string;
  amount: number;
  payee_supplier: string;
  description: string;
  liters_counter: number | null;
  created_at: string;
}

export interface ExpenseWithCategory extends Expense {
  expense_categories: ExpenseCategory | null;
}
