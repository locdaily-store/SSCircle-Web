/* SSCircle V10.18: shared color tokens and validated per-element color overrides.
   A URL/CSS/HTML value is never executed; only strict HEX and selector tokens pass. */
'use strict';
window.SSCircleTheme = (() => {
  const HEX = /^#[a-f\d]{6}$/i;
  // CSS identifiers, simple class/id/tag selectors, child/descendant combinators and
  // a few harmless state pseudo-classes. No curly braces, escaping or functions.
  const SELECTOR = /^(?=.{1,140}$)[a-zA-Z.#][a-zA-Z0-9_.# >+~:*\-]*$/;
  const STATES = ['hover', 'focus', 'focus-visible', 'active', 'checked', 'disabled', 'focus-within'];
  const KEYMAP = {
    accentColor:'--ssc-primary', secondaryColor:'--ssc-secondary', highlightColor:'--ssc-highlight',
    backgroundColor:'--ssc-bg', backgroundEndColor:'--ssc-bg-end', gradientStartColor:'--ssc-gradient-start',
    gradientEndColor:'--ssc-gradient-end', textColor:'--ssc-text', mutedColor:'--ssc-muted',
    buttonTextColor:'--ssc-button-text', panelColor:'--ssc-panel', inputColor:'--ssc-input',
    borderColor:'--ssc-border', successColor:'--ssc-success', dangerColor:'--ssc-danger',
    headerBackgroundColor:'--ssc-header-bg', headerTextColor:'--ssc-header-text',
    footerBackgroundColor:'--ssc-footer-bg', footerTextColor:'--ssc-footer-text',
    headingColor:'--ssc-heading', linkColor:'--ssc-link', linkHoverColor:'--ssc-link-hover',
    badgeBackgroundColor:'--ssc-badge-bg', badgeTextColor:'--ssc-badge-text',
    placeholderColor:'--ssc-placeholder', dividerColor:'--ssc-divider',
    inputBorderColor:'--ssc-input-border', inputFocusColor:'--ssc-input-focus',
    inputTextColor:'--ssc-input-text', primaryButtonColor:'--ssc-button-start',
    primaryButtonEndColor:'--ssc-button-end', secondaryButtonColor:'--ssc-button-secondary',
    secondaryButtonTextColor:'--ssc-button-secondary-text',
    cardGradientStartColor:'--ssc-card-start', cardGradientEndColor:'--ssc-card-end',
    selectedBackgroundColor:'--ssc-selected-bg', selectedTextColor:'--ssc-selected-text',
    shadowColor:'--ssc-shadow', warningColor:'--ssc-warning',
    heroTitleColor:'--ssc-hero-title', heroOverlayColor:'--ssc-hero-overlay'
  };
  const ROLE = {text:'color',background:'background',border:'border-color',outline:'outline-color',
    gradient:'background',shadow:'box-shadow',highlight:'background'};
  function validSelector(value) {
    if (typeof value !== 'string' || !SELECTOR.test(value) || /\.{2,}|#{2,}/.test(value)) return false;
    const normalized = value.replace(/::(?:before|after|placeholder|selection)\b/g, '');
    if (normalized.includes('::')) return false;
    const colonParts = normalized.split(':').slice(1);
    return colonParts.every(part => STATES.some(state => part === state || part.startsWith(state + ' ') || part.startsWith(state + '>')));
  }
  function safeRules(settings) {
    if (!Array.isArray(settings.themeOverrides)) return '';
    const rules = [];
    for (const entry of settings.themeOverrides.slice(0, 80)) {
      if (!entry || !validSelector(entry.selector) || !Object.hasOwn(ROLE, entry.property) || !HEX.test(entry.value || '')) continue;
      const color = entry.value;
      let declaration;
      if (entry.property === 'gradient') {
        if (!HEX.test(entry.value2 || '')) continue;
        const angle = Number.isFinite(Number(entry.angle)) ? Math.max(0, Math.min(360, Number(entry.angle))) : 135;
        declaration = `background:linear-gradient(${angle}deg,${color},${entry.value2})!important;`;
      } else if (entry.property === 'shadow') declaration = `box-shadow:0 8px 28px color-mix(in srgb,${color} 40%,transparent)!important;`;
      else if (entry.property === 'highlight') declaration = `background:color-mix(in srgb,${color} 20%,transparent)!important;`;
      else declaration = `${ROLE[entry.property]}:${color}!important;`;
      // Unscoped selectors are limited to this site's document, not any remote domain.
      // The :not() guard raises specificity so per-object settings beat legacy CSS.
      // Put it before an optional pseudo-element, not after it.
      const target = entry.selector.replace(/(::(?:before|after|placeholder|selection))$/, ':not(#ssc-color-rule-guard)$1');
      const scoped = target === entry.selector ? target + ':not(#ssc-color-rule-guard)' : target;
      // A text override must change actual text, not the panel's background,
      // border or shadow. Descendants often define their own explicit colors,
      // so inheritance alone does not update their displayed text.
      if (entry.property === 'text' && !entry.selector.includes('::')) {
        const textElements = 'h1,h2,h3,h4,h5,h6,p,span,strong,small,em,b,i,a,label,li,dt,dd,blockquote,summary,output,button,input,textarea,select,option';
        rules.push(`${scoped},${scoped} :is(${textElements}){color:${color}!important;}`);
      } else {
        rules.push(`${scoped}{${declaration}}`);
      }
    }
    return rules.join('\n');
  }
  let previewSettings = null;
  function apply(settings={}, opts={}) {
    if (!settings || typeof settings !== 'object') return;
    if (previewSettings && !opts.preview) { queueMicrotask(() => apply(previewSettings,{preview:true})); return; }
    const onAdmin = document.body.classList.contains('admin-page');
    if (onAdmin && settings.adminThemeEnabled !== true && !opts.forceAdmin) return;
    const root = document.documentElement;
    for (const [key, variable] of Object.entries(KEYMAP)) {
      if (HEX.test(settings[key] || '')) root.style.setProperty(variable, settings[key]);
    }
    // Bring legacy components using --bg/--purple/--panel into the same palette.
    const alias = {'--bg':'backgroundColor','--bg-2':'backgroundEndColor','--panel':'panelColor',
      '--panel-raised':'gradientStartColor','--line':'borderColor','--line-soft':'borderColor',
      '--text':'textColor','--muted':'mutedColor','--purple':'accentColor','--violet':'secondaryColor',
      '--soft':'highlightColor','--red':'dangerColor','--green':'successColor'};
    for (const [variable, key] of Object.entries(alias)) if (HEX.test(settings[key] || '')) root.style.setProperty(variable,settings[key]);
    if (HEX.test(settings.accentColor || '')) {
      const x = settings.accentColor.match(/^#(..)(..)(..)$/);
      root.style.setProperty('--home-primary-rgb',x.slice(1).map(n=>parseInt(n,16)).join(','));
      root.style.setProperty('--v7-accent',settings.accentColor);
    }
    root.classList.toggle('ssc-card-gradient',settings.cardGradientEnabled === true);
    // Page background has its own mode and angle. This must not change
    // the button, card or header gradients unless those colors are edited.
    root.classList.toggle('ssc-page-bg-solid', settings.pageBackgroundMode === 'solid');
    const pageAngle = Number(settings.pageBackgroundAngle);
    root.style.setProperty('--ssc-page-angle',`${Number.isFinite(pageAngle) ? Math.max(0,Math.min(360,pageAngle)) : 160}deg`);
    if (onAdmin) document.body.classList.toggle('ssc-admin-theme-active',settings.adminThemeEnabled === true);
    const angle = Number(settings.themeGradientAngle);
    root.style.setProperty('--ssc-theme-angle',`${Number.isFinite(angle) ? Math.max(0,Math.min(360,angle)) : 135}deg`);
    if (HEX.test(settings.heroOverlayColor || '')) {
      const rgb = settings.heroOverlayColor.match(/^#(..)(..)(..)$/).slice(1).map(n=>parseInt(n,16)).join(',');
      root.style.setProperty('--ssc-hero-overlay-rgb',rgb);
    }
    const rules = safeRules(settings);
    let style = document.getElementById('ssc-custom-colors');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ssc-custom-colors';
      document.head.append(style);
    }
    // Security: generated rules contain only safe hex literals and validated CSS selectors.
    style.textContent = rules;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta && HEX.test(settings.backgroundColor || '')) themeMeta.content = settings.backgroundColor;
  }
  async function load() {
    try {
      const response = await fetch('/api/form',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      if (response.ok) {
        const payload = await response.json();
        apply(payload.settings || {});
      }
    } catch { /* Leave default colors when no connection. */ }
  }
  // For live previews: previews are read-only. Authentication/admin changes are never performed.
  if (new URLSearchParams(location.search).has('ssc_theme_preview')) {
    // Iframe preview is interactive for scrolling. Block leaving the preview
    // or submitting forms, including a newly rendered form after settings update.
    document.addEventListener('submit', event => event.preventDefault(), true);
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('#')) event.preventDefault();
    }, true);
    window.addEventListener('message', e => {
      if (e.origin !== location.origin || e.source !== window.parent || e.data?.type !== 'ssc-theme-preview-settings') return;
      previewSettings = e.data.settings || {};
      apply(previewSettings,{preview:true});
      window.parent.postMessage({type:'ssc-theme-preview-applied'},location.origin);
    });
    window.addEventListener('DOMContentLoaded',()=>{
      if (window.parent !== window) window.parent.postMessage({type:'ssc-theme-preview-ready'},location.origin);
    });
  }
  return {apply, load, validSelector};
})();
