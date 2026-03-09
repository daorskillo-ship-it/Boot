import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = "https://api.paradice.in/api.php";

interface BotConfig {
  token: string;
  currency: string;
  activeStrats: string[];
  bets: Record<string, number>;
  playG: boolean;
  betG: number;
  stopLoss: number;
  takeProfit: number;
  seedInterval: number;
  rescueLimit: number;
  tgToken: string;
  tgChat: string;
  aiMode: boolean;
  riskTolerance: "LOW" | "MEDIUM" | "HIGH";
}

interface StratStats {
  wins: number;
  losses: number;
  streak: number;
  last20: number[]; // Track normalized PnL of last 20 rolls
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

class BotInstance {
  config: BotConfig;
  running: boolean = false;
  profit: number = 0;
  balance: number = 0;
  activeStrat: string = "A";
  history: number[] = [];
  chartData: { time: string; profit: number; sma?: number }[] = [{ time: new Date().toLocaleTimeString(), profit: 0 }];
  logs: { msg: string; color: string; time: string }[] = [];
  io: Server;
  
  // Stats
  totalBets: number = 0;
  wins: number = 0;
  losses: number = 0;
  currentStreak: number = 0;
  maxStreak: number = 0;
  maxDrawdown: number = 0;
  peakProfit: number = 0;

  // AI / Virtual Stats
  virtualStats: Record<string, StratStats> = {};
  aiWeights: Record<string, number> = {};
  aiConfidence: number = 50;
  aiSectorBias: string = "NONE";
  marketPhase: string = "ACCUMULATION";
  lastAIAnalysisRoll: number = 0;
  isAnalyzing: boolean = false;
  marketVolatility: number = 0;
  betHistory: BetRecord[] = [];
  
  // Bot internal state
  rezimA: "TUCET" | "RADA" = "TUCET";
  labSeqA: number[] = [1, 1];
  stratBNums: number[] = [];
  stratBLossCounter: number = 0;
  stratBCurrentBet: number = 0;
  stratGNums: number[] = [];
  stratGLossCounter: number = 0;
  stratGCurrentBet: number = 0;
  labSeqC: number[] = [1, 1];
  labSeqD: number[] = [1, 1];
  labSeqE: number[] = [1, 1];
  labSeqF: number[] = [1, 1];
  
  lastNum: number | null = null;
  sessionStartBal: number | null = null;
  highestBal: number = 0;
  lastSeedTime: number = Date.now();
  dynamicLimit: number = 0;

  allSplits: number[][] = [];
  allCorners: number[][] = [];

  constructor(config: BotConfig, io: Server) {
    this.config = config;
    this.io = io;
    this.dynamicLimit = config.rescueLimit;
    this.activeStrat = config.activeStrats[0] || "A";
    this.stratBCurrentBet = config.bets["B"] || 0;
    this.stratGCurrentBet = config.bets["G"] || 0;
    this.initBoardData();
    this.stratBNums = this.generateRandom8();
    this.stratGNums = [0, ...this.generateSmart6()];
    
    // Initialize Virtual Stats for all strategies
    ["A", "B", "C", "D", "E", "F", "G"].forEach(s => {
      this.virtualStats[s] = { wins: 0, losses: 0, streak: 0, last20: [] };
      this.aiWeights[s] = 1.0; // Default weight
    });
  }

  initBoardData() {
    for (let n = 1; n <= 36; n++) {
      if (n % 3 !== 0) this.allSplits.push([n, n + 1]);
      if (n <= 33) this.allSplits.push([n, n + 3]);
    }
    for (let n = 1; n <= 32; n++) {
      if (n % 3 !== 0) this.allCorners.push([n, n + 1, n + 3, n + 4]);
    }
  }

  generateRandom8() {
    const nums = new Set<number>();
    while (nums.size < 8) {
      nums.add(Math.floor(Math.random() * 37));
    }
    return Array.from(nums);
  }

  generateSmart6() {
    const counts: Record<number, number> = {};
    for (let i = 1; i <= 36; i++) counts[i] = 0;
    this.history.forEach(n => {
      if (typeof n === 'number' && n >= 1 && n <= 36) counts[n]++;
    });
    return Object.keys(counts)
      .map(Number)
      .sort((a, b) => counts[a] - counts[b])
      .slice(0, 6);
  }

  log(msg: string, color: string = "white") {
    const time = new Date().toLocaleTimeString();
    const logEntry = { msg, color, time };
    this.logs.push(logEntry);
    if (this.logs.length > 100) this.logs.shift();
    this.io.emit("bot:log", logEntry);
  }

  async sendTg(message: string) {
    if (!this.config.tgToken || !this.config.tgChat) return;
    try {
      await axios.post(`https://api.telegram.org/bot${this.config.tgToken}/sendMessage`, {
        chat_id: this.config.tgChat,
        text: message
      });
    } catch (e) {}
  }

  getLabBet(seq: number[]) {
    if (!seq.length) return 1;
    return seq.length === 1 ? seq[0] : seq[0] + seq[seq.length - 1];
  }

  updateLab(seq: number[], isWin: boolean, units: number) {
    if (isWin) {
      if (seq.length >= 2) {
        seq.shift();
        seq.pop();
      } else if (seq.length === 1) {
        seq.shift();
      }
      return seq.length ? seq : [1, 1];
    } else {
      seq.push(units);
      return seq;
    }
  }

