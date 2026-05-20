const { useState, useEffect, useRef, useMemo } = React;

function App() {
  const t = useTweaks(/*EDITMODE-BEGIN*/{
    "accent": "#4ade80",
    "showScanline": true,
    "autoplayDemo": true
  }/*EDITMODE-END*/);

  // Apply tweak: accent color
  useEffect(() => {
    document.documentElement.style.setProperty('--green', t.accent);
    // derive dim version
    const dim = t.accent === '#4ade80' ? '#1a4d2e'
              : t.accent === '#60a5fa' ? '#1e3a5c'
              : t.accent === '#c084fc' ? '#3b1e5c'
              : t.accent === '#fbbf24' ? '#5c4a1e'
              : '#1a4d2e';
    document.documentElement.style.setProperty('--green-dim', dim);
  }, [t.accent]);

  return (
    <>
      <Hero />
      <Problem />
      <Loop />
      <Demo autoplay={t.autoplayDemo} />
      <Hooks />
      <Tiers />
      <Retrieval />
      <Team />
      <Arch />
      <SiteFooter />

      <TweaksPanel title="Tweaks">
        <TweakSection title="Theme">
          <TweakColor
            label="Accent"
            value={t.accent}
            options={['#4ade80', '#60a5fa', '#c084fc', '#fbbf24']}
            onChange={(v) => setTweak('accent', v)}
          />
        </TweakSection>
        <TweakSection title="Demo">
          <TweakToggle
            label="自动播放"
            value={t.autoplayDemo}
            onChange={(v) => setTweak('autoplayDemo', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
