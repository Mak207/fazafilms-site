// ===== ФАЗА — интерактив сайта =====
// порядок: CG/3D-графика первыми, внутри групп — новые первыми (по vimeo-id убыв.)
const SEL = (window.SELECTION || []).slice().sort((a, b) => {
  if (a.cat === 'cg' && b.cat !== 'cg') return -1;
  if (b.cat === 'cg' && a.cat !== 'cg') return 1;
  return Number(b.id) - Number(a.id);
});
const grid = document.getElementById('grid');
const moreBtn = document.getElementById('moreBtn');
const archiveLink = document.getElementById('archiveLink');
const filters = document.getElementById('filters');
const countEl = document.getElementById('worksCount');
const BATCH = window.innerWidth < 700 ? 9 : 24;
const MAIN_LIMIT = 30;
let curFilter = 'all', shown = 0;

// Vimeo titles in the static selection contain encoded punctuation. Decode
// that punctuation once, then escape HTML as before (no HTML is rendered).
const titleEntities = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", ndash: '–', mdash: '—', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”' };
const esc = t => String(t || '').replace(/&(quot|amp|lt|gt|apos|ndash|mdash|laquo|raquo|ldquo|rdquo);/g, (_, name) => titleEntities[name])
  .replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
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
  const isAll = curFilter === 'all';
  if (reset) { grid.innerHTML = ''; shown = 0; }
  const end = isAll ? Math.min(MAIN_LIMIT, list.length) : Math.min(shown + BATCH, list.length);
  grid.insertAdjacentHTML('beforeend', list.slice(shown, end).map(cardHTML).join(''));
  shown = end;
  if (moreBtn) moreBtn.style.display = (!isAll && shown < list.length) ? '' : 'none';
  if (archiveLink) archiveLink.style.display = (isAll && list.length > MAIN_LIMIT) ? '' : 'none';
  if (countEl) countEl.textContent = list.length;
}

filters?.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  filters.querySelectorAll('.chip').forEach(c => { c.classList.remove('is-active'); c.setAttribute('aria-pressed', 'false'); });
  btn.classList.add('is-active');
  btn.setAttribute('aria-pressed', 'true');
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
const mobileMenu = window.matchMedia('(max-width:900px)');
function setMenuOpen(open) {
  menu?.classList.toggle('is-open', Boolean(open && mobileMenu.matches));
  burger?.setAttribute('aria-expanded', String(Boolean(open && mobileMenu.matches)));
}
burger?.addEventListener('click', () => setMenuOpen(!menu?.classList.contains('is-open')));
menu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenuOpen(false)));
mobileMenu.addEventListener('change', () => setMenuOpen(false));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && menu?.classList.contains('is-open')) { setMenuOpen(false); burger?.focus(); }
});

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

