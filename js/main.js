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

// ===== Hero: ротация шоурила (разный при каждом заходе) + видео только на десктопе =====
(function () {
  const bg = document.getElementById('heroBg');
  if (!bg) return;

  // пул сильных шоурилов/CG (каждый id имеет постер assets/posters/<id>.jpg)
  const POOL = ['1084907216','1084907589','1144082517','999169734','1031059410',
                '922265852','909958568','1146854881','1088667673','1162416540'];
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
  // подменяем постер на выбранный ролик (с фолбэком, чтобы не было битой картинки)
  const poster = bg.querySelector('.hero__poster');
  if (poster) {
    const img = new Image();
    img.onload = () => { poster.src = img.src; };
    img.src = 'assets/posters/' + id + '.webp';
  }

  const conn = navigator.connection || {};
  const heavyOk =
    window.innerWidth >= 900 &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !conn.saveData &&
    !/2g|slow-2g|3g/.test(conn.effectiveType || '');
  if (!heavyOk) return; // мобильные и медленные сети — остаёмся на лёгком постере
  const load = () => {
    const id = bg.dataset.reel;
    const f = document.createElement('iframe');
    f.src = `https://player.vimeo.com/video/${id}?background=1&autoplay=1&loop=1&muted=1&autopause=0&dnt=1`;
    f.title = 'ФАЗА — шоурил';
    f.allow = 'autoplay; fullscreen; picture-in-picture';
    f.setAttribute('frameborder', '0');
    f.style.opacity = '0';
    f.style.transition = 'opacity 1.2s ease';
    f.addEventListener('load', () => { f.style.opacity = '1'; });
    bg.appendChild(f);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 2500 });
  else window.addEventListener('load', () => setTimeout(load, 800));
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
