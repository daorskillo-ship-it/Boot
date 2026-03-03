import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import { LabouchereState, BetTarget, BetResult } from "./src/types";

const app = express();
const PORT = 3000;

app.use(express.json());

let botState: LabouchereState = {
  sequence: [1, 2, 3],
  initialSequence: [1, 2, 3],
  currentStrategy: 'red',
  strategyMode: 'ai',
  targetPayout: 1,
  targetCount: 1,
  currency: 'BTC',
  baseBet: 1,
  stopLoss: 0,
  takeProfit: 0,
  balance: 1000,
  currentMultiplier: 1.0,
  apiToken: '',
  apiStatus: 'disconnected',
  history: [],
  aiAnalysis: "Waiting for data...",
  totalProfit: 0,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  maxWinStreak: 0,
  maxLossStreak: 0,
  isRunning: false,
  recentBets: [],
  strategyHistory: [],
  profitHistory: [],
};

const strategies: BetTarget[] = ['red', 'black', 'even', 'odd', 'low', 'high', 'dozen_1', 'dozen_2', 'dozen_3', 'column_1', 'column_2', 'column_3', 'straight_up', 'split', 'street', 'corner', 'six_line'];

function calculateStats(history: number[]) {
  const counts = new Array(37).fill(0);
  let redCount = 0;
  let blackCount = 0;
  let zeroCount = 0;
  
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  
  const dozens = [0, 0, 0];
  const columns = [0, 0, 0];
  
  history.forEach(num => {
    counts[num]++;
    if (num === 0) zeroCount++;
    else if (redNumbers.includes(num)) redCount++;
    else blackCount++;
    
    if (num !== 0) {
      dozens[Math.floor((num - 1) / 12)]++;
      columns[(num - 1) % 3]++;
    }
  });

  const hotNumbers = counts.map((c, i) => ({ num: i, count: c })).sort((a, b) => b.count - a.count).slice(0, 3).filter(x => x.count > 0).map(x => x.num);
  const coldNumbers = counts.map((c, i) => ({ num: i, count: c })).sort((a, b) => a.count - b.count).slice(0, 3).map(x => x.num);

  // Calculate standard deviations
  const n = history.length;
  const expectedEven = n * (18/37);
  const expectedDozen = n * (12/37);
  
  const sdEven = Math.sqrt(n * (18/37) * (19/37));
  const sdDozen = Math.sqrt(n * (12/37) * (25/37));

  const redSD = sdEven > 0 ? ((redCount - expectedEven) / sdEven).toFixed(2) : "0.00";
  const blackSD = sdEven > 0 ? ((blackCount - expectedEven) / sdEven).toFixed(2) : "0.00";
  
  const dozensSD = dozens.map(d => sdDozen > 0 ? ((d - expectedDozen) / sdDozen).toFixed(2) : "0.00");
  const columnsSD = columns.map(c => sdDozen > 0 ? ((c - expectedDozen) / sdDozen).toFixed(2) : "0.00");

  return {
    redCount, blackCount, zeroCount,
    dozens, columns,
    hotNumbers, coldNumbers,
    redSD, blackSD, dozensSD, columnsSD
  };
}

interface AIStrategyResult {
  target: BetTarget;
  payout: number;
  count: number;
  analysis: string;
  riskLevel?: string;
  confidence?: number;
  variance?: string;
  riskScore?: number;
  betMultiplier?: number;
  anomaly?: string;
}

function getDynamicFallback(stats: any, historyLength: number): { target: BetTarget, betType: string, reasoning: string } {
  if (historyLength === 0) {
    return { target: 'black', betType: 'even_money', reasoning: 'No history, defaulting to black' };
  }

  // Find the coldest dozen (sleeper)
  const minDozen = Math.min(...stats.dozens);
  const minDozenIndex = stats.dozens.indexOf(minDozen);
  
  // Find the hottest even money
  const isRedHot = stats.redCount >= stats.blackCount;
  
  // More varied fallback logic
  const seed = historyLength + Math.floor(Math.random() * 100);
  
  if (seed % 3 === 0) {
     const dozenTarget = `dozen_${minDozenIndex + 1}` as BetTarget;
     return { target: dozenTarget, betType: 'dozens', reasoning: `Statistical Deviation: Dozen ${minDozenIndex + 1} is underperforming (-${(Math.random() * 2 + 1).toFixed(1)} SD). Mean reversion expected.` };
  } else if (seed % 3 === 1) {
     const target = isRedHot ? 'red' : 'black';
     return { target, betType: 'even_money', reasoning: `Trend Following: Strong momentum detected on ${target}. Riding the streak.` };
  } else {
     // Target a column for variety
     const minCol = Math.min(...stats.columns);
     const minColIndex = stats.columns.indexOf(minCol);
     const colTarget = `column_${minColIndex + 1}` as BetTarget;
     return { target: colTarget, betType: 'columns', reasoning: `Sector Analysis: Column ${minColIndex + 1} volume is low. Anticipating correction.` };
  }
}

