import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Play, 
  Square, 
  Settings, 
  BarChart3, 
  Terminal, 
  Wallet, 
  TrendingUp, 
  Brain,
  Bell,
  ChevronRight,
  ShieldAlert,
  Moon,
  Sun,
  Activity,
  History,
  Target
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

const HARDCODED_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJwYXJhZGljZS5pbiIsImF1ZCI6InBhcmFkaWNlLmluIiwiaWF0IjoxNzcwODA1NjgyLCJuYmYiOjE3NzA4MDU2ODIsImRhdGEiOnsiaWQiOiIyODI5MyIsImxvZ2luIjoiZGFvcmN6Iiwia2V5IjoiUGhhbkFUYTZDRW9MaFNoRFVtZ0ZoUzNiYnhiYk43ZWsifX0.Dj20XVI1ILfEhVsoVCuT1YOWrU9GKX0NFpnb4a5dhNIZlKmQNsBZASyqXRMGNNEqoBQxfraBEdA6ejqHXID7fbHhKcopn8arD4R3RppISp-7xq5L_MhmPs9Z1NHqR-7byV4ejQge1VfcDL4GnSW0sGMdSJYs3Tv_RkfsR3xAe4gfar0ExfMT9vGdPypVlQUIbjK0BRFAiJtM-tBN5pd8HMQ383qH7gWhYDj_Fhtz6H6GoyQhgiCWXE-xw6Yw--mw0qQWxJeAFC1uVgSozNiWA5HRXdN3lpmBcWjJDjNA63H33FSESSVEVuAGBv1ycFxczFvB5glihnw9TvYcj7tfdg";

interface LogEntry {
  msg: string;
  color: string;
  time: string;
}

interface BotStatus {
  running: boolean;
  balance: number;
  profit: number;
  activeStrat: string;
  historyCount: number;
  chartData: { time: string; profit: number; sma?: number }[];
  stats?: {
    winRate: string;
    currentStreak: number;
    maxStreak: number;
    maxDrawdown: string;
    totalBets: number;
  };
  aiWeights?: Record<string, number>;
  aiConfidence?: number;
  aiSectorBias?: string;
  marketPhase?: string;
  marketVolatility?: number;
  betHistory?: BetRecord[];
}

interface BetRecord {
  id: number;
  time: string;
  strat: string;
  bet: number;
  outcome: "WIN" | "LOSS";
  profit: number;
  roll: number;
}

interface LiveConsoleProps {
  logs: LogEntry[];
}

interface BetHistoryTableProps {
  betHistory: BetRecord[];
}

