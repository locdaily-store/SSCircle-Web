/* Daftar pemenang event resmi pada halaman Season Archive. */
'use strict';

(() => {
  const root = document.getElementById('community55-hall-of-fame');
  if (!root) return;

  const element = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  async function loadWinners() {
    try {
      const response = await fetch('/api/community/hall-of-fame', {
        cache: 'no-store'
      });
      if (!response.ok) return;

      const data = await response.json();
      if (!data.items?.length) return;

      root.replaceChildren(
        element('h2', '', 'Community Event Hall of Fame'),
        element('p', 'c55-note',
          'Pemenang kegiatan SSCircle yang telah disetujui pengurus.')
      );

      const list = element('div', 'c55-admin-grid');

      for (const winner of data.items) {
        const card = element('article', 'c55-mini-card');
        card.append(
          element('small', '', 'Juara ' + winner.rank),
          element('strong', '', winner.winner),
          element('span', '', winner.eventTitle),
          element('small', '', winner.label)
        );
        list.append(card);
      }

      root.append(list);
    } catch {
      root.replaceChildren();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadWinners, {once: true});
  } else {
    loadWinners();
  }
})();
