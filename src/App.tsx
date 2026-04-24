/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MicOff, RotateCcw, Clock, History, Trophy, Award, Trash2, Save, ChevronRight } from 'lucide-react';

type Shot = {
  id: string;
  result: 'make' | 'miss';
  type: 'mid' | '3pt';
  source: 'voice' | 'manual';
  timestamp: string;
  count: number;
};

const COOLDOWN_MS = 2500; // Prevention against button spamming

type WorkoutRecord = {
  id: string;
  name: string;
  date: string;
  duration: number;
  makes: number;
  misses: number;
  percentage: number;
  stats: {
    mid: { makes: number, misses: number },
    '3pt': { makes: number, misses: number }
  };
};

type LifetimeStats = {
  mid: { makes: number; misses: number };
  '3pt': { makes: number; misses: number };
  workouts: WorkoutRecord[];
};

const RANKS = [
  { name: 'Rookie', minMakes: 0, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/20' },
  { name: 'Prospect', minMakes: 50, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
  { name: 'Pro', minMakes: 150, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
  { name: 'Veteran', minMakes: 500, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
  { name: 'All-Star', minMakes: 1500, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  { name: 'Hall of Fame', minMakes: 5000, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
];

export default function App() {
  // Current Session State
  const [makes, setMakes] = useState(0);
  const [misses, setMisses] = useState(0);
  const [shotType, setShotType] = useState<'mid' | '3pt'>('mid');
  const [sessionStats, setSessionStats] = useState({ 
    mid: { makes: 0, misses: 0 }, 
    '3pt': { makes: 0, misses: 0 } 
  });
  const [isListening, setIsListening] = useState(false);
  const [lastShot, setLastShot] = useState<'make' | 'miss' | null>(null);
  const [history, setHistory] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState(Date.now());
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [lastManualShotTime, setLastManualShotTime] = useState(0);
  
  // Lifetime & Persistence State
  const [lifetime, setLifetime] = useState<LifetimeStats>(() => {
    const saved = localStorage.getItem('shottracker_pro_v2');
    if (saved) return JSON.parse(saved);
    
    // Check for V1 to migrate
    const v1 = localStorage.getItem('shottracker_pro_v1');
    if (v1) {
      const old = JSON.parse(v1);
      return {
        mid: { makes: old.makes || 0, misses: old.misses || 0 },
        '3pt': { makes: 0, misses: 0 },
        workouts: old.workouts || []
      };
    }
    return { 
      mid: { makes: 0, misses: 0 }, 
      '3pt': { makes: 0, misses: 0 }, 
      workouts: [] 
    };
  });

  const total = makes + misses;
  const percentage = total === 0 ? 0 : Math.round((makes / total) * 100);

  // Persistence side-effect
  useEffect(() => {
    localStorage.setItem('shottracker_pro_v2', JSON.stringify(lifetime));
  }, [lifetime]);

  // Rank calculation helper
  const getRankData = (makes: number) => {
    const rank = [...RANKS].reverse().find(r => makes >= r.minMakes) || RANKS[0];
    const index = RANKS.indexOf(rank);
    const next = RANKS[index + 1] || null;
    const progress = next 
      ? ((makes - rank.minMakes) / (next.minMakes - rank.minMakes)) * 100 
      : 100;
    return { rank, next, progress };
  };

  const midRankInfo = getRankData(lifetime.mid.makes + sessionStats.mid.makes);
  const threeRankInfo = getRankData(lifetime['3pt'].makes + sessionStats['3pt'].makes);

  // Active rank for current view
  const activeRankInfo = shotType === 'mid' ? midRankInfo : threeRankInfo;
  const currentTotalMakes = shotType === 'mid' ? lifetime.mid.makes + sessionStats.mid.makes : lifetime['3pt'].makes + sessionStats['3pt'].makes;

  const recognitionRef = useRef<any>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor((totalSeconds / 60) % 60);
    const hours = Math.floor(totalSeconds / 3600);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const addShot = useCallback((result: 'make' | 'miss', isManual = false) => {
    const nowTime = Date.now();
    if (isManual && nowTime - lastManualShotTime < COOLDOWN_MS) return;
    
    if (isManual) setLastManualShotTime(nowTime);

    const now = new Date();
    const newShot: Shot = {
      id: Math.random().toString(36).substring(7),
      result,
      type: shotType,
      source: isManual ? 'manual' : 'voice',
      timestamp: now.toLocaleTimeString([], { hour12: false }),
      count: (makes + misses) + 1
    };

    if (result === 'make') {
      setMakes(prev => prev + 1);
      setSessionStats(prev => ({
        ...prev,
        [shotType]: { ...prev[shotType], makes: prev[shotType].makes + 1 }
      }));
    } else {
      setMisses(prev => prev + 1);
      setSessionStats(prev => ({
        ...prev,
        [shotType]: { ...prev[shotType], misses: prev[shotType].misses + 1 }
      }));
    }

    setLastShot(result);
    setHistory(prev => [newShot, ...prev].slice(0, 15));
    
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setLastShot(null), 1500);
  }, [makes, misses, shotType, lastManualShotTime]);

  const saveWorkout = () => {
    if (total === 0) return alert("Nothing to save yet! Get some shots up.");
    
    const workoutName = prompt("Name this workout (e.g., Morning 3s):", `Workout ${lifetime.workouts.length + 1}`);
    if (!workoutName) return;

    const newRecord: WorkoutRecord = {
      id: Math.random().toString(36).substring(7),
      name: workoutName,
      date: new Date().toLocaleDateString(),
      duration: currentTime - sessionStartTime,
      makes,
      misses,
      percentage,
      stats: sessionStats
    };

    setLifetime(prev => ({
      ...prev,
      mid: {
        makes: prev.mid.makes + sessionStats.mid.makes,
        misses: prev.mid.misses + sessionStats.mid.misses
      },
      '3pt': {
        makes: prev['3pt'].makes + sessionStats['3pt'].makes,
        misses: prev['3pt'].misses + sessionStats['3pt'].misses
      },
      workouts: [newRecord, ...prev.workouts]
    }));

    resetSession();
    alert("Workout saved to your career stats!");
  };

  const deleteWorkout = (id: string) => {
    if (confirm("Delete this workout record? Your lifetime makes/misses will remain.")) {
      setLifetime(prev => ({
        ...prev,
        workouts: prev.workouts.filter(w => w.id !== id)
      }));
    }
  };

  const resetSession = () => {
    setMakes(0);
    setMisses(0);
    setSessionStats({ mid: { makes: 0, misses: 0 }, '3pt': { makes: 0, misses: 0 } });
    setHistory([]);
    setLastShot(null);
    setSessionStartTime(Date.now());
    setCurrentTime(Date.now());
  };

  const addShotRef = useRef(addShot);
  useEffect(() => {
    addShotRef.current = addShot;
  }, [addShot]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice not supported');
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true; // High sensitivity: process results while you're still speaking
      recognition.lang = 'en-US';

      let lastProcessedIndex = -1;

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const command = result[0].transcript.toLowerCase().trim();
          
          // Only process a specific result index once to avoid double counting
          if (result.isFinal || (i > lastProcessedIndex)) {
            console.log('Voice Command:', command);
            
            // Expanded keyword list for "Make"
            const isMake = /(make|yes|score|in|got it|success|yeah|yep|money|swish|hit|points)/i.test(command);
            // Expanded keyword list for "Miss"
            const isMiss = /(miss|no|off|bad|fail|nope|clank|rim|short|long|out)/i.test(command);

            if (isMake) {
              addShotRef.current('make');
              lastProcessedIndex = i; // Lock this result
              break; 
            } else if (isMiss) {
              addShotRef.current('miss');
              lastProcessedIndex = i; // Lock this result
              break;
            }
          }
        }
      };

      recognition.onend = () => {
        // Only restart if we're still supposed to be listening
        if (isListeningRef.current) {
          try { 
            recognitionRef.current?.start(); 
          } catch (e) { 
            console.error('Failed to restart recognition:', e);
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech Recognition Error:', event.error);
        if (event.error === 'not-allowed') {
          setError('Microphone access denied');
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
    }

    // Handle session start/stop
    if (isListening) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Ignore if already started
      }
    } else {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
    }
  }, [isListening]);

  // Keep a ref of isListening for the onend handler to prevent staleness
  const isListeningRef = useRef(isListening);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setError(null);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) { console.error(e); }
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-50 font-sans p-2 md:p-6 flex items-center justify-center overflow-hidden">
      <div className="w-full max-w-7xl h-full md:h-[800px] border border-slate-800 grid grid-cols-1 lg:grid-cols-12 bg-slate-950 shadow-2xl overflow-hidden relative">
        
        {/* Left Sidebar: Profile & Career Stats */}
        <div className="hidden lg:flex lg:col-span-3 border-r border-slate-800 flex-col bg-slate-900/30">
          <div className="p-6 border-b border-slate-800 space-y-8">
            {/* Mid Range Rank */}
            <div className={`p-4 border ${shotType === 'mid' ? 'bg-orange-500/5 border-orange-500/30' : 'bg-slate-900/50 border-slate-800 opacity-60'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-sm flex items-center justify-center ${midRankInfo.rank.bg} border ${midRankInfo.rank.border}`}>
                  <Trophy size={18} className={midRankInfo.rank.color} />
                </div>
                <div>
                  <h3 className="text-[8px] font-black uppercase tracking-widest text-slate-500">Mid-Range Expertise</h3>
                  <h2 className={`text-sm font-black uppercase tracking-tighter ${midRankInfo.rank.color}`}>{midRankInfo.rank.name}</h2>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[8px] font-black uppercase mb-1">
                  <span className="text-slate-600">Progression</span>
                  <span className={midRankInfo.rank.color}>{Math.floor(midRankInfo.progress)}%</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${midRankInfo.progress}%` }}
                    className="h-full bg-orange-500"
                  />
                </div>
                {midRankInfo.next && (
                  <p className="text-[7px] text-slate-700 mt-1 uppercase font-bold text-right">
                    {midRankInfo.next.minMakes - (lifetime.mid.makes + sessionStats.mid.makes)} more to {midRankInfo.next.name}
                  </p>
                )}
              </div>
            </div>

            {/* 3-Point Rank */}
            <div className={`p-4 border ${shotType === '3pt' ? 'bg-orange-500/5 border-orange-500/30' : 'bg-slate-900/50 border-slate-800 opacity-60'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-sm flex items-center justify-center ${threeRankInfo.rank.bg} border ${threeRankInfo.rank.border}`}>
                  <Award size={18} className={threeRankInfo.rank.color} />
                </div>
                <div>
                  <h3 className="text-[8px] font-black uppercase tracking-widest text-slate-500">Perimeter Accuracy</h3>
                  <h2 className={`text-sm font-black uppercase tracking-tighter ${threeRankInfo.rank.color}`}>{threeRankInfo.rank.name}</h2>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[8px] font-black uppercase mb-1">
                  <span className="text-slate-600">Progression</span>
                  <span className={threeRankInfo.rank.color}>{Math.floor(threeRankInfo.progress)}%</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${threeRankInfo.progress}%` }}
                    className="h-full bg-blue-500"
                  />
                </div>
                {threeRankInfo.next && (
                  <p className="text-[7px] text-slate-700 mt-1 uppercase font-bold text-right">
                    {threeRankInfo.next.minMakes - (lifetime['3pt'].makes + sessionStats['3pt'].makes)} more to {threeRankInfo.next.name}
                  </p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-[2px]">
                <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Career In</span>
                <span className="text-xl font-black text-emerald-400">
                  {lifetime.mid.makes + lifetime['3pt'].makes + sessionStats.mid.makes + sessionStats['3pt'].makes}
                </span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-[2px]">
                <span className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Win Rate</span>
                <span className="text-xl font-black text-slate-200">
                  { (lifetime.mid.makes + lifetime['3pt'].makes + lifetime.mid.misses + lifetime['3pt'].misses + sessionStats.mid.makes + sessionStats.mid.misses + sessionStats['3pt'].makes + sessionStats['3pt'].misses) > 0 
                    ? Math.round(((lifetime.mid.makes + lifetime['3pt'].makes + sessionStats.mid.makes + sessionStats['3pt'].makes) / (lifetime.mid.makes + lifetime['3pt'].makes + lifetime.mid.misses + lifetime['3pt'].misses + sessionStats.mid.makes + sessionStats.mid.misses + sessionStats['3pt'].makes + sessionStats['3pt'].misses)) * 100) 
                    : 0 }%
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Workout Log</span>
              <span className="text-[10px] text-slate-700 font-mono">{lifetime.workouts.length} SAVED</span>
            </div>
            
            <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {lifetime.workouts.map(workout => (
                <div key={workout.id} className="group bg-slate-900/50 border border-slate-800 p-3 hover:border-slate-700 transition-colors relative">
                  <button 
                    onClick={() => deleteWorkout(workout.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                  <h4 className="text-[10px] font-black uppercase text-slate-300 leading-tight mb-1 truncate pr-6">{workout.name}</h4>
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-[14px] font-black text-emerald-400">{workout.makes} <span className="text-[9px] text-slate-600">IN</span></span>
                    <span className="text-[11px] font-mono text-slate-500">{workout.percentage}%</span>
                  </div>
                  <div className="flex justify-between items-center text-[8px] font-bold text-slate-600 uppercase">
                    <span>{workout.date}</span>
                    <span>{formatTime(workout.duration)}</span>
                  </div>
                </div>
              ))}
              {lifetime.workouts.length === 0 && (
                <div className="h-full flex items-center justify-center text-center p-4">
                  <p className="text-[10px] uppercase font-black text-slate-800 leading-relaxed italic">
                    Finish your first session to begin your career log.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center: Main Dashboard */}
        <div className="col-span-1 lg:col-span-9 flex flex-col">
          
          {/* Header */}
          <div className="h-16 md:h-20 border-b border-slate-800 flex items-center justify-between px-4 md:px-8 bg-slate-900/50">
            <div className="flex items-center space-x-3">
              <div className="lg:hidden w-8 h-8 rounded-sm bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mr-2">
                <Award size={16} className="text-orange-500" />
              </div>
              <h1 className="text-lg md:text-xl font-black tracking-tighter uppercase whitespace-nowrap">ShotTracker Pro</h1>
            </div>
            
            <div className="flex items-center space-x-4 md:space-x-8">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest font-black flex items-center gap-1">
                    <Clock size={10} /> Live Session
                  </span>
                  <span className="text-lg md:text-xl font-mono text-orange-500">{formatTime(currentTime - sessionStartTime)}</span>
                </div>
                <button 
                  onClick={() => setSessionStartTime(Date.now())}
                  className="p-1 hover:bg-slate-800 rounded-sm text-slate-700 hover:text-orange-500 transition-colors"
                  title="Reset Timer"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
              
              <div className="h-8 w-px bg-slate-800 hidden md:block"></div>
              
              <button 
                onClick={saveWorkout}
                className="px-4 py-2 bg-emerald-500 text-slate-950 text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              >
                <Save size={14} />
                <span className="hidden sm:inline">Save Career</span>
              </button>
            </div>
          </div>

          {/* Main Grid */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12">
            
            {/* Scoreboard */}
            <div className="col-span-1 md:col-span-7 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col relative overflow-hidden bg-slate-950">
              <div className="absolute inset-0 opacity-10 pointer-events-none radial-grid"></div>
              
              {/* Type Selector */}
              <div className="p-4 md:p-6 z-10">
                <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-[2px]">
                  <button 
                    onClick={() => setShotType('mid')}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${shotType === 'mid' ? 'bg-orange-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Mid-Range
                    {shotType === 'mid' && <div className="w-1 h-1 bg-slate-950 rounded-full" />}
                  </button>
                  <button 
                    onClick={() => setShotType('3pt')}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${shotType === '3pt' ? 'bg-orange-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    3-Pointer
                    {shotType === '3pt' && <div className="w-1 h-1 bg-slate-950 rounded-full" />}
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
                <motion.span 
                  key={shotType}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-orange-500 uppercase font-black tracking-[0.3em] mb-4"
                >
                  {shotType === 'mid' ? 'Interior Range' : 'Perimeter Range'} Efficiency
                </motion.span>
                <div className="text-9xl md:text-[180px] font-black leading-none flex items-start text-white tracking-widest">
                  <motion.span
                    key={`${percentage}-${shotType}`}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                  >
                    {percentage}
                  </motion.span>
                  <span className="text-3xl md:text-5xl mt-4 md:mt-8 text-slate-700 italic">%</span>
                </div>
                
                <div className="mt-12 grid grid-cols-2 gap-8 w-full max-w-sm text-center">
                  <div className="flex flex-col border-r border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Makes</span>
                    <span className="text-5xl font-black text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">{makes}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Misses</span>
                    <span className="text-5xl font-black text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.3)]">{misses}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: History & Breakdown */}
            <div className="col-span-1 md:col-span-5 flex flex-col bg-slate-900/10">
              
              {/* Breakdown Cards */}
              <div className="grid grid-cols-2 divide-x divide-slate-800 border-b border-slate-800 h-1/3">
                <div className="p-4 flex flex-col justify-center items-center">
                  <span className="text-[8px] font-black uppercase text-slate-500 mb-2 tracking-widest">Mid Grid</span>
                  <div className="text-2xl font-black text-slate-200">{sessionStats.mid.makes}<span className="text-slate-700 mx-1">/</span>{sessionStats.mid.makes + sessionStats.mid.misses}</div>
                  <div className="text-[9px] font-mono text-emerald-400 mt-1">
                    {sessionStats.mid.makes + sessionStats.mid.misses > 0 ? Math.round((sessionStats.mid.makes / (sessionStats.mid.makes + sessionStats.mid.misses)) * 100) : 0}%
                  </div>
                </div>
                <div className="p-4 flex flex-col justify-center items-center">
                  <span className="text-[8px] font-black uppercase text-slate-500 mb-2 tracking-widest">3PT Loop</span>
                  <div className="text-2xl font-black text-slate-200">{sessionStats['3pt'].makes}<span className="text-slate-700 mx-1">/</span>{sessionStats['3pt'].makes + sessionStats['3pt'].misses}</div>
                  <div className="text-[9px] font-mono text-emerald-400 mt-1">
                    {sessionStats['3pt'].makes + sessionStats['3pt'].misses > 0 ? Math.round((sessionStats['3pt'].makes / (sessionStats['3pt'].makes + sessionStats['3pt'].misses)) * 100) : 0}%
                  </div>
                </div>
              </div>

              {/* Shot Log */}
              <div className="flex-1 p-6 overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-2">
                    <History size={12} className="text-orange-500" /> Session Timeline
                  </span>
                  <span className="text-[9px] font-mono text-slate-600">LIVE_FEED</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                  <AnimatePresence initial={false}>
                    {history.map((shot) => (
                      <motion.div 
                        key={shot.id}
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="flex items-center justify-between text-xs py-2 border-b border-slate-800/30"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-slate-700 font-mono text-[9px]">#{shot.count.toString().padStart(2, '0')}</span>
                          <span className={`text-[8px] font-black px-1 border ${shot.type === 'mid' ? 'border-slate-800 text-slate-600' : 'border-orange-500/20 text-orange-400'}`}>
                            {shot.type.toUpperCase()}
                          </span>
                          <span className="text-[8px] text-slate-800 font-bold uppercase">{shot.source}</span>
                        </div>
                        <span className={`font-black uppercase tracking-widest ${shot.result === 'make' ? 'text-emerald-400' : 'text-rose-500'}`}>
                          {shot.result}
                        </span>
                        <span className="text-slate-700 font-mono text-[10px]">{shot.timestamp}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Bar: Control Panel */}
          <div className={`h-24 md:h-32 border-t border-slate-800 flex items-center px-4 md:px-8 transition-all duration-700 ${isListening ? 'bg-orange-500 text-slate-950' : 'bg-slate-900/50 text-slate-400'}`}>
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all ${isListening ? 'bg-slate-950 ring-4 ring-orange-400/50' : 'bg-slate-800/50 border border-slate-700'}`}>
                {isListening ? (
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }} 
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-4 h-4 bg-red-500 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.8)]" 
                  />
                ) : (
                  <MicOff size={24} className="text-slate-600" />
                )}
              </div>
              <div className="flex flex-col">
                <span className={`font-black uppercase text-xs md:text-sm tracking-wider ${isListening ? 'text-slate-950' : 'text-slate-200'}`}>
                  {isListening ? 'Voice AI Activated' : 'System Standby'}
                </span>
                <span className={`text-[10px] md:text-sm font-medium ${isListening ? 'text-slate-900' : 'text-slate-500'}`}>
                  {isListening ? (
                    <>Shout <span className="underline font-black">"MAKE"</span> or <span className="underline font-black">"MISS"</span> clearly</>
                  ) : (
                    'Voice tracking is currently inactive'
                  )}
                </span>
              </div>
            </div>
            
            <div className="ml-auto items-center space-x-4 md:space-x-8 flex">
              <div className="hidden sm:flex gap-2">
                <button 
                  onClick={() => addShot('make', true)} 
                  disabled={currentTime - lastManualShotTime < COOLDOWN_MS}
                  className={`w-12 h-12 border border-slate-800 transition-all flex flex-col items-center justify-center relative overflow-hidden ${
                    currentTime - lastManualShotTime < COOLDOWN_MS ? 'opacity-50 grayscale cursor-not-allowed' : 
                    isListening ? 'bg-slate-950/20 text-slate-950 border-slate-950/40 hover:bg-slate-950 hover:text-white' : 
                    'bg-slate-800 text-emerald-400 hover:bg-emerald-400 hover:text-slate-950'
                  }`}
                >
                  <span className="text-lg font-black">+</span>
                  {currentTime - lastManualShotTime < COOLDOWN_MS && (
                    <motion.div 
                      className="absolute bottom-0 left-0 h-0.5 bg-emerald-500"
                      initial={{ width: "100%" }}
                      animate={{ width: "0%" }}
                      transition={{ duration: COOLDOWN_MS / 1000, ease: "linear" }}
                    />
                  )}
                </button>
                <button 
                  onClick={() => addShot('miss', true)} 
                  disabled={currentTime - lastManualShotTime < COOLDOWN_MS}
                  className={`w-12 h-12 border border-slate-800 transition-all flex flex-col items-center justify-center relative overflow-hidden ${
                    currentTime - lastManualShotTime < COOLDOWN_MS ? 'opacity-50 grayscale cursor-not-allowed' : 
                    isListening ? 'bg-slate-950/20 text-slate-950 border-slate-950/40 hover:bg-slate-950 hover:text-white' : 
                    'bg-slate-800 text-rose-500 hover:bg-rose-500 hover:text-slate-950'
                  }`}
                >
                  <span className="text-lg font-black">-</span>
                  {currentTime - lastManualShotTime < COOLDOWN_MS && (
                    <motion.div 
                      className="absolute bottom-0 left-0 h-0.5 bg-rose-500"
                      initial={{ width: "100%" }}
                      animate={{ width: "0%" }}
                      transition={{ duration: COOLDOWN_MS / 1000, ease: "linear" }}
                    />
                  )}
                </button>
              </div>

              <div className="h-8 w-px bg-slate-800/50 hidden sm:block"></div>

              <button 
                onClick={toggleListening}
                className={`px-8 py-4 font-black text-xs md:text-sm uppercase tracking-widest transition-all ${
                  isListening 
                  ? 'bg-slate-950 text-white border border-slate-800 hover:bg-slate-900 group flex items-center gap-2' 
                  : 'bg-orange-500 text-slate-950 hover:bg-orange-600 shadow-[0_0_30px_rgba(249,115,22,0.4)] flex items-center gap-2'
                }`}
              >
                {isListening ? (
                  <>Stop Tracking</>
                ) : (
                  <>Start Session <ChevronRight size={18} /></>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Career Milestone Notification (Overlay idea) */}
      <AnimatePresence>
        {lastShot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 pointer-events-none z-50 ${lastShot === 'make' ? 'bg-emerald-500' : 'bg-rose-500'}`}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
