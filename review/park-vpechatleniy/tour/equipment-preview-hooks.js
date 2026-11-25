/** Transient equipment previews never commit roots or change visitor obstacles. */
export function createEquipmentPreviewHooks({ embedded = false, getWalkState = () => ({}), getEmbeddedState = () => ({}), getScene = () => null, requestRender = () => {} } = {}) {
  function permitted() {
    const walk = getWalkState() || {};
    if (!embedded) return !walk.active;
    const view = getEmbeddedState() || {};
    return Boolean(walk.active && !walk.paused && view.visible && view.split);
  }
  function cancel(id) {
    const result = getScene()?.cancelEquipmentPreview?.(id) || { ok: true };
    requestRender(); return result;
  }
  return {
    onPreview(id, position) {
      if (!permitted()) { cancel(); return { ok: true, preview: false }; }
      const result = getScene()?.previewEquipment?.(id, position) || { ok: false, preview: false };
      if (result.ok) requestRender();
      return result;
    },
    onPreviewEnd: cancel,
    cancel,
    permitted,
  };
}
