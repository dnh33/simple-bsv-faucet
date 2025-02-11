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
  attachment?: {
    format: "hex";
    value: string;
  };
}

export type CurrencyCode = "SAT" | "USD" | "EUR" | "BSV";
