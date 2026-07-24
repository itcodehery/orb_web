"use client";
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  ChevronLeft, ChevronRight, TriangleAlert, ShieldAlert, Shield, Zap,
  Cpu, Terminal, Send, Plus, X, Globe, FileText, Sun, Moon,
  MessageSquare, Sparkles, Code, Clock, Brain, RefreshCw, Square
} from 'lucide-react';
import { SignInButton, SignUpButton, Show, UserButton, useUser } from '@clerk/nextjs';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

gsap.registerPlugin(useGSAP);

// Mirrors backend/src/llm/performanceModes.ts PERFORMANCE_PROFILES — keep in sync if those change.
const PERFORMANCE_PROFILE_INFO: Record<'low' | 'high', { summary: string; ctxSize: number }> = {
  low: { summary: '2K context · 12-message history · model unloads after 1m idle · response length governed by Output Limit (hard backstop ~1.5×, capped for this tier)', ctxSize: 2048 },
  high: { summary: '8K context · full history · model stays loaded 30m idle · response length governed by Output Limit (hard backstop ~2×)', ctxSize: 8192 },
};

// Icons aren't JSON-serializable, so persisted session settings only ever carry
// { id, name, active } — this map reconstructs the icon by id after hydration.
const DEFAULT_TOOLS = [
  { id: 'fs', name: 'Local FS', icon: <FileText size={14} /> },
  { id: 'bash', name: 'Bash Exec', icon: <Terminal size={14} /> },
  { id: 'web', name: 'Web Search', icon: <Globe size={14} /> },
];

// Cloud models routed through backend/src/llm/Anthropic.ts (selected when the
// model name starts with 'claude-'). Requires ANTHROPIC_API_KEY server-side.
const CLAUDE_MODELS = [
  { name: 'claude-sonnet-5' },
  { name: 'claude-haiku-4-5' },
];

export default function Home() {
  const [screen, setScreen] = useState<'landing' | 'app' | 'sessions' | 'api' | 'memory' | 'transition'>('landing');
  const [nextScreen, setNextScreen] = useState<'landing' | 'app' | 'sessions' | 'api' | 'memory'>('app');
  const [isDarkMode, setIsDarkMode] = useState(true);

  const handleNavigate = (target: 'landing' | 'app' | 'sessions' | 'api' | 'memory') => {
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
      {screen === 'memory' && <MemoryScreen key="memory" handleNavigate={handleNavigate} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />}
      {screen === 'transition' && <TransitionScreen key="transition" />}
    </AnimatePresence>
  );
}

