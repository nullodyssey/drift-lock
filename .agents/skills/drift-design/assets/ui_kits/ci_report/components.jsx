// ui_kits/ci_report/components.jsx
const { useState } = React;

const CIcon = ({ children, size = 16, stroke = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const IconBranch = (p) => <CIcon {...p}><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></CIcon>;
const IconClock = (p) => <CIcon {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></CIcon>;
const IconFile = (p) => <CIcon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></CIcon>;
const IconLock = (p) => <CIcon {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></CIcon>;
const IconAlert = (p) => <CIcon {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></CIcon>;
const IconCheck = (p) => <CIcon {...p}><polyline points="20 6 9 17 4 12"/></CIcon>;

// ---- TopBar ----
function TopBar() {
  return (
    <div className="ci-topbar">
      <div className="left">
        <a href="#" className="logo">
          <img src="../../brand/logo-mark.svg" alt="" />
          <span>DriftLock</span>
        </a>
        <span className="sep">/</span>
        <span className="crumbs"><strong>nullodyssey/drift-lock</strong> · <strong>PR #128</strong></span>
      </div>
      <div className="right">
        <button>Re-run check</button>
        <button>Open explain</button>
        <button className="primary">Accept change</button>
      </div>
    </div>
  );
}

// ---- PR Head ----
function PRHead() {
  return (
    <div className="pr-head">
      <div className="title-block">
        <div className="pr-eyebrow">
          <span className="badge drift"><IconAlert size={11} /> Drift detected</span>
          <span className="meta">#128 · opened 2 hours ago</span>
        </div>
        <h1>Refactor billing checkout for yearly plan</h1>
        <div className="author-line">
          <div className="avatar">CW</div>
          <span><strong style={{ color: 'var(--ink-950)', fontWeight: 500 }}>claude-worker</strong> wants to merge 3 commits into <code style={{ fontSize: 13, background: 'var(--paper-100)', padding: '2px 6px', borderRadius: 3, color: 'var(--ink-950)' }}>main</code> from <code style={{ fontSize: 13, background: 'var(--paper-100)', padding: '2px 6px', borderRadius: 3, color: 'var(--ink-950)' }}>agent/yearly-billing</code></span>
        </div>
      </div>
      <div className="pr-stamp">
        <span className="lbl">Cannot merge</span>
        <span className="num">2</span>
        <span className="sub">contracts in drift</span>
      </div>
    </div>
  );
}

// ---- Summary ----
function Summary() {
  return (
    <div className="summary">
      <div className="tile sealed">
        <span className="tile-eyebrow">Locked · proven</span>
        <span className="tile-num">3</span>
        <span className="tile-meta">contracts intact</span>
      </div>
      <div className="tile drift">
        <span className="tile-eyebrow">Drift</span>
        <span className="tile-num">2</span>
        <span className="tile-meta">DRIFT013 · DRIFT011</span>
      </div>
      <div className="tile pending">
        <span className="tile-eyebrow">Required · missing</span>
        <span className="tile-num">1</span>
        <span className="tile-meta">DRIFT015</span>
      </div>
      <div className="tile">
        <span className="tile-eyebrow">Files scanned</span>
        <span className="tile-num">42</span>
        <span className="tile-meta">in 1.4s</span>
      </div>
    </div>
  );
}

// ---- Drift cards ----
const driftItems = [
  {
    kind: 'drift',
    file: 'src/features/billing/actions.ts',
    line: '24:9',
    contract: 'billing.create-checkout-session',
    diagnostic: 'DRIFT013_SSOT_FLOW_NOT_PROVEN',
    invariant: 'enforce: drift/ssot-flow · ssot: pricing',
    diff: [
      { kind: 'context', n: 22, t: "  }" },
      { kind: 'context', n: 23, t: "" },
      { kind: 'minus',   n: 24, t: "  const price = BILLING_PRICES[payload.plan];" },
      { kind: 'plus',    n: 24, t: "  const price = { priceId: 'test', monthlyAmount: 10, currency: 'USD' };" },
      { kind: 'context', n: 25, t: "" },
      { kind: 'context', n: 26, t: "  return {" },
    ],
  },
  {
    kind: 'drift',
    file: 'src/features/billing/quote-actions.ts',
    line: '1:1',
    contract: 'billing.create-checkout-quote',
    diagnostic: 'DRIFT011_LOCKED_CONTRACT_CHANGED',
    invariant: 'stability: locked · contentHash changed',
    diff: [
      { kind: 'context', n: 8, t: "id: billing.create-checkout-quote" },
      { kind: 'minus',   n: 9, t: "stability: locked" },
      { kind: 'plus',    n: 9, t: "stability: draft" },
      { kind: 'context', n: 10, t: "intent: >" },
    ],
  },
  {
    kind: 'pending',
    file: 'src/services/auth.ts',
    line: '\u2014',
    contract: '\u2014',
    diagnostic: 'DRIFT015_REQUIRED_CONTRACT_MISSING',
    invariant: 'requireContracts: src/services/**/*.ts',
    diff: [
      { kind: 'context', n: 1, t: "// no @drift contract found" },
      { kind: 'context', n: 2, t: "export async function authenticate(req) { ... }" },
    ],
  },
];

function DriftList() {
  return (
    <div className="drift-list">
      {driftItems.map((it, i) => <DriftCard item={it} key={i} />)}
    </div>
  );
}

function DriftCard({ item }) {
  return (
    <div className={`drift-card ${item.kind}`}>
      <div className="card-head">
        <div className="card-head-left">
          <IconFile size={16} />
          <span className="file-path">{item.file}<span className="line">:{item.line}</span></span>
          <span className={`stamp-pill ${item.kind}`}><span className="dot"></span>{item.diagnostic}</span>
        </div>
        <div className="card-actions">
          <button>View file</button>
          <button>Explain</button>
          <button className="primary">Accept</button>
        </div>
      </div>
      <div className="card-body">
        <div className="invariant">
          <span style={{ color: 'var(--ink-400)' }}>contract</span>
          <strong>{item.contract}</strong>
          <span className="invariant-tag">{item.invariant}</span>
        </div>
        <div className="diff">
          {item.diff.map((d, i) => (
            <div key={i} className={`diff-line ${d.kind}`}>
              <span className="gn">{d.n}</span>
              <span>{d.t || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Sealed list (collapsed) ----
function SealedSummary() {
  const sealed = [
    'billing.create-checkout-session',
    'billing.create-checkout-quote',
    'auth.session-issuer',
    'auth.token-rotation',
    'api.rate-limit-policy',
    'webhooks.signature-verify',
  ];
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid var(--paper-200)', borderRadius: 8, padding: 18 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 12 }}>
        <strong style={{ color: 'var(--sealed-700)', fontWeight: 600 }}>3 locked contracts</strong> remain proven in this PR. Returned sinks all derive from declared SSOTs.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {sealed.map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--sealed-100)', color: 'var(--sealed-700)', borderRadius: 999, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            <span style={{ width: 6, height: 6, background: 'var(--sealed-500)', borderRadius: 999 }} />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- Review action panel ----
function ReviewPanel() {
  return (
    <div className="review">
      <div className="blurb">
        <strong>Resolve drift to unblock merge.</strong> Fix the code so each sink derives from its SSOT, or run <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--paper-100)', padding: '1px 5px', borderRadius: 3 }}>drift-lock accept &lt;id&gt; --reason</code> when the contract change is intentional.
      </div>
      <div className="acts">
        <button>Open explain</button>
        <button className="danger">Block merge</button>
        <button className="primary">Accept all</button>
      </div>
    </div>
  );
}

Object.assign(window, {
  TopBar, PRHead, Summary, DriftList, DriftCard, SealedSummary, ReviewPanel,
});
