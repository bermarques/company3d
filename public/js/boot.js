// Canvas text needs the web fonts before the first in-world texture is drawn.
const ready = Promise.race([
  Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('800 40px Nunito'), document.fonts.load('700 40px Nunito')]),
  new Promise((r) => setTimeout(r, 2500)),
]);
ready.finally(() => import('/js/main.js'));
