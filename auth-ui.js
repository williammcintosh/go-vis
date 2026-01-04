const accountArea = document.getElementById('account-area');
let authApi = null;
let openMenu = null;
let currentTrigger = null;
let detachOutside = null;

function closeMenu() {
  if (openMenu) {
    openMenu.classList.remove('open');
  }
  if (currentTrigger) {
    currentTrigger.setAttribute('aria-expanded', 'false');
  }
  if (detachOutside) {
    detachOutside();
    detachOutside = null;
  }
  openMenu = null;
  currentTrigger = null;
}

function renderAccountArea(user) {
  if (!accountArea) return;
  closeMenu();
  accountArea.innerHTML = '';
  accountArea.classList.toggle('logged-in', Boolean(user));

  if (!user) {
    const loginBtn = document.createElement('button');
    loginBtn.type = 'button';
    loginBtn.className = 'account-button';
    loginBtn.textContent = 'Log in';
    loginBtn.addEventListener('click', () => authApi?.login());
    accountArea.appendChild(loginBtn);
    return;
  }

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'account-chip';
  chip.setAttribute('aria-expanded', 'false');
  chip.setAttribute('aria-haspopup', 'true');

  const avatar = document.createElement('img');
  avatar.className = 'account-avatar';
  avatar.src = user.photoURL || './images/go-icon.png';
  avatar.alt = user.displayName ? `${user.displayName} avatar` : 'User avatar';

  const name = document.createElement('span');
  name.className = 'account-name';
  name.textContent = user.displayName || 'Player';

  chip.appendChild(avatar);
  chip.appendChild(name);

  const menu = document.createElement('div');
  menu.className = 'account-menu';

  const switchBtn = document.createElement('button');
  switchBtn.type = 'button';
  switchBtn.className = 'account-menu__item';
  switchBtn.textContent = 'Switch account';
  switchBtn.addEventListener('click', async () => {
    closeMenu();
    try {
      await authApi?.logout();
    } catch (err) {
      console.error('Logout before switch failed', err);
    }
    try {
      await authApi?.login();
    } catch (err) {
      console.error('Login failed', err);
    }
  });

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'account-menu__item';
  logoutBtn.textContent = 'Log out';
  logoutBtn.addEventListener('click', () => {
    closeMenu();
    authApi?.logout();
  });

  menu.appendChild(switchBtn);
  menu.appendChild(logoutBtn);

  const handleOutside = (event) => {
    if (menu.contains(event.target) || chip.contains(event.target)) return;
    closeMenu();
  };

  const toggleMenu = (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains('open');
    closeMenu();
    if (!isOpen) {
      menu.classList.add('open');
      chip.setAttribute('aria-expanded', 'true');
      openMenu = menu;
      currentTrigger = chip;
      detachOutside = () => document.removeEventListener('click', handleOutside, true);
      document.addEventListener('click', handleOutside, true);
    }
  };

  chip.addEventListener('click', toggleMenu);
  accountArea.appendChild(chip);
  accountArea.appendChild(menu);
}
window.renderAccountArea = renderAccountArea;

function waitForAuth() {
  if (!window.goVisAuth) {
    setTimeout(waitForAuth, 50);
    return;
  }

  authApi = window.goVisAuth;
  renderAccountArea(null);
  authApi.onChange(renderAccountArea);
}

waitForAuth();
