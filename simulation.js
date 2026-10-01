// Life Sim v19 — solo construcción.
document.title = 'Life Sim — Mente y obra';
const title = document.querySelector('#hud h1');
if (title) title.textContent = 'Life Sim — Mente y obra';
try {
  await import('./engine-construct.js?v=19.1.0');
} catch (err) {
  console.error(err);
  const notice = document.getElementById('notice');
  if (notice) notice.textContent = 'Error al cargar constructores: ' + (err?.message || err);
}
