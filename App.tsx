
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area
} from 'recharts';
import { MarketSymbol, TickData, DigitStats, SYMBOL_NAMES, AIAnalysis, TradeSignal, AccountInfo, TradeLog } from './types';
import { analyzeMarketPatterns } from './services/geminiService';

const DERIV_APP_ID = "119353";
const TOKENS = { REAL: 'A4lxJkh0sWeXD60', DEMO: 'sI05YqeXBucWOm1' };
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`;

const App: React.FC = () => {
  const [symbol, setSymbol] = useState<MarketSymbol>(MarketSymbol.R_100);
  const [ticks, setTicks] = useState<TickData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [accountType, setAccountType] = useState<'DEMO' | 'REAL'>('DEMO');
  const [stake, setStake] = useState(1);
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  
  const ws = useRef<WebSocket | null>(null);

  const connectWS = useCallback(() => {
    if (ws.current) ws.current.close();
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      setIsConnected(true);
      // Authorize immediately
      ws.current?.send(JSON.stringify({ authorize: TOKENS[accountType] }));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.error) {
        console.error("Deriv API Error:", data.error.message);
        return;
      }

      if (data.msg_type === 'authorize') {
        setIsAuthorized(true);
        setAccount({
          balance: data.authorize.balance,
          currency: data.authorize.currency,
          loginid: data.authorize.loginid,
          email: data.authorize.email,
          is_virtual: data.authorize.is_virtual === 1
        });
        // Subscribe to ticks after auth
        ws.current?.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
        // Subscribe to balance
        ws.current?.send(JSON.stringify({ balance: 1, subscribe: 1 }));
      }

      if (data.msg_type === 'balance') {
        setAccount(prev => prev ? { ...prev, balance: data.balance.balance } : null);
      }

      if (data.msg_type === 'tick') {
        const { epoch, quote } = data.tick;
        const lastDigit = parseInt(quote.toString().split('.').pop()?.slice(-1) || "0");
        setTicks(prev => [...prev, { epoch, quote, lastDigit, symbol }].slice(-100));
      }

      if (data.msg_type === 'buy') {
        const contractId = data.buy.contract_id;
        addLog({
          id: contractId.toString(),
          type: "MARKET ORDER",
          symbol,
          status: 'PENDING',
          stake,
          timestamp: Date.now()
        });
      }

      if (data.msg_type === 'proposal_open_contract') {
        const contract = data.proposal_open_contract;
        if (contract.is_completed) {
          const status = contract.status === 'won' ? 'WON' : 'LOST';
          updateLog(contract.contract_id.toString(), status, contract.profit);
        }
      }
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      setIsAuthorized(false);
    };
  }, [symbol, accountType, stake]);

  useEffect(() => {
    connectWS();
    return () => ws.current?.close();
  }, [connectWS]);

  const addLog = (log: TradeLog) => setTradeLogs(prev => [log, ...prev].slice(0, 50));
  const updateLog = (id: string, status: 'WON' | 'LOST', profit: number) => {
    setTradeLogs(prev => prev.map(l => l.id === id ? { ...l, status, payout: profit } : l));
  };

  const executeTrade = (type: 'DIGITMATCH' | 'CALL' | 'PUT', barrier?: number) => {
    if (!isAuthorized || !ws.current) return;
    
    const params: any = {
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: 'stake',
        contract_type: type,
        currency: account?.currency || 'USD',
        duration: 1,
        duration_unit: 't',
        symbol: symbol,
      }
    };

    if (type === 'DIGITMATCH' && barrier !== undefined) {
      params.parameters.barrier = barrier.toString();
    }

    ws.current.send(JSON.stringify(params));
  };

  const handleAIAnalyze = async () => {
    if (ticks.length < 20) return;
    setIsAnalyzing(true);
    try {
      const data = ticks.map(t => ({ quote: t.quote, lastDigit: t.lastDigit }));
      const result = await analyzeMarketPatterns(data, SYMBOL_NAMES[symbol]);
      setAiResult(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const currentPrice = ticks.length > 0 ? ticks[ticks.length - 1].quote : 0;
  const currentDigit = ticks.length > 0 ? ticks[ticks.length - 1].lastDigit : null;
  
  const getDigitStats = (): DigitStats[] => {
    const counts = new Array(10).fill(0);
    ticks.forEach(t => counts[t.lastDigit]++);
    const total = ticks.length || 1;
    return counts.map((count, digit) => ({
      digit, count, percentage: parseFloat(((count / total) * 100).toFixed(1))
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 space-y-8 font-sans">
      {/* Upper Navigation Bar */}
      <nav className="flex flex-col md:flex-row justify-between items-center gap-6 px-8 py-4 bg-slate-900/60 backdrop-blur-2xl border border-white/5 rounded-3xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <i className="fas fa-terminal text-white"></i>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter">DERIV<span className="text-blue-500">QUANT</span></h1>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                {accountType} {isAuthorized ? 'Authorized' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Account Switcher */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
            <button 
              onClick={() => { setAccountType('DEMO'); setAiResult(null); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${accountType === 'DEMO' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >DEMO</button>
            <button 
              onClick={() => { setAccountType('REAL'); setAiResult(null); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${accountType === 'REAL' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >REAL</button>
          </div>

          <div className="h-10 w-[1px] bg-white/10 mx-2" />

          {/* Balance Display */}
          <div className="text-right">
            <span className="text-[9px] font-black text-slate-500 uppercase block tracking-widest">Available Balance</span>
            <div className="text-xl font-mono font-bold text-emerald-400">
              {account ? `${account.currency} ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '---'}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Terminal Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Analysis & Ticks (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Live Price & Prediction Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-slate-900/40 p-6 rounded-3xl border border-white/5 flex items-center justify-between">
              <div>
                <select 
                  value={symbol}
                  onChange={(e) => { setTicks([]); setSymbol(e.target.value as MarketSymbol); setAiResult(null); }}
                  className="bg-transparent text-sm font-bold text-blue-400 outline-none mb-2 block"
                >
                  {Object.entries(SYMBOL_NAMES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
                </select>
                <div className="text-5xl font-mono font-black tracking-tighter text-white">
                  {currentPrice.toFixed(4)}
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Digit Gravity</span>
                <div className={`text-5xl font-black w-20 h-20 rounded-2xl flex items-center justify-center transition-all ${currentDigit === aiResult?.matchDigit ? 'bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.4)]' : 'bg-slate-950 text-blue-400 border border-white/10'}`}>
                  {currentDigit ?? '—'}
                </div>
              </div>
            </div>

            {/* AI Action Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 rounded-3xl shadow-2xl flex flex-col justify-between">
              <div>
                <h3 className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-2">Quant Prediction</h3>
                {aiResult ? (
                  <div className="space-y-1">
                    <div className="text-3xl font-black">{aiResult.signal}</div>
                    <div className="text-xs font-bold text-blue-100 opacity-80">Match Target: <span className="text-white text-lg">{aiResult.matchDigit}</span></div>
                  </div>
                ) : (
                  <div className="text-blue-200/50 italic text-sm">Waiting for Analysis...</div>
                )}
              </div>
              <button 
                onClick={handleAIAnalyze}
                disabled={isAnalyzing || ticks.length < 20}
                className="w-full bg-white text-blue-700 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-50 transition-all disabled:opacity-50"
              >
                {isAnalyzing ? 'Scanning...' : 'Refined Analysis'}
              </button>
            </div>
          </div>

          {/* Large Chart Container */}
          <div className="bg-slate-900/40 p-8 rounded-3xl border border-white/5 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ticks}>
                <defs>
                  <linearGradient id="quantGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis hide dataKey="epoch" />
                <YAxis hide domain={['auto', 'auto']} />
                <Area type="monotone" dataKey="quote" stroke="#3b82f6" strokeWidth={3} fill="url(#quantGradient)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Column: Trading Interface (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Trading Execution Panel */}
          <div className="bg-slate-900/60 p-8 rounded-3xl border border-white/10 shadow-2xl space-y-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Trade Terminal</h3>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Position Stake (USD)</label>
              <div className="flex gap-2">
                {[1, 5, 10, 50].map(amt => (
                  <button 
                    key={amt} 
                    onClick={() => setStake(amt)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border ${stake === amt ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/10 text-slate-400'}`}
                  >{amt}</button>
                ))}
              </div>
              <input 
                type="number" 
                value={stake} 
                onChange={(e) => setStake(Number(e.target.value))}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button 
                onClick={() => executeTrade('CALL')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl flex flex-col items-center gap-1 transition-all shadow-lg shadow-emerald-900/20 active:scale-95"
              >
                <i className="fas fa-arrow-up text-lg"></i>
                <span className="text-xs font-black uppercase">Rise / Buy</span>
              </button>
              <button 
                onClick={() => executeTrade('PUT')}
                className="bg-rose-600 hover:bg-rose-500 text-white py-4 rounded-2xl flex flex-col items-center gap-1 transition-all shadow-lg shadow-rose-900/20 active:scale-95"
              >
                <i className="fas fa-arrow-down text-lg"></i>
                <span className="text-xs font-black uppercase">Fall / Sell</span>
              </button>
            </div>

            <div className="pt-2">
              <button 
                onClick={() => aiResult && executeTrade('DIGITMATCH', aiResult.matchDigit)}
                disabled={!aiResult}
                className="w-full bg-slate-100 hover:bg-white text-slate-950 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all shadow-xl active:scale-95 disabled:opacity-30 flex items-center justify-center gap-3"
              >
                <i className="fas fa-bullseye text-blue-600"></i>
                Match Digit {aiResult?.matchDigit ?? '?'}
              </button>
              <p className="text-[9px] text-center text-slate-500 mt-4 uppercase font-bold tracking-widest">Payout: ~800% (Matches)</p>
            </div>
          </div>

          {/* Trade History Terminal */}
          <div className="bg-slate-900/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900/80 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">History Log</h3>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              </div>
            </div>
            <div className="p-4 h-[250px] overflow-y-auto font-mono text-[11px] space-y-2 custom-scrollbar">
              {tradeLogs.length === 0 && <div className="text-slate-600 italic">No trades executed in this session.</div>}
              {tradeLogs.map(log => (
                <div key={log.id} className="flex justify-between items-center group">
                  <div className="flex items-center gap-2">
                    <span className={log.status === 'WON' ? 'text-emerald-400' : log.status === 'LOST' ? 'text-rose-400' : 'text-blue-400'}>
                      {log.status === 'PENDING' ? '>' : log.status === 'WON' ? '✓' : '✗'}
                    </span>
                    <span className="text-slate-500">ID:{log.id.slice(-4)}</span>
                    <span className="text-slate-300 font-bold">{log.symbol}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">${log.stake}</span>
                    <span className={`font-bold ${log.payout && log.payout > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {log.payout ? (log.payout > 0 ? `+${log.payout.toFixed(2)}` : log.payout.toFixed(2)) : '...'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
