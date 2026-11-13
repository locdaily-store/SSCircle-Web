/* Community Achievements pada Dashboard anggota SSCircle. */
'use strict';

(() => {
  const root = document.getElementById('community55-achievements');
  if (!root) return;

  const element = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  let loading = false;

  async function refresh() {
    if (loading) return;
    loading = true;

    try {
      const response = await fetch('/api/community/achievements', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok) {
        root.replaceChildren();
        return;
      }

      const data = await response.json();
      root.replaceChildren(element('h3', '', 'Community Achievements'));
      const list = element('div', 'c55-achievements');

      for (const achievement of data.achievements || []) {
        const card = element('article', 'c55-achievement ssc-medal ' + (achievement.earnedAt ? 'ssc-medal-earned' : 'ssc-medal-progress'));
        const emblem=element('span','ssc-medal-emblem',achievement.earnedAt?'★':'◇');
        emblem.setAttribute('aria-hidden','true');
        card.append(emblem,element('strong', '', achievement.title));

        if (achievement.description)
          card.append(element('small', '', achievement.description));

        const progress = element('progress');
        progress.max = Math.max(1, Number(achievement.target) || 1);
        progress.value = Math.min(progress.max, Number(achievement.progress) || 0);
        card.append(progress);

        const details = achievement.earnedAt
          ? '✓ Tercapai · ' + new Date(achievement.earnedAt).toLocaleDateString('id-ID')
          : achievement.progress + ' / ' + achievement.target +
            (achievement.metric === 'playtime_hours' ? ' jam' : '');
        card.append(element('small', '', details));
        list.append(card);
      }

      if (!data.achievements?.length)
        list.append(element('p', 'player-helper', 'Belum ada achievement yang aktif.'));

      if (data.awards?.length) {
        list.append(element('h3', '', 'Hasil Event Saya'));
        for (const award of data.awards) {
          const card = element('article', 'c55-achievement ssc-medal ssc-medal-earned');
          const emblem=element('span','ssc-medal-emblem','★');
          emblem.setAttribute('aria-hidden','true');
          card.append(emblem,
            element('strong', '', 'Juara ' + award.rank),
            element('small', '', award.label)
          );
          list.append(card);
        }
      }

      root.append(list);
    } catch {
      root.replaceChildren();
    } finally {
      loading = false;
    }
  }

  document.addEventListener('DOMContentLoaded', refresh, {once: true});
  document.addEventListener('click', event => {
    if (event.target.closest(
      '[data-profile-tab="profile"],[data-profile-section="achievements"],a[href*="achievements"]'
    )) refresh();
  });

  window.SSCircleCommunityAchievementsReload = refresh;
})();
