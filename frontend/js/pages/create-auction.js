/* Create auction: writes one row to Auctions for an item the seller already listed. */
(function () {
  const user = Layout.mount('sell', { auth: true });
  if (!user) return;

  const root = document.getElementById('auction-root');
  const items = Api.getListableItems(user.UserID);
  if (!items.length) {
    root.innerHTML = '<div class="empty"><h3>Every item already has an open auction</h3><p>List a new item to schedule another one.</p><a class="btn btn--primary" href="list-item.html">List an item</a></div>';
    return;
  }

  const form = document.getElementById('auction-form');
  const f = { item: document.getElementById('ItemID'), price: document.getElementById('StartingPrice'), start: document.getElementById('StartTime'), end: document.getElementById('EndTime') };
  f.item.innerHTML = items.map((i) => `<option value="${i.ItemID}">${esc(i.ItemName)}</option>`).join('');
  const wanted = params().get('item');
  if (wanted && items.some((i) => String(i.ItemID) === wanted)) f.item.value = wanted;

  const current = () => items.find((i) => String(i.ItemID) === f.item.value);
  let priceTouched = false;
  f.price.addEventListener('input', () => { priceTouched = true; preview(); });
  f.item.addEventListener('change', () => { if (!priceTouched) f.price.value = current().StartingPrice; preview(); });
  f.price.value = current().StartingPrice;

  f.start.value = toLocalInput(Date.now());
  f.end.value = toLocalInput(Date.now() + 24 * 3600 * 1000);

  const DURATIONS = [['1 hour', 1], ['6 hours', 6], ['24 hours', 24], ['3 days', 72], ['7 days', 168]];
  const chips = document.getElementById('durations');
  chips.innerHTML = DURATIONS.map(([label, h]) => `<button type="button" class="chip" data-hours="${h}">${label}</button>`).join('');
  chips.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    const start = Math.max(new Date(f.start.value).getTime() || Date.now(), Date.now());
    f.end.value = toLocalInput(start + Number(c.dataset.hours) * 3600 * 1000);
    chips.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    preview();
  }));
  [f.start, f.end].forEach((i) => i.addEventListener('input', preview));

  function preview() {
    const it = current(), price = Number(f.price.value) || 0;
    const end = new Date(f.end.value);
    document.getElementById('preview').innerHTML = `<div class="lot">
      <div class="lot__art">${artFor(it)}${statusBadge('live')}</div>
      <div class="lot__body"><h3 class="lot__name">${esc(it.ItemName)}</h3>
      <p class="lot__spec">${esc(it.Category)}, ${esc(it.Condition)}</p>
      <div class="lot__bid"><div><span class="lbl">Starting price</span><span class="price">${price ? money(price) : 'Not set'}</span></div>
      <div class="lot__time"><span class="lbl">Closes</span>${isNaN(end) ? 'Not set' : dateTime(end)}</div></div></div></div>`;
  }
  preview();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const price = Number(f.price.value);
    const start = new Date(f.start.value).getTime(), end = new Date(f.end.value).getTime();
    const ok = Forms.check(form, [
      [f.price, !f.price.value || !isFinite(price) || price <= 0 ? 'Enter a starting price greater than 0.' : ''],
      [f.start, !isFinite(start) ? 'Choose when bidding opens.' : ''],
      [f.end, !isFinite(end) ? 'Choose when bidding closes.' : isFinite(start) && end <= start ? 'Closing time must be after the opening time.' : end <= Date.now() ? 'Closing time must be in the future.' : isFinite(start) && end - Math.max(start, Date.now()) < 15 * 60000 ? 'An auction must run for at least 15 minutes.' : ''],
    ]);
    if (!ok) return;
    const res = Api.createAuction(user.UserID, { ItemID: f.item.value, StartingPrice: price, StartTime: f.start.value, EndTime: f.end.value });
    if (!res.ok) { toast(res.error, 'error'); return; }
    flash('Your auction is open for bidding.', 'success');
    location.href = 'auction.html?id=' + res.auction.AuctionID;
  });
})();
