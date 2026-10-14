const ICON_LIGHT = new URL('../images/clock-white.svg', import.meta.url).href;
const ICON_DARK = new URL('../images/clock-dark.svg', import.meta.url).href;
const SECTION = new URL('../card.html', import.meta.url).href;
const REPORT = new URL('../report.html', import.meta.url).href;
if (window.self !== window.top) document.body.classList.add('embedded');

const format = minutes => `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')}m` : ''}`;
const openReport = t => t.modal({ title: 'Hours for Trello · Report', url: t.signUrl(REPORT), fullscreen: true });

window.TrelloPowerUp.initialize({
  'board-buttons': () => [{
    icon: { dark: ICON_LIGHT, light: ICON_DARK },
    text: 'Hours report', condition: 'always', callback: openReport,
  }],
  'card-back-section': t => ({
    title: 'Work hours', icon: ICON_DARK,
    content: { type: 'iframe', url: t.signUrl(SECTION), height: 550 },
  }),
  'card-badges': async t => {
    const minutes = Number(await t.get('card', 'shared', 'totalMinutes', 0));
    return Number.isFinite(minutes) && minutes > 0 ? [{ text: `⏱ ${format(minutes)}`, color: 'blue' }] : [];
  },
});