const Appbar = ({ onLogoClick, onChatClick, onApiClick, onMemoryClick, isDarkMode, setIsDarkMode }: any) => (
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
      <button
        onClick={onChatClick}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <MessageSquare size={16} /> Chat
      </button>
      <button
        onClick={onApiClick}
        title="API Access"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        <Code size={20} />
      </button>
      <button
        onClick={onMemoryClick}
        title="Memory"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        <Brain size={20} />
      </button>
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="subtle-btn" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}>Sign In</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="subtle-btn" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem', background: 'var(--accent-color)', color: '#fff' }}>Sign Up</button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
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
        <Appbar onLogoClick={() => handleNavigate('landing')} onChatClick={() => handleNavigate('app')} onApiClick={() => handleNavigate('api')} onMemoryClick={() => handleNavigate('memory')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
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

const ThinkingIndicator = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
    <div style={{ position: 'relative', width: 24, height: 24 }}>
      <motion.div
        style={{ position: 'absolute', inset: -7, borderRadius: '50%', background: 'var(--accent-gradient)', filter: 'blur(8px)' }}
        animate={{ opacity: [0.25, 0.65, 0.25], scale: [0.85, 1.2, 0.85] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
      >
        <Sparkles size={12} color="#fff" />
      </motion.div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-color)', display: 'inline-block' }}
          animate={{ y: [0, -6, 0], opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
        />
      ))}
    </div>
  </div>
);

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
  const { isSignedIn, isLoaded, user } = useUser();
  const chatContainer = useRef<HTMLDivElement>(null);
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [showInstallAlert, setShowInstallAlert] = useState(false);
  const [chatMode, setChatMode] = useState('Auto');
  const [inputLimitIdx, setInputLimitIdx] = useState(4);
  const [outputLimitIdx, setOutputLimitIdx] = useState(2);
  const [performanceMode, setPerformanceMode] = useState<'low' | 'high'>('high');
  const userSetPerfModeRef = useRef(false);
  const userSetModelRef = useRef(false);
  const [contextTokens, setContextTokens] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ctxPercent = Math.min(100, Math.round((contextTokens / PERFORMANCE_PROFILE_INFO[performanceMode].ctxSize) * 100));
  const tokenPresets = [512, 1024, 2048, 4096, 8192, 16384, 32768, 128000];

  const [tools, setTools] = useState(DEFAULT_TOOLS.map(t => ({ ...t, active: true })));
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

  const handleNewChat = async () => {
    try {
      await fetch('http://localhost:3001/api/sessions/active/complete', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Failed to complete session:', error);
    }
    setMessages([]);
    setPolicies([
      { id: 'fs', title: 'Read Local Files', condition: 'read_file', status: 'Allowed' },
      { id: 'bash', title: 'System Modifications', condition: 'execute_bash', status: 'Requires Approval' },
      { id: 'web', title: 'Web Search', condition: 'web_search', status: 'Allowed' },
    ]);
    setTools(DEFAULT_TOOLS.map(t => ({ ...t, active: true })));
    setSystemPrompt('You are Orb, a local AI assistant. Ensure all actions are safe and approved.');
  };

  const [messages, setMessages] = useState<any[]>([]);

  const messagesWithLatency = messages.filter((m: any) => m.role === 'assistant' && typeof m.totalMs === 'number');
  const avgLatencyMs = messagesWithLatency.length
    ? Math.round(messagesWithLatency.reduce((sum: number, m: any) => sum + m.totalMs, 0) / messagesWithLatency.length)
    : null;

  const messagesWithRisk = messages.filter((m: any) => m.role === 'assistant' && typeof m.riskScore === 'number');
  const hallucinationRisk = messagesWithRisk.length
    ? Math.round(messagesWithRisk.reduce((sum: number, m: any) => sum + m.riskScore, 0) / messagesWithRisk.length)
    : 0;

  const refreshActiveSession = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/sessions/active', { credentials: 'include' });
      if (!res.ok) return;
      const session = await res.json();
      if (!Array.isArray(session?.messages)) return;
      setMessages((prev: any[]) => prev.map((m, i) => {
        const serverMsg = session.messages[i];
        return serverMsg && typeof serverMsg.riskScore === 'number' ? { ...m, riskScore: serverMsg.riskScore } : m;
      }));
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  };

  const [inputValue, setInputValue] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are Orb, a local AI assistant. Ensure all actions are safe and approved.');
  const [isLoading, setIsLoading] = useState(false);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn) return;
    const hydrate = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/sessions/active', { credentials: 'include' });
        if (!res.ok) return;
        const session = await res.json();
        if (!session) return;

        if (Array.isArray(session.messages)) setMessages(session.messages);
        if (Array.isArray(session.policies) && session.policies.length) setPolicies(session.policies);

        const s = session.settings || {};
        if (s.systemPrompt) setSystemPrompt(s.systemPrompt);
        if (s.selectedModel) {
          setSelectedModel(s.selectedModel);
          userSetModelRef.current = true;
        }
        if (s.chatMode) setChatMode(s.chatMode);
        if (s.performanceMode) {
          setPerformanceMode(s.performanceMode);
          userSetPerfModeRef.current = true;
        }
        if (typeof s.inputLimitIdx === 'number') setInputLimitIdx(s.inputLimitIdx);
        if (typeof s.outputLimitIdx === 'number') setOutputLimitIdx(s.outputLimitIdx);
        if (Array.isArray(s.tools) && s.tools.length) {
          setTools(s.tools.map((t: any) => ({ ...t, icon: DEFAULT_TOOLS.find(d => d.id === t.id)?.icon })));
        }
      } catch (error) {
        console.error('Failed to hydrate active session:', error);
      } finally {
        hasHydratedRef.current = true;
      }
    };
    hydrate();
  }, [isSignedIn]);

  useEffect(() => {
    if (!hasHydratedRef.current || !isSignedIn) return;

    const timeoutId = setTimeout(() => {
      fetch('http://localhost:3001/api/sessions/active', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policies,
          settings: {
            systemPrompt,
            selectedModel,
            chatMode,
            performanceMode,
            inputLimitIdx,
            outputLimitIdx,
            tools: tools.map(({ id, name, active }) => ({ id, name, active })),
          },
        }),
      }).catch(err => console.error('Failed to save session settings:', err));
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [policies, systemPrompt, selectedModel, chatMode, performanceMode, inputLimitIdx, outputLimitIdx, tools, isSignedIn]);

  useEffect(() => {
    const fetchModels = async () => {
      let ollamaModels: any[] = [];
      try {
        const response = await fetch('http://localhost:3001/api/models');
        if (response.ok) {
          const data = await response.json();
          ollamaModels = data.models || [];
        }
      } catch (error) {
        // Ollama unreachable — Claude models below can still be used if ANTHROPIC_API_KEY is configured.
      }
      const models = [...ollamaModels, ...CLAUDE_MODELS];
      setAvailableModels(models);
      if (!userSetModelRef.current && models.length > 0) {
        setSelectedModel(models[0].name);
      }
      if (ollamaModels.length === 0) {
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
    setIsGenerating(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const requestStartedAt = performance.now();
    try {
      const toolPolicies = policies.reduce((acc, p) => {
        acc[p.condition] = p.status;
        return acc;
      }, {} as Record<string, string>);

      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          messages: currentMessages.map(m => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, name: m.name, tool_call_id: m.tool_call_id })),
          systemPrompt: systemPrompt,
          model: selectedModel,
          toolPolicies,
          performanceMode,
          chatMode,
          outputLimitTokens: tokenPresets[outputLimitIdx]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream available");
      
      const decoder = new TextDecoder('utf-8');
      
      let aiMessage: any = {
        role: 'assistant', content: '', type: 'normal', tool_calls: [],
        firstTokenMs: null as number | null, totalMs: null as number | null,
      };
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
              if (aiMessage.firstTokenMs === null) {
                aiMessage.firstTokenMs = performance.now() - requestStartedAt;
              }
              aiMessage.content += data.content;
              setMessages([...nextMessages]);
            } else if (data.type === 'tool_call_intent') {
              aiMessage.tool_calls = data.toolCalls;
              setMessages([...nextMessages]);
            } else if (data.type === 'tool_result') {
              const toolMsg = { role: 'tool', name: data.name, content: data.result, type: 'tool_result', tool_call_id: data.toolCallId };
              nextMessages = [...nextMessages, toolMsg];
              setMessages(nextMessages);
            } else if (data.type === 'requires_approval') {
              setPendingToolCall(data.toolCall);
              // Backend paused execution. We break out of the stream reader.
              setIsGenerating(false);
              abortControllerRef.current = null;
              return;
            } else if (data.type === 'error') {
              console.error('Agent error:', data.error);
            } else if (data.type === 'done') {
              if (typeof data.contextTokens === 'number') {
                setContextTokens(data.contextTokens);
              }
            }
          } catch (e) {
            console.error('Error parsing NDJSON line:', line, e);
          }
        }
      }

      // If the stream ended and we had tools executed (but not paused), we need to check if we should continue
      // Actually, the backend loop handles continuing. So when the stream ends normally, it means 'done'.
      aiMessage.totalMs = performance.now() - requestStartedAt;
      setMessages([...nextMessages]);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'system', content: 'Response stopped.', type: 'normal' }]);
      } else {
        console.error(error);
        setMessages(prev => [...prev, { role: 'system', content: 'Network error communicating with backend.', type: 'normal' }]);
      }
      setIsLoading(false);
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const executeToolAndContinue = async (toolCall: any, currentMessages: any[]) => {
    setIsLoading(true);
    setIsGenerating(true);
    try {
      const res = await fetch('http://localhost:3001/api/execute_tool', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_name: toolCall.function.name, arguments: toolCall.function.arguments })
      });
      const toolData = await res.json();
      const toolMsg = { role: 'tool', content: toolData.result, type: 'tool_result', name: toolCall.function.name, tool_call_id: toolCall.id };
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
      const toolMsg = { role: 'tool', content: `Action Denied by user for ${pendingToolCall.function.name}.`, type: 'blocked', reason: `User manually denied the use of ${pendingToolCall.function.name}`, name: pendingToolCall.function.name, tool_call_id: pendingToolCall.id };
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

  const handleStop = () => {
    abortControllerRef.current?.abort();
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

  if (isLoaded && !isSignedIn) {
    return (
      <motion.div
        className="dashboard-wrapper"
        initial={{ opacity: 0, scale: 1.02, filter: 'blur(15px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <Appbar onLogoClick={() => handleNavigate('landing')} onChatClick={() => handleNavigate('app')} onApiClick={() => handleNavigate('api')} onMemoryClick={() => handleNavigate('memory')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
        <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', textAlign: 'center', padding: '2rem' }}>
          <Shield size={28} color="var(--text-muted)" />
          <div style={{ fontWeight: 600, fontSize: '1.125rem', color: 'var(--text-color)' }}>Sign in to chat</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: 360 }}>
            Orb remembers facts about you across conversations, so chatting requires a signed-in account.
          </div>
          <SignInButton mode="modal">
            <button className="btn-pill" style={{ marginTop: '0.5rem', padding: '0.75rem 1.5rem' }}>Sign In</button>
          </SignInButton>
        </div>
      </motion.div>
    );
  }

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
      <Appbar onLogoClick={() => handleNavigate('landing')} onChatClick={() => handleNavigate('app')} onApiClick={() => handleNavigate('api')} onMemoryClick={() => handleNavigate('memory')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button className="icon-btn" onClick={refreshActiveSession} title="Refresh"><RefreshCw size={14} /></button>
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
                </div>
                <div className="stat-value-large" style={{ color: hallucinationRisk > 10 ? 'var(--danger-color)' : 'var(--text-color)' }}>
                  {hallucinationRisk}<span style={{ fontSize: '1.5rem', fontWeight: 500 }}>%</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {messagesWithRisk.length ? `Avg over ${messagesWithRisk.length} scored ${messagesWithRisk.length === 1 ? 'reply' : 'replies'}` : 'Scores land ~1-2 min after each reply — hit refresh'}
                </div>
              </div>

              <div className="stat-item glass-panel">
                <div className="stat-item-header">
                  <span>Avg Latency</span>
                </div>
                <div className="stat-value-large" style={{ color: 'var(--text-color)' }}>
                  {avgLatencyMs != null ? (avgLatencyMs / 1000).toFixed(2) : '—'}<span style={{ fontSize: '1.5rem', fontWeight: 500 }}>s</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {messagesWithLatency.length ? `Avg over ${messagesWithLatency.length} ${messagesWithLatency.length === 1 ? 'reply' : 'replies'} this session` : 'No replies yet'}
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
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>Not yet enforced — reserved for a future context-trimming feature.</div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}><Terminal size={14} style={{ display: 'inline', marginRight: '6px' }} /> Output Limit</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600 }}>{tokenPresets[outputLimitIdx]}</div>
                    </div>
                    <input type="range" className="range-slider" min={0} max={tokenPresets.length - 1} value={outputLimitIdx} onChange={(e) => setOutputLimitIdx(Number(e.target.value))} />
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>Sent to the model as a soft target it's asked to wrap up within, with a generous hard backstop so it can't run away.</div>
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
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                      {PERFORMANCE_PROFILE_INFO[performanceMode].summary}
                      <br />
                      {userSetPerfModeRef.current ? 'Manually set' : 'Auto-selected for this system'}
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
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-color)' }}>Hello {user?.firstName || 'there'}</span>
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
                <div className="telemetry-chip">
                  <span>Ctx:</span>
                  <div className="ctx-bar">
                    <div
                      className={`ctx-bar-fill ${ctxPercent >= 90 ? 'ctx-danger' : ctxPercent >= 70 ? 'ctx-warn' : ''}`}
                      style={{ width: `${ctxPercent}%` }}
                    />
                  </div>
                  <span style={{ color: ctxPercent >= 90 ? 'var(--danger-color)' : ctxPercent >= 70 ? 'var(--warning-color)' : 'var(--success-color)' }}>
                    {ctxPercent}%
                  </span>
                </div>
                <div className="telemetry-chip"><Shield size={14} color="var(--success-color)" /> <span>1,204 Actions Blocked</span></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="subtle-btn" onClick={handleNewChat}>
                New Chat
              </button>
              <button className="subtle-btn" onClick={() => handleNavigate('sessions')}>
                View all sessions
              </button>
            </div>
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
                  {msg.role === 'assistant' && msg.totalMs != null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <Clock size={12} />
                      {msg.firstTokenMs != null && <span>first token {(msg.firstTokenMs / 1000).toFixed(2)}s ·</span>}
                      <span>total {(msg.totalMs / 1000).toFixed(2)}s</span>
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
                  <ThinkingIndicator />
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
                  {[
                    { mode: 'Auto', icon: RefreshCw, color: 'var(--danger-color)' },
                    { mode: 'Policy', icon: Shield, color: 'var(--warning-color)' },
                    { mode: 'Manual', icon: MessageSquare, color: 'var(--accent-color)' },
                  ].map(({ mode, icon: Icon, color }) => {
                    const isActive = chatMode === mode;
                    return (
                      <button
                        key={mode}
                        className={`mode-btn ${isActive ? 'active' : ''}`}
                        onClick={() => setChatMode(mode)}
                        style={isActive ? { color, boxShadow: `0 0 0 1px ${color}` } : undefined}
                      >
                        <Icon size={14} style={{ display: 'inline', marginRight: '6px' }} />
                        {mode}
                      </button>
                    );
                  })}
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
                {isGenerating ? (
                  <button className="send-btn" onClick={handleStop} style={{ background: 'var(--danger-color)' }} title="Stop generating">
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button className="send-btn" onClick={handleSendMessage}>
                    <Send size={18} />
                  </button>
                )}
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
  const { isSignedIn, isLoaded } = useUser();
  const [sessions, setSessions] = useState<any[]>([]);

  const fetchSessions = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/sessions', { credentials: 'include' });
      if (!res.ok) { setSessions([]); return; }
      const data = await res.json();
      setSessions(data);
    } catch (error) {
      console.error(error);
      setSessions([]);
    }
  };

  useEffect(() => {
    if (isSignedIn) fetchSessions();
    else setSessions([]);
  }, [isSignedIn]);

  const handleResume = async (id: number) => {
    try {
      await fetch(`http://localhost:3001/api/sessions/${id}/resume`, { method: 'POST', credentials: 'include' });
      handleNavigate('app');
    } catch (error) {
      console.error('Failed to resume session:', error);
    }
  };

  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <Appbar onLogoClick={() => handleNavigate('landing')} onChatClick={() => handleNavigate('app')} onApiClick={() => handleNavigate('api')} onMemoryClick={() => handleNavigate('memory')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
        <div className="dash-title" style={{ paddingBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="icon-btn" onClick={() => handleNavigate('app')}><ChevronLeft size={20} /></button>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)' }}>Past Sessions</h1>
          </div>
        </div>

        {!isLoaded ? null : !isSignedIn ? (
          <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <MessageSquare size={28} color="var(--text-muted)" />
            <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>Sign in to view your sessions</div>
            <SignInButton mode="modal">
              <button className="btn-pill" style={{ marginTop: '0.5rem', padding: '0.75rem 1.5rem' }}>Sign In</button>
            </SignInButton>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '1rem' }}>
            {sessions.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No sessions yet. Start chatting to create one.</div>}
            {sessions.map((session: any) => (
              <div key={session.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => handleResume(session.id)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-color)' }}>{session.title}</h3>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{new Date(session.updated_at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div className="telemetry-chip"><Clock size={14} color="var(--warning-color)" /> <span>{session.avgLatencyMs != null ? `${(session.avgLatencyMs / 1000).toFixed(1)}s avg` : '—'}</span></div>
                    <div className="telemetry-chip"><TriangleAlert size={14} color="var(--danger-color)" /> <span>{session.avgRiskScore != null ? `${session.avgRiskScore}% risk` : '—'}</span></div>
                  </div>
                  <div className="status-indicator">
                    {session.status === 'active' ? <><div className="status-dot green"></div> Active</> : <><div className="status-dot green"></div> Completed</>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const ApiScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const { isSignedIn, isLoaded } = useUser();
  const baseUrl = 'http://localhost:3001/api/v1';
  const [copied, setCopied] = useState(false);

  const handleCopyBaseUrl = () => {
    navigator.clipboard.writeText(baseUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const [connectors, setConnectors] = useState<any[]>([]);
  const [connectorInputs, setConnectorInputs] = useState<Record<string, string>>({});
  const [savingConnector, setSavingConnector] = useState<string | null>(null);

  const fetchConnectors = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/connectors', { credentials: 'include' });
      if (!res.ok) { setConnectors([]); return; }
      setConnectors(await res.json());
    } catch (error) {
      console.error(error);
      setConnectors([]);
    }
  };

  useEffect(() => {
    if (isSignedIn) fetchConnectors();
    else setConnectors([]);
  }, [isSignedIn]);

  const handleSaveConnector = async (provider: string) => {
    const apiKey = connectorInputs[provider]?.trim();
    if (!apiKey) return;
    setSavingConnector(provider);
    try {
      await fetch('http://localhost:3001/api/connectors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      setConnectorInputs({ ...connectorInputs, [provider]: '' });
      fetchConnectors();
    } catch (error) {
      console.error(error);
    } finally {
      setSavingConnector(null);
    }
  };

  const handleRemoveConnector = async (provider: string) => {
    if (!window.confirm('Remove this connector\'s stored API key?')) return;
    await fetch(`http://localhost:3001/api/connectors/${provider}`, { method: 'DELETE', credentials: 'include' });
    fetchConnectors();
  };

  const [keys, setKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyTools, setNewKeyTools] = useState({ fs: false, bash: false, web: false });
  const [createdKey, setCreatedKey] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const fetchKeys = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/keys', { credentials: 'include' });
      if (!res.ok) { setKeys([]); return; }
      const data = await res.json();
      setKeys(data);
    } catch (error) {
      console.error(error);
      setKeys([]);
    }
  };

  useEffect(() => {
    if (isSignedIn) fetchKeys();
    else setKeys([]);
  }, [isSignedIn]);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch('http://localhost:3001/api/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName, tools: newKeyTools }),
      });
      if (!res.ok) { console.error('Failed to create key:', await res.text()); return; }
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
    await fetch(`http://localhost:3001/api/keys/${id}`, { method: 'DELETE', credentials: 'include' });
    fetchKeys();
  };

  const generateRandomName = () => {
    const adjectives = ['swift', 'cosmic', 'silent', 'amber', 'lunar', 'crimson', 'quantum', 'nimble'];
    const nouns = ['falcon', 'orbit', 'ember', 'cipher', 'nebula', 'vector', 'pulse', 'raptor'];
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    const suffix = Math.floor(1000 + Math.random() * 9000);
    setNewKeyName(`${pick(adjectives)}-${pick(nouns)}-${suffix}`);
  };

  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/audit-logs?limit=50', { credentials: 'include' });
      if (!res.ok) { setAuditLogs([]); return; }
      const data = await res.json();
      setAuditLogs(data);
    } catch (error) {
      console.error(error);
      setAuditLogs([]);
    }
  };

  useEffect(() => {
    if (isSignedIn) fetchAuditLogs();
    else setAuditLogs([]);
  }, [isSignedIn]);

  const [analytics, setAnalytics] = useState<any>(null);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/analytics/summary?hours=24', { credentials: 'include' });
      if (!res.ok) { setAnalytics(null); return; }
      setAnalytics(await res.json());
    } catch (error) {
      console.error(error);
      setAnalytics(null);
    }
  };

  useEffect(() => {
    if (isSignedIn) fetchAnalytics();
    else setAnalytics(null);
  }, [isSignedIn]);

  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <Appbar onLogoClick={() => handleNavigate('landing')} onChatClick={() => handleNavigate('app')} onApiClick={() => handleNavigate('api')} onMemoryClick={() => handleNavigate('memory')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

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

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div className="dash-title-small" style={{ marginBottom: '0.25rem' }}>Model Connectors</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Connect additional model providers alongside your local Ollama models. Keys are stored locally and never leave this machine.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {connectors.map(c => (
              <div key={c.provider} className="rule-row" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div className="rule-row-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {c.name}
                    <div className="status-indicator">
                      <div className={`status-dot ${c.configured ? 'green' : 'yellow'}`}></div>
                      {c.configured ? `Connected${c.source === 'environment' ? ' (via .env)' : ''}` : 'Not connected'}
                    </div>
                  </div>
                  {c.configured ? (
                    <div className="rule-row-desc">{c.maskedKey}</div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <input
                        type="password"
                        className="form-input"
                        placeholder="Paste API key"
                        value={connectorInputs[c.provider] || ''}
                        onChange={(e) => setConnectorInputs({ ...connectorInputs, [c.provider]: e.target.value })}
                      />
                      <button
                        className="btn-pill"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', whiteSpace: 'nowrap' }}
                        onClick={() => handleSaveConnector(c.provider)}
                        disabled={!connectorInputs[c.provider]?.trim() || savingConnector === c.provider}
                      >
                        Connect
                      </button>
                    </div>
                  )}
                </div>
                {c.configured && c.source === 'database' && (
                  <button className="icon-btn" onClick={() => handleRemoveConnector(c.provider)}><X size={16} /></button>
                )}
              </div>
            ))}
          </div>
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

        {!isLoaded ? null : !isSignedIn ? (
          <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <Shield size={28} color="var(--text-muted)" />
            <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>Sign in to manage API keys</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: 360 }}>
              Key creation, revocation, and audit history are only visible to a signed-in account.
            </div>
            <SignInButton mode="modal">
              <button className="btn-pill" style={{ marginTop: '0.5rem', padding: '0.75rem 1.5rem' }}>Sign In</button>
            </SignInButton>
          </div>
        ) : (
          <>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div className="dash-title-small" style={{ marginBottom: '1rem' }}>Create New Key</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="text" className="form-input" placeholder="Key name, e.g. my-script" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} style={{ flex: 1 }} />
                  <button className="icon-btn" title="Generate random name" onClick={generateRandomName}><Sparkles size={16} /></button>
                </div>
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

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div className="dash-title-small">Analytics (last 24h)</div>
                <button className="icon-btn" onClick={fetchAnalytics}><RefreshCw size={14} /></button>
              </div>

              {analytics && analytics.anomalies.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  {analytics.anomalies.map((a: any, i: number) => (
                    <div key={i} className="action-card" style={{ borderColor: a.severity === 'critical' ? 'var(--danger-color)' : 'var(--warning-color)' }}>
                      <h4 style={{ color: a.severity === 'critical' ? 'var(--danger-color)' : 'var(--warning-color)' }}>
                        <TriangleAlert size={16} /> {a.severity === 'critical' ? 'Critical' : 'Warning'}
                      </h4>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{a.message}</p>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="stat-item glass-panel">
                  <div className="stat-item-header"><span>Total Requests</span></div>
                  <div className="stat-value-large">{analytics?.totalRequests ?? '—'}</div>
                </div>
                <div className="stat-item glass-panel">
                  <div className="stat-item-header"><span>Blocked</span></div>
                  <div className="stat-value-large" style={{ color: (analytics?.blockedCount ?? 0) > 0 ? 'var(--warning-color)' : 'var(--text-color)' }}>{analytics?.blockedCount ?? '—'}</div>
                </div>
                <div className="stat-item glass-panel">
                  <div className="stat-item-header"><span>Errors</span></div>
                  <div className="stat-value-large" style={{ color: (analytics?.errorCount ?? 0) > 0 ? 'var(--danger-color)' : 'var(--text-color)' }}>{analytics?.errorCount ?? '—'}</div>
                </div>
                <div className="stat-item glass-panel">
                  <div className="stat-item-header"><span>Avg Latency</span></div>
                  <div className="stat-value-large">{analytics ? `${(analytics.avgLatencyMs / 1000).toFixed(2)}s` : '—'}</div>
                </div>
              </div>

              {analytics && analytics.hourlyVolume.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Request volume by hour</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '60px' }}>
                    {analytics.hourlyVolume.map((h: any, i: number) => {
                      const max = Math.max(...analytics.hourlyVolume.map((x: any) => x.count));
                      return (
                        <div
                          key={i}
                          title={`${h.hour}: ${h.count} requests`}
                          style={{ flex: 1, minWidth: 4, height: `${Math.max(6, (h.count / max) * 100)}%`, background: 'var(--accent-gradient)', borderRadius: '3px 3px 0 0' }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {analytics && analytics.topTools.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Most-used tools</div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {analytics.topTools.map((t: any) => (
                      <div key={t.name} className="telemetry-chip"><Zap size={14} color="var(--accent-color)" /> <span>{t.name} · {t.count}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div className="dash-title-small">Recent API Activity</div>
                <button className="icon-btn" onClick={fetchAuditLogs}>Refresh</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {auditLogs.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No API activity yet.</div>}
                {auditLogs.map(log => (
                  <div key={log.id} className="rule-row">
                    <div>
                      <div className="rule-row-title">{log.key_name} → {log.endpoint}</div>
                      <div className="rule-row-desc">
                        {new Date(log.timestamp).toLocaleString()} · {JSON.parse(log.tool_calls || '[]').map((t: any) => t.function?.name).join(', ') || 'no tools'} · {log.latency_ms}ms
                      </div>
                    </div>
                    <div className="status-indicator">
                      <div className={`status-dot ${log.status_code === 200 ? 'green' : 'red'}`}></div> {log.status_code}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

const MemoryScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const { isSignedIn, isLoaded } = useUser();
  const [memories, setMemories] = useState<any[]>([]);

  const fetchMemories = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/memories', { credentials: 'include' });
      if (!res.ok) { setMemories([]); return; }
      const data = await res.json();
      setMemories(data);
    } catch (error) {
      console.error(error);
      setMemories([]);
    }
  };

  useEffect(() => {
    if (isSignedIn) fetchMemories();
    else setMemories([]);
  }, [isSignedIn]);

  const handleDelete = async (id: number) => {
    await fetch(`http://localhost:3001/api/memories/${id}`, { method: 'DELETE', credentials: 'include' });
    fetchMemories();
  };

  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <Appbar onLogoClick={() => handleNavigate('landing')} onChatClick={() => handleNavigate('app')} onApiClick={() => handleNavigate('api')} onMemoryClick={() => handleNavigate('memory')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="dash-title" style={{ paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="icon-btn" onClick={() => handleNavigate('app')}><ChevronLeft size={20} /></button>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)' }}>Memory</h1>
          </div>
        </div>

        {!isLoaded ? null : !isSignedIn ? (
          <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <Brain size={28} color="var(--text-muted)" />
            <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>Sign in to view your memory</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: 360 }}>
              Facts Orb remembers about you across conversations are only visible to a signed-in account.
            </div>
            <SignInButton mode="modal">
              <button className="btn-pill" style={{ marginTop: '0.5rem', padding: '0.75rem 1.5rem' }}>Sign In</button>
            </SignInButton>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="dash-title-small">What Orb remembers</div>
              <button className="icon-btn" onClick={fetchMemories} title="Refresh">Refresh</button>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '-0.5rem', marginBottom: '1rem' }}>
              New facts are extracted in the background after a reply and can take up to a minute or two to show up — hit Refresh if you don't see something yet.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {memories.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nothing remembered yet.</div>}
              {memories.map((m: any) => (
                <div key={m.id} className="rule-row">
                  <div>
                    <div className="rule-row-title">{m.content}</div>
                    <div className="rule-row-desc">{new Date(m.created_at).toLocaleString()}</div>
                  </div>
                  <button className="icon-btn" onClick={() => handleDelete(m.id)}><X size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
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
