/* Register page: validation mirrors the Users table constraints. */
(function () {
  Layout.mount('register');
  if (Auth.user()) { location.replace('browse.html'); return; }

  const form = document.getElementById('register-form');
  const f = {
    name: document.getElementById('FullName'), email: document.getElementById('Email'), phone: document.getElementById('PhoneNo'),
    address: document.getElementById('Address'), pw: document.getElementById('Password'), confirm: document.getElementById('Confirm'),
  };
  const bar = document.getElementById('strength-bar'), text = document.getElementById('strength-text');

  f.pw.addEventListener('input', () => {
    const v = f.pw.value;
    const score = (v.length >= 8) + /[A-Za-z]/.test(v) + /\d/.test(v) + (v.length >= 12) + /[^A-Za-z0-9]/.test(v);
    const labels = ['', 'Too short', 'Weak', 'Fair', 'Strong', 'Very strong'];
    bar.style.width = (score * 20) + '%';
    bar.style.background = score <= 2 ? 'var(--ruby)' : score === 3 ? 'var(--brass)' : 'var(--ok)';
    text.textContent = v ? `Password strength: ${labels[score] || 'Too short'}` : 'At least 8 characters, with a letter and a number.';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const phone = f.phone.value.replace(/[\s-]/g, '');
    const ok = Forms.check(form, [
      [f.name, f.name.value.trim().length < 2 ? 'Enter your full name.' : ''],
      [f.email, !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim()) ? 'Enter a valid email address.' : ''],
      [f.phone, phone && !/^\+?\d{10,14}$/.test(phone) ? 'Enter a phone number with 10 to 14 digits.' : ''],
      [f.pw, f.pw.value.length < 8 || !/[A-Za-z]/.test(f.pw.value) || !/\d/.test(f.pw.value) ? 'Use at least 8 characters with a letter and a number.' : ''],
      [f.confirm, f.confirm.value !== f.pw.value ? 'The two passwords do not match.' : ''],
    ]);
    if (!ok) return;

    const res = Api.register({
      FullName: f.name.value, Email: f.email.value, PhoneNo: f.phone.value, Address: f.address.value, Password: f.pw.value,
    });
    if (!res.ok) {
      const target = /email/i.test(res.error) ? f.email : /phone/i.test(res.error) ? f.phone : f.name;
      Forms.setError(target, res.error); target.focus();
      return;
    }
    Auth.startSession(res.user.UserID);
    flash('Your account is ready. Add money to your wallet to start bidding.', 'success');
    location.href = 'wallet.html';
  });
})();
