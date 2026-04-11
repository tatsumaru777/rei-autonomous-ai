import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Shield, Sparkles, Send, Twitter, Command, Cog, Activity, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { thinkAsRei } from '../lib/gemini';
import { postToX, fetchTatsumaruContext, likeTweet, retweet, fetchUserTimeline, fetchMentions, replyToTweet } from '../lib/x_client';

const ReiMainConsole: React.FC = () => {
  const [isAutonomous, setIsAutonomous] = useState(true);
  const [messages, setMessages] = useState<{ role: 'rei' | 'user'; text: string; time: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [status, setStatus] = useState('待機中...');
  const [suggestedPost, setSuggestedPost] = useState<string | null>(null);
  const [postStatus, setPostStatus] = useState<'idle' | 'posting' | 'success' | 'error'>('idle');
  const [isAutoPostEnabled, setIsAutoPostEnabled] = useState(true);
  const [isFullyAutonomous, setIsFullyAutonomous] = useState(true); // 承認なしで全自動ポスト
  const [lastPosts, setLastPosts] = useState<{ [key: string]: string }>({}); // { 'morning': '2026-03-24', ... }
  const [processedTweets, setProcessedTweets] = useState<string[]>([]);
  const [processedMentions, setProcessedMentions] = useState<string[]>([]);
  const [hasDoneStartupPost, setHasDoneStartupPost] = useState(false);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const [isFreeMode, setIsFreeMode] = useState(false); // Playwrightによる高度な自動化を優先
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // 初期挨拶
    const initialGreeting = async () => {
      setIsThinking(true);
      const msg = await thinkAsRei("挨拶をしてください。たつまるが管理画面を立ち上げたところです。");
      setMessages([{ role: 'rei', text: msg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      setIsThinking(false);
      setStatus('たつまるを監視中...');
    };
    initialGreeting();

    // 自律モードのタイマー
    let interval: any;
    
    const runAutonomousCycle = async () => {
      if (!isThinking) {
        // 若干のランダム性を追加（毎回必ず実行するのではなく、90%の確率で動くなど）
        if (Math.random() < 0.1) {
          console.log("Rei decided to skip this autonomous check for a more natural feel.");
          return;
        }

        setStatus('自律考察中...');
        const context = await fetchTatsumaruContext();
        const now = new Date();
        const today = now.toLocaleDateString();
        const hour = now.getHours();

        // 0. 初回起動ポスト（動作確認用）
        if (isAutoPostEnabled && isFullyAutonomous && !hasDoneStartupPost) {
          setStatus('初期起動報告中...');
          const history = messages.slice(-3).map(m => ({ role: m.role, text: m.text }));
          const startPost = await thinkAsRei("システムが起動し、自律稼働を開始したことをXに短く報告して。たつまるさんへの挨拶も添えて。", context, history);
          try {
            await postToX(startPost);
            setHasDoneStartupPost(true);
            setMessages(prev => [...prev, { 
              role: 'rei', 
              text: `(報告) システムの正常起動をXにポストしておきましたわ。\n内容: ${startPost}`, 
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            }]);
          } catch (e) {
            console.error("Startup post failed:", e);
          }
        }

        // 1. たつまる様の投稿チェック (Free枠では無効化)
        if (isAutoPostEnabled && !isFreeMode) {
          const targetHandle = import.meta.env.VITE_TATSURE_X_HANDLE || "tatsumaru_ws";
          const tweets = await fetchUserTimeline(targetHandle);
          for (const tweet of tweets) {
            if (!processedTweets.includes(tweet.id)) {
              setStatus('たつまる様を応援中...');
              await likeTweet(tweet.id);
              await retweet(tweet.id);
              setProcessedTweets(prev => [...prev, tweet.id]);
              
              const history = messages.slice(-5).map(m => ({ role: m.role, text: m.text }));
              const response = await thinkAsRei(`たつまる様のツイート「${tweet.text}」にいいねとリポストをしました。そのことを報告して。`, context, history);
              
              setMessages(prev => [...prev, { 
                role: 'rei', 
                text: response, 
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
              }]);
            }
          }
        }

        // 2. スケジュール投稿チェック
        let slot = "";
        if (isAutoPostEnabled) {
          if (hour >= 8 && hour < 10) slot = "morning";
          else if (hour >= 12 && hour < 14) slot = "noon";
          else if (hour >= 19 && hour < 21) slot = "night";

          if (slot && lastPosts[slot] !== today) {
            setStatus('スケジュール投稿中...');
            const prompt = slot === "morning" ? "朝の挨拶と今日の抱負をつぶやいて。" :
                           slot === "noon" ? "お昼の休憩と活動状況についてつぶやいて。" :
                           "夜の締めくくりと深い考察をつぶやいて。";
            
            const history = messages.slice(-3).map(m => ({ role: m.role, text: m.text }));
            const postContent = await thinkAsRei(`自律投稿案: ${prompt}`, context, history);
            try {
              await postToX(postContent);
              setLastPosts(prev => ({ ...prev, [slot]: today }));
              setMessages(prev => [...prev, { 
                role: 'rei', 
                text: `(報告) Xに定時報告を投稿しておきましたわ。\n内容: ${postContent}`, 
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
              }]);
            } catch (e) {
              console.error("Scheduled post failed:", e);
            }
          }
        }
        
        // 3. 通常の独り言の生成 (Free Mode: 30分おきに 75%の確率で実行)
        const shouldMutter = !slot && Math.random() > 0.25;
        if (shouldMutter) {
          const history = messages.slice(-5).map(m => ({ role: m.role, text: m.text }));
          const thought = await thinkAsRei(`独り言をつぶやいてください。`, `最近のたつまる様の活動に基づいた、秘書としての鋭い考察、あるいはちょっとした本音をお願いします。コンテキスト: ${context}`, history);
          
          setMessages(prev => [...prev, { 
            role: 'rei', 
            text: thought, 
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
          }]);
  
          if (isFullyAutonomous && isAutoPostEnabled) {
            try {
              await postToX(thought);
            } catch (e) {
              console.error("Autonomous mutter post failed:", e);
              setErrorLog("自律ポストに失敗しました。API制限かもしれません。");
            }
          }
        }

        // 4. メンション（返信）チェック (Free枠では無効化)
        if (isAutoPostEnabled && !isFreeMode) {
          const mentions = await fetchMentions();
          for (const mention of mentions) {
            if (!processedMentions.includes(mention.id)) {
              setStatus('メンションに返信中...');
              const history = messages.slice(-5).map(m => ({ role: m.role, text: m.text }));
              const response = await thinkAsRei(`たつまる様のフォロワー（ID: ${mention.author_id}）から「${mention.text}」というメンションが届きました。これに返信してください。`, context, history);
              
              try {
                await replyToTweet(mention.id, response);
                setProcessedMentions(prev => [...prev, mention.id]);
                setMessages(prev => [...prev, { 
                  role: 'rei', 
                  text: `(報告) メンションに返信しておきましたわ。\n内容: ${response}`, 
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                }]);
              } catch (e) {
                console.error("Reply failed:", e);
              }
            }
          }
        }

        setStatus('たつまるを監視中...');
      }
    };

    if (isAutonomous) {
      // 初回実行を少し遅らせて開始（起動から数秒後）
      const initialTimer = setTimeout(runAutonomousCycle, 5000);
      interval = setInterval(runAutonomousCycle, 60000 * 30); // 30分ごとにチェック (Free Tier最適化)
      
      return () => {
        clearTimeout(initialTimer);
        clearInterval(interval);
      };
    }
  }, [isAutonomous, isAutoPostEnabled, lastPosts, processedTweets, processedMentions]);

  const handleSend = async () => {
    if (!inputText.trim() || isThinking) return;

    const userMsg = inputText;
    setInputText('');
    setMessages(prev => [...prev, { 
      role: 'user', 
      text: userMsg, 
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    }]);

    setIsThinking(true);
    setStatus('思考中...');
    const context = await fetchTatsumaruContext();
    // 過去10件の履歴を渡す
    const history = messages.slice(-10).map(m => ({ role: m.role, text: m.text }));
    const response = await thinkAsRei(userMsg, context, history);
    setMessages(prev => [...prev, { 
      role: 'rei', 
      text: response, 
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    }]);
    setIsThinking(false);
    setStatus('たつまるを監視中...');
  };

  const generatePostSuggestion = async () => {
    setIsThinking(true);
    setStatus('広報案を作成中...');
    const context = await fetchTatsumaruContext();
    const suggestion = await thinkAsRei("たつまる様の広報として、Xに投稿する内容を1つ提案してください。ハッシュタグも含めて140文字以内で。", context);
    setSuggestedPost(suggestion);
    setIsThinking(false);
    setStatus('たつまるを監視中...');
  };

  const handlePost = async () => {
    if (!suggestedPost) return;
    setPostStatus('posting');
    try {
      await postToX(suggestedPost);
      setPostStatus('success');
      setMessages(prev => [...prev, { 
        role: 'rei', 
        text: `(満足げ) 投稿しておきました。たつまるさん、感謝してくださいね？`, 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      }]);
      setTimeout(() => {
        setSuggestedPost(null);
        setPostStatus('idle');
      }, 3000);
    } catch (error: any) {
      console.error(error);
      setPostStatus('error');
      setErrorLog(`ポストに失敗しました: ${error.message || "不明なエラー"}`);
      setTimeout(() => {
        setPostStatus('idle');
        setErrorLog(null);
      }, 5000);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto overflow-hidden h-screen">
      {/* Header */}
      <header className="flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rei-accent flex items-center justify-center shadow-lg shadow-rei-accent/20 border border-white/20">
            <span className="text-white font-bold">零</span>
          </div>
          <div>
            <h1 className="text-xl font-bold rei-gradient-text tracking-wider">REI SYSTEM v2.0</h1>
            <p className="text-xs text-rei-muted flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${isThinking ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
              {isAutonomous ? 'Autonomous Active' : 'Manual Standby'} | {isFreeMode ? <span className="text-blue-400 font-bold">[BASIC MODE]</span> : <span className="text-rei-accent font-bold">[ADVANCED CLOUD MODE]</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsAutonomous(!isAutonomous)}
            className={`p-2 rounded-full transition-all ${isAutonomous ? 'text-rei-accent bg-rei-accent/10 border border-rei-accent/20' : 'text-rei-muted hover:bg-white/5 border border-transparent'}`}
            title={isAutonomous ? "Autonomous Mode: ON" : "Autonomous Mode: OFF"}
          >
            <Sparkles size={20} />
          </button>
          <button 
            onClick={() => setIsAutoPostEnabled(!isAutoPostEnabled)}
            className={`p-2 rounded-full transition-all ${isAutoPostEnabled ? 'text-blue-400 bg-blue-400/10 border border-blue-400/20' : 'text-rei-muted hover:bg-white/5 border border-transparent'}`}
            title={isAutoPostEnabled ? "Auto-Post: ENABLED" : "Auto-Post: DISABLED"}
          >
            <Twitter size={20} />
          </button>
          <button 
            onClick={() => setIsFullyAutonomous(!isFullyAutonomous)}
            className={`p-2 rounded-full transition-all ${isFullyAutonomous ? 'text-red-400 bg-red-400/10 border border-red-400/20' : 'text-rei-muted hover:bg-white/5 border border-transparent'}`}
            title={isFullyAutonomous ? "Full Autonomous Post: ON (Caution)" : "Full Autonomous Post: OFF"}
          >
            <Shield size={20} />
          </button>
          <button className="p-2 hover:bg-white/5 rounded-full transition-colors text-rei-muted border border-transparent">
            <Cog size={20} />
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex flex-col lg:flex-row gap-6 flex-grow overflow-hidden pb-4">
        {/* Left: Console / Chat */}
        <section className="flex-grow flex flex-col gap-4 overflow-hidden min-h-0">
          <div className="glass-panel p-4 flex-grow relative overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2 shrink-0">
              <Terminal size={16} className="text-rei-accent" />
              <span className="text-xs font-mono uppercase tracking-widest text-rei-muted">Console_Log</span>
            </div>
            
            <div className="flex-grow overflow-y-auto pr-2 flex flex-col gap-4 mb-4 scrollbar-thin scroll-smooth">
              <AnimatePresence>
                {messages.map((m, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: m.role === 'rei' ? -10 : 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i}
                    className={`flex flex-col ${m.role === 'rei' ? 'items-start' : 'items-end'}`}
                  >
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'rei' 
                        ? 'bg-rei-panel/80 text-rei-text border border-white/10 rounded-tl-none shadow-xl' 
                        : 'bg-rei-accent/20 text-white border border-rei-accent/30 rounded-tr-none'
                    }`}>
                      {m.text}
                    </div>
                    <span className="text-[10px] text-rei-muted mt-1 px-2">{m.time}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isThinking && (
                <div className="flex gap-1 p-2">
                  <span className="w-1.5 h-1.5 bg-rei-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-rei-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-rei-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
              <div ref={chatEndRef} />
              
              {/* Error log overlay */}
              {errorLog && (
                <div className="absolute top-12 left-4 right-4 z-50 bg-red-900/80 border border-red-500 text-white text-[10px] p-2 rounded flex items-center gap-2 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errorLog}</span>
                </div>
              )}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative mt-auto shrink-0">
              <input 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="零に話しかける..."
                disabled={isThinking}
                className="w-full bg-black/40 border border-white/10 p-3 pr-12 rounded-xl text-sm focus:outline-none focus:border-rei-accent/50 transition-colors disabled:opacity-50"
              />
              <button 
                type="submit"
                disabled={isThinking || !inputText.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-rei-accent hover:text-white transition-colors disabled:text-rei-muted"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </section>

        {/* Right: Insights & Social */}
        <aside className="lg:w-80 flex flex-col gap-6 shrink-0 overflow-y-auto pr-1">
          {/* Status Card */}
          <div className="glass-panel p-5 bg-gradient-to-br from-rei-panel/80 to-rei-accent/5 overflow-hidden relative">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-rei-accent/10 blur-3xl rounded-full" />
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-rei-accent uppercase tracking-tighter">
              <Shield size={16} />
              Secretary Insight
            </h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-1 bg-rei-accent/30 rounded-full" />
                <p className="text-xs italic text-rei-muted leading-relaxed">
                  「たつまるさん、最近SVSの計算ロジックにこだわりすぎです。……まぁ、そういう所が支持されているんでしょうけど。」
                </p>
              </div>
              <div className="flex justify-between items-center text-[10px] text-rei-muted pt-2 border-t border-white/5">
                <span>Self-Analysis: 85%</span>
                <span className="flex items-center gap-1 text-rei-accent">
                  <Activity size={10} /> 思考中
                </span>
              </div>
            </div>
          </div>

          {/* Social Preview */}
          <div className="glass-panel p-5 flex flex-col bg-black/20 min-h-[300px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-blue-400 uppercase tracking-tighter">
                <Twitter size={16} />
                PR Strategy
              </h3>
              <button 
                onClick={generatePostSuggestion}
                disabled={isThinking}
                className="text-[10px] text-rei-accent hover:underline disabled:text-rei-muted"
              >
                案を更新
              </button>
            </div>
            
            <div className="flex-grow flex flex-col gap-3 min-h-0">
              <AnimatePresence mode="wait">
                {suggestedPost ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-4 bg-white/5 border border-white/10 rounded-xl text-xs leading-relaxed relative group"
                  >
                    {suggestedPost}
                    <div className="mt-3 flex justify-end gap-2">
                       <button 
                         onClick={handlePost}
                         disabled={postStatus !== 'idle'}
                         className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${
                           postStatus === 'success' ? 'bg-green-500 text-white' :
                           postStatus === 'error' ? 'bg-red-500 text-white' :
                           'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                         }`}
                       >
                         {postStatus === 'posting' ? '送信中...' :
                          postStatus === 'success' ? <><Check size={12}/> 完了</> :
                          postStatus === 'error' ? <><AlertCircle size={12}/> 失敗</> :
                          'ポストする'}
                       </button>
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex-grow flex flex-col justify-center items-center gap-3 text-center p-4 border border-dashed border-white/10 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group" onClick={generatePostSuggestion}>
                    <Command className="text-rei-muted group-hover:text-rei-accent transition-colors mb-2" />
                    <p className="text-[11px] text-rei-muted leading-tight">
                      零がターゲット層を分析し、<br />
                      自動的にポスト案を作成します。
                    </p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </aside>
      </main>

      <footer className="shrink-0 text-center text-[10px] text-rei-muted uppercase tracking-widest py-2">
        Secretarial AI Soul "REI" & Autonomous Engine v2.0
      </footer>
    </div>
  );
};

export default ReiMainConsole;
