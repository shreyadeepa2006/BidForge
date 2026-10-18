/* Login page. */
(function () {
  Layout.mount('login');
  if (Auth.user()) { location.replace('browse.html'); return; }

  const form = document.getElementById('login-form');
  const email = document.getElementById('email'), password = document.getElementById('password');

  /* Only allow going back to one of our own pages, never to another website. */
  function safeNext() {
    const next = params().get('next') || '';
    return /^[a-z0-9-]+\.html(\?[a-z0-9=&%._-]*)?$/i.test(next) ? next : 'browse.html';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = Forms.check(form, [
      [email, !email.value.trim() ? 'Enter your email.' : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()) ? 'Enter a valid email address.' : ''],
      [password, !password.value ? 'Enter your password.' : ''],
    ]);
    if (!ok) return;
    const res = Auth.login(email.value, password.value);
    if (!res.ok) { Forms.setError(password, res.error); password.focus(); return; }
    flash(`Welcome back, ${res.user.FullName.split(' ')[0]}.`, 'success');
    location.href = safeNext();
  });
})();
