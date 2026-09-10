/* ============================================
   CID Aprueba — Post-login splash
   Inlines the brand SVG so its shapes can be animated individually:
   the two figures pop in, then each letter of the wordmark rises in sequence.
   ============================================ */

import { escapeHtml } from '../utils/format.js';

const LOGO_URL = 'assets/logo-LA-CID.svg';
const DURATION = 2400;
const REDUCED_DURATION = 700;
const FADE_OUT = 450;

let logoPromise = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        // Per-letter delay for the wordmark (`.cls-2` paths are in reading order)
        svg.querySelectorAll('.cls-2').forEach((path, i) => path.style.setProperty('--i', i));
        return svg;
      })
      .catch(() => null);
  }
  return logoPromise;
}

/**
 * Show the splash overlay and resolve once it has faded out.
 * The app can render underneath while it plays.
 * @param {{ full_name?: string } | null} user
 */
export async function playSplash(user) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const firstName = user && user.full_name ? user.full_name.split(' ')[0] : '';

  const overlay = document.createElement('div');
  overlay.className = 'splash';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="splash__logo"></div>
    <div class="splash__bar" aria-hidden="true"><div class="splash__bar-fill"></div></div>
    <p class="splash__text">${firstName ? `Bienvenido/a, ${escapeHtml(firstName)}` : 'Preparando tu espacio…'}</p>
  `;
  document.body.appendChild(overlay);

  const svg = await loadLogo();
  const logoEl = overlay.querySelector('.splash__logo');
  if (svg) {
    logoEl.appendChild(svg.cloneNode(true));
  } else {
    logoEl.innerHTML = `<img src="${LOGO_URL}" alt="">`;
  }

  // Next frame so the initial (hidden) state paints before the animations start
  await new Promise((resolve) => requestAnimationFrame(resolve));
  overlay.classList.add('splash--play');

  await sleep(reduced ? REDUCED_DURATION : DURATION);
  overlay.classList.add('splash--out');
  await sleep(FADE_OUT);
  overlay.remove();
}
