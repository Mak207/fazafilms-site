const nf = (value, digits = 1) => Number.isFinite(value)
  ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value) : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A separate, explicitly scoped RGO proposal beside the existing park scenario. */
export function createRgoOverview({ mount, onOpenDocuments }) {
  const overview = mount.querySelector('#ic-overview');
  const requestedHall = new URL(location.href).searchParams.get('rgo');
  const hall = /^(all|0[0-8])$/.test(requestedHall || '') ? requestedHall : 'all';
  let program = requestedHall && /^(all|0[0-8])$/.test(requestedHall) ? 'rgo' : 'park';
  let started = false;
  const controls = document.createElement('div');
  controls.className = 'ic-map-programs';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Выбор схемы');
  controls.innerHTML = '<button type="button" data-program="park" aria-pressed="true">Парк · 2D</button><button type="button" data-program="rgo" aria-pressed="false">РГО · 9 залов в 3D</button><span>Отдельная программа по первичке РГО</span>';
  overview.prepend(controls);

  const section = document.createElement('section');
  section.className = 'ic-rgo-overview';
  section.id = 'ic-rgo-overview';
  section.setAttribute('aria-label', 'РГО: экраны в девяти залах');
  const tourUrl = new URL('./tour/', location.href);
  tourUrl.searchParams.set('rgo', hall);
  tourUrl.searchParams.set('v', 'rgo-20261124');
  section.innerHTML = `
    <div class="ic-rgo-map-heading"><div><h3>РГО: от Пролога до Будущего</h3><p>Выберите зал на карте. Наведите на полотно или нажмите его, чтобы увидеть размеры и назначение.</p></div><a class="ic-rgo-open" href="${esc(tourUrl.href)}" target="_blank" rel="noopener">Открыть 3D на весь экран ↗</a></div>
    <iframe id="ic-rgo-frame" title="РГО — интерактивная 3D-расстановка экранов" allow="fullscreen" allowfullscreen loading="lazy"></iframe>
    <div class="ic-rgo-summary" aria-live="polite"><p class="ic-note">Загружаем состав РГО…</p></div>`;
  controls.after(section);
  const frame = section.querySelector('iframe');

  const syncVisibility = () => {
    const visible = program === 'rgo' && mount.dataset.section === 'overview' && document.body.dataset.folder === 'installations';
    frame.contentWindow?.postMessage({ type: 'park-tour-visibility', visible }, location.origin);
  };
  frame.addEventListener('load', syncVisibility);
  const observer = new MutationObserver(syncVisibility);
  observer.observe(mount, { attributes: true, attributeFilter: ['data-section'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-folder'] });

  async function loadSummary() {
    const target = section.querySelector('.ic-rgo-summary');
    try {
      const response = await fetch('./tour/rgo-data.json?v=rgo-20261124');
      if (!response.ok) throw new Error('RGO proposal unavailable');
      const data = await response.json();
      if (data.confirmedProgram?.hallCount !== 9 || !data.totals?.local || !Array.isArray(data.halls)) throw new Error('RGO proposal incomplete');
      const t = data.totals.local, c = data.content, r = data.reconciliation;
      const facts = [
        [data.confirmedProgram.hallCount, 'последовательных залов', `${nf(data.confirmedProgram.programHallAreaM2, 0)} м² по программе`],
        [t.surfaceCount, 'LED-полотен в РГО', `${nf(data.totals.additional.surfaceCount, 0)} новых + ${nf(data.totals.sharedNavigation.surfaceCount, 0)} из общей навигации`],
        [c.totalNewRgoPackageCount, 'новых пакетов контента', `${nf(c.digitalPackageCount, 0)} цифровых + ${nf(c.editorialPackageCount, 0)} редакционных`]
      ];
      target.innerHTML = `<div class="ic-kpis">${facts.map(([v, label, note]) => `<div class="ic-kpi"><strong>${nf(v, 0)}</strong><span>${esc(label)}</span><small>${esc(note)}</small></div>`).join('')}</div>
        <p class="ic-rgo-led"><strong>${nf(t.cabinetCount, 0)} кабинетов · ${nf(t.areaM2, 2)} м² LED</strong><span>${nf(t.cabinetMassKg, 1)} кг кабинетов · ≤${nf(t.publishedSeriesMaximumW / 1000, 2)} кВт по верхнему показателю серии</span></p>
        <p class="ic-note">Это предложение на основе программы 018: GLOSHINE X Pro 1.58, кабинеты 608 × 342 мм. Проекции, купол, портретные устройства, крепления и внешняя техника требуют отдельной комплектации; полный монтажный вес и питание РГО пока не определены.</p>
        <details class="ic-document-section"><summary>Как РГО меняет общий объём<span aria-hidden="true">+</span></summary><div class="ic-prose">
          <p><strong>${nf(r.describedLedSurfaces, 0)} описанных LED-поверхностей</strong> для Парка: (${nf(r.originalWorkingBase.surfaces, 0)} − ${nf(r.unassignedCommonReserveRemovedFromDescribedCount.surfaces, 0)} нераспределённых общих) + (${nf(t.surfaceCount, 0)} РГО − ${nf(data.totals.sharedNavigation.surfaceCount, 0)} общая навигация). Это ${nf(r.describedLedCabinets, 0)} кабинета и ${nf(r.describedLedAreaM2, 2)} м² LED при принятом профиле.</p>
          <p>Описанный контент: ${nf(r.originalWorkingBase.packages, 0)} − ${nf(r.unassignedCommonReserveRemovedFromDescribedCount.digitalPackages, 0)} общих резервных + ${nf(c.totalNewRgoPackageCount, 0)} РГО = <strong>${nf(r.describedContentPackages, 0)} пакетов</strong>. Остальные общие программы и специальные медиасистемы ещё не раскрыты, поэтому это промежуточный объём.</p>
          <p>Расстановка РГО рассчитана для рабочего сценария 300 экскурсионных + 500 самостоятельных посетителей в час, при условии входа всех в РГО. Три копии каждой из шести LED-игр обслуживают один сюжет; шесть активных ролей на станции и 40% участия требуют проверки прототипом. Параметры калькулятора Парка не меняют эту отдельную расстановку автоматически.</p>
          <p>1 120 м² — сумма площадей залов в первичке. Границы этих площадей ещё не обмерены в CAD; общая площадь Парка остаётся 18 884 м² по 3D из DWG. Девять залов и 45+ экспонатов не равны количеству экранов или инсталляций.</p>
        </div></details>
        <div class="ic-rgo-actions"><button type="button" data-rgo-doc>Программа и основания расчёта</button><a href="${esc(tourUrl.href)}" target="_blank" rel="noopener">Открыть расстановку отдельно ↗</a></div>`;
      target.querySelector('[data-rgo-doc]').addEventListener('click', onOpenDocuments);
    } catch {
      target.innerHTML = '<p class="ic-warning">Состав РГО не загрузился. Откройте 3D отдельно или обновите страницу; итоговые числа пока не показаны.</p>';
    }
  }

  function setProgram(value, updateUrl = true) {
    if (!['park', 'rgo'].includes(value)) return;
    program = value;
    mount.dataset.planProgram = value;
    section.hidden = value !== 'rgo';
    controls.querySelectorAll('[data-program]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.program === value)));
    if (value === 'rgo' && !started) {
      started = true;
      frame.src = tourUrl.href;
      loadSummary();
    }
    if (updateUrl) {
      const url = new URL(location.href);
      if (value === 'rgo') url.searchParams.set('rgo', hall);
      else url.searchParams.delete('rgo');
      history.replaceState(null, '', url);
    }
    syncVisibility();
  }
  controls.querySelectorAll('[data-program]').forEach(button => button.addEventListener('click', () => setProgram(button.dataset.program)));
  setProgram(program, false);
  return { setProgram };
}
