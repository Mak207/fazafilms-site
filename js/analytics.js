// Public-site analytics only; no form content, audio, or cabinet data.
(() => {
  'use strict';
  if (location.hostname !== 'fazafilms.ru' || window.__fazaAnalytics) return;
  window.__fazaAnalytics = true;
  const counter = 113826620;
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = Date.now();
  const script = document.createElement('script');
  script.async = true; script.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.appendChild(script);
  const cleanUrl = new URL(location.href);
  for (const name of [...cleanUrl.searchParams.keys()]) {
    if (!['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid','gclid','ysclid'].includes(name)) cleanUrl.searchParams.delete(name);
  }
  cleanUrl.hash = '';
  window.ym(counter, 'init', {webvisor:false, clickmap:false, trackLinks:false, accurateTrackBounce:true, url:cleanUrl.href});
  const allowed = new Set(['brief_success','contact_click','portfolio_click','cabinet_click']);
  function goal(name) { if (allowed.has(name)) window.ym(counter, 'reachGoal', name); }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (href === '#contact' || href.startsWith('mailto:') || href.startsWith('tel:')) goal('contact_click');
    else if (link.classList.contains('card')) goal('portfolio_click');
    else if (href === 'https://panel.fazafilms.ru/workplace') goal('cabinet_click');
  });
  window.addEventListener('faza:brief-success', () => goal('brief_success'));
})();
