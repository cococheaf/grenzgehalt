const address = document.querySelector('[data-operator]');
try {
  const theme = localStorage.getItem('grenzgehalt.theme');
  if (['light', 'dark'].includes(theme)) document.documentElement.dataset.theme = theme;
  const size = localStorage.getItem('grenzgehalt.textSize');
  if (['100', '115', '130', '150'].includes(size)) document.documentElement.dataset.textSize = size;
} catch { /* System theme and default size remain usable. */ }

try {
  const { operator } = await import('./site-contact.mjs');
  address.replaceChildren(...operator.flatMap((line, index) => index
    ? [document.createElement('br'), document.createTextNode(line)]
    : [document.createTextNode(line)]));
} catch { /* A public source checkout does not contain operator details. */ }
