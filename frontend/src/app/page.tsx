"use client";
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  ChevronLeft, ChevronRight, TriangleAlert, ShieldAlert, Shield, Zap,
  Cpu, Terminal, Search, Send, Plus, X, Globe, FileText, Sun, Moon,
  MessageSquare, Sparkles, Code
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

gsap.registerPlugin(useGSAP);

export default function Home() {
  const [screen, setScreen] = useState<'landing' | 'app' | 'sessions' | 'api' | 'transition'>('landing');
  const [nextScreen, setNextScreen] = useState<'landing' | 'app' | 'sessions' | 'api'>('app');
  const [isDarkMode, setIsDarkMode] = useState(true);

  const handleNavigate = (target: 'landing' | 'app' | 'sessions' | 'api') => {
    if (screen === target || screen === 'transition') return;
    setNextScreen(target);
    setScreen('transition');
    setTimeout(() => {
      setScreen(target);
    }, 2000);
  };

  // Apply dark mode to body
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  return (
    <AnimatePresence mode="wait">
      {screen === 'landing' && <LandingScreen key="landing" handleNavigate={handleNavigate} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />}
      {screen === 'app' && <AppScreen key="app" handleNavigate={handleNavigate} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />}
      {screen === 'sessions' && <SessionsScreen key="sessions" handleNavigate={handleNavigate} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />}
      {screen === 'api' && <ApiScreen key="api" handleNavigate={handleNavigate} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />}
      {screen === 'transition' && <TransitionScreen key="transition" />}
    </AnimatePresence>
  );
}

const Appbar = ({ onLogoClick, onApiClick, isDarkMode, setIsDarkMode }: any) => (
  <nav className="app-nav">
    <motion.div
      className="logo"
      onClick={onLogoClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-gradient)' }}></div>
      orb.
    </motion.div>
    <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem', fontWeight: 600, alignItems: 'center' }}>
      <span>Work</span>
      <span>About</span>
      <span>Info</span>
      <button
        onClick={onApiClick}
        title="API Access"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        <Code size={20} />
      </button>
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </div>
  </nav>
);

const LandingScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  return (
    <motion.div
      className="landing-wrapper"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.6 }}
    >
      {/* Navigation */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      </div>

      {/* HERO SECTION */}
      <section className="hero-section" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', background: 'var(--bg-color)' }}>

        {/* Cinematic Apogee/Payius Beam & Glow */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 0 }}>
          {/* Base ambient glow emanating from the bottom */}
          <div className="hero-ambient-glow" style={{ position: 'absolute', bottom: '-30%', left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '80vh', filter: 'blur(100px)' }} />

          {/* The intense central beam */}
          <motion.div
            className="hero-beam"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: '85vh', opacity: 1 }}
            transition={{ duration: 2, ease: "easeOut" }}
            style={{ position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)' }}
          />
        </div>

        {/* Bottom fade to blend with next section */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30vh', background: 'linear-gradient(to top, var(--bg-color) 10%, transparent)', zIndex: 1 }} />

        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', width: '100%', maxWidth: '1200px', padding: '0 2rem', marginTop: '4rem' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1.25rem', background: 'var(--panel-bg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-color)', marginBottom: '3rem', border: '1px solid var(--panel-border)', textTransform: 'uppercase', letterSpacing: '0.15em', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
              <ShieldAlert size={14} color="var(--accent-color)" />
              Backed by Total Oversight
            </div>

            <h1 style={{ fontSize: 'clamp(3.5rem, 9vw, 8rem)', fontWeight: 800, lineHeight: 0.95, letterSpacing: '-0.04em', color: 'var(--text-color)', marginBottom: '2.5rem' }}>
              Propel your <br />
              <span className="gradient-text-logo">local intelligence</span> <br />
              to the absolute peak.
            </h1>

            <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', margin: '0 auto 3.5rem auto', maxWidth: '650px', lineHeight: 1.6, fontWeight: 500 }}>
              Advanced reasoning systems and predictive models built for the unknown. Orb intercepts, evaluates, and protects every action on your machine.
            </p>

            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
              <button className="btn-pill" onClick={() => handleNavigate('app')} style={{ fontSize: '1.125rem', padding: '1.25rem 3.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
                Launch Dashboard
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="section-divider-stripes" />

      {/* SECTION 1: CORE PHILOSOPHY */}
      <section style={{ padding: '8rem 5%', maxWidth: '1400px', margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          style={{ marginBottom: '4rem', textAlign: 'center' }}
        >
          <div style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent-color)', fontWeight: 800, marginBottom: '1rem' }}>
            01. Core Philosophy
          </div>
          <h2 style={{ fontSize: 'clamp(2.5rem, 4vw, 3.5rem)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)', maxWidth: '800px', margin: '0 auto' }}>
            Transparent, local, and completely under your control.
          </h2>
        </motion.div>

        <div className="bento-grid-new">
          {/* LARGE CARD: Organic fluid blobs (Grow+ Inspiration) */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass-panel bento-large"
            style={{ position: 'relative', overflow: 'hidden', padding: '3rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'var(--panel-bg)' }}
          >
            {/* Blobs */}
            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '400px', height: '400px', background: 'var(--accent-alt)', borderRadius: '50%', filter: 'blur(80px)', opacity: 0.4 }} />
            <div style={{ position: 'absolute', bottom: '10%', right: '-10%', width: '350px', height: '350px', background: 'var(--accent-color)', borderRadius: '40%', filter: 'blur(60px)', opacity: 0.5 }} />

            <div style={{ position: 'relative', zIndex: 2, background: 'var(--bg-color)', padding: '2rem', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', border: '1px solid var(--panel-border)' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-color)', marginBottom: '0.5rem' }}>01</div>
              <h3 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-color)', letterSpacing: '-0.02em' }}>Total Oversight</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '1.125rem' }}>Monitor every inference cycle and token generated by your local models in real-time with comprehensive tracking interfaces.</p>
            </div>
          </motion.div>

          {/* SMALL CARD 1: Retro Stripes (Sakura Chroma Inspiration) */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="glass-panel"
            style={{ position: 'relative', overflow: 'hidden', padding: '2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--panel-bg)' }}
          >
            <div className="retro-stripes" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }} />

            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-color)', marginBottom: '0.5rem' }}>02</div>
              <h3 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-color)', letterSpacing: '-0.02em' }}>Human in Loop</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>Define strict policies requiring explicit human approval before execution.</p>
            </div>
          </motion.div>

          {/* SMALL CARD 2: Solid contrast / Gradient Orb */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="glass-panel"
            style={{ position: 'relative', overflow: 'hidden', padding: '2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--text-color)' }}
          >
            <div style={{ position: 'absolute', bottom: '-50%', right: '-20%', width: '300px', height: '300px', background: 'var(--danger-color)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.5 }} />

            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-alt)', marginBottom: '0.5rem' }}>03</div>
              <h3 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--bg-color)', letterSpacing: '-0.02em' }}>Local Only</h3>
              <p style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>Orb runs entirely on your machine. No telemetry sent to the cloud.</p>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="section-divider-stripes" />

      {/* SECTION 2: DEEP TELEMETRY */}
      <section style={{ padding: '8rem 5%', background: 'var(--panel-bg)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '4rem', alignItems: 'center' }}>
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--warning-color)', fontWeight: 800, marginBottom: '1rem' }}>
              02. Deep Telemetry
            </div>
            <h2 style={{ fontSize: 'clamp(2.5rem, 4vw, 3.5rem)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)', marginBottom: '1.5rem' }}>
              Know exactly what your AI is thinking.
            </h2>
            <p style={{ fontSize: '1.125rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '2rem' }}>
              Orb tracks compute usage, input/output token rates, and model latency. Our Hallucination Risk Index analyzes local outputs to warn you when the model might be straying from facts.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {['Token generation velocity tracking', 'Real-time hallucination scoring', 'Inference latency monitoring'].map((feature, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-color)', fontWeight: 600 }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>✓</div>
                  {feature}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="glass-panel"
            style={{ padding: '3rem', background: 'var(--bg-color)' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-bg)', paddingBottom: '1rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Hallucination Risk</span>
                <span style={{ color: 'var(--danger-color)', fontSize: '1.5rem', fontWeight: 800 }}>14.5%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-bg)', paddingBottom: '1rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Input Tokens</span>
                <span style={{ color: 'var(--text-color)', fontSize: '1.5rem', fontWeight: 800 }}>8,192</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Output Tokens</span>
                <span style={{ color: 'var(--text-color)', fontSize: '1.5rem', fontWeight: 800 }}>2,048</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="section-divider-stripes" />

      {/* SECTION 3: GRANULAR GUARDRAILS */}
      <section style={{ padding: '10rem 5%', maxWidth: '1400px', margin: '0 auto', textAlign: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--danger-color)', fontWeight: 800, marginBottom: '1rem' }}>
            03. Granular Guardrails
          </div>
          <h2 style={{ fontSize: 'clamp(2.5rem, 4vw, 3.5rem)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)', marginBottom: '1.5rem' }}>
            Define the boundaries.
          </h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '600px', margin: '0 auto 4rem auto' }}>
            Create complex rulesets for your local AI. Automatically block destructive bash commands, require human approval for web requests, and whitelist safe directories.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="glass-panel"
          style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', textAlign: 'left', background: 'var(--panel-bg)' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-color)', borderRadius: '12px', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>System Modifications</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Condition: `sudo` or `rm`</div>
              </div>
              <div style={{ padding: '0.25rem 0.75rem', background: 'var(--danger-color)', color: '#fff', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 700 }}>Blocked</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-color)', borderRadius: '12px', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>Network Outbound</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Condition: Any Domain</div>
              </div>
              <div style={{ padding: '0.25rem 0.75rem', background: 'var(--warning-color)', color: '#fff', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 700 }}>Requires Approval</div>
            </div>
          </div>
        </motion.div>
      </section>

      <div className="section-divider-stripes" />

      {/* FOOTER CTA */}
      <section style={{ padding: '8rem 5%', background: 'var(--accent-color)', color: '#fff', textAlign: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 style={{ fontSize: '3rem', fontWeight: 700, marginBottom: '2rem' }}>Ready to take back control?</h2>
          <button className="btn-pill" style={{ background: '#fff', color: 'var(--accent-color)' }} onClick={() => handleNavigate('app')}>
            Launch Dashboard
          </button>
        </motion.div>
      </section>
    </motion.div>
  );
};

const ToolMessage = ({ msg }: { msg: any }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <>
      <div 
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Terminal size={12} color="var(--accent-color)" />
        </div>
        <strong>System Execution</strong>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto', background: 'var(--panel-bg)', padding: '2px 8px', borderRadius: '12px' }}>
          {isExpanded ? 'Collapse' : 'Expand'}
        </span>
      </div>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="msg-content" style={{ marginTop: '0.5rem', background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{ borderRadius: '8px', margin: '1rem 0' }}
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code style={{ background: 'rgba(0,0,0,0.1)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontFamily: 'monospace' }} className={className} {...props}>
                        {children}
                      </code>
                    )
                  }
                }}
              >
                {msg.content || ''}
              </ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const AppScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const chatContainer = useRef<HTMLDivElement>(null);
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [showInstallAlert, setShowInstallAlert] = useState(false);
  const [chatMode, setChatMode] = useState('Ask');
  const [inputLimitIdx, setInputLimitIdx] = useState(4);
  const [outputLimitIdx, setOutputLimitIdx] = useState(2);
  const [performanceMode, setPerformanceMode] = useState<'low' | 'high'>('high');
  const userSetPerfModeRef = useRef(false);
  const hallucinationRisk = 14.5;
  const tokenPresets = [512, 1024, 2048, 4096, 8192, 16384, 32768, 128000];

  const [tools, setTools] = useState([
    { id: 'fs', name: 'Local FS', active: true, icon: <FileText size={14} /> },
    { id: 'bash', name: 'Bash Exec', active: true, icon: <Terminal size={14} /> },
    { id: 'web', name: 'Web Search', active: true, icon: <Globe size={14} /> }
  ]);
  const toggleTool = (id: string) => setTools(tools.map(t => t.id === id ? { ...t, active: !t.active } : t));

  const [policies, setPolicies] = useState([
    { id: 'fs', title: 'Read Local Files', condition: 'read_file', status: 'Allowed' },
    { id: 'bash', title: 'System Modifications', condition: 'execute_bash', status: 'Requires Approval' },
    { id: 'web', title: 'Web Search', condition: 'web_search', status: 'Allowed' }
  ]);

  const [pendingToolCall, setPendingToolCall] = useState<any>(null);

  const [isAddingRule, setIsAddingRule] = useState(false);
  const [ruleCondition, setRuleCondition] = useState('Contains Command');
  const [ruleTarget, setRuleTarget] = useState('');
  const [ruleAction, setRuleAction] = useState('Block');

  const conditionToTool: Record<string, string> = {
    'Contains Command': 'execute_bash',
    'Modifies File Path': 'read_file',
    'Network Outbound': 'web_search',
  };
  const actionToStatus: Record<string, string> = {
    'Allow': 'Allowed',
    'Block': 'Blocked',
    'Require Approval': 'Requires Approval',
  };

  const handleSaveRule = () => {
    if (!ruleTarget.trim()) return;
    const newPolicy = {
      id: `custom-${Date.now()}`,
      title: `${ruleCondition}: ${ruleTarget}`,
      condition: conditionToTool[ruleCondition],
      status: actionToStatus[ruleAction],
    };
    setPolicies([...policies, newPolicy]);
    setRuleTarget('');
    setRuleCondition('Contains Command');
    setRuleAction('Block');
    setIsAddingRule(false);
  };

  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are Orb, a local AI assistant. Ensure all actions are safe and approved.');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/models');
        if (!response.ok) {
          setShowInstallAlert(true);
          return;
        }
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          setSelectedModel(data.models[0].name);
        } else {
          setShowInstallAlert(true);
        }
      } catch (error) {
        setShowInstallAlert(true);
      }
    };
    fetchModels();

    const fetchSystemInfo = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/system-info');
        if (!response.ok) return;
        const data = await response.json();
        if (!userSetPerfModeRef.current && (data.recommendedMode === 'low' || data.recommendedMode === 'high')) {
          setPerformanceMode(data.recommendedMode);
        }
      } catch (error) {
        // keep default 'high' if system-info can't be reached
      }
    };
    fetchSystemInfo();
  }, []);

  const ollamaTools = [
    { type: 'function', function: { name: 'execute_bash', description: 'Run a bash command', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
    { type: 'function', function: { name: 'read_file', description: 'Read a local file', parameters: { type: 'object', properties: { filepath: { type: 'string', description: 'Absolute path to file' } }, required: ['filepath'] } } },
    { type: 'function', function: { name: 'web_search', description: 'Search the web', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } }
  ];

  const getPolicyStatus = (toolName: string) => {
    const policy = policies.find(p => p.condition === toolName);
    return policy ? policy.status : 'Requires Approval';
  };

  const processChat = async (currentMessages: any[]) => {
    setIsLoading(true);
    try {
      const toolPolicies = policies.reduce((acc, p) => {
        acc[p.condition] = p.status;
        return acc;
      }, {} as Record<string, string>);

      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages.map(m => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, name: m.name })),
          systemPrompt: systemPrompt,
          model: selectedModel,
          toolPolicies,
          performanceMode
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream available");
      
      const decoder = new TextDecoder('utf-8');
      
      let aiMessage = { role: 'assistant', content: '', type: 'normal', tool_calls: [] };
      let nextMessages = [...currentMessages, aiMessage];
      
      // Show empty message block immediately and stop "Thinking..." spinner
      setMessages(nextMessages);
      setIsLoading(false); 

      let buffer = '';
      let shouldContinueLoop = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            
            if (data.type === 'content_chunk') {
              aiMessage.content += data.content;
              setMessages([...nextMessages]);
            } else if (data.type === 'tool_call_intent') {
              aiMessage.tool_calls = data.toolCalls;
              setMessages([...nextMessages]);
            } else if (data.type === 'tool_result') {
              const toolMsg = { role: 'tool', name: data.name, content: data.result, type: 'tool_result' };
              nextMessages = [...nextMessages, toolMsg];
              setMessages(nextMessages);
            } else if (data.type === 'requires_approval') {
              setPendingToolCall(data.toolCall);
              // Backend paused execution. We break out of the stream reader.
              return; 
            } else if (data.type === 'error') {
              console.error('Agent error:', data.error);
            } else if (data.type === 'done') {
              // Agent loop finished natively
            }
          } catch (e) {
            console.error('Error parsing NDJSON line:', line, e);
          }
        }
      }

      // If the stream ended and we had tools executed (but not paused), we need to check if we should continue
      // Actually, the backend loop handles continuing. So when the stream ends normally, it means 'done'.
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'system', content: 'Network error communicating with backend.', type: 'normal' }]);
      setIsLoading(false);
    }
  };

  const executeToolAndContinue = async (toolCall: any, currentMessages: any[]) => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/execute_tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_name: toolCall.function.name, arguments: toolCall.function.arguments })
      });
      const toolData = await res.json();
      const toolMsg = { role: 'tool', content: toolData.result, type: 'tool_result', name: toolCall.function.name };
      const nextMessages = [...currentMessages, toolMsg];
      setMessages(nextMessages);
      // Resume the agent loop by calling chat again
      processChat(nextMessages);
    } catch (error) {
      console.error(error);
      const toolMsg = { role: 'tool', content: 'Execution error', type: 'tool_result' };
      const nextMessages = [...currentMessages, toolMsg];
      setMessages(nextMessages);
      processChat(nextMessages);
    }
  };

  const handleApproveTool = () => {
    if (pendingToolCall) {
      const call = pendingToolCall;
      setPendingToolCall(null);
      executeToolAndContinue(call, messages);
    }
  };

  const handleDenyTool = () => {
    if (pendingToolCall) {
      const toolMsg = { role: 'tool', content: `Action Denied by user for ${pendingToolCall.function.name}.`, type: 'blocked', reason: `User manually denied the use of ${pendingToolCall.function.name}` };
      const nextMessages = [...messages, toolMsg];
      setPendingToolCall(null);
      setMessages(nextMessages);
      processChat(nextMessages);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const userMessage = { role: 'user', content: inputValue, type: 'normal' };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputValue('');
    processChat(nextMessages);
  };

  useGSAP(() => {
    gsap.from('.msg-anim', {
      opacity: 0,
      y: 20,
      scale: 0.95,
      stagger: 0.15,
      duration: 0.5,
      ease: 'power3.out',
      delay: 0.3
    });
  }, { scope: chatContainer });

  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 1.02, filter: 'blur(15px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence>
        {showInstallAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
          >
            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.9 }}
              className="glass-panel"
              style={{ maxWidth: '500px', width: '90%', padding: '2.5rem', textAlign: 'center', background: 'var(--panel-bg)', position: 'relative' }}
            >
              <button className="icon-btn" onClick={() => setShowInstallAlert(false)} style={{ position: 'absolute', top: '1rem', right: '1rem' }}><X size={20} /></button>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--danger-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                <TriangleAlert size={32} color="#fff" />
              </div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-color)' }}>No Local Models Detected</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '2rem' }}>
                Orb requires a local model running via Ollama to function securely. We couldn't detect any installed models or Ollama might not be running.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <button className="btn-pill" style={{ width: '100%', padding: '1rem' }}>Download Ollama</button>
                </a>
                <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: '12px', border: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <code style={{ fontSize: '0.875rem', color: 'var(--text-color)' }}>ollama run llama3.1</code>
                  <button className="icon-btn" onClick={() => navigator.clipboard.writeText('ollama run llama3.1')}><FileText size={16} /></button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

      <div className="dashboard-content">
        {/* Left Panel */}
        <motion.aside
          layout
          className="glass-panel dash-panel dash-sidebar"
          animate={{
            width: isLeftOpen ? 340 : 64,
            padding: isLeftOpen ? '1.5rem' : '1.5rem 0.5rem',
          }}
          transition={{ type: 'spring', bounce: 0.25 }}
          style={{ overflow: 'hidden' }}
        >
          {isLeftOpen ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minWidth: 290, display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', overflowY: 'auto', paddingRight: '0.5rem' }}>
              <div className="dash-title">
                Telemetry & Guardrails
                <button className="icon-btn" onClick={() => setIsLeftOpen(false)}>
                  <ChevronLeft size={20} />
                </button>
              </div>

              <div className="stat-item glass-panel">
                <div className="stat-item-header">
                  <span>Hallucination Risk</span>
                  {hallucinationRisk > 10 ? (
                    <motion.div className="status-indicator" animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                      <div className="status-dot red"></div> High
                    </motion.div>
                  ) : (
                    <div className="status-indicator">
                      <div className="status-dot green"></div> Nominal
                    </div>
                  )}
                </div>
                <div className="stat-value-large" style={{ color: hallucinationRisk > 10 ? 'var(--danger-color)' : 'var(--text-color)' }}>
                  {hallucinationRisk}<span style={{ fontSize: '1.5rem', fontWeight: 500 }}>%</span>
                </div>
              </div>

              <div className="stat-item glass-panel">
                <div className="stat-item-header" style={{ marginBottom: '1rem' }}><span>Compute Settings</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}><Cpu size={14} style={{ display: 'inline', marginRight: '6px' }} /> Input Limit</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600 }}>{tokenPresets[inputLimitIdx]}</div>
                    </div>
                    <input type="range" className="range-slider" min={0} max={tokenPresets.length - 1} value={inputLimitIdx} onChange={(e) => setInputLimitIdx(Number(e.target.value))} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}><Terminal size={14} style={{ display: 'inline', marginRight: '6px' }} /> Output Limit</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600 }}>{tokenPresets[outputLimitIdx]}</div>
                    </div>
                    <input type="range" className="range-slider" min={0} max={tokenPresets.length - 1} value={outputLimitIdx} onChange={(e) => setOutputLimitIdx(Number(e.target.value))} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      <Cpu size={14} style={{ display: 'inline', marginRight: '6px' }} /> Performance Mode
                    </div>
                    <div className="mode-switcher" style={{ background: 'var(--bg-color)', border: '1px solid var(--panel-border)', borderRadius: '99px', padding: '2px' }}>
                      {(['low', 'high'] as const).map(m => (
                        <button
                          key={m}
                          className={`mode-btn ${performanceMode === m ? 'active' : ''}`}
                          onClick={() => { userSetPerfModeRef.current = true; setPerformanceMode(m); }}
                        >
                          {m === 'low' ? 'Low' : 'High'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="stat-item">
                <div className="stat-item-header" style={{ marginBottom: '1rem' }}>
                  <span>Active Integrations</span>
                  <button className="icon-btn" onClick={() => alert("Modal to add tool")}><Plus size={16} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {tools.map(tool => (
                    <div key={tool.id} className="tool-row">
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: tool.active ? 'var(--text-color)' : 'var(--text-muted)' }}>{tool.icon} {tool.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', color: tool.active ? 'var(--success-color)' : 'var(--text-muted)', fontWeight: 500 }}>{tool.active ? 'Active' : 'Disabled'}</span>
                        <label className="toggle-switch">
                          <input type="checkbox" checked={tool.active} onChange={() => toggleTool(tool.id)} />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="stat-item glass-panel" style={{ marginTop: 'auto' }}>
                <div className="stat-item-header" style={{ marginBottom: '1rem' }}><span>Behavioral Guardrails</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>System Pre-Prompt (System Prompt)</div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="e.g., Do not answer questions outside of linux system administration."
                    style={{
                      width: '100%',
                      minHeight: '80px',
                      background: 'var(--bg-color)',
                      border: '1px solid var(--panel-border)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      color: 'var(--text-color)',
                      fontSize: '0.875rem',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="icon-btn"
              onClick={() => setIsLeftOpen(true)}
              style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronRight size={24} />
            </motion.button>
          )}
        </motion.aside>

        {/* Center Panel */}
        <motion.main layout className="glass-panel dash-panel dash-center">
          <motion.div layout="position" className="dash-title" style={{ paddingBottom: '1.5rem', paddingLeft: '1rem', paddingRight: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-color)' }}>Hello Hari</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{ background: 'var(--panel-bg)', color: 'var(--text-color)', border: '1px solid var(--panel-border)', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', outline: 'none' }}
              >
                {availableModels.length > 0 ? availableModels.map((m: any) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                )) : (
                  <option value="">No models found</option>
                )}
              </select>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div className="telemetry-chip"><Shield size={14} color="var(--success-color)" /> <span>1,204 Actions Blocked</span></div>
                <div className="telemetry-chip"><Zap size={14} color="var(--warning-color)" /> <span>42.1k Tokens Saved</span></div>
              </div>
            </div>
            <button className="subtle-btn" onClick={() => handleNavigate('sessions')}>
              View all sessions
            </button>
          </motion.div>

          <div className="chat-container" ref={chatContainer}>
            <div className="chat-history">
              {messages.length === 0 && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.7, minHeight: '300px' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--panel-border)' }}>
                    <Sparkles size={32} color="var(--accent-color)" />
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-color)', marginBottom: '0.5rem' }}>Start a conversation</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Ask a question or command your local model.</p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`msg ${msg.role === 'user' ? 'msg-user' : 'msg-ai'} msg-anim`}>
                  {(msg.role === 'system' || msg.role === 'assistant') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={12} color="#fff" />
                      </div>
                      <strong>{selectedModel}</strong>
                    </div>
                  )}
                  {msg.role === 'tool' ? (
                    <ToolMessage msg={msg} />
                  ) : (
                    <div className="msg-content">
                      {msg.role === 'system' || msg.role === 'assistant' ? (
                        <ReactMarkdown
                          components={{
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  style={vscDarkPlus}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{ borderRadius: '8px', margin: '1rem 0' }}
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              ) : (
                                <code style={{ background: 'rgba(0,0,0,0.1)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontFamily: 'monospace' }} className={className} {...props}>
                                  {children}
                                </code>
                              )
                            }
                          }}
                        >
                          {msg.content || ''}
                        </ReactMarkdown>
                      ) : msg.content}
                    </div>
                  )}
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem', padding: '0.5rem', background: 'var(--panel-bg)', borderRadius: '8px' }}>
                      <Zap size={14} style={{ display: 'inline', marginRight: '6px' }} />
                      Attempted Tool Call: <code>{msg.tool_calls[0].function.name}</code>
                    </div>
                  )}
                  {msg.type === 'blocked' && (
                    <div className="action-card" style={{ marginTop: '1rem' }}>
                      <h4><ShieldAlert size={18} /> Action Blocked by Orb Policy</h4>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{msg.reason}</p>
                    </div>
                  )}
                </div>
              ))}
              {pendingToolCall && (
                <div className="msg msg-anim">
                  <div className="action-card" style={{ borderColor: 'var(--warning-color)' }}>
                    <h4 style={{ color: 'var(--warning-color)' }}><ShieldAlert size={18} /> Approval Required for {pendingToolCall.function.name}</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem', background: 'var(--bg-color)', padding: '0.5rem', borderRadius: '8px' }}>
                      <code>{JSON.stringify(pendingToolCall.function.arguments)}</code>
                    </p>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button onClick={handleDenyTool} style={{ background: 'var(--danger-color)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Deny Action</button>
                      <button onClick={handleApproveTool} style={{ background: 'transparent', color: 'var(--success-color)', border: '1px solid var(--success-color)', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Approve (Once)</button>
                    </div>
                  </div>
                </div>
              )}
              {isLoading && (
                <div className="msg msg-ai msg-anim">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={12} color="#fff" />
                    </div>
                    <strong>{selectedModel}</strong>
                  </div>
                  <div className="msg-content">Thinking...</div>
                </div>
              )}
            </div>

            <motion.div
              layout="position"
              className="chat-input-wrapper"
              initial={{ opacity: 0, y: 100, filter: 'blur(10px)', scale: 0.95 }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
              transition={{ type: 'spring', bounce: 0.3, duration: 0.8 }}
            >
              <div className="chat-input-toolbar">
                <div className="mode-switcher">
                  {['Ask', 'Search', 'Research'].map(mode => (
                    <button key={mode} className={`mode-btn ${chatMode === mode ? 'active' : ''}`} onClick={() => setChatMode(mode)}>
                      {mode === 'Ask' && <MessageSquare size={14} style={{ display: 'inline', marginRight: '6px' }} />}
                      {mode === 'Search' && <Search size={14} style={{ display: 'inline', marginRight: '6px' }} />}
                      {mode === 'Research' && <Sparkles size={14} style={{ display: 'inline', marginRight: '6px' }} />}
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chat-input-row">
                <input
                  type="text"
                  placeholder="Command the local AI..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button className="send-btn" onClick={handleSendMessage} disabled={isLoading}>
                  <Send size={18} />
                </button>
              </div>
            </motion.div>
          </div>
        </motion.main>

        {/* Right Panel */}
        <motion.aside
          layout
          className="glass-panel dash-panel dash-sidebar"
          animate={{
            width: isRightOpen ? 360 : 64,
            padding: isRightOpen ? '1.5rem' : '1.5rem 0.5rem',
          }}
          transition={{ type: 'spring', bounce: 0.25 }}
          style={{ overflow: 'hidden' }}
        >
          {isRightOpen ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minWidth: 312, display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
              <div className="dash-title">
                Policy Enforcement
                <button className="icon-btn" onClick={() => setIsRightOpen(false)}><ChevronRight size={20} /></button>
              </div>

              <div className="policy-block">
                <div className="dash-title-small" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Active Rules</span>
                  <span>Status</span>
                </div>
                <div className="policy-list">
                  {policies.map(policy => (
                    <div key={policy.id} className="rule-row">
                      <div>
                        <div className="rule-row-title">{policy.title}</div>
                        <div className="rule-row-desc">Condition: `{policy.condition}`</div>
                      </div>
                      <div className="status-indicator">
                        <div className={`status-dot ${policy.status === 'Allowed' ? 'green' : policy.status === 'Blocked' ? 'red' : 'yellow'}`}></div> {policy.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 'auto' }}>
                {isAddingRule ? (
                  <motion.div
                    layout
                    initial={{ opacity: 0, height: 0, filter: 'blur(5px)' }}
                    animate={{ opacity: 1, height: 'auto', filter: 'blur(0px)' }}
                    className="policy-form"
                    style={{ background: 'var(--bg-color)', padding: '1rem', borderRadius: '12px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0 }}>Add New Rule</h4>
                      <button className="icon-btn" onClick={() => setIsAddingRule(false)}><X size={16} /></button>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Condition</label>
                      <select className="form-select" value={ruleCondition} onChange={(e) => setRuleCondition(e.target.value)}>
                        <option>Contains Command</option>
                        <option>Modifies File Path</option>
                        <option>Network Outbound</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Target / Regex</label>
                      <input type="text" className="form-input" placeholder="e.g. rm -rf or /etc/*" value={ruleTarget} onChange={(e) => setRuleTarget(e.target.value)} />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Action</label>
                      <select className="form-select" value={ruleAction} onChange={(e) => setRuleAction(e.target.value)}>
                        <option>Allow</option>
                        <option>Block</option>
                        <option>Require Approval</option>
                      </select>
                    </div>

                    <button className="btn-pill" style={{ width: '100%', padding: '0.75rem', fontSize: '0.875rem', marginTop: '0.5rem' }} onClick={handleSaveRule} disabled={!ruleTarget.trim()}>Save Policy Rule</button>
                  </motion.div>
                ) : (
                  <button
                    onClick={() => setIsAddingRule(true)}
                    style={{ background: 'var(--bg-color)', border: 'none', color: 'var(--text-color)', padding: '1rem', borderRadius: '12px', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    <Plus size={16} /> Add New Policy Rule
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="icon-btn"
              onClick={() => setIsRightOpen(true)}
              style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={24} />
            </motion.button>
          )}
        </motion.aside>
      </div>
    </motion.div>
  );
};

const SessionsScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
        <div className="dash-title" style={{ paddingBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="icon-btn" onClick={() => handleNavigate('app')}><ChevronLeft size={20} /></button>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)' }}>Past Sessions</h1>
          </div>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '1rem' }}>
          {[
            { id: 1, title: 'System upgrade and dependency check', date: 'Today, 10:24 AM', tokens: '14.2k', risk: '14.5%', status: 'Blocked Actions' },
            { id: 2, title: 'Analyze frontend bundle size', date: 'Yesterday, 4:12 PM', tokens: '8.4k', risk: '2.1%', status: 'Completed' },
            { id: 3, title: 'Refactor user authentication flow', date: 'Jul 19, 2:45 PM', tokens: '32.1k', risk: '8.4%', status: 'Completed' },
            { id: 4, title: 'Scan home directory for large files', date: 'Jul 18, 9:15 AM', tokens: '4.2k', risk: '1.2%', status: 'Completed' },
          ].map(session => (
            <div key={session.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-color)' }}>{session.title}</h3>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{session.date}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="telemetry-chip"><Zap size={14} color="var(--warning-color)" /> <span>{session.tokens}</span></div>
                  <div className="telemetry-chip"><TriangleAlert size={14} color="var(--danger-color)" /> <span>{session.risk}</span></div>
                </div>
                <div className="status-indicator">
                  {session.status === 'Completed' ? <><div className="status-dot green"></div> {session.status}</> : <><div className="status-dot red"></div> {session.status}</>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

const ApiScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const baseUrl = 'http://localhost:3001/api/v1';
  const [copied, setCopied] = useState(false);

  const handleCopyBaseUrl = () => {
    navigator.clipboard.writeText(baseUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const [keys, setKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyTools, setNewKeyTools] = useState({ fs: false, bash: false, web: false });
  const [createdKey, setCreatedKey] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const fetchKeys = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/keys');
      const data = await res.json();
      setKeys(data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch('http://localhost:3001/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName, tools: newKeyTools }),
      });
      const data = await res.json();
      setCreatedKey(data);
      setNewKeyName('');
      setNewKeyTools({ fs: false, bash: false, web: false });
      fetchKeys();
    } catch (error) {
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!window.confirm('Revoke this API key? This cannot be undone.')) return;
    await fetch(`http://localhost:3001/api/keys/${id}`, { method: 'DELETE' });
    fetchKeys();
  };

  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="dash-title" style={{ paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="icon-btn" onClick={() => handleNavigate('app')}><ChevronLeft size={20} /></button>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)' }}>API Access</h1>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Base URL</div>
            <code style={{ fontSize: '1rem', color: 'var(--text-color)' }}>{baseUrl}</code>
          </div>
          <button className="icon-btn" onClick={handleCopyBaseUrl}>{copied ? 'Copied!' : <FileText size={16} />}</button>
        </div>

        {createdKey && (
          <div className="glass-panel" style={{ padding: '1.5rem', border: '1px solid var(--warning-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ color: 'var(--warning-color)' }}>New key created — copy it now, it won't be shown again</strong>
              <button className="icon-btn" onClick={() => setCreatedKey(null)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-color)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
              <code>{createdKey.key}</code>
              <button className="icon-btn" onClick={() => navigator.clipboard.writeText(createdKey.key)}><FileText size={16} /></button>
            </div>
          </div>
        )}

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div className="dash-title-small" style={{ marginBottom: '1rem' }}>Create New Key</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="text" className="form-input" placeholder="Key name, e.g. my-script" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {(['fs', 'bash', 'web'] as const).map(flag => (
                <label key={flag} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-color)' }}>
                  <input type="checkbox" checked={newKeyTools[flag]} onChange={(e) => setNewKeyTools({ ...newKeyTools, [flag]: e.target.checked })} />
                  {flag === 'fs' ? 'Local FS' : flag === 'bash' ? 'Bash Exec' : 'Web Search'}
                </label>
              ))}
            </div>
            <button className="btn-pill" style={{ alignSelf: 'flex-start', padding: '0.75rem 1.5rem' }} onClick={handleCreateKey} disabled={!newKeyName.trim() || isCreating}>Create Key</button>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div className="dash-title-small" style={{ marginBottom: '1rem' }}>Active Keys</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {keys.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No keys yet.</div>}
            {keys.map(k => (
              <div key={k.id} className="rule-row">
                <div>
                  <div className="rule-row-title">{k.name} <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{k.maskedKey}</code></div>
                  <div className="rule-row-desc">
                    {Object.entries(k.tools).filter(([, v]) => v).map(([t]) => t).join(', ') || 'no tools enabled'}
                    {k.revoked_at ? ' · revoked' : ''}
                  </div>
                </div>
                {!k.revoked_at && (
                  <button className="icon-btn" onClick={() => handleRevoke(k.id)}><X size={16} /></button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const TransitionScreen = () => (
  <motion.div
    key="transition"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0, filter: 'blur(10px)' }}
    transition={{ duration: 0.4 }}
    style={{
      width: '100vw', height: '100vh',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      background: 'var(--bg-color)',
      position: 'fixed', top: 0, left: 0, zIndex: 9999
    }}
  >
    <div className="retro-stripes-scroll-left" style={{ height: '32px', width: '100%' }} />

    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1.05, opacity: 1 }}
        transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }}
      >
        <div style={{ fontSize: '6rem', fontWeight: 800, letterSpacing: '-0.05em', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--accent-gradient)' }}></div>
          orb.
        </div>
      </motion.div>
    </div>

    <div className="retro-stripes-scroll-right" style={{ height: '32px', width: '100%' }} />
  </motion.div>
);