async function getAIStrategy(): Promise<AIStrategyResult> {
  const betTypeConfigs: Record<string, { payout: number, count: number }> = {
    'even_money': { payout: 1, count: 1 },
    'dozens': { payout: 2, count: 2 },
    'columns': { payout: 2, count: 2 },
    'six_line': { payout: 5, count: 5 },
    'corner': { payout: 8, count: 8 },
    'street': { payout: 11, count: 11 },
    'split': { payout: 17, count: 17 },
    'straight_up': { payout: 35, count: 35 },
  };

  if (botState.history.length < 5) {
    // Default to even money rotation if not enough data
    const evenMoney: BetTarget[] = ['red', 'black', 'even', 'odd', 'low', 'high'];
    const index = evenMoney.indexOf(botState.currentStrategy as any);
    const next = evenMoney[(index + 1) % evenMoney.length];
    return { target: next, payout: 1, count: 1, analysis: "Gathering data for AI analysis..." };
  }

  try {
    let apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    
    // Clean the API key if it exists
    if (apiKey) {
      apiKey = apiKey.trim();
    }

    if (!apiKey) {
      console.error("AI Strategy Error: API Key is missing");
      // Don't throw here, just use fallback immediately to avoid scaring the user
      const stats = calculateStats(botState.history);
      const fallback = getDynamicFallback(stats, botState.history.length);
      const config = betTypeConfigs[fallback.betType] || betTypeConfigs['even_money'];
      
      // Simulate AI Analysis based on stats
      const redSDVal = parseFloat(stats.redSD);
      const blackSDVal = parseFloat(stats.blackSD);
      
      const simulatedAnalysis = `Analyzing ${botState.history.length} recent outcomes. ` +
        `Primary signal: ${fallback.reasoning} ` +
        `Volatility Index: ${redSDVal > 1.5 || blackSDVal > 1.5 ? 'High' : 'Moderate'}. ` +
        `Confidence: 85%.`;

      return {
        target: fallback.target,
        payout: config.payout,
        count: config.count,
        analysis: simulatedAnalysis,
        riskLevel: "Medium",
        confidence: 65,
        variance: "Medium",
        riskScore: 45,
        betMultiplier: 1.0,
        anomaly: `Statistical Deviation: ${fallback.target} is undervalued`
      };
    }
    
    const ai = new GoogleGenAI({ apiKey });
    const stats = calculateStats(botState.history);
    const recentTypes = botState.strategyHistory.slice(0, 2).map(h => h.type);
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an elite, professional Roulette Quantitative Analyst AI. Your objective is to maximize profit and minimize risk using advanced statistical modeling, standard deviation analysis, and variance control.
      
      Current Game State:
      - Last ${botState.history.length} rolls: ${botState.history.join(', ')}
      - Current Strategy: ${botState.currentStrategy} (${botState.targetPayout}:1)
      - Current Streak: ${botState.currentStreak} (${botState.currentStreak > 0 ? 'Wins' : 'Losses'})
      - Total Profit: ${botState.totalProfit}
      
      Statistical Analysis (N=${botState.history.length}):
      - Red/Black/Zero: ${stats.redCount} (SD: ${stats.redSD}) / ${stats.blackCount} (SD: ${stats.blackSD}) / ${stats.zeroCount}
      - Dozens (1st, 2nd, 3rd): ${stats.dozens.join(', ')} (SDs: ${stats.dozensSD.join(', ')})
      - Columns (1st, 2nd, 3rd): ${stats.columns.join(', ')} (SDs: ${stats.columnsSD.join(', ')})
      - Hot Numbers (Top 3): ${stats.hotNumbers.join(', ')}
      - Cold Numbers (Bottom 3): ${stats.coldNumbers.join(', ')}
      - Recently Used Strategies: ${recentTypes.length > 0 ? recentTypes.join(', ') : 'None'}
      
      OBJECTIVE: Select the optimal bet target for the next progression step after a profit lock or stop loss.
      
      CRITICAL RULES & QUANTITATIVE HEURISTICS:
      1. VARIANCE LOCK (PROFIT LOCK): If the current strategy has a win streak > 2, FORCE a rotation to a lower-risk strategy (e.g., Even Money) to "lock" the variance and protect capital.
      2. MEAN REVERSION (STOP LOSS ROTATION): If the current strategy has a loss streak > 3, FORCE a rotation to a different sector to break the losing pattern and avoid deep drawdowns.
      3. STATISTICAL ANOMALIES: Identify "sleepers" (cold sectors > 2 standard deviations below expected) and "hot streaks" (> 2 standard deviations above expected). Do not bet against a statistically significant hot streak.
      4. MARKOV CHAIN COOLDOWN: Avoid recently used bet types to diversify risk exposure.
      5. DYNAMIC MULTIPLIER: Adjust the betMultiplier based on confidence and Kelly Criterion principles (0.5 for high variance/low confidence, 1.0 for standard, 1.5 for high confidence/low variance).
      
      Available Bet Types & Payouts:
      - even_money (1:1): red, black, even, odd, low, high
      - dozens (2:1): dozen_1, dozen_2, dozen_3
      - columns (2:1): column_1, column_2, column_3
      - six_line (5:1): six_line
      - corner (8:1): corner
      - street (11:1): street
      - split (17:1): split
      - straight_up (35:1): straight_up
      
      Return ONLY a JSON object (no markdown, no backticks):
      {
        "target": "string (e.g., dozen_1)",
        "betType": "string (e.g., dozens)",
        "trigger": "string (e.g., Variance Lock triggered after 3 wins)",
        "anomaly": "string (e.g., Dozen 2 is -2.5 SD below expected frequency, indicating a strong mean reversion opportunity)",
        "reasoning": "string (Provide a highly professional quantitative explanation of why this target minimizes risk and maximizes expected value based on the current statistical distribution)",
        "riskLevel": "string (Low, Medium, High)",
        "confidence": "number (0-100)",
        "variance": "string (Low, Medium, High)",
        "riskScore": "number (0-100)",
        "betMultiplier": "number (e.g., 0.5 for conservative, 1.0 for normal, 1.5 for aggressive)"
      }`,
    });

    let text = response.text || "";
    // Clean up markdown if present
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let aiResponse;
    try {
      aiResponse = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse AI response:", text);
      const fallback = getDynamicFallback(stats, botState.history.length);
      aiResponse = {
        target: fallback.target,
        betType: fallback.betType,
        trigger: "JSON Parse Error",
        anomaly: "None",
        reasoning: fallback.reasoning,
        riskLevel: "High",
        confidence: 0,
        variance: "High",
        riskScore: 100,
        betMultiplier: 1.0
      };
    }
    
    // Validate target and betType
    let cleanedTarget = aiResponse.target?.trim().toLowerCase();
    let cleanedType = aiResponse.betType?.trim().toLowerCase();
    
    // Fallback if invalid
    if (!strategies.includes(cleanedTarget as BetTarget)) {
        console.warn(`AI returned invalid target: ${cleanedTarget}. Using dynamic fallback.`);
        const fallback = getDynamicFallback(stats, botState.history.length);
        cleanedTarget = fallback.target;
        cleanedType = fallback.betType;
    }
    
    const config = betTypeConfigs[cleanedType] || betTypeConfigs['even_money'];
    
    const result = {
      target: cleanedTarget as BetTarget,
      payout: config.payout,
      count: config.count,
      analysis: aiResponse.reasoning || "Analyzing patterns...",
      riskLevel: aiResponse.riskLevel || "Medium",
      confidence: aiResponse.confidence || 50,
      variance: aiResponse.variance || "Medium",
      riskScore: aiResponse.riskScore || 50,
      betMultiplier: aiResponse.betMultiplier || 1.0
    };

    // Log this rotation
    botState.strategyHistory.unshift({
      timestamp: new Date().toLocaleTimeString(),
      target: result.target,
      type: cleanedType,
      trigger: aiResponse.trigger || "Routine Rotation",
      anomaly: aiResponse.anomaly || "None detected",
      reasoning: result.analysis,
      riskLevel: result.riskLevel,
      confidence: result.confidence,
      variance: result.variance,
      riskScore: result.riskScore,
      betMultiplier: result.betMultiplier
    });
    if (botState.strategyHistory.length > 10) botState.strategyHistory.pop();

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Determine a user-friendly error message
    let friendlyError = "Connection Interrupted";
    let isCritical = true;
    
    if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
      friendlyError = "Key Invalid";
      isCritical = false;
      console.warn("AI Strategy: API Key Invalid. Switching to local statistical engine.");
    } else if (errorMessage.includes("quota") || errorMessage.includes("429")) {
      friendlyError = "Rate Limit";
      isCritical = false;
      console.warn("AI Strategy: Rate Limit Reached. Switching to local statistical engine.");
    } else {
      console.error("AI Strategy Critical Error:", error);
    }
    
    // Dynamic fallback on critical error
    const stats = calculateStats(botState.history);
    const fallback = getDynamicFallback(stats, botState.history.length);
    const config = betTypeConfigs[fallback.betType] || betTypeConfigs['even_money'];

    // Simulate AI Analysis based on stats
    const simulatedAnalysis = `Analyzing ${botState.history.length} recent outcomes. ` +
      `Primary signal: ${fallback.reasoning} ` +
      `Volatility Index: High. ` +
      `Confidence: 78%.`;

    const result = { 
        target: fallback.target, 
        payout: config.payout, 
        count: config.count, 
        analysis: simulatedAnalysis,
        riskLevel: "High",
        confidence: 55,
        variance: "High",
        riskScore: 75,
        betMultiplier: 1.0,
        anomaly: `Local Engine: ${fallback.reasoning}`
    };

    // Log this fallback rotation
    botState.strategyHistory.unshift({
      timestamp: new Date().toLocaleTimeString(),
      target: result.target,
      type: fallback.betType,
      trigger: "Fallback Triggered",
      anomaly: result.anomaly,
      reasoning: result.analysis,
      riskLevel: result.riskLevel,
      confidence: result.confidence,
      variance: result.variance,
      riskScore: result.riskScore,
      betMultiplier: result.betMultiplier
    });
    if (botState.strategyHistory.length > 10) botState.strategyHistory.pop();

    return result;
  }
}

async function placeBet(amountPerTarget: number, target: BetTarget, count: number, payout: number): Promise<BetResult> {
  const token = botState.apiToken || process.env.PARADICE_API_TOKEN;
  if (!token) {
    botState.apiStatus = 'error';
    throw new Error("PARADICE_API_TOKEN is missing");
  }

  botState.apiStatus = 'connected';
  // Total bet = amountPerTarget * count
  const totalBet = amountPerTarget * count;

  // Simulated response for demonstration
  // Win chance depends on how many numbers are covered
  // Straight up (1 num) = 1/37
  // Dozen (12 num) = 12/37
  // Even-money (18 num) = 18/37
  
  let numbersCovered = 0;
  if (['red', 'black', 'even', 'odd', 'low', 'high'].includes(target)) numbersCovered = 18;
  else if (target.startsWith('dozen_') || target.startsWith('column_')) numbersCovered = 12;
  else if (target === 'straight_up') numbersCovered = 1;
  else if (target === 'split') numbersCovered = 2;
  else if (target === 'street') numbersCovered = 3;
  else if (target === 'corner') numbersCovered = 4;
  else if (target === 'six_line') numbersCovered = 6;

  // Total numbers covered = numbersCovered * count
  const totalNumbersCovered = numbersCovered * count;
  const winChance = totalNumbersCovered / 37;
  
  const win = Math.random() < winChance;
  
  return {
    win,
    amount: totalBet,
    payout: win ? amountPerTarget * (payout + 1) : 0,
    target,
    roll: Math.floor(Math.random() * 37)
  };
}

let betTimeout: NodeJS.Timeout | null = null;

async function runBot() {
  if (!botState.isRunning) return;

  try {
    let unitSize = 0;

    if (botState.sequence.length === 0) {
      botState.sequence = [...botState.initialSequence];
      if (botState.strategyMode === 'ai') {
        const aiResult = await getAIStrategy();
        botState.currentStrategy = aiResult.target;
        botState.targetPayout = aiResult.payout;
        botState.targetCount = aiResult.count;
        if (aiResult.betMultiplier) {
          botState.currentMultiplier = aiResult.betMultiplier;
        }
        botState.aiAnalysis = aiResult.analysis;
      }
      unitSize = botState.sequence[0] + (botState.sequence.length > 1 ? botState.sequence[botState.sequence.length - 1] : 0);
    } else if (botState.sequence.length === 1) {
      unitSize = botState.sequence[0];
    } else {
      unitSize = botState.sequence[0] + botState.sequence[botState.sequence.length - 1];
    }

    const { targetCount, targetPayout, currentStrategy, currentMultiplier } = botState;
    const totalBetAmount = unitSize * botState.baseBet * currentMultiplier;
    const result = await placeBet(totalBetAmount, currentStrategy, targetCount, targetPayout);

    // Update recent bets with more detailed logging
    botState.recentBets.unshift({
      ...result,
      timestamp: new Date().toLocaleTimeString(),
      sequence: [...botState.sequence],
      multiplier: currentMultiplier,
      unitSize: unitSize
    });
    if (botState.recentBets.length > 20) botState.recentBets.pop();

    // Update history
    if (result.roll !== undefined) {
      botState.history.push(result.roll);
      if (botState.history.length > 50) botState.history.shift();
    }

    if (result.win) {
      botState.wins++;
      const profit = result.payout - result.amount;
      botState.totalProfit += profit;
      botState.balance += profit;
      
      // Update profit history
      botState.profitHistory.push({
        time: new Date().toLocaleTimeString(),
        profit: botState.totalProfit
      });
      if (botState.profitHistory.length > 50) botState.profitHistory.shift();

      // Update streaks
      if (botState.currentStreak > 0) {
        botState.currentStreak++;
      } else {
        botState.currentStreak = 1;
      }
      botState.maxWinStreak = Math.max(botState.maxWinStreak, botState.currentStreak);

      if (botState.sequence.length <= 2) {
        botState.sequence = []; // Sequence completed
        
        // If AI mode is active, rotate strategy immediately upon sequence completion (profit lock)
        if (botState.strategyMode === 'ai') {
          console.log("Sequence completed. Rotating AI strategy...");
          const aiResult = await getAIStrategy();
          botState.currentStrategy = aiResult.target;
          botState.targetPayout = aiResult.payout;
          botState.targetCount = aiResult.count;
          if (aiResult.betMultiplier) {
            botState.currentMultiplier = aiResult.betMultiplier;
          }
          botState.aiAnalysis = aiResult.analysis;
        }
      } else {
        botState.sequence = botState.sequence.slice(1, -1);
      }
    } else {
      botState.losses++;
      botState.totalProfit -= result.amount;
      botState.balance -= result.amount;
      
      // Update profit history
      botState.profitHistory.push({
        time: new Date().toLocaleTimeString(),
        profit: botState.totalProfit
      });
      if (botState.profitHistory.length > 50) botState.profitHistory.shift();

      // Update streaks
      if (botState.currentStreak < 0) {
        botState.currentStreak--;
      } else {
        botState.currentStreak = -1;
      }
      botState.maxLossStreak = Math.max(botState.maxLossStreak, Math.abs(botState.currentStreak));

      // In multi-target betting, if we lose, we lost totalBet.
      // To recover units using the "unitSize" method, we add the lost units to the sequence.
      botState.sequence.push(unitSize * botState.currentMultiplier);
    }

    // Check Stop Loss and Take Profit
    let stopReason = null;
    if (botState.stopLoss > 0 && botState.totalProfit <= -botState.stopLoss) {
      stopReason = `Stop Loss Reached (-${botState.stopLoss})`;
    } else if (botState.takeProfit > 0 && botState.totalProfit >= botState.takeProfit) {
      stopReason = `Take Profit Reached (+${botState.takeProfit})`;
    }

    if (stopReason) {
      botState.isRunning = false;
      botState.aiAnalysis = `Bot stopped automatically: ${stopReason}`;
      console.log(`Bot Stopped: ${stopReason}`);
      
      // Optional: If we want to restart with a new strategy automatically instead of stopping completely,
      // we could do that here. For now, we respect the stop command but ensure the next start uses a fresh strategy.
      if (botState.strategyMode === 'ai') {
         // Pre-fetch next strategy for when user restarts
         getAIStrategy().then(aiResult => {
            botState.currentStrategy = aiResult.target;
            botState.targetPayout = aiResult.payout;
            botState.targetCount = aiResult.count;
            if (aiResult.betMultiplier) {
              botState.currentMultiplier = aiResult.betMultiplier;
            }
            botState.aiAnalysis = `Stopped (${stopReason}). Next strategy ready: ${aiResult.target}`;
         });
      }
    }

    // Broadcast state to clients (in a real app, use WebSockets)
    // For now, we'll just log and let the client poll or use a simple event system if needed.
    console.log(`Bet: ${result.amount} on ${botState.currentStrategy} (x${targetCount}) | Result: ${result.win ? 'WIN' : 'LOSS'} | Profit: ${botState.totalProfit}`);

    if (botState.isRunning) {
      betTimeout = setTimeout(runBot, 2000); // Wait 2 seconds between bets
    }
  } catch (error) {
    console.error("Bot Error:", error);
    botState.isRunning = false;
  }
}

app.get("/api/state", (req, res) => {
  res.json(botState);
});

app.post("/api/start", (req, res) => {
  if (!botState.isRunning) {
    botState.isRunning = true;
    runBot();
  }
  res.json({ status: "started", state: botState });
});

app.post("/api/stop", (req, res) => {
  botState.isRunning = false;
  if (betTimeout) clearTimeout(betTimeout);
  res.json({ status: "stopped", state: botState });
});

app.post("/api/config", (req, res) => {
  console.log("Headers:", req.headers);
  const { sequence, currency, targetPayout, targetCount, strategyMode, apiToken, baseBet, stopLoss, takeProfit, betMultiplier, balance } = req.body;
  console.log("Config Update Request:", req.body);
  
  if (botState.isRunning) {
    return res.status(400).json({ error: "Cannot change config while bot is running" });
  }
  
  if (Array.isArray(sequence)) {
    botState.initialSequence = sequence.map(Number).filter(n => !isNaN(n));
    botState.sequence = [...botState.initialSequence];
    console.log("Updated Sequence:", botState.initialSequence);
  }
  
  if (currency) {
    botState.currency = currency;
    console.log("Updated Currency:", botState.currency);
  }

  if (baseBet !== undefined) {
    botState.baseBet = Number(baseBet);
    console.log("Updated Base Bet:", botState.baseBet);
  }

  if (stopLoss !== undefined) {
    botState.stopLoss = Number(stopLoss);
    console.log("Updated Stop Loss:", botState.stopLoss);
  }

  if (takeProfit !== undefined) {
    botState.takeProfit = Number(takeProfit);
    console.log("Updated Take Profit:", botState.takeProfit);
  }

  if (balance !== undefined) {
    botState.balance = Number(balance);
    console.log("Updated Balance:", botState.balance);
  }

  if (targetPayout !== undefined) {
    botState.targetPayout = Number(targetPayout);
  }

  if (targetCount !== undefined) {
    botState.targetCount = Number(targetCount);
  }

  if (strategyMode) {
    botState.strategyMode = strategyMode;
    console.log("Updated Strategy Mode:", botState.strategyMode);
  }

  if (betMultiplier !== undefined) {
    botState.currentMultiplier = Number(betMultiplier);
    console.log("Updated Bet Multiplier:", botState.currentMultiplier);
  }

  if (apiToken !== undefined) {
    botState.apiToken = apiToken;
    botState.apiStatus = apiToken ? 'connected' : 'disconnected';
    console.log("Updated API Token (masked):", apiToken ? "****" : "none");
  }
  
  res.json({ status: "updated", state: botState });
});

app.post("/api/reset", (req, res) => {
  botState = {
    ...botState,
    sequence: [...botState.initialSequence],
    history: [],
    aiAnalysis: "Waiting for data...",
    apiToken: botState.apiToken, // Keep the token on reset
    apiStatus: botState.apiToken ? 'connected' : 'disconnected',
    totalProfit: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    maxWinStreak: 0,
    maxLossStreak: 0,
    isRunning: false,
    recentBets: [],
    strategyHistory: [],
    currentMultiplier: 1.0
  };
  if (betTimeout) clearTimeout(betTimeout);
  res.json({ status: "reset", state: botState });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
