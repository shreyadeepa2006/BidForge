/* List an item: writes one row to Items. The auction itself is created on the next page. */
(function () {
  const user = Layout.mount('sell', { auth: true });
  if (!user) return;

  const form = document.getElementById('item-form');
  const f = {
    name: document.getElementById('ItemName'), category: document.getElementById('Category'), condition: document.getElementById('Condition'),
    desc: document.getElementById('Description'), price: document.getElementById('StartingPrice'),
  };
  const options = (list, placeholder) => `<option value="">${placeholder}</option>` + list.map((v) => `<option>${esc(v)}</option>`).join('');
  f.category.innerHTML = options(Api.CATEGORIES, 'Choose a category');
  f.condition.innerHTML = options(Api.CONDITIONS, 'Choose the condition');

  /* live preview of the lot card */
  function preview() {
    const draft = {
      ItemID: 1, ItemName: f.name.value.trim() || 'Your item name', Category: f.category.value || 'Rings', Condition: f.condition.value || 'Condition',
    };
    const price = Number(f.price.value) || 0;
    document.getElementById('preview').innerHTML = `<div class="lot">
      <div class="lot__art">${artFor(draft)}</div>
      <div class="lot__body"><h3 class="lot__name">${esc(draft.ItemName)}</h3>
      <p class="lot__spec">${esc(draft.Category)}, ${esc(draft.Condition)}</p>
      <div class="lot__bid"><div><span class="lbl">Starting price</span><span class="price">${price ? money(price) : 'Not set'}</span></div></div></div></div>`;
  }
  [f.name, f.price].forEach((i) => i.addEventListener('input', preview));
  [f.category, f.condition].forEach((s) => s.addEventListener('change', preview));
  f.desc.addEventListener('input', () => { document.getElementById('desc-count').textContent = `${f.desc.value.length} of 300 characters`; });
  preview();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const price = Number(f.price.value);
    const ok = Forms.check(form, [
      [f.name, !f.name.value.trim() ? 'Enter the item name.' : ''],
      [f.category, !f.category.value ? 'Choose a category.' : ''],
      [f.condition, !f.condition.value ? 'Choose the condition.' : ''],
      [f.price, !f.price.value || !isFinite(price) || price <= 0 ? 'Enter a starting price greater than 0.' : ''],
    ]);
    if (!ok) return;
    const res = Api.createItem(user.UserID, {
      ItemName: f.name.value, Category: f.category.value, Condition: f.condition.value,
      Description: f.desc.value, StartingPrice: f.price.value,
    });
    if (!res.ok) { toast(res.error, 'error'); return; }
    flash('Item saved. Now choose when its auction opens and closes.', 'success');
    location.href = 'create-auction.html?item=' + res.item.ItemID;
  });
})();
