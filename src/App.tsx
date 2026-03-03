import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Square, 
  RotateCcw, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Settings,
  History,
  Coins,
  ShieldAlert,
  Brain,
  Zap,
  LineChart as ChartIcon
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { LabouchereState } from './types';

export default function App() {
  const [state, setState] = useState<LabouchereState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inputSequence, setInputSequence] = useState('1, 2, 3');
  const [selectedCurrency, setSelectedCurrency] = useState('BTC');
  const [selectedBetType, setSelectedBetType] = useState('even_money');
  const [strategyMode, setStrategyMode] = useState<'manual' | 'ai'>('ai');
  const [apiToken, setApiToken] = useState('');
  const [baseBet, setBaseBet] = useState('1');
  const [stopLoss, setStopLoss] = useState('0');
  const [takeProfit, setTakeProfit] = useState('0');
  const [balance, setBalance] = useState('1000');
  const [hasInitialized, setHasInitialized] = useState(false);

  const betTypeConfigs: Record<string, { payout: number, count: number, label: string }> = {
    'even_money': { payout: 1, count: 1, label: 'Even Money (1:1)' },
    'dozens': { payout: 2, count: 2, label: 'Dozens (2:1)' },
    'columns': { payout: 2, count: 2, label: 'Columns (2:1)' },
    'six_line': { payout: 5, count: 5, label: 'Six Line (5:1)' },
    'corner': { payout: 8, count: 8, label: 'Corner (8:1)' },
    'street': { payout: 11, count: 11, label: 'Street (11:1)' },
    'split': { payout: 17, count: 17, label: 'Split (17:1)' },
    'straight_up': { payout: 35, count: 35, label: 'Straight Up (35:1)' },
  };

  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const text = await res.text();
      
      try {
        const data = JSON.parse(text);
        setState(data);
        setError(null);
      } catch (parseErr) {
        // If the response is not JSON (e.g. HTML error page during restart), ignore it
        console.warn('Received invalid JSON from server (likely restarting)');
      }
    } catch (err) {
      console.error('Failed to fetch state:', err);
      setError('Connection lost. Retrying...');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (state && !hasInitialized) {
      setInputSequence(state.initialSequence.join(', '));
      setSelectedCurrency(state.currency);
      setBaseBet(state.baseBet.toString());
      setStopLoss(state.stopLoss.toString());
      setTakeProfit(state.takeProfit.toString());
      setBalance(state.balance.toString());
      setApiToken(state.apiToken);
      setStrategyMode(state.strategyMode);
      setHasInitialized(true);
    }
  }, [state, hasInitialized]);

  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        if (error !== 'Connection lost. Retrying...') setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const handleStart = async () => {
    try {
      await fetch('/api/start', { method: 'POST' });
      fetchState();
    } catch (err) {
      setError('Failed to start bot');
    }
  };

  const handleStop = async () => {
    try {
      await fetch('/api/stop', { method: 'POST' });
      fetchState();
    } catch (err) {
      setError('Failed to stop bot');
    }
  };

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to reset all stats and sequence?')) {
      try {
        await fetch('/api/reset', { method: 'POST' });
        fetchState();
      } catch (err) {
        setError('Failed to reset bot');
      }
    }
  };

  const handleUpdateConfig = async () => {
    try {
      const sequence = inputSequence.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      if (sequence.length === 0) {
        setError('Invalid sequence format');
        return;
      }
      
      const config = betTypeConfigs[selectedBetType];
      
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sequence, 
          currency: selectedCurrency,
          targetPayout: config.payout,
          targetCount: config.count,
          strategyMode,
          apiToken,
          baseBet: parseFloat(baseBet) || 1,
          stopLoss: parseFloat(stopLoss) || 0,
          takeProfit: parseFloat(takeProfit) || 0,
          betMultiplier: state?.currentMultiplier || 1,
          balance: parseFloat(balance) || 1000
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update config');
        return;
      }
      
      setSuccess('Configuration saved successfully!');
      fetchState();
    } catch (err) {
      setError('Failed to update configuration');
    }
  };

  if (loading && !state) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Activity className="w-12 h-12 text-emerald-500 animate-pulse" />
          <p className="text-emerald-500/60 font-mono text-sm uppercase tracking-widest">Initializing System...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <Activity className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Paradice <span className="text-emerald-500">Bot</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            {error && (
              <div className="flex items-center gap-2 text-rose-500 text-xs font-medium bg-rose-500/10 px-3 py-1.5 rounded-full border border-rose-500/20">
                <ShieldAlert className="w-3.5 h-3.5" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-emerald-500 text-xs font-medium bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <Zap className="w-3.5 h-3.5" />
                {success}
              </div>
            )}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
              state?.isRunning 
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${state?.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
              {state?.isRunning ? 'SYSTEM ACTIVE' : 'SYSTEM STANDBY'}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Controls & Stats */}
        <div className="lg:col-span-4 space-y-6">
          {/* Main Controls */}
          <section className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Control Center
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {!state?.isRunning ? (
                <button
                  onClick={handleStart}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.2)] active:scale-[0.98]"
                >
                  <Play className="w-5 h-5 fill-current" />
                  START BOT
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="w-full py-4 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(244,63,94,0.2)] active:scale-[0.98]"
                >
                  <Square className="w-5 h-5 fill-current" />
                  STOP BOT
                </button>
              )}
              
              <button
                onClick={handleReset}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-zinc-300 font-medium rounded-xl transition-all flex items-center justify-center gap-2 border border-white/5 active:scale-[0.98]"
              >
                <RotateCcw className="w-4 h-4" />
                RESET SESSION
              </button>
            </div>
          </section>

          {/* Configuration */}
          <section className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-6">
            <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Bot Configuration
            </h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Paradice API Token</label>
                <div className="relative">
                  <input 
                    type="password" 
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    disabled={state?.isRunning}
                    placeholder="Enter your API token..."
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className={`w-2 h-2 rounded-full ${
                      state?.apiStatus === 'connected' ? 'bg-emerald-500' :
                      state?.apiStatus === 'error' ? 'bg-rose-500' : 'bg-zinc-600'
                    }`} />
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 italic px-1">
                  {state?.apiStatus === 'connected' ? 'API Connected' : 
                   state?.apiStatus === 'error' ? 'API Error: Check Token' : 'API Token Required'}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Strategy Selection Mode</label>
                <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={() => setStrategyMode('manual')}
                    disabled={state?.isRunning}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                      strategyMode === 'manual' 
                        ? 'bg-zinc-800 text-white shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    MANUAL
                  </button>
                  <button
                    onClick={() => setStrategyMode('ai')}
                    disabled={state?.isRunning}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      strategyMode === 'ai' 
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Brain className="w-3 h-3" />
                    AI OPTIMIZED
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Initial Sequence</label>
                <input 
                  type="text" 
                  value={inputSequence}
                  onChange={(e) => setInputSequence(e.target.value)}
                  disabled={state?.isRunning}
                  placeholder="e.g. 1, 2, 3"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Starting Balance</label>
                <input 
                  type="number" 
                  step="0.00000001"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  disabled={state?.isRunning}
                  placeholder="e.g. 1000"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Base Bet (Unit Value)</label>
                <input 
                  type="number" 
                  step="0.00000001"
                  value={baseBet}
                  onChange={(e) => setBaseBet(e.target.value)}
                  disabled={state?.isRunning}
                  placeholder="e.g. 0.0001"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Stop Loss</label>
                  <input 
                    type="number" 
                    step="0.00000001"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    disabled={state?.isRunning}
                    placeholder="0 for none"
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-rose-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Take Profit</label>
                  <input 
                    type="number" 
                    step="0.00000001"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    disabled={state?.isRunning}
                    placeholder="0 for none"
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {strategyMode === 'manual' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Bet Type (Manual)</label>
                  <select 
                    value={selectedBetType}
                    onChange={(e) => setSelectedBetType(e.target.value)}
                    disabled={state?.isRunning}
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                  >
                    {Object.entries(betTypeConfigs).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-500 italic px-1">
                    Covers {betTypeConfigs[selectedBetType].count} spots.
                  </p>
                </div>
              )}

              {strategyMode === 'ai' && (
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
                  <p className="text-[10px] text-emerald-500/80 leading-relaxed font-medium">
                    AI will automatically select the best Bet Type and Target after every successful progression.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Currency</label>
                <select 
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  disabled={state?.isRunning}
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                >
                  <option value="BTC">BTC (Bitcoin)</option>
                  <option value="ETH">ETH (Ethereum)</option>
                  <option value="LTC">LTC (Litecoin)</option>
                  <option value="DOGE">DOGE (Dogecoin)</option>
                  <option value="TRX">TRX (Tron)</option>
                  <option value="USDT">USDT (Tether)</option>
                </select>
              </div>

              <button
                onClick={handleUpdateConfig}
                disabled={state?.isRunning}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-zinc-300 font-medium rounded-xl transition-all flex items-center justify-center gap-2 border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                APPLY CONFIGURATION
              </button>
            </div>
          </section>

          {/* Quick Stats */}
          <section className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 space-y-1">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Profit</p>
              <div className={`text-2xl font-mono font-bold ${state && state.totalProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {state?.totalProfit.toFixed(8)}
              </div>
            </div>
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 space-y-1">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Win Rate</p>
              <div className="text-2xl font-mono font-bold text-zinc-100">
                {state && (state.wins + state.losses) > 0 
                  ? ((state.wins / (state.wins + state.losses)) * 100).toFixed(1) 
                  : '0.0'}%
              </div>
            </div>
          </section>

          {/* Detailed Stats */}
          <section className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <History className="w-4 h-4" />
              Session Metrics
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Wins</span>
                <span className="text-sm font-mono text-emerald-500">{state?.wins}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Losses</span>
                <span className="text-sm font-mono text-rose-500">{state?.losses}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Current Streak</span>
                <span className={`text-sm font-mono ${state && state.currentStreak > 0 ? 'text-emerald-500' : state && state.currentStreak < 0 ? 'text-rose-500' : 'text-zinc-500'}`}>
                  {state && state.currentStreak > 0 ? `+${state.currentStreak}` : state?.currentStreak}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Max Win Streak</span>
                <span className="text-sm font-mono text-emerald-500">{state?.maxWinStreak}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Max Loss Streak</span>
                <span className="text-sm font-mono text-rose-500">{state?.maxLossStreak}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Current Strategy</span>
                <span className="text-sm font-mono text-zinc-100 uppercase">{state?.currentStrategy}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Bet Mode</span>
                <span className="text-sm font-mono text-zinc-100 uppercase">
                  {state?.targetPayout}:1 (x{state?.targetCount})
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Selection Mode</span>
                <span className={`text-sm font-mono uppercase ${state?.strategyMode === 'ai' ? 'text-emerald-500' : 'text-zinc-400'}`}>
                  {state?.strategyMode}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">API Status</span>
                <span className={`text-sm font-mono uppercase ${
                  state?.apiStatus === 'connected' ? 'text-emerald-500' :
                  state?.apiStatus === 'error' ? 'text-rose-500' : 'text-zinc-500'
                }`}>
                  {state?.apiStatus}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Currency</span>
                <span className="text-sm font-mono text-zinc-100 uppercase">{state?.currency}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Base Bet</span>
                <span className="text-sm font-mono text-zinc-100 uppercase">{state?.baseBet}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-sm text-zinc-500">Stop Loss</span>
                <span className="text-sm font-mono text-rose-500 uppercase">{state?.stopLoss > 0 ? `-${state.stopLoss}` : 'None'}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-zinc-500">Take Profit</span>
                <span className="text-sm font-mono text-emerald-500 uppercase">{state?.takeProfit > 0 ? `+${state.takeProfit}` : 'None'}</span>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Labouchere Sequence & Visuals */}
        <div className="lg:col-span-8 space-y-6">
          {/* Sequence Visualizer */}
          <section className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 min-h-[300px] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <Coins className="w-4 h-4" />
                Labouchere Sequence
              </h2>
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                {state?.sequence.length} Units Remaining
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center flex-wrap gap-4">
              <AnimatePresence mode="popLayout">
                {state?.sequence.map((num, idx) => {
                  const isEdge = idx === 0 || idx === state.sequence.length - 1;
                  return (
                    <motion.div
                      key={`${idx}-${num}`}
                      layout
                      initial={{ scale: 0.8, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.5, opacity: 0, y: -20 }}
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-mono font-bold border-2 transition-colors ${
                        isEdge 
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                          : 'bg-zinc-800/50 border-white/5 text-zinc-400'
                      }`}
                    >
                      {num}
                    </motion.div>
                  );
                })}
                {state?.sequence.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center space-y-2"
                  >
                    <div className="text-emerald-500 font-bold text-xl">SEQUENCE COMPLETED</div>
                    <p className="text-zinc-500 text-sm">Rotating strategy and resetting sequence...</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-zinc-500">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Next Bet Components</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-zinc-700" />
                  <span>Inactive Units</span>
                </div>
              </div>
              <div className="font-mono">
                Next Bet: <span className="text-zinc-100 font-bold">
                  {state?.sequence.length === 0 
                    ? state.initialSequence[0] + state.initialSequence[state.initialSequence.length - 1]
                    : state?.sequence.length === 1 
                      ? state.sequence[0] 
                      : (state?.sequence[0] || 0) + (state?.sequence[state?.sequence.length - 1] || 0)
                  } Units
                </span>
              </div>
            </div>
          </section>

          {/* Roll History */}
          <section className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <History className="w-4 h-4" />
                Roll History
              </h2>
              <span className="text-[10px] text-zinc-500 font-mono">LAST 20</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {state?.history.map((roll, i) => {
                const isRed = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(roll);
                const isZero = roll === 0;
                return (
                  <div 
                    key={i}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${
                      isZero ? 'bg-emerald-500 border-emerald-400 text-black' :
                      isRed ? 'bg-rose-500/20 border-rose-500/40 text-rose-500' : 
                      'bg-zinc-800 border-white/10 text-zinc-400'
                    }`}
                  >
                    {roll}
                  </div>
                );
              })}
              {state?.history.length === 0 && (
                <div className="text-xs text-zinc-600 italic py-4">No rolls recorded yet...</div>
              )}
            </div>
          </section>

          {/* Profit Graph */}
          <section className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <ChartIcon className="w-4 h-4" />
                Profit Trajectory
              </h2>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono font-bold ${
                  (state?.totalProfit || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'
                }`}>
                  {(state?.totalProfit || 0) > 0 ? '+' : ''}{(state?.totalProfit || 0).toFixed(8)} Units
                </span>
              </div>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={state?.profitHistory || []}>
                  <defs>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    hide 
                  />
                  <YAxis 
                    hide 
                    domain={['auto', 'auto']}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #333', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff', fontSize: '12px', fontFamily: 'monospace' }}
                    labelStyle={{ display: 'none' }}
                    formatter={(value: number) => [`${value.toFixed(8)} Units`, 'Profit']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="profit" 
                    stroke={(state?.totalProfit || 0) >= 0 ? "#10b981" : "#f43f5e"} 
                    fillOpacity={1} 
                    fill={(state?.totalProfit || 0) >= 0 ? "url(#colorProfit)" : "url(#colorLoss)"} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Recent Bets Table */}
          <section className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Recent Activity
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-zinc-500 border-b border-white/5">
                    <th className="pb-3 font-bold uppercase tracking-widest">Time</th>
                    <th className="pb-3 font-bold uppercase tracking-widest">Roll</th>
                    <th className="pb-3 font-bold uppercase tracking-widest">Target</th>
                    <th className="pb-3 font-bold uppercase tracking-widest">Amount</th>
                    <th className="pb-3 font-bold uppercase tracking-widest">Units</th>
                    <th className="pb-3 font-bold uppercase tracking-widest">Mult</th>
                    <th className="pb-3 font-bold uppercase tracking-widest">Profit</th>
                    <th className="pb-3 font-bold uppercase tracking-widest">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {state?.recentBets.map((bet, i) => (
                    <tr key={i} className="group">
                      <td className="py-3 font-mono text-zinc-500">{bet.timestamp || '-'}</td>
                      <td className="py-3 font-mono text-zinc-300">
                        <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                          bet.roll === 0 ? 'bg-emerald-500 text-black' :
                          [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(bet.roll || -1) 
                            ? 'bg-rose-500/20 text-rose-500' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {bet.roll !== undefined ? bet.roll : '-'}
                        </div>
                      </td>
                      <td className="py-3 font-mono uppercase text-zinc-300">{bet.target}</td>
                      <td className="py-3 font-mono text-zinc-400">{bet.amount.toFixed(8)}</td>
                      <td className="py-3 font-mono text-zinc-500">{bet.unitSize || '-'}</td>
                      <td className="py-3 font-mono text-zinc-500">{bet.multiplier ? `${bet.multiplier}x` : '-'}</td>
                      <td className={`py-3 font-mono font-bold ${bet.win ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {bet.win ? `+${(bet.payout - bet.amount).toFixed(8)}` : `-${bet.amount.toFixed(8)}`}
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold ${
                          bet.win ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {bet.win ? 'WIN' : 'LOSS'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {state?.recentBets.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-zinc-600 italic">
                        No activity recorded...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* AI Strategy & Rotation Log */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tight">AI Strategy Engine</h3>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-emerald-500/60 font-mono uppercase">Active Analysis</p>
                  </div>
                </div>
                {state?.strategyHistory[0]?.confidence && (
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Confidence</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">{state.strategyHistory[0].confidence}%</span>
                  </div>
                )}
              </div>
              <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Reasoning</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {state?.aiAnalysis}
                  </p>
                </div>
                {state?.strategyHistory[0]?.anomaly && state.strategyHistory[0].anomaly !== "None" && state.strategyHistory[0].anomaly !== "None detected" && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldAlert className="w-3 h-3 text-amber-500" />
                      <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Anomaly Detected</p>
                    </div>
                    <p className="text-[10px] text-amber-200/80 font-mono leading-relaxed">
                      {state.strategyHistory[0].anomaly}
                    </p>
                  </div>
                )}
                {state?.strategyHistory[0] && (
                  <div className="grid grid-cols-2 gap-2 pt-4 border-t border-white/5">
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Variance</p>
                      <p className={`text-xs font-mono font-bold ${
                        state.strategyHistory[0].variance?.toLowerCase() === 'high' ? 'text-rose-500' :
                        state.strategyHistory[0].variance?.toLowerCase() === 'low' ? 'text-emerald-500' :
                        'text-amber-500'
                      }`}>{state.strategyHistory[0].variance || 'Medium'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Risk Score</p>
                      <p className="text-xs font-mono font-bold text-indigo-400">{state.strategyHistory[0].riskScore || 50}/100</p>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Bet Multiplier</p>
                      <p className="text-xs font-mono font-bold text-zinc-300">
                        {state.currentMultiplier ? state.currentMultiplier.toFixed(2) : '1.00'}x
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-zinc-500" />
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">AI Rotation History</h3>
                </div>
                <span className="text-[10px] text-zinc-600 font-mono">LAST 10 ROTATIONS</span>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800">
                {state?.strategyHistory.map((log, i) => (
                  <div key={i} className="flex flex-col gap-2 text-[11px] border-b border-white/5 pb-3 mb-3 last:border-0 last:mb-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-600 font-mono text-[10px]">{log.timestamp}</span>
                        {log.riskLevel && (
                          <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                            log.riskLevel.toLowerCase() === 'low' ? 'bg-emerald-500/10 text-emerald-500' :
                            log.riskLevel.toLowerCase() === 'high' ? 'bg-rose-500/10 text-rose-500' :
                            'bg-amber-500/10 text-amber-500'
                          }`}>
                            {log.riskLevel} RISK
                          </span>
                        )}
                        {log.confidence && (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                            {log.confidence}% CONF
                          </span>
                        )}
                        {log.betMultiplier && log.betMultiplier !== 1 && (
                           <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">
                             {log.betMultiplier.toFixed(2)}x BET
                           </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 bg-zinc-800/50 px-2 py-1 rounded border border-white/5">
                        <span className="text-emerald-500 font-bold uppercase">{log.type}</span>
                        <span className="text-zinc-600">→</span>
                        <span className="text-zinc-100 font-mono uppercase">{log.target}</span>
                      </div>
                    </div>
                    
                    {(log.trigger || (log.anomaly && log.anomaly !== 'None detected')) && (
                      <div className="grid grid-cols-1 gap-1">
                        {log.trigger && (
                          <div className="flex items-start gap-2">
                            <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider shrink-0 mt-0.5 w-14">TRIGGER</span>
                            <span className="text-zinc-400">{log.trigger}</span>
                          </div>
                        )}
                        {log.anomaly && log.anomaly !== 'None detected' && (
                          <div className="flex items-start gap-2">
                            <span className="text-[9px] font-bold text-rose-500 uppercase tracking-wider shrink-0 mt-0.5 w-14">ANOMALY</span>
                            <span className="text-zinc-400">{log.anomaly}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bg-black/20 p-2 rounded border border-white/5">
                      <p className="text-zinc-500 italic leading-relaxed">{log.reasoning}</p>
                    </div>
                  </div>
                ))}
                {state?.strategyHistory.length === 0 && (
                  <div className="text-xs text-zinc-600 italic py-8 text-center">
                    Waiting for first profit lock to trigger rotation...
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Logic Info */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
              </div>
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tight">Labouchere Logic</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Bets the sum of the first and last numbers. Wins remove them; losses add the bet amount to the end.
              </p>
            </div>
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-500" />
              </div>
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tight">AI Rotation</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Automatically switches between all bet types (1:1 to 35:1) after every successful progression based on AI scanning.
              </p>
            </div>
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Coins className="w-5 h-5 text-emerald-500" />
              </div>
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tight">Profit Target</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Each completed sequence nets a profit equal to the sum of the initial sequence (1+2+3 = 6 units).
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/5">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-xs text-zinc-600 font-mono">
            &copy; 2024 PARADICE AUTOMATION SYSTEM // V1.0.4
          </div>
          <div className="flex items-center gap-6 text-xs font-bold text-zinc-500 uppercase tracking-widest">
            <a href="#" className="hover:text-emerald-500 transition-colors">Documentation</a>
            <a href="#" className="hover:text-emerald-500 transition-colors">API Status</a>
            <a href="#" className="hover:text-emerald-500 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
