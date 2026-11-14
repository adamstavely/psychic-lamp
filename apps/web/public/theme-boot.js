try {
  var t = localStorage.getItem('donovan.theme');
  if (t === 'light' || t === 'dark' || t === 'system') document.documentElement.setAttribute('data-tc-theme', t);
} catch (e) {}