  getSmartTargets(strat: string): any {
    if (this.history.length < 15) {
      if (strat === "A") {
        const ls = this.lastNum && this.lastNum >= 1 && this.lastNum <= 36 ? Math.floor((this.lastNum - 1) / 12) + 1 : 0;
        return [1, 2, 3].filter(t => t !== ls).slice(0, 2);
      } else if (strat === "C") {
        const options = ["RED", "BLACK", "EVEN", "ODD", "LOW", "HIGH"];
        return options[Math.floor(Math.random() * options.length)];
      } else if (strat === "D") {
        return [1, 2, 3, 4, 5, 6].sort(() => 0.5 - Math.random()).slice(0, 3);
      } else if (strat === "E") {
        return this.allSplits.sort(() => 0.5 - Math.random()).slice(0, 8);
      } else if (strat === "F") {
        return this.allCorners.sort(() => 0.5 - Math.random()).slice(0, 4);
      }
    }

    if (strat === "A") {
      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
      if (this.rezimA === "TUCET") {
        this.history.forEach(n => { 
          if (typeof n === 'number' && n >= 1 && n <= 36) {
            counts[Math.floor((n - 1) / 12) + 1]++; 
          }
        });
      } else {
        this.history.forEach(n => { 
          if (typeof n === 'number' && n >= 1 && n <= 36) {
            counts[(n - 1) % 3 + 1]++; 
          }
        });
      }
      return Object.keys(counts).map(Number).sort((a, b) => counts[a] - counts[b]).slice(0, 2);
    } else if (strat === "C") {
      const c: Record<string, number> = { RED: 0, BLACK: 0, EVEN: 0, ODD: 0, LOW: 0, HIGH: 0 };
      const redNums = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
      this.history.forEach(n => {
        if (typeof n !== 'number' || n < 1 || n > 36) return;
        if (redNums.includes(n)) c.RED++; else c.BLACK++;
        if (n % 2 === 0) c.EVEN++; else c.ODD++;
        if (n <= 18) c.LOW++; else c.HIGH++;
      });
      return Object.keys(c).sort((a, b) => c[a] - c[b])[0];
    } else if (strat === "D") {
      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      this.history.forEach(n => { 
        if (typeof n === 'number' && n >= 1 && n <= 36) {
          counts[Math.floor((n - 1) / 6) + 1]++; 
        }
      });
      return Object.keys(counts).map(Number).sort((a, b) => counts[a] - counts[b]).slice(0, 3);
    } else if (strat === "E") {
      const scores = this.allSplits.map(s => ({ s, count: this.history.filter(n => s.includes(n)).length }));
      return scores.sort((a, b) => a.count - b.count).slice(0, 8).map(x => x.s);
    } else if (strat === "F") {
      const scores = this.allCorners.map(c => ({ c, count: this.history.filter(n => c.includes(n)).length }));
      return scores.sort((a, b) => a.count - b.count).slice(0, 4).map(x => x.c);
    } else if (strat === "G") {
      return [0, ...this.generateSmart6()];
    }
  }

  getPocketStrA(mode: string, idx: number) {
    if (mode === "TUCET") {
      if (idx === 1) return "1,2,3,4,5,6,7,8,9,10,11,12";
      if (idx === 2) return "13,14,15,16,17,18,19,20,21,22,23,24";
      if (idx === 3) return "25,26,27,28,29,30,31,32,33,34,35,36";
    } else {
      if (idx === 1) return "1,4,7,10,13,16,19,22,25,28,31,34";
      if (idx === 2) return "2,5,8,11,14,17,20,23,26,29,32,35";
      if (idx === 3) return "3,6,9,12,15,18,21,24,27,30,33,36";
    }
    return "";
  }

  async rotateSeed() {
    try {
      const newSeed = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      await axios.post(API_URL, {
        query: `mutation { rotateClientSeed(seed: "${newSeed}") }`
      }, { headers: { "x-access-token": this.config.token } });
      this.log("🎲 SEED RESET", "#d946ef");
      this.lastSeedTime = Date.now();
    } catch (e) {}
  }

  async stop() {
    this.running = false;
    this.log("⏹ Bot was stopped.", "#ef4444");
    this.sendTg("⏹ Bot was stopped.");
    this.io.emit("bot:status", { running: false });
  }

  calculateSMA(data: { profit: number }[], period: number) {
    if (data.length < period) return undefined;
    const slice = data.slice(-period);
    const sum = slice.reduce((acc, val) => acc + val.profit, 0);
    return sum / period;
  }

