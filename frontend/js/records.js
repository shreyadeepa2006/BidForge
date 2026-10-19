/* Records manager: CREATE, RETRIEVE, SEARCH, UPDATE and DELETE on the five tables.
   Each table is described once in TABLES below; one generic screen draws them all.
   All writes go to Flask (/api/records/...), which calls the Oracle procedures. */
(function () {
  const user = Layout.mount('records', { auth: true });
  if (!user) return;

  const R = Api.Records;
  const tabsEl = document.getElementById('rec-tabs');
  const root = document.getElementById('records-root');

  /* ---------- small helpers ---------- */
  const F = (key, label, type, extra) => Object.assign({ key, label, type: type || 'text' }, extra || {});
  const userOptions = () => R.list('users', '').map((u) => [u.UserID, `${u.FullName} (#${u.UserID})`]);
  const catOptions = (current) => { const l = Api.CATEGORIES.slice(); if (current && !l.includes(current)) l.push(current); return l.map((c) => [c, c]); };
  const condOptions = () => Api.CONDITIONS.map((c) => [c, c]);

  /* ---------- one description per table ---------- */
  const TABLES = {
    users: {
      label: 'Users', pk: 'UserID', noun: 'user',
      note: 'Deleting a user is blocked by a trigger if they have items or bids. A new user gets a wallet row automatically (another trigger).',
      cols: [['UserID', 'ID'], ['FullName', 'Full name'], ['Email', 'Email'], ['PhoneNo', 'Phone'], ['WalletBalance', 'Wallet balance', 'money'], ['DateJoined', 'Joined', 'date'], ['Address', 'Address']],
      create: () => [F('FullName', 'Full name', 'text', { max: 100 }), F('Email', 'Email', 'email', { max: 100 }), F('Password', 'Password', 'password', { hint: 'At least 8 characters with a letter and a number.' }),
        F('PhoneNo', 'Phone number (optional)', 'tel', { max: 15 }), F('Address', 'Address (optional)', 'text', { max: 200 }), F('WalletBalance', 'Opening balance (optional)', 'number', { min: 0 })],
      edit: () => [F('FullName', 'Full name', 'text', { max: 100 }), F('Email', 'Email', 'email', { max: 100 }), F('PhoneNo', 'Phone number', 'tel', { max: 15 }),
        F('Address', 'Address', 'text', { max: 200 }), F('Password', 'New password (leave empty to keep)', 'password')],
    },
    items: {
      label: 'Items', pk: 'ItemID', noun: 'item',
      note: 'An item can only be deleted while it has no auction. Its price can only change while it has no auction (afterwards edit the auction).',
      cols: [['ItemID', 'ID'], ['SellerName', 'Seller'], ['ItemName', 'Item'], ['Category', 'Category'], ['Condition', 'Condition'], ['StartingPrice', 'Starting price', 'money'], ['CreatedAt', 'Listed', 'date']],
      create: () => [F('SellerID', 'Seller', 'select', { options: userOptions() }), F('ItemName', 'Item name', 'text', { max: 100 }),
        F('Description', 'Description (optional)', 'textarea', { max: 300 }), F('Category', 'Category', 'select', { options: catOptions() }),
        F('Condition', 'Condition', 'select', { options: condOptions() }), F('StartingPrice', 'Starting price', 'number', { min: 1 })],
      edit: (row) => [F('ItemName', 'Item name', 'text', { max: 100 }), F('Description', 'Description', 'textarea', { max: 300 }),
        F('Category', 'Category', 'select', { options: catOptions(row.Category) }), F('Condition', 'Condition', 'select', { options: condOptions() }),
        F('StartingPrice', 'Starting price', 'number', { min: 1 })],
    },
    auctions: {
      label: 'Auctions', pk: 'AuctionID', noun: 'auction',
      note: 'One auction per item. An auction can be edited or cancelled only while it is live and has no bids. Auctions with accepted bids cannot be deleted.',
      cols: [['AuctionID', 'ID'], ['ItemName', 'Item'], ['WinnerFullName', 'Leading bidder'], ['StartingPrice', 'Starting price', 'money'], ['CurrentHighestBid', 'Highest bid', 'money'], ['StartTime', 'Start', 'dt'], ['EndTime', 'End', 'dt'], ['Status', 'Status']],
      create: () => {
        const taken = new Set(R.list('auctions', '').map((a) => a.ItemID));
        const free = R.list('items', '').filter((i) => !taken.has(i.ItemID)).map((i) => [i.ItemID, `${i.ItemName} (#${i.ItemID}, ${i.SellerName})`]);
        return [F('ItemID', 'Item (without an auction)', 'select', { options: free, empty: 'Every item already has an auction.' }),
          F('StartingPrice', 'Starting price', 'number', { min: 1 }), F('StartTime', 'Starts', 'datetime', { value: toLocalInput(Date.now()) }),
          F('EndTime', 'Ends', 'datetime', { value: toLocalInput(Date.now() + 24 * 3600 * 1000) })];
      },
      edit: () => [F('StartingPrice', 'Starting price', 'number', { min: 1 }), F('StartTime', 'Starts', 'datetime'), F('EndTime', 'Ends', 'datetime')],
      extra: (row) => (row.Status === 'Live' ? [['cancel', 'Cancel']] : []),
    },
    bids: {
      label: 'Bids', pk: 'BidID', noun: 'bid',
      note: 'Adding a bid runs place_bid, so every rule applies and a refused attempt is stored as Rejected. Editing raises your own leading bid. Only Rejected bids can be deleted.',
      cols: [['BidID', 'ID'], ['AuctionID', 'Auction'], ['ItemName', 'Item'], ['BidderName', 'Bidder'], ['BidAmount', 'Amount', 'money'], ['BidTime', 'Time', 'dt'], ['Status', 'Status']],
      create: () => {
        const live = R.list('auctions', '').filter((a) => a.Phase === 'live').map((a) => [a.AuctionID, `#${a.AuctionID} ${a.ItemName} (now ${money(a.CurrentHighestBid)})`]);
        return [F('AuctionID', 'Auction', 'select', { options: live, empty: 'There is no live auction.' }), F('UserID', 'Bidder', 'select', { options: userOptions() }),
          F('BidAmount', 'Bid amount', 'number', { min: 1 })];
      },
      edit: () => [F('BidAmount', 'New amount (raise the leading bid)', 'number', { min: 1 })],
    },
    wallet: {
      label: 'Wallet', pk: 'TransactionID', noun: 'wallet',
      note: 'One wallet per user. Credit adds money, Debit withdraws from the available balance. A wallet can be deleted only when its balance is zero.',
      cols: [['TransactionID', 'ID'], ['OwnerName', 'Owner'], ['WalletBalance', 'Balance', 'money'], ['TransactionType', 'Last type'], ['TransactionDate', 'Last date', 'date'], ['Status', 'Status']],
      create: () => {
        const have = new Set(R.list('wallet', '').map((w) => w.UserID));
        const without = R.list('users', '').filter((u) => !have.has(u.UserID)).map((u) => [u.UserID, `${u.FullName} (#${u.UserID})`]);
        return [F('UserID', 'User without a wallet', 'select', { options: without, empty: 'Every user already has a wallet (a trigger creates it).' })];
      },
      edit: () => [F('TransactionType', 'Transaction', 'select', { options: [['Credit', 'Credit (add money)'], ['Debit', 'Debit (withdraw)']] }),
        F('Amount', 'Amount', 'number', { min: 1 })],
    },
  };
  const ORDER = ['users', 'items', 'auctions', 'bids', 'wallet'];
  let current = 'users';
  let search = '';

  /* ---------- show one cell ---------- */
  function cell(value, type) {
    if (value === null || value === undefined || value === '') return '<span class="muted">-</span>';
    if (type === 'money') return money(value);
    if (type === 'date') return dateOnly(value);
    if (type === 'dt') return dateTime(value);
    return esc(value);
  }

  /* ---------- the form dialog (used for Add and Edit) ---------- */
  function openForm({ title, fields, values, submitText, submit }) {
    const back = document.createElement('div');
    back.className = 'dialog-backdrop';
    const inputFor = (f) => {
      const v = values && values[f.key] != null ? values[f.key] : (f.value != null ? f.value : '');
      const id = 'rf-' + f.key;
      const attrs = `id="${id}" name="${f.key}"${f.max ? ` maxlength="${f.max}"` : ''}${f.min != null ? ` min="${f.min}"` : ''}`;
      if (f.type === 'select') {
        if (!f.options.length) return `<select ${attrs} disabled><option>${esc(f.empty || 'No choices')}</option></select>`;
        return `<select ${attrs}>${f.options.map(([val, lab]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
      }
      if (f.type === 'textarea') return `<textarea ${attrs}>${esc(v)}</textarea>`;
      if (f.type === 'number') return `<input ${attrs} type="number" step="any" value="${esc(v)}">`;
      if (f.type === 'datetime') return `<input ${attrs} type="datetime-local" value="${esc(v)}">`;
      return `<input ${attrs} type="${f.type}" value="${esc(v)}" autocomplete="off">`;
    };
    back.innerHTML = `<div class="dialog dialog--wide" role="dialog" aria-modal="true" aria-labelledby="rf-title">
      <h3 id="rf-title">${esc(title)}</h3>
      <form class="form" novalidate>
        ${fields.map((f) => `<div class="field"><label for="rf-${f.key}">${esc(f.label)}</label>${inputFor(f)}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`).join('')}
        <div class="btn-row"><button class="btn btn--primary" type="submit">${esc(submitText)}</button><button class="btn btn--secondary" type="button" data-no>Cancel</button></div>
      </form></div>`;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.querySelector('[data-no]').onclick = close;
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    back.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      fields.forEach((f) => {
        let val = back.querySelector('#rf-' + f.key).value;
        if (f.type === 'datetime' && val) { const d = new Date(val); val = isNaN(d) ? '' : d.toISOString(); }
        out[f.key] = val;
      });
      const res = submit(out);
      if (res.ok) { close(); toast(res.message || 'Done.', 'success'); draw(); } else toast(res.error, 'error');
    });
    document.body.appendChild(back);
    const first = back.querySelector('input,select,textarea');
    if (first) first.focus();
  }

  /* ---------- draw the current table ---------- */
  function draw() {
    tabsEl.innerHTML = ORDER.map((t) => `<button class="tab" role="tab" data-table="${t}" aria-selected="${t === current}">${TABLES[t].label}</button>`).join('');
    tabsEl.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { current = b.dataset.table; search = ''; draw(); }));

    const T = TABLES[current];
    const rows = R.list(current, search);
    root.innerHTML = `<p class="rec-note">${esc(T.note)}</p>
      <div class="rec-toolbar">
        <div class="field"><label for="rec-q">Search ${esc(T.label.toLowerCase())}</label><input id="rec-q" type="search" placeholder="Type a name, status, or an ID number" value="${esc(search)}" autocomplete="off"></div>
        <button class="btn btn--primary" type="button" id="rec-add">Add ${esc(T.noun)}</button>
      </div>
      <p class="rec-count" aria-live="polite">${rows.length} ${rows.length === 1 ? 'row' : 'rows'}${search ? ' match' : ''}</p>
      <div class="panel panel--flush"><div class="table-wrap"><table>
        <thead><tr>${T.cols.map(([, l, ty]) => `<th${ty === 'money' ? ' class="num"' : ''}>${esc(l)}</th>`).join('')}<th>Actions</th></tr></thead>
        <tbody>${rows.length ? rows.map((r) => `<tr>${T.cols.map(([k, , ty]) => `<td${ty === 'money' ? ' class="num"' : ''}>${cell(r[k], ty)}</td>`).join('')}
          <td><div class="btn-row" style="gap:8px">
            <button class="btn btn--secondary btn--small" data-edit="${r[T.pk]}">Edit</button>
            ${(T.extra ? T.extra(r) : []).map(([a, l]) => `<button class="btn btn--secondary btn--small" data-act="${a}" data-id="${r[T.pk]}">${l}</button>`).join('')}
            <button class="btn btn--danger btn--small" data-del="${r[T.pk]}">Delete</button>
          </div></td></tr>`).join('') : `<tr><td colspan="${T.cols.length + 1}" class="muted" style="text-align:center;padding:28px">No rows${search ? ' match this search' : ' yet'}.</td></tr>`}
        </tbody></table></div></div>`;

    const q = document.getElementById('rec-q');
    let timer = null;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { search = q.value.trim(); draw(); const n = document.getElementById('rec-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); });

    document.getElementById('rec-add').addEventListener('click', () => {
      const fields = T.create();
      openForm({ title: 'Add ' + T.noun, fields, submitText: 'Add', submit: (v) => R.create(current, v) });
    });
    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const row = rows.find((r) => String(r[T.pk]) === b.dataset.edit);
      const values = Object.assign({}, row);
      if (current === 'auctions') { values.StartTime = toLocalInput(row.StartTime); values.EndTime = toLocalInput(row.EndTime); }
      if (current === 'users') values.Password = '';
      if (current === 'wallet') { values.TransactionType = 'Credit'; values.Amount = ''; }
      if (current === 'bids') values.BidAmount = row.BidAmount;
      openForm({ title: `Edit ${T.noun} #${row[T.pk]}`, fields: T.edit(row), values, submitText: 'Save changes', submit: (v) => R.update(current, row[T.pk], v) });
    }));
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const yes = await confirmDialog({ title: `Delete ${T.noun} #${b.dataset.del}?`, message: 'This removes the row from the database. Oracle will refuse if other rows depend on it.', confirmText: 'Delete', danger: true });
      if (!yes) return;
      const res = R.remove(current, b.dataset.del);
      toast(res.ok ? (res.message || 'Deleted.') : res.error, res.ok ? 'success' : 'error');
      draw();
    }));
    root.querySelectorAll('[data-act="cancel"]').forEach((b) => b.addEventListener('click', async () => {
      const yes = await confirmDialog({ title: `Cancel auction #${b.dataset.id}?`, message: 'Its Status becomes Cancelled. This is only allowed while it is live and has no bids.', confirmText: 'Cancel auction', danger: true });
      if (!yes) return;
      const res = R.cancelAuction(b.dataset.id);
      toast(res.ok ? (res.message || 'Cancelled.') : res.error, res.ok ? 'success' : 'error');
      draw();
    }));
  }

  draw();
})();
