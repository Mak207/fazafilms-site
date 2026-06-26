// ===== ФАЗА — интерактив сайта =====
const SEL = window.SELECTION || [];
const grid = document.getElementById('grid');
const moreBtn = document.getElementById('moreBtn');
const filters = document.getElementById('filters');
const countEl = document.getElementById('worksCount');
const BATCH = 24;
let curFilter = 'all', shown = 0;

const esc = t => (t || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const filtered = () => curFilter === 'all' ? SEL : SEL.filter(s => s.cat === curFilter);

function cardHTML(s) {
  return `<a class="card" data-cat="${s.cat}" href="${s.vimeo}" target="_blank" rel="noopener" title="${esc(s.title)}">
    <img class="card__img" loading="lazy" src="${s.poster}" alt="${esc(s.title)}">
    <span class="card__cat">${esc(s.cat_ru)}</span>
    <h3 class="card__title">${esc(s.title)}</h3>
    <span class="card__play">▶&nbsp;смотреть на Vimeo</span>
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
  document.querySelectorAll('.section, .hero__inner').forEach(el => {
    el.style.opacity = 0; el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity .7s ease, transform .7s ease';
    io.observe(el);
  });
}