  private async startTelegramListener() {
    let lastUpdateId = 0;
    while (this.running) {
      if (!this.config.tgToken || !this.config.tgChat) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      try {
        const url = `https://api.telegram.org/bot${this.config.tgToken}/getUpdates?offset=${lastUpdateId}&timeout=5`;
        const res = await axios.get(url, { timeout: 10000 });
        if (res.data.ok) {
          for (const item of res.data.result) {
            lastUpdateId = item.update_id + 1;
            const msg = item.message || {};
            const chat = String(msg.chat?.id || "");
            const text = (msg.text || "").trim().toLowerCase();
            if (chat === this.config.tgChat && text) {
              await this.handleTelegramCommand(text);
            }
          }
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  private async handleTelegramCommand(fullText: string) {
    const parts = fullText.split(" ");
    const cmd = parts[0];

    if (cmd === "/stop") {
      if (this.running) {
        await this.stop();
        await this.sendTg("🛑 Bot se bezpečně zastavuje.");
      } else {
        await this.sendTg("ℹ️ Bot už je zastavený.");
      }
    } else if (cmd === "/status") {
      const msg = `📊 AKTUALNÍ STATUS:\n💰 Profit: ${this.profit.toFixed(8)}\n🏦 Zůstatek: ${this.balance.toFixed(8)}\n⚙️ Strat: ${this.activeStrat}\n🧠 AI Paměť: ${this.history.length}/100`;
      await this.sendTg(msg);
    } else if (cmd === "/start") {
      if (!this.running) {
        this.start();
        await this.sendTg("🚀 Bot se spouští s aktuálním nastavením!");
      } else {
        await this.sendTg("ℹ️ Bot už běží.");
      }
    } else if (cmd === "/sl" && parts.length > 1) {
      const val = parseFloat(parts[1]);
      if (!isNaN(val)) {
        this.config.stopLoss = val;
        await this.sendTg(`✅ Stop Loss změněn na: ${val}`);
        this.io.emit("bot:config_update", { stopLoss: val });
      }
    } else if (cmd === "/tp" && parts.length > 1) {
      const val = parseFloat(parts[1]);
      if (!isNaN(val)) {
        this.config.takeProfit = val;
        await this.sendTg(`✅ Take Profit změněn na: ${val}`);
        this.io.emit("bot:config_update", { takeProfit: val });
      }
    } else if (cmd === "/help") {
      const helpText = "🤖 Dálkové ovládání bota:\n\n🟢 /start - Spustí sázení\n🔴 /stop - Zastaví sázení\n📊 /status - Výpis profitu\n📉 /sl <číslo> - Stop Loss\n📈 /tp <číslo> - Take Profit";
      await this.sendTg(helpText);
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log("BotInstance.start() called");
    this.log("🚀 TRINITY START", "#4ade80");
    this.sendTg(`🚀 TRINITY SPUŠTĚN\nMěna: ${this.config.currency}\nStop Loss: ${this.config.stopLoss}\nTake Profit: ${this.config.takeProfit}`);
    this.io.emit("bot:status", { running: true });

    // Start Telegram Listener
    this.startTelegramListener();

    while (this.running) {
      try {
        const drawdown = Math.max(0, this.highestBal - this.balance);
        let betsPayload: any[] = [];
        let totalBetSpin = 0;
        let isCrisis = false;
        let infoMsg = "";

        let betMultiplier = 1.0;
        if (this.config.aiMode) {
          // Skip roll if confidence is extremely low and volatility is high
          if (this.aiConfidence < 20 && this.marketVolatility > 0.7) {
            this.log("🛡️ AI Safety: Confidence too low for current volatility. Skipping roll.", "#94a3b8");
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }

          // Dynamic bet sizing based on confidence
          // 50% confidence = 1.0x, 100% = 1.8x, 0% = 0.4x
          betMultiplier = 0.4 + (this.aiConfidence / 100) * 1.4;
          
          // Market Phase Adjustments
          if (this.marketPhase === "CHAOTIC") betMultiplier *= 0.6;
          if (this.marketPhase === "TRENDING") betMultiplier *= 1.2;

          // If in recovery mode (high drawdown), be more conservative
          const drawdownVal = this.peakProfit - this.profit;
          if (drawdownVal > this.config.stopLoss * 0.5) {
            betMultiplier *= 0.6;
          }
        }

        if (this.activeStrat === "A") {
          const u = this.getLabBet(this.labSeqA);
          if (u >= this.dynamicLimit) isCrisis = true;
          else {
            const targets = this.getSmartTargets("A");
            targets.forEach((t: number) => {
              const amt = this.config.bets["A"] * u * betMultiplier;
              betsPayload.push({ pocket: this.getPocketStrA(this.rezimA, t), bet: parseFloat(amt.toFixed(8)) });
              totalBetSpin += amt;
            });
            infoMsg = `A-${this.rezimA} (${u}u x${betMultiplier.toFixed(1)})`;
          }
        } else if (this.activeStrat === "B") {
          if (this.stratBCurrentBet >= this.config.bets["B"] * this.dynamicLimit) isCrisis = true;
          else {
            const currentBet = this.stratBCurrentBet * betMultiplier;
            this.stratBNums.forEach(n => {
              betsPayload.push({ pocket: n.toString(), bet: parseFloat(currentBet.toFixed(8)) });
              totalBetSpin += currentBet;
            });
            infoMsg = `B-Lot. (${(currentBet * this.stratBNums.length).toFixed(8)})`;
          }
        } else if (this.activeStrat === "C") {
          const u = this.getLabBet(this.labSeqC);
          if (u >= this.dynamicLimit) isCrisis = true;
          else {
            const target = this.getSmartTargets("C");
            const pockets: any = {
              RED: "1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36",
              BLACK: "2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35",
              EVEN: "2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36",
              ODD: "1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35",
              LOW: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18",
              HIGH: "19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36"
            };
            const amt = this.config.bets["C"] * u * betMultiplier;
            betsPayload.push({ pocket: pockets[target], bet: parseFloat(amt.toFixed(8)) });
            totalBetSpin += amt;
            infoMsg = `C-${target} (${u}u x${betMultiplier.toFixed(1)})`;
          }
        } else if (this.activeStrat === "D") {
          const u = this.getLabBet(this.labSeqD);
          if (u >= this.dynamicLimit) isCrisis = true;
          else {
            const lines = this.getSmartTargets("D");
            const amt = this.config.bets["D"] * u * betMultiplier;
            lines.forEach((l: number) => {
              const p = Array.from({ length: 6 }, (_, i) => (l - 1) * 6 + 1 + i).join(",");
              betsPayload.push({ pocket: p, bet: parseFloat(amt.toFixed(8)) });
              totalBetSpin += amt;
            });
            infoMsg = `D-Šest. (${u}u x${betMultiplier.toFixed(1)})`;
          }
        } else if (this.activeStrat === "E") {
          const u = this.getLabBet(this.labSeqE);
          if (u >= this.dynamicLimit) isCrisis = true;
          else {
            const splits = this.getSmartTargets("E");
            const amt = this.config.bets["E"] * u * betMultiplier;
            splits.forEach((s: number[]) => {
              betsPayload.push({ pocket: `${s[0]},${s[1]}`, bet: parseFloat(amt.toFixed(8)) });
              totalBetSpin += amt;
            });
            infoMsg = `E-Splity (${u}u x${betMultiplier.toFixed(1)})`;
          }
        } else if (this.activeStrat === "F") {
          const u = this.getLabBet(this.labSeqF);
          if (u >= this.dynamicLimit) isCrisis = true;
          else {
            const corners = this.getSmartTargets("F");
            const amt = this.config.bets["F"] * u * betMultiplier;
            corners.forEach((c: number[]) => {
              betsPayload.push({ pocket: `${c[0]},${c[1]},${c[2]},${c[3]}`, bet: parseFloat(amt.toFixed(8)) });
              totalBetSpin += amt;
            });
            infoMsg = `F-Čtveř. (${u}u x${betMultiplier.toFixed(1)})`;
          }
        } else if (this.activeStrat === "G") {
          if (this.stratGCurrentBet >= this.config.bets["G"] * this.dynamicLimit) isCrisis = true;
          else {
            this.stratGNums = this.getSmartTargets("G");
            const currentBet = this.stratGCurrentBet * betMultiplier;
            this.stratGNums.forEach(n => {
              betsPayload.push({ pocket: n.toString(), bet: parseFloat(currentBet.toFixed(8)) });
              totalBetSpin += currentBet;
            });
            infoMsg = `G-AI Lot. (${(currentBet * this.stratGNums.length).toFixed(8)})`;
          }
        }

        if (isCrisis && drawdown > 0) {
          await this.triggerRescuePivot(drawdown);
          continue;
        }

        if (betsPayload.length === 0) {
          this.log("⚠️ No bets generated. Checking configuration...", "#fbbf24");
          const available = this.config.activeStrats.length > 0 ? this.config.activeStrats : ["A"];
          this.activeStrat = available[0];
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        const response = await axios.post(API_URL, {
          query: "mutation spinRoulette($bets: [RouletteBetInput]!, $currency: CurrencyEnum!) { spinRoulette(bets: $bets, currency: $currency) { roll winAmount user { wallets { currency balance } } } }",
          variables: { bets: betsPayload, currency: this.config.currency }
        }, { headers: { "x-access-token": this.config.token, "Content-Type": "application/json" } });

        const data = response.data;
        if (data.errors) {
          const errMsg = data.errors[0].message;
          this.log(`API Error: ${errMsg}`, "#ef4444");
          if (errMsg === "incorrect_bet") {
            this.log(`🔍 Debug: Strat ${this.activeStrat}, Total: ${totalBetSpin.toFixed(8)}`, "#94a3b8");
            this.log(`📦 Payload: ${JSON.stringify(betsPayload[0])}`, "#94a3b8");
          }
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        const res = data.data.spinRoulette;
        const roll = res.roll;
        
        // AI Analysis: Update virtual stats for all strategies based on this roll
        this.updateVirtualStats(roll);
        this.calculateVolatility();

        // Smart AI Analysis Trigger (Longevity & Performance)
        if (this.config.aiMode && !this.isAnalyzing) {
          const rollsSinceLast = this.totalBets - this.lastAIAnalysisRoll;
          const drawdown = this.peakProfit - this.profit;
          const isStruggling = drawdown > this.config.stopLoss * 0.3 || this.currentStreak < -3;
          const isVolatile = this.marketVolatility > 0.6;
          
          // Trigger AI if:
          // 1. We are struggling (every 30 rolls)
          // 2. Market is volatile (every 50 rolls)
          // 3. Normal operation (every 100 rolls)
          const threshold = isStruggling ? 30 : (isVolatile ? 50 : 100);
          
          if (rollsSinceLast >= threshold) {
            this.lastAIAnalysisRoll = this.totalBets;
            this.runAIPatternAnalysis().catch(e => console.error("AI Analysis Error:", e));
          }
        }

        const winTotal = parseFloat(res.winAmount);
        const isWin = winTotal > totalBetSpin;
        const curBal = res.user.wallets.find((w: any) => w.currency === this.config.currency || w.currency === "USDT")?.balance || 0;

        const profit = winTotal - totalBetSpin;
        const record: BetRecord = {
          id: this.totalBets + 1,
          time: new Date().toLocaleTimeString(),
          strat: this.activeStrat,
          bet: totalBetSpin,
          outcome: isWin ? "WIN" : "LOSS",
          profit: profit,
          roll: roll
        };
        this.betHistory.unshift(record);
        if (this.betHistory.length > 50) this.betHistory.pop();

        this.history.push(roll);
        if (this.history.length > 500) this.history.shift();
        
        if (this.sessionStartBal === null) {
          this.sessionStartBal = curBal + totalBetSpin;
          this.highestBal = this.sessionStartBal;
        }
        
        this.profit = curBal - this.sessionStartBal;
        this.balance = curBal;

        // Update Stats
        this.totalBets++;
        if (isWin) {
          this.wins++;
          this.currentStreak = this.currentStreak >= 0 ? this.currentStreak + 1 : 1;
        } else {
          this.losses++;
          this.currentStreak = this.currentStreak <= 0 ? this.currentStreak - 1 : -1;
        }
        if (Math.abs(this.currentStreak) > this.maxStreak) this.maxStreak = Math.abs(this.currentStreak);
        
        if (this.profit > this.peakProfit) this.peakProfit = this.profit;
        const currentDrawdown = this.peakProfit - this.profit;
        if (currentDrawdown > this.maxDrawdown) this.maxDrawdown = currentDrawdown;

        const chartEntry = { 
          time: new Date().toLocaleTimeString(), 
          profit: this.profit,
          sma: this.calculateSMA(this.chartData, 10)
        };
        this.chartData.push(chartEntry);
        if (this.chartData.length > 500) this.chartData.shift();

        // Update strategies
        if (this.activeStrat === "A") {
          const u = this.getLabBet(this.labSeqA);
          this.labSeqA = this.updateLab(this.labSeqA, isWin, !isWin ? u * 2 : u);
          this.rezimA = this.rezimA === "TUCET" ? "RADA" : "TUCET";
        } else if (this.activeStrat === "B") {
          if (isWin) {
            this.stratBLossCounter = 0;
            this.stratBCurrentBet = this.config.bets["B"];
          } else {
            this.stratBLossCounter++;
            if (this.stratBLossCounter % 2 === 0) this.stratBCurrentBet *= 2;
          }
        } else if (this.activeStrat === "C") {
          const u = this.getLabBet(this.labSeqC);
          this.labSeqC = this.updateLab(this.labSeqC, isWin, u);
        } else if (this.activeStrat === "D") {
          const u = this.getLabBet(this.labSeqD);
          this.labSeqD = this.updateLab(this.labSeqD, isWin, u);
        } else if (this.activeStrat === "E") {
          const u = this.getLabBet(this.labSeqE);
          this.labSeqE = this.updateLab(this.labSeqE, isWin, u);
        } else if (this.activeStrat === "F") {
          const u = this.getLabBet(this.labSeqF);
          this.labSeqF = this.updateLab(this.labSeqF, isWin, u);
        } else if (this.activeStrat === "G") {
          if (isWin) {
            this.stratGLossCounter = 0;
            this.stratGCurrentBet = this.config.bets["G"];
          } else {
            this.stratGLossCounter++;
            if (this.stratGLossCounter % 2 === 0) this.stratGCurrentBet *= 2;
          }
        }

        // Profit Lock
        if (curBal > this.highestBal) {
          const diff = curBal - this.highestBal;
          this.highestBal = curBal;
          this.dynamicLimit = this.config.rescueLimit;
          this.labSeqA = [1, 1];
          this.stratBLossCounter = 0;
          this.stratBCurrentBet = this.config.bets["B"];
          this.stratGLossCounter = 0;
          this.stratGCurrentBet = this.config.bets["G"];
          this.labSeqC = [1, 1]; this.labSeqD = [1, 1]; this.labSeqE = [1, 1]; this.labSeqF = [1, 1];
          
          this.log(`🔒 LOCK (+${diff.toFixed(8)})`, "#22d3ee");
          this.sendTg(`🔒 ZISK UZAMČEN!\nVýdělek: +${diff.toFixed(8)} ${this.config.currency}\nCelkový Profit: ${this.profit.toFixed(8)}\nZůstatek: ${curBal.toFixed(8)}`);
          
          if (this.config.aiMode) {
            this.activeStrat = this.pickBestStrategy();
          } else {
            const idx = this.config.activeStrats.indexOf(this.activeStrat);
            this.activeStrat = this.config.activeStrats[(idx + 1) % this.config.activeStrats.length];
          }
        }

        const resultText = isWin ? "✅ VÝHRA" : "❌ PROHRA";
        const resultColor = isWin ? "#4ade80" : "#f87171";
        this.log(`#${roll} | ${infoMsg} | Sáz: ${totalBetSpin.toFixed(8)} | ${resultText}`, resultColor);
        this.lastNum = roll;

        this.io.emit("bot:update", {
          balance: this.balance,
          profit: this.profit,
          activeStrat: this.activeStrat,
          historyCount: this.history.length,
          chartData: this.chartData,
          stats: {
            winRate: (this.wins / this.totalBets * 100).toFixed(2),
            currentStreak: this.currentStreak,
            maxStreak: this.maxStreak,
            maxDrawdown: this.maxDrawdown.toFixed(8),
            totalBets: this.totalBets
          },
          aiWeights: this.aiWeights,
          aiConfidence: this.aiConfidence,
          aiSectorBias: this.aiSectorBias,
          marketPhase: this.marketPhase,
          marketVolatility: this.marketVolatility,
          betHistory: this.betHistory
        });

        if (this.config.takeProfit > 0 && this.profit >= this.config.takeProfit) {
          this.log("🏆 TAKE PROFIT DOSAŽEN", "#fbbf24");
          this.sendTg(`🏆 TAKE PROFIT DOSAŽEN!\nProfit: ${this.profit.toFixed(8)}`);
          break;
        }
        if (this.config.stopLoss > 0 && (this.sessionStartBal - curBal) >= this.config.stopLoss) {
          this.log("🛑 STOP LOSS DOSAŽEN", "#ef4444");
          this.sendTg(`🛑 STOP LOSS DOSAŽEN!\nZtráta: ${this.profit.toFixed(8)}`);
          break;
        }

        if (Date.now() - this.lastSeedTime > this.config.seedInterval * 3600000) {
          await this.rotateSeed();
        }

        await new Promise(r => setTimeout(r, 1200));
      } catch (e: any) {
        this.log(`Err: ${e.message}`, "#ef4444");
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    this.running = false;
    this.io.emit("bot:status", { running: false });
  }

  async triggerRescuePivot(drawdown: number) {
    const safeStrats = this.config.activeStrats.filter(s => ["A", "C", "D", "E", "F"].includes(s) && s !== this.activeStrat);
    const candidates = safeStrats.length ? safeStrats : ["A", "C", "D", "E", "F"].filter(s => s !== this.activeStrat);
    
    // Simplified coldest strategy for now
    const newStrat = candidates[Math.floor(Math.random() * candidates.length)];
    const base = this.config.bets[newStrat];
    
    let targetMult = 1.0;
    if (newStrat === "D") targetMult = 3.0;
    else if (newStrat === "E") targetMult = 10.0;
    else if (newStrat === "F") targetMult = 5.0;

    const unitsNeeded = Math.floor(drawdown / (base * targetMult)) + 1;
    const parts = 6;
    const baseVal = Math.floor(unitsNeeded / parts);
    const remainder = unitsNeeded % parts;
    
    let newSeq = Array(parts).fill(baseVal);
    for (let i = 0; i < remainder; i++) newSeq[i]++;
    newSeq = newSeq.filter(x => x > 0);
    if (!newSeq.length) newSeq = [1, 1];
    else if (newSeq.length === 1) newSeq.push(1);

    const firstBetU = newSeq[0] + newSeq[newSeq.length - 1];
    this.dynamicLimit = firstBetU * 3 + this.config.rescueLimit;

    this.log(`🧠 TRUE PIVOT! Cíl: ${newStrat}. Nový limit: ${this.dynamicLimit}u`, "#d946ef");
    this.sendTg(`🚑 KRIZE (TRUE LABOUCHERE PIVOT)!\nDluh: ${drawdown.toFixed(8)}\nAI nasazuje strategii: ${newStrat}\nLimit uvolněn na: ${this.dynamicLimit}u`);

    this.labSeqA = [1, 1]; this.stratBLossCounter = 0; this.stratBCurrentBet = this.config.bets["B"];
    this.stratGLossCounter = 0; this.stratGCurrentBet = this.config.bets["G"];
    this.labSeqC = [1, 1]; this.labSeqD = [1, 1]; this.labSeqE = [1, 1]; this.labSeqF = [1, 1];

    if (newStrat === "A") this.labSeqA = newSeq;
    else if (newStrat === "C") this.labSeqC = newSeq;
    else if (newStrat === "D") this.labSeqD = newSeq;
    else if (newStrat === "E") this.labSeqE = newSeq;
    else if (newStrat === "F") this.labSeqF = newSeq;

    this.activeStrat = newStrat;
    await this.rotateSeed();
  }

  checkVirtualWin(strat: string, roll: number): boolean {
    // Re-calculate what the strategy WOULD have bet
    // Note: This is an approximation based on the current state logic
    const targets = this.getSmartTargets(strat);
    
    if (strat === "A") {
      // Targets are [1, 2] (dozens/columns indices)
      // Need to check against rezimA (which might toggle, but we use current state)
      // This is a heuristic approximation
      if (this.rezimA === "TUCET") {
        const dozen = Math.floor((roll - 1) / 12) + 1;
        return targets.includes(dozen);
      } else {
        const col = (roll - 1) % 3 + 1;
        return targets.includes(col);
      }
    } else if (strat === "B") {
      return this.stratBNums.includes(roll);
    } else if (strat === "C") {
      // Target is "RED", "BLACK", etc.
      const pockets: any = {
        RED: [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36],
        BLACK: [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35],
        EVEN: [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36],
        ODD: [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35],
        LOW: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],
        HIGH: [19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36]
      };
      return pockets[targets]?.includes(roll) || false;
    } else if (strat === "D") {
      // Targets are line indices [1..6]
      const line = Math.floor((roll - 1) / 6) + 1;
      return targets.includes(line);
    } else if (strat === "E") {
      // Targets are splits (arrays of 2 nums)
      return targets.some((s: number[]) => s.includes(roll));
    } else if (strat === "F") {
      // Targets are corners (arrays of 4 nums)
      return targets.some((c: number[]) => c.includes(roll));
    } else if (strat === "G") {
      return this.stratGNums.includes(roll);
    }
    return false;
  }

  updateVirtualStats(roll: number) {
    const PNL_MAP: Record<string, { win: number, loss: number }> = {
      "A": { win: 0.5, loss: -1 },
      "B": { win: 3.5, loss: -1 },
      "C": { win: 1, loss: -1 },
      "D": { win: 1, loss: -1 },
      "E": { win: 1.25, loss: -1 },
      "F": { win: 1.25, loss: -1 },
      "G": { win: 5, loss: -1 }
    };

    ["A", "B", "C", "D", "E", "F", "G"].forEach(s => {
      const isWin = this.checkVirtualWin(s, roll);
      const stats = this.virtualStats[s];
      const pnl = isWin ? PNL_MAP[s].win : PNL_MAP[s].loss;
      
      if (isWin) {
        stats.wins++;
        stats.streak = stats.streak >= 0 ? stats.streak + 1 : 1;
      } else {
        stats.losses++;
        stats.streak = stats.streak <= 0 ? stats.streak - 1 : -1;
      }
      
      stats.last20.push(pnl);
      if (stats.last20.length > 20) stats.last20.shift();
    });
  }

  calculateVolatility() {
    let totalSwings = 0;
    let count = 0;
    Object.values(this.virtualStats).forEach(stats => {
      for (let i = 1; i < stats.last20.length; i++) {
        totalSwings += Math.abs(stats.last20[i] - stats.last20[i - 1]);
        count++;
      }
    });
    // Normalize to 0.0 - 1.0 (max swing is roughly 6 for G)
    this.marketVolatility = count > 0 ? Math.min(1.0, (totalSwings / count) / 3.0) : 0;
  }

  getStatsSummary() {
    const counts: Record<number, number> = {};
    this.history.forEach(n => counts[n] = (counts[n] || 0) + 1);
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    
    const dozens = [0, 0, 0, 0]; // 0, 1st, 2nd, 3rd
    this.history.forEach(n => {
      if (n === 0) dozens[0]++;
      else dozens[Math.floor((n - 1) / 12) + 1]++;
    });

    const parity = { even: 0, odd: 0 };
    this.history.forEach(n => {
      if (n === 0) return;
      if (n % 2 === 0) parity.even++;
      else parity.odd++;
    });

    const stratMomentum = Object.entries(this.virtualStats).map(([s, stats]) => ({
      strat: s,
      pnl20: stats.last20.reduce((a, b) => a + b, 0),
      streak: stats.streak
    }));

    return {
      hot: sorted.slice(0, 5).map(x => x[0]),
      cold: sorted.slice(-5).map(x => x[0]),
      dozens,
      parity,
      stratMomentum
    };
  }

  async runAIPatternAnalysis() {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
      this.log("⚠️ AI Analysis skipped: GEMINI_API_KEY is missing or invalid in environment.", "#fbbf24");
      return;
    }

    this.isAnalyzing = true;
    this.log("🧠 AI Deep Analysis starting...", "#a855f7");
    
    try {
      const stats = this.getStatsSummary();
      const ai = new GoogleGenAI({ apiKey: key });
      const model = "gemini-3-flash-preview";
      
      const prompt = `Analyze these last ${this.history.length} roulette rolls: ${this.history.join(", ")}.
      
      STATISTICAL CONTEXT:
      - Hot Numbers: ${stats.hot.join(", ")}
      - Cold Numbers: ${stats.cold.join(", ")}
      - Dozen Distribution (0, 1st, 2nd, 3rd): ${stats.dozens.join(", ")}
      - Parity (Even/Odd): ${stats.parity.even}/${stats.parity.odd}
      - Strategy Momentum: ${JSON.stringify(stats.stratMomentum)}
      
      Market Volatility: ${this.marketVolatility.toFixed(2)}
      User Risk Tolerance: ${this.config.riskTolerance}
      
      TASK:
      1. Weight multipliers (0.5 to 2.5) for strategies A-G.
      2. Confidence score (0-100).
      3. Sector bias (VOISINS, TIERS, ORPHELINS, NONE).
      4. Market Phase: (ACCUMULATION, TRENDING, CHAOTIC, REVERSAL).
      
      Return JSON only: { 
        "weights": { "A": number, "B": number, "C": number, "D": number, "E": number, "F": number, "G": number },
        "confidence": number,
        "sectorBias": string,
        "marketPhase": string
      }`;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              weights: {
                type: Type.OBJECT,
                properties: {
                  A: { type: Type.NUMBER },
                  B: { type: Type.NUMBER },
                  C: { type: Type.NUMBER },
                  D: { type: Type.NUMBER },
                  E: { type: Type.NUMBER },
                  F: { type: Type.NUMBER },
                  G: { type: Type.NUMBER },
                },
                required: ["A", "B", "C", "D", "E", "F", "G"]
              },
              confidence: { type: Type.NUMBER },
              sectorBias: { type: Type.STRING },
              marketPhase: { type: Type.STRING }
            },
            required: ["weights", "confidence", "sectorBias", "marketPhase"]
          }
        }
      });

      const result = JSON.parse(response.text);
      const weights = result.weights;
      Object.keys(weights).forEach(s => {
        this.aiWeights[s] = Math.max(0.5, Math.min(2.5, weights[s]));
      });
      this.aiConfidence = Math.max(0, Math.min(100, result.confidence || 50));
      this.aiSectorBias = result.sectorBias || "NONE";
      this.marketPhase = result.marketPhase || "CHAOTIC";
      
      this.log(`🧠 AI Analysis: ${this.marketPhase} phase detected. Confidence: ${this.aiConfidence}%`, "#a855f7");
    } catch (e) {
      console.error("AI Pattern Analysis failed:", e);
    } finally {
      this.isAnalyzing = false;
    }
  }

  pickBestStrategy(): string {
    // AI Logic: Score strategies based on recent profitability (PnL), AI weights, volatility, and risk tolerance
    this.calculateVolatility();
    const stats = this.getStatsSummary();
    const available = this.config.activeStrats.length > 0 ? this.config.activeStrats : ["A"];
    const riskMult = this.config.riskTolerance === "HIGH" ? 1.5 : this.config.riskTolerance === "LOW" ? 0.5 : 1.0;
    
    // Local Sector Analysis (Fallback for when AI is off)
    let localSectorBias = "NONE";
    const sectorCounts = { VOISINS: 0, TIERS: 0, ORPHELINS: 0 };
    const sectorNums: Record<string, number[]> = {
      VOISINS: [22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25],
      TIERS: [27,13,36,11,30,8,23,10,5,24,16,33],
      ORPHELINS: [1,20,14,31,9,17,34,6]
    };
    
    // Analyze last 30 rolls for local bias
    this.history.slice(-30).forEach(n => {
      if (sectorNums.VOISINS.includes(n)) sectorCounts.VOISINS++;
      else if (sectorNums.TIERS.includes(n)) sectorCounts.TIERS++;
      else if (sectorNums.ORPHELINS.includes(n)) sectorCounts.ORPHELINS++;
    });
    
    const maxSector = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])[0];
    if (maxSector[1] > 12) localSectorBias = maxSector[0]; // Only bias if > 40% in one sector

    const scores = available.map(strat => {
      const vStats = this.virtualStats[strat];
      if (!vStats) return { strat, score: -999, pnl: 0 };

      // 1. Recent Profitability (Sum of last 20 rolls PnL)
      const recentPnL = vStats.last20.reduce((a, b) => a + b, 0);
      
      // 2. Momentum (Streak multiplier) adjusted by risk tolerance
      const momentum = vStats.streak > 0 ? (vStats.streak * 0.8 * riskMult) : (vStats.streak * 0.3);
      
      // 3. AI Pattern Weight (from Gemini)
      const aiWeight = this.aiWeights[strat] || 1.0;
      
      // 4. Sector Bias Bonus (Combine AI bias and Local bias)
      let biasBonus = 0;
      const activeBias = this.aiSectorBias !== "NONE" ? this.aiSectorBias : localSectorBias;
      
      if (activeBias !== "NONE") {
        const targets = this.getSmartTargets(strat);
        // If strategy targets overlap with biased sector, give bonus
        if (strat === "B" || strat === "G") {
          const overlap = targets.filter((n: number) => sectorNums[activeBias]?.includes(n)).length;
          biasBonus = (overlap / targets.length) * 4;
        } else if (strat === "A") {
          // Check dozen/column overlap
          const overlap = targets.filter((t: number) => {
            const nums = this.rezimA === "TUCET" 
              ? Array.from({length: 12}, (_, i) => (t-1)*12 + 1 + i)
              : Array.from({length: 12}, (_, i) => i*3 + t);
            return nums.some(n => sectorNums[activeBias]?.includes(n));
          }).length;
          biasBonus = (overlap / targets.length) * 2;
        }
      }

      // 5. Statistical Alignment Bonus (Local Intelligence)
      let statBonus = 0;
      const targets = this.getSmartTargets(strat);
      if (strat === "B" || strat === "G") {
        // Bonus for targeting "Hot" numbers
        const hotOverlap = targets.filter((n: number) => stats.hot.includes(n.toString())).length;
        statBonus += hotOverlap * 1.5;
      }
      
      // 6. Risk & Volatility Adjustments
      let riskAdjustment = 0;
      if (this.config.riskTolerance === "LOW") {
        if (["A", "C", "D"].includes(strat)) riskAdjustment += 2;
        if (["B", "G"].includes(strat)) riskAdjustment -= 2;
      } else if (this.config.riskTolerance === "HIGH") {
        if (["B", "G"].includes(strat)) riskAdjustment += 2;
      }

      // If highly volatile, penalize high-variance strats unless risk tolerance is HIGH
      if (this.marketVolatility > 0.5 && this.config.riskTolerance !== "HIGH") {
        if (["B", "G", "E", "F"].includes(strat)) riskAdjustment -= this.marketVolatility * 4;
      }
      
      // Calculate final score
      const totalScore = recentPnL + momentum + (aiWeight * 5) + biasBonus + statBonus + riskAdjustment;
      
      return { strat, score: totalScore, pnl: recentPnL };
    });
    
    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);
    
