(() => {
  const dialog = document.querySelector('#film-dialog');
  const movie = dialog.querySelector('video');
  const preview = document.createElement('video');
  preview.muted = preview.defaultMuted = preview.loop = preview.playsInline = true;
  preview.className = 'hover-film';
  preview.setAttribute('aria-hidden', 'true');
  let trigger;
  let current;
  let timer;
  function stopPreview() {
    clearTimeout(timer);
    current = null;
    preview.pause();
    preview.remove();
    if (preview.hasAttribute('src')) { preview.removeAttribute('src'); preview.load(); }
  }
  const stopOnHide = () => { if (document.hidden) { stopPreview(); movie.pause(); } };
  document.addEventListener('visibilitychange', stopOnHide);
  window.addEventListener('hashchange', stopPreview);
  for (const card of document.querySelectorAll('.experience[data-scene]')) {
    const cover = card.querySelector('.play-cover');
    const title = card.querySelector('h2').textContent;
    const asset = new URL(cover.href);
    if(card.dataset.filmRevision) asset.searchParams.set('v',card.dataset.filmRevision);
    const file = asset.href;
    card.addEventListener('pointerenter', e => {
      if (cover.closest('.material-unpublished') || e.pointerType !== 'mouse' || dialog.open || navigator.connection?.saveData ||
          matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      stopPreview(); current = card;
      timer = setTimeout(() => {
        if (card !== current) return;
        preview.src = file; cover.append(preview);
        preview.play().catch(() => { if (current === card) stopPreview(); });
      }, 160);
    });
    card.addEventListener('pointerleave', stopPreview);
    for (const link of [cover, card.querySelector('.film-link')]) link.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !dialog.showModal) return;
      e.preventDefault(); stopPreview(); trigger = link;
      dialog.querySelector('#film-heading').textContent = title;
      dialog.querySelector('#gallery-status').textContent = card.dataset.performance ? '' : 'Драфт';
      dialog.querySelector('#film-resolution').textContent = '';
      movie.poster = cover.querySelector('img').src;
      movie.replaceChildren();
      const captions = document.createElement('track');
      Object.assign(captions, {kind:'captions', label:'Русский', srclang:'ru',src:file.replace(/\.mp4(?=\?|$)/,'.vtt')});
      movie.append(captions); movie.src = file; movie.muted = false;
      dialog.showModal(); movie.play().catch(() => {}); dialog.querySelector('button').focus();
    });
  }
  movie.addEventListener('loadedmetadata', () => {
    document.querySelector('#film-resolution').textContent = movie.videoWidth+' × '+movie.videoHeight;
  });
  document.querySelector('#dismiss-film').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    movie.pause(); movie.removeAttribute('src'); movie.replaceChildren(); movie.load();
    trigger?.focus({preventScroll:true});
  });
})();
