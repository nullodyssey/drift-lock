// ui_kits/ci_report/app.jsx
const { useState: useStateCI } = React;

function CIApp() {
  const [tab, setTab] = useStateCI('issues');
  return (
    <div className="ci-shell">
      <TopBar />
      <PRHead />
      <Summary />

      <div className="section-head">
        <h2>Findings</h2>
        <div className="tabs">
          <button className={tab === 'issues' ? 'active' : ''} onClick={() => setTab('issues')}>Issues (3)</button>
          <button className={tab === 'sealed' ? 'active' : ''} onClick={() => setTab('sealed')}>Locked (3)</button>
        </div>
      </div>

      {tab === 'issues' ? <DriftList /> : <SealedSummary />}

      <ReviewPanel />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<CIApp />);
