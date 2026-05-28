// ui_kits/marketing/app.jsx
function App() {
  return (
    <div>
      <Nav />
      <Hero />
      <Anatomy />
      <Features />
      <Compare />
      <Philosophy />
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