    const best = scores[0];
    this.log(`🧠 AI Swap: Chose ${best.strat} (Score: ${best.score.toFixed(1)}, PnL: ${best.pnl.toFixed(1)}u)`, "#a855f7");
    
    return best.strat;
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  app.use(cors());
  app.use(express.json());

  let bot: BotInstance | null = null;

  io.on("connection", (socket) => {
    console.log("Client connected");
    if (bot) {
      socket.emit("bot:init", {
        running: bot.running,
        balance: bot.balance,
        profit: bot.profit,
        activeStrat: bot.activeStrat,
        historyCount: bot.history.length,
        chartData: bot.chartData,
        stats: {
          winRate: (bot.wins / bot.totalBets * 100 || 0).toFixed(2),
          currentStreak: bot.currentStreak,
          maxStreak: bot.maxStreak,
          maxDrawdown: bot.maxDrawdown.toFixed(8),
          totalBets: bot.totalBets
        },
        aiWeights: bot.aiWeights,
        marketVolatility: bot.marketVolatility,
        betHistory: bot.betHistory,
        logs: bot.logs
      });
    } else {
      socket.emit("bot:init", {
        running: false,
        balance: 0,
        profit: 0,
        activeStrat: "---",
        historyCount: 0,
        chartData: [{ time: new Date().toLocaleTimeString(), profit: 0 }],
        stats: {
          winRate: "0.00",
          currentStreak: 0,
          maxStreak: 0,
          maxDrawdown: "0.00000000",
          totalBets: 0
        },
        aiWeights: {},
        marketVolatility: 0,
        betHistory: [],
        logs: []
      });
    }
  });