// ===== Форма «Расскажите о задаче»: текст + голос → бриф, капча, анти-спам =====
(function () {
  const form = document.getElementById('briefForm');
  if (!form) return;
  const API = 'https://panel.fazafilms.ru';
  const note = document.getElementById('briefNote');
  const aState = document.getElementById('audioState');
  const recBtn = document.getElementById('recBtn');
  const audioInput = document.getElementById('audioInput');
  const attachBtn = document.getElementById('audioAttach');
  const clearBtn = document.getElementById('audioClear');
  const capAns = document.getElementById('capAns');
  const capRetry = document.getElementById('capRetry');
  const submitBtn = document.getElementById('briefSubmit');
  const field = name => form.elements.namedItem(name);
  const MAX_AUDIO = 40 * 1024 * 1024;
  let capToken = '', audioBlob = null, audioName = '', audioError = '', mediaRec = null;
  let capLoading = false, capRequest = 0, acquiring = false, stopping = false, sending = false;

  function syncControls() {
    const recording = mediaRec?.state === 'recording';
    recBtn.disabled = acquiring || stopping || sending;
    audioInput.disabled = attachBtn.disabled = clearBtn.disabled = acquiring || stopping || recording || sending;
    submitBtn.disabled = acquiring || stopping || recording || sending || capLoading || !capToken || Boolean(audioError);
    ['name', 'contact', 'text'].forEach(name => { field(name).disabled = sending; });
    capAns.disabled = sending || capLoading || !capToken;
    capRetry.disabled = sending || capLoading;
    clearBtn.hidden = !audioBlob && !audioError;
  }
  function audioSizeError(blob) {
    if (blob.size <= 200) return 'Аудио пустое или слишком короткое. Запишите заново или выберите другой файл.';
    if (blob.size > MAX_AUDIO) return 'Аудио больше 40 МБ. Выберите файл поменьше или уберите вложение.';
    return '';
  }
  function clearAudio() {
    audioBlob = null; audioName = ''; audioError = ''; audioInput.value = ''; aState.textContent = '';
    recBtn.textContent = '🎤 Записать голосом'; syncControls();
  }
  function acceptAudio(blob, name, recorded) {
    audioError = audioSizeError(blob);
    audioBlob = audioError ? null : blob; audioName = audioError ? '' : name;
    aState.textContent = audioError || (recorded ? '🎙 запись прикреплена (' + Math.round(blob.size / 1024) + ' КБ)' : '📎 ' + name);
    syncControls();
  }

  async function loadCap() {
    const request = ++capRequest;
    capToken = ''; capAns.value = ''; capLoading = true; syncControls();
    document.getElementById('capQ').textContent = 'загрузка…';
    try {
      const response = await fetch(API + '/api/captcha');
      if (!response.ok) throw new Error('captcha_unavailable');
      const c = await response.json();
      if (!c || typeof c.q !== 'string' || !c.q.trim() || typeof c.token !== 'string' || !c.token) throw new Error('captcha_invalid');
      if (request !== capRequest) return;
      document.getElementById('capQ').textContent = c.q + ' ='; capToken = c.token; capRetry.hidden = true;
    } catch (e) {
      if (request !== capRequest) return;
      document.getElementById('capQ').textContent = 'Проверка не загрузилась'; capToken = ''; capRetry.hidden = false;
    } finally { if (request === capRequest) { capLoading = false; syncControls(); } }
  }
  capRetry.addEventListener('click', loadCap);
  attachBtn.addEventListener('click', () => audioInput.click());
  clearBtn.addEventListener('click', clearAudio);
  loadCap();

  recBtn.addEventListener('click', async () => {
    if (acquiring || stopping || sending) return;
    if (mediaRec?.state === 'recording') {
      stopping = true; syncControls(); mediaRec.stop(); return;
    }
    acquiring = true; syncControls();
    let stream = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('recording_unavailable');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream), chunks = [];
      let failed = false;
      mediaRec = recorder;
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => {
        failed = true; audioError = 'Не удалось записать аудио. Запишите заново или прикрепите файл.';
        audioBlob = null; audioName = ''; aState.textContent = audioError;
        if (recorder.state !== 'inactive') { try { recorder.stop(); } catch (_) {} }
        stream.getTracks().forEach(t => t.stop());
        mediaRec = null; stopping = false; recBtn.classList.remove('rec'); syncControls();
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        mediaRec = null; stopping = false; recBtn.textContent = '🎤 Записать заново'; recBtn.classList.remove('rec');
        if (!failed) {
          const mime = recorder.mimeType || chunks.find(chunk => chunk.type)?.type || 'audio/webm';
          const extensions = { 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac' };
          const ext = extensions[mime.split(';')[0].trim().toLowerCase()];
          if (ext) acceptAudio(new Blob(chunks, { type: mime }), 'voice.' + ext, true);
          else { audioError = 'Формат записи не поддерживается. Прикрепите аудиофайл.'; aState.textContent = audioError; }
        }
        syncControls();
      };
      recorder.start();
      audioBlob = null; audioName = ''; audioError = ''; audioInput.value = '';
      recBtn.textContent = '⏹ Остановить'; recBtn.classList.add('rec');
      aState.textContent = '● идёт запись…';
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop()); mediaRec = null; stopping = false;
      recBtn.classList.remove('rec');
      aState.textContent = 'Микрофон недоступен — прикрепите файл' + (audioBlob ? '. Прежнее аудио сохранено.' : '');
    } finally { acquiring = false; syncControls(); }
  });

  audioInput.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) acceptAudio(f, f.name, false);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    if (acquiring || stopping || mediaRec?.state === 'recording') { note.textContent = 'Сначала остановите запись и дождитесь прикрепления аудио.'; return; }
    if (audioError) { note.textContent = audioError; return; }
    if (capLoading || !capToken) { note.textContent = 'Дождитесь загрузки проверки или нажмите «Повторить».'; return; }
    if (!field('contact').value.trim() || (!field('text').value.trim() && !audioBlob)) {
      note.textContent = 'Укажите контакт и задачу — текстом или голосом.'; return;
    }
    const fd = new FormData();
    fd.append('name', field('name').value || '');
    fd.append('contact', field('contact').value || '');
    fd.append('text', field('text').value || '');
    fd.append('captcha', capAns.value || '');
    fd.append('captcha_token', capToken);
    fd.append('website', document.getElementById('hpField').value || '');
    if (audioBlob) fd.append('audio', audioBlob, audioName);
    sending = true; syncControls(); note.textContent = 'Отправляем…';
    try {
      const r = await fetch(API + '/api/brief', { method: 'POST', body: fd });
      if (r.ok) {
        note.textContent = '✅ Спасибо! Заявка получена — свяжемся в течение рабочего дня.';
        form.reset(); clearAudio(); loadCap();
      } else {
        let detail = '';
        try { detail = (await r.json()).detail; } catch (_) {}
        note.textContent = r.status === 413 ? '⚠️ Аудио больше 40 МБ. Выберите файл поменьше или уберите вложение.'
          : r.status === 400 && detail === 'Аудио пустое или слишком короткое' ? '⚠️ Аудио пустое или слишком короткое. Запишите заново или выберите другой файл.'
          : r.status === 400 ? '⚠️ Проверьте ответ на пример и заполните контакт.'
          : r.status === 429 ? '⚠️ Слишком много заявок — попробуйте позже.' : '⚠️ Не удалось отправить, попробуйте ещё раз.';
        loadCap();
      }
    } catch (e) { note.textContent = '⚠️ Нет связи. Напишите на project@fazafilms.ru'; }
    finally { sending = false; syncControls(); }
  });
})();
