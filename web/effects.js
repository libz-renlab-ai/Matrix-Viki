// Matrix-style digital rain — subtle, performance-tuned, respects prefers-reduced-motion
(function() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'matrix-rain';
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '0', opacity: '0.08',
    mixBlendMode: 'screen',
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  let W = 0, H = 0, cols = 0, drops = [], speeds = [], chars = [];

  // Mixed glyphs: katakana-like + binary + hex + latin
  const charset = 'アァカサタナハマヤラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユルグズヅブプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨロヲゴゾドボポ0123456789ABCDEF{}[]<>/\\|=+-*';

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fontSize = 14;
    cols = Math.ceil(W / fontSize);
    drops = new Array(cols).fill(0).map(() => Math.random() * -50);
    speeds = new Array(cols).fill(0).map(() => 0.25 + Math.random() * 0.55);
    chars = new Array(cols).fill('');
    ctx.font = fontSize + 'px JetBrains Mono, monospace';
  }
  resize();
  window.addEventListener('resize', resize);

  let lastT = 0;
  const FPS = 30; // throttle for perf
  const FRAME = 1000 / FPS;

  function draw(t) {
    if (t - lastT < FRAME) {
      requestAnimationFrame(draw);
      return;
    }
    lastT = t;

    // Fade prior frame
    ctx.fillStyle = 'rgba(7, 9, 10, 0.12)';
    ctx.fillRect(0, 0, W, H);

    const fontSize = 14;
    for (let i = 0; i < cols; i++) {
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      // Occasionally change character
      if (Math.random() < 0.4) {
        chars[i] = charset[(Math.random() * charset.length) | 0];
      }
      const c = chars[i] || charset[(Math.random() * charset.length) | 0];

      // Brighter head, dimmer tail
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(c, x, y);
      ctx.fillStyle = 'rgba(74, 222, 128, 0.55)';
      ctx.fillText(c, x, y - fontSize);

      drops[i] += speeds[i];
      if (y > H + Math.random() * 200) {
        drops[i] = Math.random() * -30;
        speeds[i] = 0.25 + Math.random() * 0.55;
      }
    }

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);

  // Pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestAnimationFrame(draw);
  });
})();

// Cursor spotlight — radial glow that follows the cursor
(function() {
  if ('ontouchstart' in window) return; // skip on touch
  const sp = document.createElement('div');
  sp.id = 'cursor-spotlight';
  Object.assign(sp.style, {
    position: 'fixed', top: '0', left: '0', width: '700px', height: '700px',
    pointerEvents: 'none', zIndex: '2',
    background: 'radial-gradient(circle at center, rgba(74,222,128,0.10), rgba(74,222,128,0.04) 30%, transparent 60%)',
    transform: 'translate(-50%, -50%)',
    transition: 'opacity 0.3s',
    opacity: '0',
    mixBlendMode: 'screen',
    filter: 'blur(40px)',
  });
  document.body.appendChild(sp);

  let tx = 0, ty = 0, cx = 0, cy = 0, raf = null, visible = false;
  document.addEventListener('mousemove', (e) => {
    tx = e.clientX; ty = e.clientY;
    if (!visible) { visible = true; sp.style.opacity = '1'; }
    if (!raf) raf = requestAnimationFrame(loop);
  });
  document.addEventListener('mouseleave', () => {
    visible = false; sp.style.opacity = '0';
  });
  function loop() {
    cx += (tx - cx) * 0.12;
    cy += (ty - cy) * 0.12;
    sp.style.transform = `translate(${cx - 350}px, ${cy - 350}px)`;
    if (Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4) {
      raf = requestAnimationFrame(loop);
    } else {
      raf = null;
    }
  }
})();

// Scroll reveal — adds .revealed class to [data-reveal] elements when in viewport
(function() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -80px 0px' });

  // Re-scan whenever DOM mutates significantly (React renders)
  function scan() {
    document.querySelectorAll('[data-reveal]:not(.revealed)').forEach(el => {
      io.observe(el);
    });
  }
  // Initial + periodic catch-up
  scan();
  const mo = new MutationObserver(() => scan());
  mo.observe(document.body, { childList: true, subtree: true });
})();

// Text scramble — reusable on any element with data-scramble attribute
window.scrambleText = function(el, finalText, opts = {}) {
  const { duration = 800, charset = '!<>-_\\/[]{}—=+*^?#________アカサタナハ0123456789ABCDEF' } = opts;
  const start = performance.now();
  let raf;
  function frame(t) {
    const p = Math.min(1, (t - start) / duration);
    let out = '';
    for (let i = 0; i < finalText.length; i++) {
      const charP = (p * finalText.length - i);
      if (charP < 0) {
        out += ' ';
      } else if (charP > 1.5) {
        out += finalText[i];
      } else {
        const ch = finalText[i];
        if (ch === ' ' || ch === '\n') out += ch;
        else out += charset[(Math.random() * charset.length) | 0];
      }
    }
    el.textContent = out;
    if (p < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      el.textContent = finalText;
    }
  }
  raf = requestAnimationFrame(frame);
};
