import {
  contextOutput,
  demoContract,
  driftOutput,
  driftedAction,
  healthyAction,
  nestedBranchContract,
  nestedBranchDrifted,
  nestedBranchHealthy,
  nestedBranchOutput,
} from '@/demo/snippets';

const checks = [
  ['Contract parsed', 'YAML strict, typed schema, anchored to the action'],
  ['SSOT protected', 'Pricing and input shape must come from declared files'],
  ['Locked baseline', 'Contract changes compare against .drift/contracts.generated.index'],
];

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">DriftLock V1 / Next.js App Router</p>
          <h1>AI can edit the code. It cannot silently rewrite the contract.</h1>
          <p className="lede">
            This mini app demonstrates the core idea behind DriftLock: local code contracts become executable guardrails for
            AI-assisted development.
          </p>
        </div>
        <div className="verdictPanel" aria-label="DriftLock check summary">
          <span className="statusDot" />
          <div>
            <p className="panelLabel">CI signal</p>
            <strong>Blocked drift before merge</strong>
          </div>
        </div>
      </section>

      <section className="sequence" aria-label="DriftLock workflow">
        {checks.map(([title, body], index) => (
          <article className="step" key={title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="demoGrid">
        <CodePanel title="1. Contract near the server action" code={demoContract} />
        <CodePanel title="2. Healthy implementation" code={healthyAction} tone="green" />
        <CodePanel title="3. Typical LLM drift" code={driftedAction} tone="red" />
        <CodePanel title="4. DriftLock response" code={driftOutput} tone="amber" />
      </section>

      <section className="contextBand">
        <div>
          <p className="eyebrow">Agent context</p>
          <h2>Before editing, the agent receives the contract instead of guessing architecture.</h2>
        </div>
        <pre>{contextOutput}</pre>
      </section>

      <section className="flowProof" aria-label="Nested ssot-flow branch proof">
        <div className="flowProofCopy">
          <p className="eyebrow">New ssot-flow coverage</p>
          <h2>Nested return paths and branch returns are now part of the proof.</h2>
          <p>
            This second locked contract is checked by the same DriftLock command. A hardcoded fallback in one branch fails even
            when another branch still reads from pricing.
          </p>
        </div>
        <div className="flowGrid">
          <CodePanel title="1. Nested sinks" code={nestedBranchContract} />
          <CodePanel title="2. Branch-safe quote" code={nestedBranchHealthy} tone="green" />
          <CodePanel title="3. Branch drift" code={nestedBranchDrifted} tone="red" />
          <CodePanel title="4. DriftLock response" code={nestedBranchOutput} tone="amber" />
        </div>
      </section>

      <section className="commands">
        <h2>Run the proof locally</h2>
        <div className="commandList">
          <code>pnpm --filter next-v1 drift-lock:extract</code>
          <code>pnpm --filter next-v1 drift-lock:context</code>
          <code>pnpm --filter next-v1 drift-lock:check</code>
          <code>pnpm --filter next-v1 lint</code>
        </div>
      </section>
    </main>
  );
}

function CodePanel({ title, code, tone = 'blue' }: { title: string; code: string; tone?: 'blue' | 'green' | 'red' | 'amber' }) {
  return (
    <article className={`codePanel ${tone}`}>
      <header>
        <h2>{title}</h2>
      </header>
      <pre>{code}</pre>
    </article>
  );
}
