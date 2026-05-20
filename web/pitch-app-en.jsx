const { useState, useEffect, useRef, useMemo } = React;

function App() {
  return (
    <>
      <PitchHero />
      <PitchProblem />
      <PitchSolution />
      <PitchProof />
      <PitchVision />
      <PitchCTA />
      <footer>
        <div className="container" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
            <div className="brand-mark"><span></span><span></span><span></span><span></span></div>
            <span>MATRIX·VIKI</span>
            <span style={{color: 'var(--ink-mute)', opacity: 0.7}}>· MIT · personal AI rule assistant</span>
          </div>
          <div style={{display: 'flex', gap: 24}}>
            <a href="https://github.com/libz-renlab-ai/Matrix-Viki" target="_blank" rel="noreferrer">github</a>
            <a href="/">technical details</a>
            <a href="mailto:contact@example.com">contact</a>
          </div>
        </div>
      </footer>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
