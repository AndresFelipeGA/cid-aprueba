/* ============================================
   CID Aprueba — Post-login splash
   Inlines the brand SVG so its shapes can be animated individually:
   the two figures pop in, then each letter of the wordmark rises in sequence.
   ============================================ */
import { useEffect, useRef, useState } from 'react';

const LOGO_URL = '/assets/logo-LA-CID.svg';
const DURATION = 2400;
const REDUCED_DURATION = 700;
const FADE_OUT = 450;

let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    logoPromise = fetch(LOGO_URL)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.text();
      })
      .then((text) => {
        const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
        svg.removeAttribute('id');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.querySelectorAll('.cls-2').forEach((path, i) => path.style.setProperty('--i', i));
        return svg;
      })
      .catch(() => null);
  }
  return logoPromise;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Renders the splash overlay and calls `onDone` once it has faded out.
 * The app renders underneath while it plays.
 */
export default function Splash({ firstName, onDone }) {
  const [playing, setPlaying] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const logoRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const svg = await loadLogo();
      if (cancelled) return;
      const logoEl = logoRef.current;
      if (logoEl) {
        if (svg) {
          logoEl.appendChild(svg.cloneNode(true));
        } else {
          logoEl.innerHTML = `<img src="${LOGO_URL}" alt="">`;
        }
      }

      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (cancelled) return;
      setPlaying(true);

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      await sleep(reduced ? REDUCED_DURATION : DURATION);
      if (cancelled) return;
      setFadingOut(true);
      await sleep(FADE_OUT);
      if (!cancelled) onDone();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`splash${playing ? ' splash--play' : ''}${fadingOut ? ' splash--out' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="splash__logo" ref={logoRef} />
      <div className="splash__bar" aria-hidden="true"><div className="splash__bar-fill" /></div>
      <p className="splash__text">{firstName ? `Bienvenido/a, ${firstName}` : 'Preparando tu espacio…'}</p>
    </div>
  );
}