const BetHistoryTable = React.memo(({ betHistory }: BetHistoryTableProps) => {
  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden transition-colors duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 flex items-center gap-2 transition-colors duration-200">
        <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h2 className="font-semibold text-sm uppercase tracking-wider text-slate-800 dark:text-slate-200">Bet History</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Strat</th>
              <th className="px-4 py-3 font-medium">Roll</th>
              <th className="px-4 py-3 font-medium">Bet</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium text-right">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {(betHistory || []).map((bet) => (
              <tr key={bet.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">{bet.id}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{bet.time}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {bet.strat}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-200">{bet.roll}</td>
                <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{bet.bet.toFixed(8)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    bet.outcome === 'WIN' 
                      ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20' 
                      : 'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
                  }`}>
                    {bet.outcome}
                  </span>
                </td>
                <td className={`px-4 py-3 font-mono font-bold text-right ${bet.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {bet.profit >= 0 ? '+' : ''}{bet.profit.toFixed(8)}
                </td>
              </tr>
            ))}
            {(betHistory || []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400 dark:text-slate-600 text-xs uppercase tracking-widest">
                  No bets placed yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

interface ProfitChartProps {
  chartData: { time: string; profit: number; sma?: number }[];
  isDarkMode: boolean;
  running: boolean;
  showSMA: boolean;
  setShowSMA: (show: boolean) => void;
}

const ProfitChart = React.memo(({ chartData, isDarkMode, running, showSMA, setShowSMA }: ProfitChartProps) => {
  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden transition-colors duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 flex items-center justify-between transition-colors duration-200">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="font-semibold text-sm uppercase tracking-wider italic font-serif text-slate-800 dark:text-slate-200">Profit Performance</h2>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showSMA}
              onChange={(e) => setShowSMA(e.target.checked)}
              className="w-3 h-3 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Show SMA (10)</span>
          </label>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-slate-600'}`}></div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{running ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </div>
      <div className="p-6 h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} vertical={false} />
            <XAxis 
              dataKey="time" 
              stroke={isDarkMode ? "#64748b" : "#94a3b8"} 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
              minTickGap={30}
            />
            <YAxis 
              stroke={isDarkMode ? "#64748b" : "#94a3b8"} 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
              tickFormatter={(val) => val.toFixed(4)}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '8px' }}
              itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
              labelStyle={{ color: '#94a3b8', fontSize: '10px' }}
            />
            <Line 
              type="monotone" 
              dataKey="profit" 
              stroke="#6366f1" 
              strokeWidth={3} 
              dot={false}
              isAnimationActive={false}
            />
            {showSMA && (
              <Line 
                type="monotone" 
                dataKey="sma" 
                stroke="#f59e0b" 
                strokeWidth={2} 
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

const LiveConsole = React.memo(({ logs }: LiveConsoleProps) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = logContainerRef.current;
    if (container) {
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
      if (isAtBottom) {
        logEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
    }
  }, [logs]);

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col h-[400px] transition-colors duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 flex items-center gap-2 transition-colors duration-200">
        <Terminal className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h2 className="font-semibold text-sm uppercase tracking-wider text-slate-800 dark:text-slate-200">Live Console</h2>
      </div>
      <div ref={logContainerRef} className="flex-1 p-4 font-mono text-xs overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950/50 transition-colors duration-200">
        {logs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-2">
            <Terminal className="w-8 h-8 opacity-20" />
            <p className="uppercase tracking-widest text-[10px] font-bold">Waiting for bot activity...</p>
          </div>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-3 py-0.5 group">
            <span className="text-slate-400 dark:text-slate-600 shrink-0">[{log.time}]</span>
            <span style={{ color: log.color }} className="break-all">{log.msg}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
});

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showSMA, setShowSMA] = useState(true);
  const [status, setStatus] = useState<BotStatus>({
    running: false,
    balance: 0,
    profit: 0,
    activeStrat: '---',
    historyCount: 0,
    chartData: [{ time: '', profit: 0 }]
  });

  const [config, setConfig] = useState({
    token: HARDCODED_TOKEN,
    currency: 'USDT_BEP',
    tgToken: '',
    tgChat: '',
    playA: true,
    playB: false,
    playC: true,
    playD: false,
    playE: false,
    playF: false,
    playG: true,
    betA: '0.00000001',
    betB: '0.00000001',
    betC: '0.00000001',
    betD: '0.00000001',
    betE: '0.00000001',
    betF: '0.00000001',
    betG: '0.00000001',
    rescueLimit: '25',
    stopLoss: '10.0',
    takeProfit: '0.0',
    seedInterval: 1,
    aiMode: true,
    riskTolerance: 'MEDIUM'
  });

  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('bot:init', (data) => {
      setRunning(data.running);
      setStatus(prev => ({ ...prev, ...data }));
      if (data.logs) setLogs(data.logs);
      setIsLoaded(true);
    });
    newSocket.on('bot:status', (data) => setRunning(data.running));
    newSocket.on('bot:log', (log) => setLogs(prev => [...prev.slice(-499), log]));
    newSocket.on('bot:update', (data) => setStatus(prev => ({ ...prev, ...data })));

    return () => {
      newSocket.close();
    };
  }, []);

  const handleStart = async () => {
    const activeStrats = [];
    if (config.playA) activeStrats.push('A');
    if (config.playB) activeStrats.push('B');
    if (config.playC) activeStrats.push('C');
    if (config.playD) activeStrats.push('D');
    if (config.playE) activeStrats.push('E');
    if (config.playF) activeStrats.push('F');
    if (config.playG) activeStrats.push('G');

    const payload = {
      ...config,
      activeStrats,
      aiMode: config.aiMode,
      rescueLimit: parseInt(config.rescueLimit) || 0,
      stopLoss: parseFloat(config.stopLoss) || 0,
      takeProfit: parseFloat(config.takeProfit) || 0,
      bets: {
        A: parseFloat(config.betA) || 0,
        B: parseFloat(config.betB) || 0,
        C: parseFloat(config.betC) || 0,
        D: parseFloat(config.betD) || 0,
        E: parseFloat(config.betE) || 0,
        F: parseFloat(config.betF) || 0,
        G: parseFloat(config.betG) || 0
      }
    };

    try {
      const res = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setRunning(true);
        setLogs([]);
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || 'Failed to start bot'}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Network Error: ${e.message}`);
    }
  };

  const handleStop = async () => {
    try {
      await fetch('/api/bot/stop', { method: 'POST' });
      setRunning(false);
    } catch (e) {
      console.error(e);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs animate-pulse">Connecting to Trinity Engine...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-slate-200 font-sans selection:bg-indigo-500/30 transition-colors duration-200">
      <div className="max-w-[1600px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Sidebar - Configuration */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden transition-colors duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 flex items-center justify-between transition-colors duration-200">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h2 className="font-semibold text-sm uppercase tracking-wider text-slate-800 dark:text-slate-200">Configuration</h2>
              </div>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
            
            <div className="p-4 space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Casino Token</label>
                <input 
                  type="password" 
                  value={config.token}
                  onChange={(e) => setConfig({...config, token: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-200"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Currency</label>
                <select 
                  value={config.currency}
                  onChange={(e) => setConfig({...config, currency: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-200"
                >
                  {["USDT_BEP", "BNB", "DOGE", "LTC", "TRX", "PRDC", "POL"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Bell className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-widest">Telegram Notifications</span>
                </div>
                <div className="space-y-3">
                  <input 
                    placeholder="Bot Token"
                    type="password"
                    value={config.tgToken}
                    onChange={(e) => setConfig({...config, tgToken: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none text-slate-900 dark:text-slate-200"
                  />
                  <input 
                    placeholder="Chat ID"
                    value={config.tgChat}
                    onChange={(e) => setConfig({...config, tgChat: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none text-slate-900 dark:text-slate-200"
                  />
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">AI Intelligence</span>
                </div>
                <label className="flex items-center gap-3 cursor-pointer group p-3 bg-purple-50 dark:bg-purple-500/5 rounded-xl border border-purple-200 dark:border-purple-500/20">
                  <input 
                    type="checkbox" 
                    checked={config.aiMode}
                    onChange={(e) => setConfig({...config, aiMode: e.target.checked})}
                    className="w-4 h-4 rounded border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-900 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-purple-600 dark:text-purple-400">AI Smart Switch</span>
                    <span className="text-[10px] text-slate-500 leading-tight">Continuously analyzes all strategies and swaps to the most profitable one after each lock.</span>
                  </div>
                </label>
              </div>

              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Active Rotation</span>
                </div>
                <div className="space-y-2">
                  {[
                    { id: 'playA', strat: 'A', label: 'A: Tucty / Řady (Smart AI)' },
                    { id: 'playB', strat: 'B', label: 'B: Loterie 8 čísel (x2 Loss)' },
                    { id: 'playC', strat: 'C', label: 'C: Barvy/Ostatní (Smart AI)' },
                    { id: 'playD', strat: 'D', label: 'D: 3x Šestice (Smart AI)' },
                    { id: 'playE', strat: 'E', label: 'E: 8x Dvojice (Smart AI)', color: 'text-amber-400' },
                    { id: 'playF', strat: 'F', label: 'F: 4x Čtveřice (Smart AI)', color: 'text-amber-400' },
                    { id: 'playG', strat: 'G', label: 'G: AI Loterie (6+0)', color: 'text-emerald-400' },
                  ].map(strat => {
                    const weight = status.aiWeights?.[strat.strat] || 1.0;
                    const weightColor = weight > 1.2 ? 'text-emerald-400' : weight < 0.8 ? 'text-rose-400' : 'text-slate-500';
                    return (
                      <label key={strat.id} className="flex items-center justify-between cursor-pointer group">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={(config as any)[strat.id]}
                            onChange={(e) => setConfig({...config, [strat.id]: e.target.checked})}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className={`text-sm ${strat.color || 'text-slate-700 dark:text-slate-300'} group-hover:text-slate-900 dark:group-hover:text-white transition-colors`}>{strat.label}</span>
                        </div>
                        {config.aiMode && (
                          <div className="flex items-center gap-1.5" title="Gemini AI Weight">
                            <Brain className={`w-3 h-3 ${weightColor}`} />
                            <span className={`text-[10px] font-mono font-bold ${weightColor}`}>
                              {weight.toFixed(2)}x
                            </span>
                          </div>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(s => (
                  <div key={s} className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Bet {s}</label>
                    <input 
                      type="text" 
                      value={(config as any)[`bet${s}`]}
                      onChange={(e) => setConfig({...config, [`bet${s}`]: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none font-mono text-slate-900 dark:text-slate-200"
                    />
                  </div>
                ))}
              </div>

              <div className="pt-2 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Risk & Rescue</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Base Limit (Units)</label>
                    <input 
                      type="text" 
                      value={config.rescueLimit}
                      onChange={(e) => setConfig({...config, rescueLimit: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none text-slate-900 dark:text-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Stop Loss</label>
                    <input 
                      type="text" 
                      value={config.stopLoss}
                      onChange={(e) => setConfig({...config, stopLoss: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none text-slate-900 dark:text-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Take Profit</label>
                    <input 
                      type="text" 
                      value={config.takeProfit}
                      onChange={(e) => setConfig({...config, takeProfit: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none text-slate-900 dark:text-slate-200"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Risk Tolerance</label>
                    <select 
                      value={config.riskTolerance}
                      onChange={(e) => setConfig({...config, riskTolerance: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none text-slate-900 dark:text-slate-200"
                    >
                      <option value="LOW">Low (Safe & Steady)</option>
                      <option value="MEDIUM">Medium (Balanced)</option>
                      <option value="HIGH">High (Aggressive Yield)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 space-y-2 transition-colors duration-200">
              <button 
                onClick={handleStart}
                disabled={running}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  running 
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed' 
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 active:scale-[0.98]'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                START BOT
              </button>
              <button 
                onClick={handleStop}
                disabled={!running}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  !running 
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed' 
                    : 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-900/20 active:scale-[0.98]'
                }`}
              >
                <Square className="w-4 h-4 fill-current" />
                STOP BOT
              </button>
            </div>
          </div>
        </div>

        {/* Main Content - Stats & Logs */}
        <div className="lg:col-span-9 space-y-6">
          
          {/* Top Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#1e293b] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg flex items-center gap-4 transition-colors duration-200">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Balance</p>
                <p className="text-xl font-mono font-bold text-slate-900 dark:text-white">{status.balance.toFixed(8)} <span className="text-xs text-slate-500 dark:text-slate-400">{config.currency}</span></p>
              </div>
            </div>
            
            <div className={`bg-white dark:bg-[#1e293b] p-5 rounded-2xl border ${status.profit >= 0 ? 'border-emerald-200 dark:border-emerald-500/20' : 'border-rose-200 dark:border-rose-500/20'} shadow-lg flex items-center gap-4 transition-colors duration-200`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status.profit >= 0 ? 'bg-emerald-100 dark:bg-emerald-500/10' : 'bg-rose-100 dark:bg-rose-500/10'}`}>
                <TrendingUp className={`w-6 h-6 ${status.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Session Profit</p>
                <p className={`text-xl font-mono font-bold ${status.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {status.profit >= 0 ? '+' : ''}{status.profit.toFixed(8)}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1e293b] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg flex items-center gap-4 transition-colors duration-200">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
                <Brain className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">AI Strategy</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{status.activeStrat}</p>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500 dark:text-slate-400 font-mono">MEM: {status.historyCount}/500</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1e293b] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg flex items-center gap-4 transition-colors duration-200">
              <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-500/10 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Win Rate</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{status.stats?.winRate || '0.00'}%</p>
              </div>
            </div>
          </div>

          {/* Technical Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[
              { label: 'Market Phase', value: status.marketPhase || 'ACCUMULATION', icon: Activity, color: 'text-blue-500 dark:text-blue-400' },
              { label: 'Current Streak', value: status.stats?.currentStreak || 0, icon: TrendingUp, color: (status.stats?.currentStreak || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400' },
              { label: 'AI Confidence', value: `${status.aiConfidence || 0}%`, icon: Brain, color: 'text-indigo-500 dark:text-indigo-400' },
              { label: 'Sector Bias', value: status.aiSectorBias || 'NONE', icon: Target, color: 'text-amber-500 dark:text-amber-400' },
              { label: 'Max Drawdown', value: status.stats?.maxDrawdown || '0.00000000', icon: ShieldAlert, color: 'text-rose-600 dark:text-rose-400' },
              { label: 'Volatility', value: `${((status.marketVolatility || 0) * 100).toFixed(1)}%`, icon: Activity, color: 'text-purple-500 dark:text-purple-400' },
            ].map((stat, i) => (
              <div key={i} className="bg-white dark:bg-[#1e293b]/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-1 transition-colors duration-200">
                <div className="flex items-center gap-2">
                  <stat.icon className={`w-3 h-3 ${stat.color}`} />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{stat.label}</span>
                </div>
                <span className={`text-sm font-mono font-bold ${stat.color}`}>{stat.value}</span>
              </div>
            ))}
          </div>

          {/* Chart Section */}
          <ProfitChart 
            chartData={status.chartData} 
            isDarkMode={isDarkMode} 
            running={running} 
            showSMA={showSMA} 
            setShowSMA={setShowSMA} 
          />

          {/* Bet History Section */}
          <BetHistoryTable betHistory={status.betHistory || []} />

          {/* Logs Section */}
          <LiveConsole logs={logs} />

        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}} />
    </div>
  );
}
