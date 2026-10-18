/* Browse page: search, filters and sorting over Auctions + Items. */
(function () {
  Layout.mount('browse');

  const el = {
    q: document.getElementById('f-q'), category: document.getElementById('f-category'),
    condition: document.getElementById('f-condition'),
    sort: document.getElementById('f-sort'), min: document.getElementById('f-min'), max: document.getElementById('f-max'),
    lots: document.getElementById('lots'), count: document.getElementById('result-count'),
    tabOpen: document.getElementById('tab-open'), tabClosed: document.getElementById('tab-closed'),
  };
  const fill = (select, values) => values.forEach((v) => select.insertAdjacentHTML('beforeend', `<option>${esc(v)}</option>`));
  fill(el.category, Api.CATEGORIES);
  fill(el.condition, Api.CONDITIONS);

  const qs = params();
  if (qs.get('category')) el.category.value = qs.get('category');
  if (qs.get('q')) el.q.value = qs.get('q');
  let tab = 'open';

  function render() {
    const rows = Api.listAuctions({
      tab, q: el.q.value.trim(), category: el.category.value, condition: el.condition.value,
      min: el.min.value, max: el.max.value, sort: el.sort.value,
    });
    el.count.textContent = rows.length === 1 ? '1 lot' : `${rows.length} lots`;
    if (!rows.length) {
      el.lots.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>No lots match these filters</h3>
        <p>Try a different search, or clear the filters to see every ${tab === 'open' ? 'open' : 'closed'} lot.</p>
        <button class="btn btn--secondary" type="button" id="empty-clear">Clear filters</button></div>`;
      document.getElementById('empty-clear').onclick = clear;
    } else {
      el.lots.innerHTML = rows.map(auctionCard).join('');
    }
    Countdown.tick(el.lots);
  }
  function clear() {
    el.q.value = ''; el.category.value = ''; el.condition.value = ''; el.min.value = ''; el.max.value = '';
    el.sort.value = 'ending';
    render();
  }
  function setTab(next) {
    tab = next;
    el.tabOpen.setAttribute('aria-selected', String(next === 'open'));
    el.tabClosed.setAttribute('aria-selected', String(next === 'closed'));
    render();
  }

  document.getElementById('filters').addEventListener('submit', (e) => e.preventDefault());
  [el.q, el.min, el.max].forEach((i) => i.addEventListener('input', render));
  [el.category, el.condition, el.sort].forEach((s) => s.addEventListener('change', render));
  document.getElementById('f-clear').addEventListener('click', clear);
  el.tabOpen.addEventListener('click', () => setTab('open'));
  el.tabClosed.addEventListener('click', () => setTab('closed'));
  window.addEventListener('storage', render);
  render();
})();
