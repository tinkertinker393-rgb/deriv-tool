
export interface TickData {
  epoch: number;
  quote: number;
  lastDigit: number;
  symbol: string;
}

export interface DigitStats {
  digit: number;
  count: number;
  percentage: number;
}

export type TradeSignal = "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL";

export interface AIAnalysis {
  summary: string;
  prediction: string;
  matchDigit: number;
  signal: TradeSignal;
  confidence: number;
  logic: string;
}

export interface AccountInfo {
  balance: number;
  currency: string;
  loginid: string;
  email: string;
  is_virtual: boolean;
}

export interface TradeLog {
  id: string;
  type: string;
  symbol: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'ERROR';
  stake: number;
  payout?: number;
  timestamp: number;
}

export enum MarketSymbol {
  R_10 = "R_10",
  R_25 = "R_25",
  R_50 = "R_50",
  R_75 = "R_75",
  R_100 = "R_100",
}

export const SYMBOL_NAMES: Record<MarketSymbol, string> = {
  [MarketSymbol.R_10]: "Volatility 10 Index",
  [MarketSymbol.R_25]: "Volatility 25 Index",
  [MarketSymbol.R_50]: "Volatility 50 Index",
  [MarketSymbol.R_75]: "Volatility 75 Index",
  [MarketSymbol.R_100]: "Volatility 100 Index",
};