  app.post("/api/bot/start", (req, res) => {
    console.log("Received start request:", req.body);
    const config: BotConfig = req.body;
    if (bot && bot.running) {
      console.log("Bot already running");
      return res.status(400).json({ error: "Bot is already running" });
    }
    try {
      bot = new BotInstance(config, io);
      bot.start();
      console.log("Bot started successfully");
      res.json({ status: "ok" });
    } catch (e: any) {
      console.error("Error starting bot:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/bot/stop", (req, res) => {
    if (bot) {
      bot.stop();
      res.json({ status: "ok" });
    } else {
      res.status(400).json({ error: "Bot is not initialized" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = parseInt(process.env.PORT || "3000");
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    
    // Auto-start bot if token is provided in environment
    if (process.env.CASINO_TOKEN) {
      console.log("Auto-starting bot from environment variables...");
      const autoConfig: BotConfig = {
        token: process.env.CASINO_TOKEN,
        currency: process.env.CURRENCY || "POL",
        activeStrats: (process.env.ACTIVE_STRATS || "A").split(","),
        bets: {
          A: parseFloat(process.env.BET_A || "0.00000001"),
          B: parseFloat(process.env.BET_B || "0.00000001"),
          C: parseFloat(process.env.BET_C || "0.00000001"),
          D: parseFloat(process.env.BET_D || "0.00000001"),
          E: parseFloat(process.env.BET_E || "0.00000001"),
          F: parseFloat(process.env.BET_F || "0.00000001"),
          G: parseFloat(process.env.BET_G || "0.00000001"),
        },
        playG: process.env.PLAY_G === "true",
        betG: parseFloat(process.env.BET_G || "0.00000001"),
        stopLoss: parseFloat(process.env.STOP_LOSS || "100"),
        takeProfit: parseFloat(process.env.TAKE_PROFIT || "100"),
        seedInterval: parseInt(process.env.SEED_INTERVAL || "10"),
        rescueLimit: parseInt(process.env.RESCUE_LIMIT || "10"),
        tgToken: process.env.TG_TOKEN || "",
        tgChat: process.env.TG_CHAT || "",
        aiMode: process.env.AI_MODE === "true",
        riskTolerance: (process.env.RISK_TOLERANCE as any) || "MEDIUM",
      };
      bot = new BotInstance(autoConfig, io);
      bot.start();
    }
  });
}

startServer();
