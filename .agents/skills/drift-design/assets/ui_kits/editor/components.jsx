// ui_kits/editor/components.jsx
const { useState } = React;

const EIcon = ({ children, size = 16, stroke = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

const IconFile = (p) => <EIcon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></EIcon>;
const IconFolder = (p) => <EIcon {...p}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></EIcon>;
const IconChevron = (p) => <EIcon {...p}><polyline points="9 18 15 12 9 6"/></EIcon>;
const IconChevronDown = (p) => <EIcon {...p}><polyline points="6 9 12 15 18 9"/></EIcon>;
const IconSearch = (p) => <EIcon {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></EIcon>;
const IconGit = (p) => <EIcon {...p}><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 009 9"/></EIcon>;
const IconLock = (p) => <EIcon {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></EIcon>;
const IconBug = (p) => <EIcon {...p}><rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2M5 7l3 2M19 17l-3-1M5 17l3-1M12 20v-8"/></EIcon>;
const IconSettings = (p) => <EIcon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></EIcon>;
const IconX = (p) => <EIcon {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></EIcon>;

// ---- Title Bar ----
function TitleBar({ project }) {
  return (
    <div className="titlebar">
      <div className="crumbs">
        <span style={{ color: 'var(--ink-500)' }}>{project}</span>
        <span className="sep">›</span>
        <span>src/features/billing</span>
        <span className="sep">›</span>
        <span>actions.ts</span>
      </div>
      <div className="actions">
        <span>drift-lock check</span>
        <span style={{ color: 'var(--ink-500)' }}>·</span>
        <span>main</span>
      </div>
    </div>
  );
}

// ---- Activity bar ----
function ActivityBar({ activeView, setView }) {
  const items = [
    { id: 'files',    Ico: IconFile },
    { id: 'search',   Ico: IconSearch },
    { id: 'git',      Ico: IconGit },
    { id: 'contracts',Ico: IconLock },
    { id: 'debug',    Ico: IconBug },
  ];
  return (
    <div className="activity">
      {items.map(it => (
        <button key={it.id} className={activeView === it.id ? 'active' : ''} onClick={() => setView(it.id)}>
          <it.Ico size={20} />
        </button>
      ))}
      <div className="spacer" />
      <button><IconSettings size={20} /></button>
    </div>
  );
}

// ---- Sidebar (file explorer with seal markers) ----
function Sidebar() {
  const tree = [
    { name: 'app', kind: 'folder', open: true, depth: 0 },
    { name: 'layout.tsx', kind: 'file', depth: 1 },
    { name: 'page.tsx', kind: 'file', depth: 1 },
    { name: 'globals.css', kind: 'file', depth: 1 },
    { name: 'src', kind: 'folder', open: true, depth: 0 },
    { name: 'features', kind: 'folder', open: true, depth: 1 },
    { name: 'billing', kind: 'folder', open: true, depth: 2 },
    { name: 'actions.ts', kind: 'file', depth: 3, status: 'drift', active: true },
    { name: 'quote-actions.ts', kind: 'file', depth: 3, status: 'sealed' },
    { name: 'billing.schema.ts', kind: 'file', depth: 3, status: 'sealed' },
    { name: 'pricing.ts', kind: 'file', depth: 3, status: 'sealed' },
    { name: '.drift', kind: 'folder', open: true, depth: 0 },
    { name: 'config.json', kind: 'file', depth: 1 },
    { name: 'contracts.generated.json', kind: 'file', depth: 1 },
    { name: 'eslint.config.js', kind: 'file', depth: 0 },
    { name: 'package.json', kind: 'file', depth: 0 },
  ];
  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <span>Explorer</span>
        <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>next-v1</span>
      </div>
      <div className="sidebar-section">
        <div className="tree">
          {tree.map((t, i) => {
            const Ico = t.kind === 'folder' ? IconFolder : IconFile;
            const ChI = t.kind === 'folder' ? (t.open ? IconChevronDown : IconChevron) : null;
            return (
              <div key={i} className={`tree-item indent-${t.depth} ${t.active ? 'active' : ''}`}>
                {ChI ? <ChI size={12} /> : <span style={{ width: 12, flexShrink: 0 }} />}
                <Ico size={14} />
                <span className="tree-name">{t.name}</span>
                {t.status && <span className={`stamp ${t.status}`} title={t.status} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Tabs ----
function Tabs() {
  return (
    <div className="tabs">
      <div className="tab active">
        <span className="stamp-dot drift" />
        actions.ts
        <IconX size={12} className="x" />
      </div>
      <div className="tab">
        <span className="stamp-dot sealed" />
        quote-actions.ts
        <IconX size={12} className="x" />
      </div>
      <div className="tab">
        pricing.ts
        <IconX size={12} className="x" />
      </div>
      <div className="tab">
        contracts.generated.json
        <IconX size={12} className="x" />
      </div>
    </div>
  );
}

// ---- Code lines ----
function CodeLines({ onHover }) {
  // Real actions.ts from apps/next-v1, with a drifted body to demonstrate DRIFT013.
  const L = [
    { n: 1, t: <><span className="tok-st">'use server'</span><span className="tok-pun">;</span></> },
    { n: 2, t: <>{' '}</> },
    { n: 3, t: <><span className="tok-kw">import</span>{' '}<span className="tok-pun">{'{'}</span>{' isCheckoutInput '}<span className="tok-pun">{'}'}</span>{' '}<span className="tok-kw">from</span>{' '}<span className="tok-st">'@/features/billing/billing.schema'</span><span className="tok-pun">;</span></> },
    { n: 4, t: <><span className="tok-kw">import</span>{' '}<span className="tok-pun">{'{'}</span>{' BILLING_PRICES '}<span className="tok-pun">{'}'}</span>{' '}<span className="tok-kw">from</span>{' '}<span className="tok-st">'@/features/billing/pricing'</span><span className="tok-pun">;</span></> },
    { n: 5, t: <>{' '}</> },
    { n: 6, t: <><span className="tok-cm">{`/* @drift`}</span></>, seal: 'sealed', hoverId: 'contract' },
    { n: 7, t: <><span className="tok-cm">{`version: 1`}</span></>, seal: 'sealed' },
    { n: 8, t: <><span className="tok-cm">{`id: billing.create-checkout-session`}</span></>, seal: 'sealed' },
    { n: 9, t: <><span className="tok-cm">{`scope: declaration`}</span></>, seal: 'sealed' },
    { n: 10, t: <><span className="tok-cm">{`stability: locked`}</span></>, seal: 'sealed' },
    { n: 11, t: <><span className="tok-cm">{`ssot:`}</span></>, seal: 'sealed' },
    { n: 12, t: <><span className="tok-cm">{`  pricing: "@/features/billing/pricing.ts"`}</span></>, seal: 'sealed' },
    { n: 13, t: <><span className="tok-cm">{`  schema:  "@/features/billing/billing.schema.ts"`}</span></>, seal: 'sealed' },
    { n: 14, t: <><span className="tok-cm">{`invariants:`}</span></>, seal: 'sealed' },
    { n: 15, t: <><span className="tok-cm">{`  - enforce: drift/ssot-flow`}</span></>, seal: 'sealed' },
    { n: 16, t: <><span className="tok-cm">{`    ssot: pricing`}</span></>, seal: 'sealed' },
    { n: 17, t: <><span className="tok-cm">{`    sinks: [return.priceId, return.amount, return.currency]`}</span></>, seal: 'sealed' },
    { n: 18, t: <><span className="tok-cm">{`*/`}</span></>, seal: 'sealed' },
    { n: 19, t: <><span className="tok-kw">export async function</span>{' '}<span className="tok-fn">createCheckoutSession</span>{'(input: '}<span className="tok-kw">unknown</span>{') '}<span className="tok-pun">{'{'}</span></> },
    { n: 20, t: <>{'  '}<span className="tok-kw">if</span>{' (!isCheckoutInput(input)) '}<span className="tok-pun">{'{'}</span></> },
    { n: 21, t: <>{'    '}<span className="tok-kw">throw new</span>{' '}<span className="tok-fn">Error</span>{'('}<span className="tok-st">'Invalid checkout input'</span>{');'}</> },
    { n: 22, t: <>{'  '}<span className="tok-pun">{'}'}</span></> },
    { n: 23, t: <>{' '}</> },
    { n: 24, t: <>{'  '}<span className="tok-kw">const</span>{' price = '}<span className="tok-pun">{'{'}</span>{' priceId: '}<span className="tok-st">'test'</span>{', monthlyAmount: '}<span className="tok-num">10</span>{', currency: '}<span className="tok-st">'USD'</span>{' '}<span className="tok-pun">{'}'}</span><span className="tok-pun">;</span>{'  '}<span className="tok-cm">{`// ✗ drift`}</span></>, seal: 'drift', hoverId: 'priceDrift' },
    { n: 25, t: <>{' '}</> },
    { n: 26, t: <>{'  '}<span className="tok-kw">return</span>{' '}<span className="tok-pun">{'{'}</span></> },
    { n: 27, t: <>{'    '}{'priceId: price.priceId,'}</> },
    { n: 28, t: <>{'    '}{'amount: price.monthlyAmount * input.seats,'}</> },
    { n: 29, t: <>{'    '}{'currency: price.currency,'}</> },
    { n: 30, t: <>{'  '}<span className="tok-pun">{'}'}</span><span className="tok-pun">;</span></> },
    { n: 31, t: <><span className="tok-pun">{'}'}</span></> },
  ];
  return (
    <>
      <div className="gutter">
        {L.map((l) => (
          <div key={l.n} className={`gutter-line ${l.seal === 'drift' ? 'drift' : ''}`}>
            <span className="num">{l.n}</span>
            <span className="seal">{l.seal && <span className="seal-stamp" />}</span>
          </div>
        ))}
      </div>
      <div className="code-area" style={{ paddingTop: 16, paddingBottom: 16 }}>
        {L.map((l, idx) => (
          <div
            key={l.n}
            className={`code-line ${l.seal === 'sealed' ? 'contract-region' : ''} ${l.seal === 'drift' ? 'contract-region drift' : ''}`}
            onMouseEnter={() => l.hoverId && onHover({ id: l.hoverId, top: idx * 22 + 16 })}
          >
            {l.t}
          </div>
        ))}
      </div>
    </>
  );
}

// ---- Hover card ----
function HoverCard({ data, onClose }) {
  if (!data) return null;
  const cards = {
    contract: {
      kind: 'sealed',
      id: 'billing.create-checkout-session',
      body: 'Locked declaration-scoped contract. createCheckoutSession must derive return.priceId, return.amount, and return.currency from the pricing SSOT.',
      meta: [
        ['scope', 'declaration'],
        ['stability', 'locked'],
        ['ssot.pricing', '@/features/billing/pricing.ts'],
        ['enforce', 'drift/ssot-flow'],
      ],
    },
    priceDrift: {
      kind: 'drift',
      id: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
      body: 'price is a local object literal. Return sinks priceId, amount, currency no longer derive from the pricing SSOT.',
      meta: [
        ['contract', 'billing.create-checkout-session'],
        ['invariant', 'checkout-price-from-pricing'],
        ['expected ssot', '@/features/billing/pricing.ts'],
        ['fix', 'price = BILLING_PRICES[input.plan]'],
      ],
    },
  };
  const c = cards[data.id];
  if (!c) return null;
  return (
    <div className="hover-card" style={{ top: data.top - 8, left: 320 }}>
      <div className="hc-head">
        <span className={`hc-stamp ${c.kind}`}>{c.kind === 'sealed' ? 'Locked' : 'Drift detected'}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-500)', fontFamily: 'var(--font-mono)' }}>{c.kind === 'sealed' ? 'contract' : 'diagnostic'}</span>
      </div>
      <div className="hc-title">{c.id}</div>
      <div className="hc-body">{c.body}</div>
      <div className="hc-meta">
        {c.meta.map(([k, v], i) => (
          <span key={i}><span className="key">{k}</span><span>{v}</span></span>
        ))}
      </div>
      <div className="hc-actions">
        {c.kind === 'sealed'
          ? <><button>Open contract</button><button>View SSOT</button></>
          : <><button className="primary">Explain</button><button>Open diff</button></>}
      </div>
    </div>
  );
}

// ---- Right panel ----
function RightPanel() {
  const [tab, setTab] = useState('contracts');
  return (
    <div className="right-panel">
      <div className="panel-tabs">
        <button className={`panel-tab ${tab === 'contracts' ? 'active' : ''}`} onClick={() => setTab('contracts')}>Contracts</button>
        <button className={`panel-tab ${tab === 'manifest' ? 'active' : ''}`} onClick={() => setTab('manifest')}>Manifest</button>
        <button className={`panel-tab ${tab === 'problems' ? 'active' : ''}`} onClick={() => setTab('problems')}>Problems</button>
      </div>
      <div className="panel-body">
        {tab === 'contracts' && <ContractsList />}
        {tab === 'manifest' && <ManifestView />}
        {tab === 'problems' && <ProblemsView />}
      </div>
    </div>
  );
}

function ContractsList() {
  const rows = [
    { id: 'billing.create-checkout-session', status: 'drift', meta: 'DRIFT013 · actions.ts:24' },
    { id: 'billing.create-checkout-quote', status: 'sealed', meta: 'locked · 3 sinks proven' },
  ];
  return (
    <div>
      <div className="panel-section-head"><span>Contracts in this file</span><span>1</span></div>
      {rows.slice(0, 1).map((r, i) => (
        <div className="contract-row" key={i}>
          <div className="row-head">
            <span className={`dot ${r.status}`} />
            <span className="row-title">{r.id}</span>
          </div>
          <div className="row-meta">{r.meta}</div>
        </div>
      ))}
      <div className="panel-section-head" style={{ marginTop: 24 }}><span>Other contracts</span><span>1</span></div>
      {rows.slice(1).map((r, i) => (
        <div className="contract-row" key={i}>
          <div className="row-head">
            <span className={`dot ${r.status}`} />
            <span className="row-title">{r.id}</span>
          </div>
          <div className="row-meta">{r.meta}</div>
        </div>
      ))}
    </div>
  );
}

function ManifestView() {
  return (
    <div>
      <div className="panel-section-head"><span>.drift/contracts.generated.json</span></div>
      <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.6, color: 'var(--paper-50)', margin: 0 }}>
{`{
  "version": 1,
  "contracts": [{
    "id": "billing.create-checkout-session",
    "scope": "declaration",
    "stability": "locked",
    "ssot": {
      "pricing": "@/features/billing/pricing.ts",
      "schema":  "@/features/billing/billing.schema.ts"
    },
    "invariants": [{
      "enforce": "drift/ssot-flow",
      "ssot": "pricing",
      "sinks": [
        "return.priceId",
        "return.amount",
        "return.currency"
      ]
    }],
    "contentHash": "sha256:f041..."
  }]
}`}
      </pre>
    </div>
  );
}

function ProblemsView() {
  return (
    <div>
      <div className="panel-section-head"><span>Problems</span><span style={{ color: 'var(--drift-500)' }}>1</span></div>
      <div className="contract-row">
        <div className="row-head">
          <span className="dot drift" />
          <span className="row-title">DRIFT013_SSOT_FLOW_NOT_PROVEN</span>
        </div>
        <div className="row-meta" style={{ color: 'var(--ink-300)', fontSize: 12, fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}>
          Sink <code style={{ background: 'var(--ink-800)', padding: '0 4px', borderRadius: 3 }}>return.priceId</code> does not derive from the <code style={{ background: 'var(--ink-800)', padding: '0 4px', borderRadius: 3 }}>pricing</code> SSOT.
        </div>
        <div className="row-meta" style={{ marginTop: 4 }}>src/features/billing/actions.ts:24:9</div>
      </div>
      <div className="contract-row">
        <div className="row-head">
          <span className="dot drift" />
          <span className="row-title">drift-lock/ssot-flow</span>
        </div>
        <div className="row-meta" style={{ color: 'var(--ink-300)', fontSize: 12, fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}>
          ESLint surface of the same diagnostic — same line, same fix.
        </div>
        <div className="row-meta" style={{ marginTop: 4 }}>actions.ts:24:9 · drift-lock</div>
      </div>
    </div>
  );
}

// ---- Status bar ----
function StatusBar() {
  return (
    <div className="statusbar">
      <div className="left">
        <span className="seg">main</span>
        <span className="seg">TypeScript</span>
        <span className="seg">UTF-8</span>
        <span className="seg">LF</span>
      </div>
      <div className="right">
        <span className="seg" style={{ fontWeight: 600 }}>drift-lock</span>
        <span className="seg">✓ 1 locked</span>
        <span className="seg">✗ 1 drift</span>
        <span className="seg">DRIFT013</span>
      </div>
    </div>
  );
}

Object.assign(window, {
  TitleBar, ActivityBar, Sidebar, Tabs, CodeLines, HoverCard, RightPanel, StatusBar,
});
