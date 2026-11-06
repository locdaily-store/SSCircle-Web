/* Shared animated drag-and-drop helper for administrator lists. */
'use strict';
window.SSCircleSort = (() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function attach(root, { item, onMove, handleText = '⠿', handleTarget = '' }) {
    if (!root || typeof onMove !== 'function') return;
    const nodes = [...root.querySelectorAll(':scope > ' + item)];
    if (nodes.length < 2) return;

    nodes.forEach((node, index) => {
      node.classList.add('ssc-sort-item');
      const target = handleTarget ? node.querySelector(handleTarget) : node;
      if ((target || node).querySelector(':scope > .ssc-sort-handle')) return;
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'ssc-sort-handle';
      handle.textContent = handleText;
      handle.setAttribute('aria-label', `Seret item ${index + 1} untuk mengubah urutan`);
      handle.title = 'Tahan dan seret';
      (target || node).prepend(handle);

      handle.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        const start = { x: event.clientX, y: event.clientY };
        let dragging = false;
        let ghost = null;
        let target = null;
        let after = false;
        const pointerId = event.pointerId;

        function clearTargets() {
          for (const element of nodes) {
            element.classList.remove('ssc-sort-before', 'ssc-sort-after');
            element.style.removeProperty('transform');
          }
        }
        function begin() {
          dragging = true;
          const bounds = node.getBoundingClientRect();
          ghost = node.cloneNode(true);
          ghost.className = 'ssc-sort-ghost';
          ghost.style.left = bounds.left + 'px';
          ghost.style.top = bounds.top + 'px';
          ghost.style.width = bounds.width + 'px';
          ghost.setAttribute('aria-hidden', 'true');
          document.body.append(ghost);
          node.classList.add('ssc-sort-source');
        }
        function move(pointer) {
          if (pointer.pointerId !== pointerId) return;
          const dx = pointer.clientX - start.x;
          const dy = pointer.clientY - start.y;
          if (!dragging && Math.hypot(dx, dy) < 6) return;
          if (!dragging) begin();
          pointer.preventDefault();
          ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(-1deg)`;
          clearTargets();
          const hovered = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest(item);
          target = hovered && hovered !== node && root.contains(hovered) ? hovered : null;
          if (target) {
            const rect = target.getBoundingClientRect();
            after = pointer.clientY > rect.top + rect.height / 2;
            target.classList.add(after ? 'ssc-sort-after' : 'ssc-sort-before');
            if (!reducedMotion.matches) target.style.transform = `translateY(${after ? -4 : 4}px)`;
          }
          if (pointer.clientY < 75) window.scrollBy(0, -12);
          if (pointer.clientY > window.innerHeight - 75) window.scrollBy(0, 12);
        }
        function end(pointer) {
          if (pointer.pointerId !== pointerId) return;
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', end);
          document.removeEventListener('pointercancel', cancel);
          node.classList.remove('ssc-sort-source');
          clearTargets();
          const oldGhost = ghost;
          if (oldGhost) {
            if (!reducedMotion.matches && oldGhost.animate) {
              const animation = oldGhost.animate([{ opacity: 1 }, { opacity: 0, transform: oldGhost.style.transform + ' scale(.96)' }], { duration: 180, easing: 'ease-out' });
              animation.onfinish = () => oldGhost.remove();
              setTimeout(() => oldGhost.remove(), 250);
            } else oldGhost.remove();
          }
          if (!dragging || !target) return;
          const from = nodes.indexOf(node);
          let destination = nodes.indexOf(target) + (after ? 1 : 0);
          if (from < destination) destination--;
          if (destination !== from) onMove(from, destination);
        }
        function cancel() {
          end({ pointerId });
        }
        document.addEventListener('pointermove', move, { passive: false });
        document.addEventListener('pointerup', end);
        document.addEventListener('pointercancel', cancel);
      });
    });
  }
  return { attach };
})();
