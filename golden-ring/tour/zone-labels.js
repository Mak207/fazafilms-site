import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const overlaps = (a, b, gap = 5) => a.left < b.right + gap && a.right + gap > b.left
  && a.top < b.bottom + gap && a.bottom + gap > b.top;

export function createZoneLabels({ stage, camera, zones, toggle, selectZone }) {
  const layer = document.createElement('div');
  layer.className = 'zone-label-layer';
  layer.setAttribute('aria-label', 'Города и зоны на модели заказчика');
  const lines = document.createElementNS(SVG_NS, 'svg');
  lines.classList.add('zone-label-lines');
  lines.setAttribute('aria-hidden', 'true');
  layer.append(lines);
  stage.append(layer);

  let enabled = true;
  let viewName = 'overview';
  let selectedId = null;
  let dirty = true;
  let sizeKey = '';
  let previousMatrix = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const world = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const records = zones.map(zone => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'zone-label' + (zone.city ? ' is-city' : ' is-place');
    button.dataset.zone = zone.id;
    button.setAttribute('aria-label', 'Рассмотреть зону: ' + zone.title);
    const number = document.createElement('span');
    number.className = 'zone-label-number';
    number.textContent = String(zone.number);
    const title = document.createElement('strong');
    title.textContent = zone.shortTitle || zone.title;
    const copy = document.createElement('span');
    copy.className = 'zone-label-copy';
    copy.append(title);
    if (zone.subTitle) {
      const subtitle = document.createElement('small');
      subtitle.textContent = zone.subTitle;
      copy.append(subtitle);
    }
    button.append(number, copy);
    button.addEventListener('click', event => {
      event.stopPropagation();
      selectZone(zone);
    });
    const line = document.createElementNS(SVG_NS, 'path');
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', zone.city ? '3.5' : '2.5');
    dot.dataset.zoneAnchor = zone.id;
    lines.append(line, dot);
    layer.append(button);
    return { zone, button, line, dot, width: 0, height: 0, rect: null, point: null };
  });

  function setEnabled(value) {
    enabled = value;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? 'Подписи: вкл.' : 'Подписи: выкл.';
    layer.hidden = !enabled;
    dirty = true;
  }
  toggle.addEventListener('click', () => setEnabled(!enabled));
  setEnabled(true);

  function setView(name) {
    viewName = name;
    selectedId = name.startsWith('zone-') ? name.slice(5) : null;
    records.forEach(record => {
      const selected = record.zone.id === selectedId;
      record.button.classList.toggle('is-selected', selected);
      record.button.setAttribute('aria-pressed', String(selected));
    });
    dirty = true;
  }

  function update(force = false) {
    const mapView = viewName === 'overview' || viewName === 'plan';
    const zoneView = Boolean(selectedId);
    layer.hidden = !enabled || (!mapView && !zoneView);
    if (layer.hidden) return;
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const width = stage.clientWidth, height = stage.clientHeight;
    const nextSize = width + 'x' + height;
    if (!force && !dirty && nextSize === sizeKey && previousMatrix.equals(matrix)) return;
    previousMatrix.copy(matrix);
    const resized = nextSize !== sizeKey;
    sizeKey = nextSize;
    dirty = false;
    lines.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    const stageRect = stage.getBoundingClientRect();
    const blocked = [...stage.querySelectorAll('.view-card, .help, .camera-nav, .zone-label-toggle, .source-zone-details')].filter(element => {
      if (element.hidden) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).map(element => {
      const box = element.getBoundingClientRect();
      return { left: box.left - stageRect.left - 3, right: box.right - stageRect.left + 3,
        top: box.top - stageRect.top - 3, bottom: box.bottom - stageRect.top + 3 };
    });
    const candidates = [];
    for (const record of records) {
      const allowed = mapView || record.zone.id === selectedId;
      world.fromArray(record.zone.anchor);
      projected.copy(world).project(camera);
      const onScreen = projected.z > -1 && projected.z < 1
        && projected.x > -1.03 && projected.x < 1.03
        && projected.y > -1.03 && projected.y < 1.03;
      record.button.hidden = !allowed || !onScreen;
      record.line.style.display = record.button.hidden ? 'none' : '';
      record.dot.style.display = record.button.hidden ? 'none' : '';
      record.rect = null;
      if (record.button.hidden) { record.point = null; continue; }
      if (resized || !record.width) {
        record.width = record.button.offsetWidth;
        record.height = record.button.offsetHeight;
      }
      record.point = { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
      candidates.push(record);
    }
    candidates.sort((a, b) => Number(b.zone.id === selectedId) - Number(a.zone.id === selectedId)
      || Number(b.zone.city) - Number(a.zone.city) || a.zone.number - b.zone.number);
    const placed = [];
    const margin = width < 600 ? 7 : 11;
    for (const record of candidates) {
      const { x, y } = record.point;
      const bw = record.width, bh = record.height;
      let best = null, bestScore = Infinity;
      const tryPosition = (cx, cy, penalty = 0) => {
        const left = clamp(cx - bw / 2, margin, width - bw - margin);
        const top = clamp(cy - bh / 2, margin, height - bh - margin);
        const box = { left, top, right: left + bw, bottom: top + bh };
        if (blocked.some(other => overlaps(box, other, 3)) || placed.some(other => overlaps(box, other, 4))) return;
        const dx = left + bw / 2 - x, dy = top + bh / 2 - y;
        const score = dx * dx + dy * dy + penalty;
        if (score < bestScore) { best = box; bestScore = score; }
      };
      const preferred = record.zone.labelOffset || [0, -25];
      tryPosition(x + preferred[0], y + preferred[1]);
      for (let radius = 24; radius <= 240; radius += 22) {
        for (let step = 0; step < 16; step++) {
          const angle = step * Math.PI / 8;
          tryPosition(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 40);
        }
        if (best && radius * radius > bestScore + 2000) break;
      }
      if (!best) {
        for (let cy = margin + bh / 2; cy < height - margin - bh / 2; cy += 14) {
          for (let cx = margin + bw / 2; cx < width - margin - bw / 2; cx += 18) tryPosition(cx, cy, 80);
        }
      }
      if (!best) {
        record.button.hidden = true;
        record.line.style.display = record.dot.style.display = 'none';
        continue;
      }
      record.rect = best;
      placed.push(best);
      record.button.style.transform = 'translate(' + best.left.toFixed(1) + 'px,' + best.top.toFixed(1) + 'px)';
      const endX = clamp(x, best.left, best.right);
      const endY = clamp(y, best.top, best.bottom);
      record.line.setAttribute('d', 'M ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' L ' + endX.toFixed(1) + ' ' + endY.toFixed(1));
      record.dot.setAttribute('cx', x.toFixed(1));
      record.dot.setAttribute('cy', y.toFixed(1));
    }
    layer.dataset.visible = String(records.filter(record => !record.button.hidden).length);
  }

  return {
    update, setView,
    invalidate() { dirty = true; },
    snapshot() {
      return { enabled, view: viewName, selected: selectedId, visible: !layer.hidden,
        zones: records.map(record => ({
          id: record.zone.id, title: record.zone.title, city: Boolean(record.zone.city),
          shown: !layer.hidden && !record.button.hidden, anchor: record.zone.anchor.slice(),
          point: record.point, rect: record.rect
        })) };
    }
  };
}
