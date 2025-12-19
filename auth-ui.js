const loginBtn = document.getElementById('loginBtn');

if (loginBtn) {
  loginBtn.onclick = () => window.goVisAuth.login();
}

window.goVisAuth.onChange((user) => {
  if (!loginBtn) return;
  loginBtn.textContent = user ? 'Logged in' : 'Login with Google';
});
