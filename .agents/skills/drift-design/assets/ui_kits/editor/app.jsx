// ui_kits/editor/app.jsx
const { useState } = React;

function EditorApp() {
  const [view, setView] = useState('contracts');
  // Default hover anchored on the drift line (24 — 0-indexed 23)
  const [hover, setHover] = useState({ id: 'priceDrift', top: 23 * 22 + 16 });

  return (
    <div className="app">
      <TitleBar project="next-v1" />
      <div className="workbench">
        <ActivityBar activeView={view} setView={setView} />
        <Sidebar />
        <div className="editor">
          <Tabs />
          <div className="editor-body">
            <CodeLines onHover={setHover} />
            <HoverCard data={hover} onClose={() => setHover(null)} />
          </div>
        </div>
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<EditorApp />);
