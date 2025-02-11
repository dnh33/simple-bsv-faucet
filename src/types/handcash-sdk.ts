// HandCash SDK Types
export interface PaymentRequestItem {
  destination: string;
  sendAmount: number;
  currencyCode: CurrencyCode;
}

export interface PaymentParameters {
  description: string;
  appAction: string;
  payments: PaymentRequestItem[];
}

export type CurrencyCode = "SAT" | "USD" | "EUR" | "BSV";
