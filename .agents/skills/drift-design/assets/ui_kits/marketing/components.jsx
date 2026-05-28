// ui_kits/marketing/components.jsx
const { useState } = React;

// ---- Lucide-style icons (1.5px stroke, 24px viewbox) ----
const Icon = ({ d, children, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {d ? <path d={d} /> : children}
  </svg>
);
const IconLock = (p) => <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></Icon>;
const IconCheck = (p) => <Icon {...p}><polyline points="20 6 9 17 4 12"/></Icon>;
const IconAlert = (p) => <Icon {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Icon>;
const IconCode = (p) => <Icon {...p}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></Icon>;
const IconKey = (p) => <Icon {...p}><circle cx="8" cy="15" r="4"/><path d="M10.85 12.15 19 4M18 5l3 3M15 8l3 3"/></Icon>;
const IconActivity = (p) => <Icon {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></Icon>;
const IconArrowRight = (p) => <Icon {...p}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></Icon>;
const IconGithub = (p) => <Icon {...p}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></Icon>;
const IconTerminal = (p) => <Icon {...p}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></Icon>;

// ---- Nav ----
function Nav() {
  return (
    <nav className="nav">
      <div className="site-shell">
        <div className="nav-inner">
          <div className="nav-left">
            <a href="#" className="nav-logo">
              <img src="../../brand/logo-mark.svg" alt="" />
              <span>DriftLock</span>
            </a>
            <div className="nav-links">
              <a href="#how">How it works</a>
              <a href="#features">Features</a>
              <a href="#docs">Docs</a>
              <a href="#demo">Demo</a>
              <a href="https://github.com/nullodyssey/drift-lock">GitHub</a>
            </div>
          </div>
          <div className="nav-right">
            <a href="#" className="nav-link-btn">Sign in</a>
            <a href="#" className="nav-cta">Get started</a>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ---- Hero ----
function Hero() {
  return (
    <section className="hero">
      <div className="site-shell" style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 64, alignItems: 'center' }}>
        <div>
          <div className="eyebrow-stamp"><span className="dot"></span>V1 · ESLint 9 + CI ready</div>
          <h1>
            Lock the intent.<br/>
            <span className="quiet">Ship the </span><span className="accent">vibe.</span>
          </h1>
          <p className="hero-sub">
            DriftLock turns local engineering intent into agent context, ESLint feedback, and CI checks — so AI-assisted TypeScript changes cannot silently drift away from critical sources of truth.
          </p>
          <div className="hero-cta">
            <a href="#" className="btn btn-primary">Install DriftLock <IconArrowRight size={14} /></a>
            <a href="#" className="btn btn-secondary btn-mono">npx --yes @drift-lock/cli@latest install</a>
          </div>
          <div className="hero-meta">
            <span><IconCheck size={14} /> TypeScript-native</span>
            <span><IconCheck size={14} /> Node 22+ · ESM</span>
            <span><IconCheck size={14} /> Works with any agent</span>
          </div>
        </div>
        <HeroCodeCard />
      </div>
    </section>
  );
}

function HeroCodeCard() {
  return (
    <div className="code-card">
      <div className="code-card-head">
        <div className="file"><div className="dots"><span /><span /><span /></div> billing/actions.ts</div>
        <span className="contract-callout">stability: locked</span>
      </div>
<pre>
<span className="cm">{`/* @drift`}</span>
{`\n`}<span className="cm">{`id: billing.create-checkout-session`}</span>
{`\n`}<span className="cm">{`scope: declaration`}</span>
{`\n`}<span className="cm">{`stability: locked`}</span>
{`\n`}
{`\n`}<span className="cm">{`ssot:`}</span>
{`\n`}<span className="cm">{`  pricing: "@/features/billing/pricing.ts"`}</span>
{`\n`}
{`\n`}<span className="cm">{`invariants:`}</span>
{`\n`}<span className="cm">{`  - enforce: drift/ssot-flow`}</span>
{`\n`}<span className="cm">{`    sinks:`}</span>
{`\n`}<span className="cm">{`      - return.priceId`}</span>
{`\n`}<span className="cm">{`      - return.amount`}</span>
{`\n`}<span className="cm">{`*/`}</span>
{`\n`}<span className="kw">export async function</span> <span className="nm">createCheckoutSession</span>(input) {`{`}
{`\n  `}<span className="kw">const</span> price = BILLING_PRICES[input.plan];
{`\n  `}<span className="kw">return</span> {`{`} priceId: price.priceId, amount: price.monthlyAmount {`}`};
{`\n`}{`}`}
</pre>
    </div>
  );
}

// ---- Anatomy ----
function Anatomy() {
  const [active, setActive] = useState(1);
  const steps = [
    { step: 'Step 01', title: 'Declare', body: 'Add a /* @drift */ block comment with an id, scope, stability, declared SSOTs, and the invariants to enforce. The contract lives next to the code.' },
    { step: 'Step 02', title: 'Extract', body: 'Run drift-lock extract to write .drift/contracts.generated.json. Commit the baseline so locked contract changes can be detected later.' },
    { step: 'Step 03', title: 'Give agents context', body: 'drift-lock context --task "<prompt>" surfaces the contracts relevant to a planned change. The agent reads SSOTs and invariants before planning.' },
    { step: 'Step 04', title: 'Check + ESLint + CI', body: 'drift-lock check validates locked baselines and supported invariants. @drift-lock/eslint-plugin brings the same feedback into the editor.' },
  ];
  return (
    <section className="section" id="how">
      <div className="site-shell">
        <div className="section-head">
          <div className="section-eyebrow">How it works</div>
          <h2 className="section-title">Four steps. Same code. Deterministic check.</h2>
          <p className="section-sub">Contracts describe local engineering intent. DriftLock makes them visible — to agents, ESLint, and CI — without changing the runtime.</p>
        </div>
        <div className="anatomy">
          <div className="anatomy-list">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`anatomy-item ${active === i ? 'active' : ''}`}
                onClick={() => setActive(i)}
                style={{ cursor: 'pointer' }}
              >
                <span className="step">{s.step}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
          <AnatomyCode step={active} />
        </div>
      </div>
    </section>
  );
}

function AnatomyCode({ step }) {
  const blocks = [
    (<pre key="0">
<span className="cm">{`/* @drift`}</span>{`\n`}
<span className="cm">{`id: billing.create-checkout-session`}</span>{`\n`}
<span className="cm">{`scope: declaration`}</span>{`\n`}
<span className="cm">{`stability: locked`}</span>{`\n`}
<span className="cm">{`ssot:`}</span>{`\n`}
<span className="cm">{`  pricing: "@/features/billing/pricing.ts"`}</span>{`\n`}
<span className="cm">{`invariants:`}</span>{`\n`}
<span className="cm">{`  - enforce: drift/ssot-flow`}</span>{`\n`}
<span className="cm">{`    sinks: [return.priceId, return.amount]`}</span>{`\n`}
<span className="cm">{`*/`}</span>{`\n`}
<span className="kw">export async function</span> <span className="nm">createCheckoutSession</span>(input) {`{ ... }`}
    </pre>),
    (<pre key="1">
<span className="gt">{`$`}</span> drift-lock extract{`\n`}
<span style={{ color: 'var(--sealed-500)' }}>{`✓`}</span> 2 contracts extracted{`\n`}
<span style={{ color: 'var(--ink-500)' }}>{`  written to .drift/contracts.generated.json`}</span>{`\n\n`}
<span className="cm">{`// baseline (committed)`}</span>{`\n`}
{`{ `}<span className="st">"id"</span>: <span className="st">"billing.create-checkout-session"</span>,{`\n`}
{`  `}<span className="st">"stability"</span>: <span className="st">"locked"</span>,{`\n`}
{`  `}<span className="st">"contentHash"</span>: <span className="st">"sha256:f041..."</span> {`}`}
    </pre>),
    (<pre key="2">
<span className="gt">{`$`}</span> drift-lock context --task <span className="st">"add yearly plan"</span>{`\n\n`}
<span style={{ color: 'var(--seal-500)' }}>{`▸ billing.create-checkout-session`}</span>{`\n`}
<span style={{ color: 'var(--ink-500)' }}>{`  ssot.pricing  @/features/billing/pricing.ts`}</span>{`\n`}
<span style={{ color: 'var(--ink-500)' }}>{`  invariant     drift/ssot-flow`}</span>{`\n`}
<span style={{ color: 'var(--ink-500)' }}>{`  must_not_change:`}</span>{`\n`}
<span style={{ color: 'var(--ink-500)' }}>{`    · pricing source`}</span>{`\n`}
<span style={{ color: 'var(--ink-500)' }}>{`    · accepted input shape`}</span>
    </pre>),
    (<pre key="3">
<span className="gt">{`$`}</span> drift-lock check{`\n`}
<span style={{ color: 'var(--drift-500)' }}>{`✗ DRIFT013_SSOT_FLOW_NOT_PROVEN`}</span>{`\n`}
<span style={{ color: 'var(--ink-500)' }}>{`  billing.create-checkout-session`}</span>{`\n`}
<span style={{ color: 'var(--ink-500)' }}>{`  sink return.amount does not derive from pricing`}</span>{`\n\n`}
<span className="gt">{`$`}</span> drift-lock explain billing.create-checkout-session{`\n`}
<span style={{ color: 'var(--ink-500)' }}>{`  fix: return amount from BILLING_PRICES[plan]`}</span>
    </pre>),
  ];
  return (
    <div className="code-card">
      <div className="code-card-head">
        <div className="file">
          <div className="dots"><span /><span /><span /></div>
          {['actions.ts','contracts.generated.json','drift-lock context','drift-lock check'][step]}
        </div>
        <span className="contract-callout">step {step + 1} / 4</span>
      </div>
      {blocks[step]}
    </div>
  );
}

// ---- Features ----
function Features() {
  const items = [
    { Ico: IconLock, title: 'SSOT-bound invariants', body: 'Declare which sources of truth a function must derive from. drift/ssot-flow proves every return sink traces back.' },
    { Ico: IconActivity, title: 'Live ESLint feedback', body: '@drift-lock/eslint-plugin surfaces valid-contract, locked-contract-change, ssot-usage and ssot-flow as you type.' },
    { Ico: IconCode, title: 'YAML in a block comment', body: 'Contracts are /* @drift */ block comments. No DSL, no codegen, no runtime cost. Just metadata next to the code.' },
    { Ico: IconAlert, title: 'Locked baselines', body: 'Commit .drift/contracts.generated.json. A locked contract that mutates without explicit accept fails the check.' },
    { Ico: IconKey, title: 'Agent skills bundled', body: 'Install DriftLock skills for OpenAI, Claude, or Cursor. Drops ready-made rules into your agent\u2019s context.' },
    { Ico: IconTerminal, title: 'Stable JSON diagnostics', body: 'drift-lock explain --json gives agents and CI stable contract id, invariant, sink, and suggested fix fields.' },
  ];
  return (
    <section className="section" id="features">
      <div className="site-shell">
        <div className="section-head">
          <div className="section-eyebrow">Features</div>
          <h2 className="section-title">Built for TypeScript codebases where local intent matters.</h2>
        </div>
        <div className="features">
          {items.map((it, i) => (
            <div className="feature" key={i}>
              <it.Ico />
              <h3>{it.title}</h3>
              <p>{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Compare strip ----
function Compare() {
  return (
    <section className="section">
      <div className="site-shell">
        <div className="section-head">
          <div className="section-eyebrow">With vs without</div>
          <h2 className="section-title">The same agent. Two outcomes.</h2>
          <p className="section-sub">Without DriftLock, an agent can plausibly hardcode a price. With DriftLock, the agent sees the SSOT contract first and drift-lock check fails before merge.</p>
        </div>
        <div className="compare">
          <div className="compare-card bad">
            <div className="stamp-row">
              <span className="stamp"><IconAlert size={12} /></span>
              Without DriftLock
            </div>
            <pre className="compare-code">
<span className="cm">{`// agent: "make checkout cheaper to test"`}</span>{`\n`}
<span className="kw">const</span> <span className="nm">price</span> = {`{`} priceId: <span className="st">'test'</span>, monthlyAmount: <span className="nm">10</span> {`}`};
            </pre>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 16, lineHeight: 1.55 }}>
              The agent silently replaces BILLING_PRICES with a literal. Tests pass. Reviewer skims the diff. Drift merges.
            </p>
          </div>
          <div className="compare-card good">
            <div className="stamp-row">
              <span className="stamp"><IconCheck size={12} /></span>
              With DriftLock
            </div>
            <pre className="compare-code">
<span className="cm">{`/* @drift id: billing.create-checkout-session`}</span>{`\n`}
<span className="cm">{`   ssot.pricing: pricing.ts`}</span>{`\n`}
<span className="cm">{`   enforce: drift/ssot-flow */`}</span>{`\n`}
<span className="kw">const</span> <span className="nm">price</span> = BILLING_PRICES[input.plan];
            </pre>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 16, lineHeight: 1.55 }}>
              drift-lock check fails with DRIFT013_SSOT_FLOW_NOT_PROVEN. CI blocks merge until the sink derives from pricing.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Philosophy ----
function Philosophy() {
  return (
    <section className="philosophy">
      <div className="inner">
        <blockquote>
          DriftLock makes intent <span className="em">easy to preserve</span>, and <span className="em">expensive to erase</span> silently.
        </blockquote>
        <span className="cite">— Founding principle</span>
      </div>
    </section>
  );
}

// ---- Footer ----
function Footer() {
  return (
    <footer className="footer">
      <div className="site-shell">
        <div className="footer-grid">
          <div>
            <a href="#" className="nav-logo">
              <img src="../../brand/logo-mark.svg" width="28" height="28" alt="" />
              <span>DriftLock</span>
            </a>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 16, maxWidth: 240, lineHeight: 1.55 }}>
              Agent context, ESLint feedback, and CI checks for TypeScript codebases that carry local engineering intent.
            </p>
          </div>
          <div>
            <h4>Packages</h4>
            <ul>
              <li><a href="https://www.npmjs.com/package/@drift-lock/cli">@drift-lock/cli</a></li>
              <li><a href="#">@drift-lock/core</a></li>
              <li><a href="#">@drift-lock/eslint-plugin</a></li>
              <li><a href="#">Agent skills</a></li>
            </ul>
          </div>
          <div>
            <h4>Resources</h4>
            <ul>
              <li><a href="#">Documentation</a></li>
              <li><a href="#">@drift contract spec</a></li>
              <li><a href="#">Next.js demo</a></li>
              <li><a href="#">Diagnostics reference</a></li>
            </ul>
          </div>
          <div>
            <h4>Project</h4>
            <ul>
              <li><a href="https://github.com/nullodyssey/drift-lock">GitHub</a></li>
              <li><a href="#">Philosophy</a></li>
              <li><a href="#">Changelog</a></li>
              <li><a href="#">License (MIT)</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 DriftLock · MIT</span>
          <span>@drift-lock/cli · V1</span>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, {
  Nav, Hero, HeroCodeCard, Anatomy, Features, Compare, Philosophy, Footer,
  IconLock, IconCheck, IconAlert, IconCode, IconKey, IconActivity, IconArrowRight, IconGithub, IconTerminal,
});
