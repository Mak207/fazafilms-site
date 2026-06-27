// ===== ФАЗА — интерактив сайта =====
const SEL = window.SELECTION || [];
const grid = document.getElementById('grid');
const moreBtn = document.getElementById('moreBtn');
const filters = document.getElementById('filters');
const countEl = document.getElementById('worksCount');
const BATCH = window.innerWidth < 700 ? 9 : 24;
let curFilter = 'all', shown = 0;

const esc = t => (t || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const filtered = () => curFilter === 'all' ? SEL : SEL.filter(s => s.cat === curFilter);

function cardHTML(s) {
  const webp = s.poster.replace(/\.jpg$/, '.webp');
  return `<a class="card" data-cat="${s.cat}" href="${s.vimeo}" target="_blank" rel="noopener" title="${esc(s.title)}">
    <picture>
      <source srcset="${webp}" type="image/webp">
      <img class="card__img" loading="lazy" src="${s.poster}" alt="${esc(s.title)}" width="480" height="270">
    </picture>
    <video class="card__vid" muted loop playsinline preload="none" data-src="assets/previews/${s.id}.mp4"></video>
    <span class="card__cat">${esc(s.cat_ru)}</span>
    <h3 class="card__title">${esc(s.title)}</h3>
    <span class="card__play">▶&nbsp;смотреть</span>
  </a>`;
}

function render(reset) {
  const list = filtered();
  if (reset) { grid.innerHTML = ''; shown = 0; }
  grid.insertAdjacentHTML('beforeend', list.slice(shown, shown + BATCH).map(cardHTML).join(''));
  shown = Math.min(shown + BATCH, list.length);
  if (moreBtn) moreBtn.style.display = shown < list.length ? '' : 'none';
  if (countEl) countEl.textContent = list.length;
}

filters?.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  filters.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
  btn.classList.add('is-active');
  curFilter = btn.dataset.filter;
  render(true);
});
moreBtn?.addEventListener('click', () => render(false));
if (grid) render(true);

// hover-видео на карточках (только устройства с мышью — десктоп)
if (grid && window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
  grid.addEventListener('mouseover', (e) => {
    const card = e.target.closest('.card'); if (!card) return;
    const v = card.querySelector('.card__vid'); if (!v) return;
    if (!v.src && v.dataset.src) v.src = v.dataset.src;  // лениво — только при наведении
    v.play().catch(() => {});
  });
  grid.addEventListener('mouseout', (e) => {
    const card = e.target.closest('.card'); if (!card) return;
    if (e.relatedTarget && card.contains(e.relatedTarget)) return;
    const v = card.querySelector('.card__vid');
    if (v && v.src) { try { v.pause(); v.currentTime = 0; } catch (_) {} }
  });
}

// ===== Hero: ротация шоурила (разный при каждом заходе) — НАТИВНОЕ видео на самом сайте =====
// Видео хостится у нас (assets/hero-<id>.mp4), а не на Vimeo — играет у всех,
// не зависит от доменных ограничений Vimeo и блокировок ТСПУ в РФ.
(function () {
  const bg = document.getElementById('heroBg');
  const vid = document.getElementById('heroVideo');
  if (!bg || !vid) return;

  // пул собственных веб-петель (каждый id имеет assets/hero-<id>.mp4 и постер assets/posters/<id>.webp)
  const POOL = ['1084907216', '1084907589', '1144082517'];
  // ротация по кругу через localStorage → повторный визит видит ДРУГОЙ
  let idx = 0;
  try {
    const prev = parseInt(localStorage.getItem('faza_hero_i') || '-1', 10);
    idx = (isNaN(prev) ? -1 : prev) + 1;
    if (idx >= POOL.length) idx = 0;
    localStorage.setItem('faza_hero_i', String(idx));
  } catch (e) { idx = Math.floor((Date.now() / 1000) % POOL.length); }
  const id = POOL[idx];
  bg.dataset.reel = id;

  // постер выбранного ролика (с фолбэком, чтобы не было битой картинки)
  const poster = bg.querySelector('.hero__poster');
  const img = new Image();
  img.onload = () => { if (poster) poster.src = img.src; vid.poster = img.src; };
  img.src = 'assets/posters/' + id + '.webp';

  // экономия трафика / reduce-motion / очень медленная сеть → остаёмся на лёгком постере
  const conn = navigator.connection || {};
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      conn.saveData || /(^|\W)(2g|slow-2g)(\W|$)/.test(conn.effectiveType || '')) return;

  // источник + воспроизведение (muted+playsinline → autoplay разрешён везде, в т.ч. на мобильных)
  vid.muted = true; vid.defaultMuted = true; vid.setAttribute('muted', '');
  vid.src = 'assets/hero-' + id + '.mp4';
  const tryplay = () => { const p = vid.play(); if (p && p.catch) p.catch(() => {}); };
  vid.addEventListener('canplay', () => { vid.style.opacity = '1'; tryplay(); }, { once: true });
  vid.addEventListener('loadeddata', tryplay, { once: true });
  if ('requestIdleCallback' in window) requestIdleCallback(tryplay, { timeout: 1500 });
  else window.addEventListener('load', () => setTimeout(tryplay, 300));
})();

// ===== Бургер-меню (мобильное) =====
const burger = document.getElementById('burger');
const menu = document.querySelector('.nav__menu');
burger?.addEventListener('click', () => {
  const open = menu.style.display === 'flex';
  menu.style.display = open ? '' : 'flex';
  Object.assign(menu.style, open ? {} : {
    position: 'absolute', top: '64px', left: '0', right: '0',
    flexDirection: 'column', background: 'rgba(11,11,13,.97)',
    padding: '20px 28px', borderBottom: '1px solid #26262d'
  });
});
menu?.querySelectorAll('a').forEach(a =>
  a.addEventListener('click', () => { if (window.innerWidth <= 900) menu.style.display = ''; })
);

// ===== Плавное появление секций =====
const io = new IntersectionObserver((entries) => {
  entries.forEach(en => {
    if (en.isIntersecting) {
      en.target.style.opacity = 1; en.target.style.transform = 'none';
      io.unobserve(en.target);
    }
  });
}, { threshold: 0.1 });
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('.section').forEach(el => {
    el.style.opacity = 0; el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity .7s ease, transform .7s ease';
    io.observe(el);
  });
}
