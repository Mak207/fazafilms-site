'use strict';

const panels = Array.from(document.querySelectorAll('.panel'));
const navigation = Array.from(document.querySelectorAll('[data-nav]'));
const legacyAnchors = {
  overview: 'approved',
  R01: 'REF-01',
  R02: 'REF-02',
  deck: 'deck-title'
};
const ownerFilter = document.getElementById('owner-filter');
const decisions = Array.from(document.querySelectorAll('.decision'));

function filterDecisions() {
  let visible = 0;
  for (const decision of decisions) {
    const owner = decision.dataset.owner;
    const search = ownerFilter.value;
    const jointQuestion = owner === 'Оба' && (search === 'Вячеслав' || search === 'Дорошенко');
    const matches = !search || owner === search || jointQuestion;
    decision.hidden = !matches;
    if (matches) visible++;
  }
  document.getElementById('result-count').textContent = 'Вопросов: ' + visible;
}

function showSection(focus = false) {
  const hash = location.hash.slice(1);
  const target = document.getElementById(legacyAnchors[hash] || hash);
  const section = target?.closest('.panel') || document.getElementById('approved');

  for (const panel of panels) panel.hidden = panel !== section;
  for (const link of navigation) {
    if (link.dataset.nav === section.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const heading = document.getElementById(section.id + '-title');
  document.title = section.id === 'approved' ? 'Золотое кольцо — референсы · ФАЗА' : heading.textContent + ' · Золотое кольцо';
  if (target?.matches('.decision')) {
    if (target.hidden) {
      ownerFilter.value = '';
      filterDecisions();
    }
    target.open = true;
  }
  if (focus) {
    heading.focus({preventScroll: true});
    if (target && target !== section) target.scrollIntoView({block: 'start'});
    else window.scrollTo(0, 0);
  } else if (target && target !== section) {
    requestAnimationFrame(() => target.scrollIntoView({block: 'start'}));
  }
}

document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  document.getElementById('main').focus();
});
ownerFilter.addEventListener('change', filterDecisions);
window.addEventListener('hashchange', () => showSection(true));
filterDecisions();
showSection();

const viewer = document.getElementById('viewer');
const stage = document.getElementById('image-stage');
const image = document.getElementById('viewer-image');
const viewerTitle = document.getElementById('viewer-title');
const previous = document.getElementById('prev');
const next = document.getElementById('next');
const zoom = document.getElementById('zoom');
const galleries = {
  boards: Array.from(document.querySelectorAll('[data-gallery="boards"]')),
  slides: Array.from(document.querySelectorAll('[data-gallery="slides"]'))
};
let activeGallery = [];
let activeIndex = 0;
let returnFocus;

function setZoom(enlarged) {
  stage.classList.toggle('zoomed', enlarged);
  stage.style.setProperty('--image-width', (image.naturalWidth || 1920) + 'px');
  zoom.setAttribute('aria-pressed', String(enlarged));
  zoom.textContent = enlarged ? 'Лист целиком' : 'Увеличить';
  stage.scrollTo(0, 0);
}

function displayImage(index) {
  if (index < 0 || index >= activeGallery.length) return;
  activeIndex = index;
  const item = activeGallery[index];
  image.src = item.href;
  image.alt = item.dataset.title;
  viewerTitle.textContent = (index + 1) + ' / ' + activeGallery.length + ' · ' + item.dataset.title;
  previous.disabled = index === 0;
  next.disabled = index === activeGallery.length - 1;
  setZoom(false);
}

function openGallery(event, gallery, index) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !viewer.showModal) return;
  event.preventDefault();
  activeGallery = gallery;
  returnFocus = event.currentTarget;
  displayImage(index);
  viewer.showModal();
}

for (const gallery of Object.values(galleries)) {
  gallery.forEach((item, index) => {
    item.addEventListener('click', event => openGallery(event, gallery, index));
  });
}
document.getElementById('start-show').addEventListener('click', event => openGallery(event, galleries.slides, 0));
document.getElementById('close-show').addEventListener('click', () => viewer.close());
viewer.addEventListener('close', () => returnFocus?.focus({preventScroll: true}));
zoom.addEventListener('click', () => setZoom(!stage.classList.contains('zoomed')));
previous.addEventListener('click', () => displayImage(activeIndex - 1));
next.addEventListener('click', () => displayImage(activeIndex + 1));
viewer.addEventListener('keydown', event => {
  if (stage.classList.contains('zoomed') && event.target === stage) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    displayImage(activeIndex + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});

const demoPlayer = document.querySelector('#demo-player');
const demoWindow = document.querySelector('#demo-window');
const closeDemo = document.querySelector('#close-demo');
let demoTrigger;

function openDemo(event) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !demoPlayer.showModal) return;
  event.preventDefault();
  demoTrigger = event.currentTarget;
  const name = demoTrigger.dataset.title;
  document.querySelector('#demo-title').textContent = name;
  document.querySelector('#solo-demo').href = demoTrigger.href;
  demoWindow.title = name;
  demoWindow.src = demoTrigger.href;
  demoPlayer.showModal();
  closeDemo.focus();
}

document.querySelectorAll('[data-demo]').forEach(link => link.addEventListener('click', openDemo));
closeDemo.addEventListener('click', () => demoPlayer.close());
demoWindow.addEventListener('load', () => {
  if (!demoPlayer.open) return;
  demoWindow.contentDocument?.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !demoWindow.contentDocument.fullscreenElement) {
      event.preventDefault();
      demoPlayer.close();
    }
  });
});
demoPlayer.addEventListener('close', () => {
  if (demoPlayer.open) return;
  demoWindow.removeAttribute('src');
  demoTrigger?.focus({preventScroll: true});
});
