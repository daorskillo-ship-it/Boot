declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export type BetTarget = 
  | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high'
  | 'dozen_1' | 'dozen_2' | 'dozen_3'
  | 'column_1' | 'column_2' | 'column_3'
  | 'straight_up' | 'split' | 'street' | 'corner' | 'six_line';

export interface LabouchereState {
  sequence: number[];
  initialSequence: number[];
  currentStrategy: BetTarget;
  strategyMode: 'manual' | 'ai';
  targetPayout: number; // e.g. 1 for 1:1, 2 for 2:1
  targetCount: number; // How many spots to cover
  currency: string;
  baseBet: number;
  stopLoss: number;
  takeProfit: number;
  balance: number;
  currentMultiplier: number;
  apiToken: string;
  apiStatus: 'connected' | 'disconnected' | 'error';
  history: number[];
  aiAnalysis: string;
  totalProfit: number;
  wins: number;
  losses: number;
  currentStreak: number; // Positive for wins, negative for losses
  maxWinStreak: number;
  maxLossStreak: number;
  isRunning: boolean;
  recentBets: BetResult[];
  strategyHistory: StrategyLogEntry[];
  profitHistory: { time: string; profit: number }[];
}

export interface StrategyLogEntry {
  timestamp: string;
  target: BetTarget;
  type: string;
  trigger: string;
  anomaly: string;
  reasoning: string;
  riskLevel?: string;
  confidence?: number;
  variance?: string;
  riskScore?: number;
  betMultiplier?: number;
}

export interface BetResult {
  win: boolean;
  amount: number;
  payout: number;
  target: BetTarget;
  roll?: number;
  timestamp?: string;
  sequence?: number[];
  multiplier?: number;
  unitSize?: number;
}
