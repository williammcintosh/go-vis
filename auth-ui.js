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
  const badgeAvatarBtn = document.getElementById('gameAvatar');
  const badgeAvatarImg = document.getElementById('gameAvatarImg');
  closeMenu();
  accountArea.innerHTML = '';
  accountArea.classList.toggle('logged-in', Boolean(user));

  const menu = document.createElement('div');
  menu.className = 'account-menu';

  const setBadgeAvatar = (src, alt) => {
    if (badgeAvatarImg) {
      badgeAvatarImg.src = src;
      badgeAvatarImg.alt = alt;
    }
  };

  const handleOutside = (event) => {
    if (menu.contains(event.target) || currentTrigger?.contains(event.target))
      return;
    closeMenu();
  };

  const toggleMenu = (event, triggerEl) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains('open');
    closeMenu();
    if (!isOpen) {
      menu.classList.add('open');
      if (triggerEl) triggerEl.setAttribute('aria-expanded', 'true');
      openMenu = menu;
      currentTrigger = triggerEl || null;
      detachOutside = () => document.removeEventListener('click', handleOutside, true);
      document.addEventListener('click', handleOutside, true);
    }
  };

  if (!user) {
    setBadgeAvatar('./images/not-logged-in-avatar.png', 'Anonymous avatar');

    const loginBtn = document.createElement('button');
    loginBtn.type = 'button';
    loginBtn.className = 'account-button';
    loginBtn.textContent = 'Log in';
    loginBtn.addEventListener('click', () => authApi?.login());
    accountArea.appendChild(loginBtn);

    const loginMenuItem = document.createElement('button');
    loginMenuItem.type = 'button';
    loginMenuItem.className = 'account-menu__item';
    loginMenuItem.textContent = 'Log in';
    loginMenuItem.addEventListener('click', () => {
      closeMenu();
      authApi?.login();
    });
    menu.appendChild(loginMenuItem);

    accountArea.appendChild(menu);
    if (badgeAvatarBtn) {
      badgeAvatarBtn.onclick = (event) => toggleMenu(event, badgeAvatarBtn);
    }
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
  setBadgeAvatar(avatar.src, avatar.alt);

  const name = document.createElement('span');
  name.className = 'account-name';
  name.textContent = user.displayName || 'Player';

  chip.appendChild(avatar);
  chip.appendChild(name);

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

  const restartBtn = document.createElement('button');
  restartBtn.type = 'button';
  restartBtn.className = 'account-menu__item';
  restartBtn.textContent = 'Restart';
  restartBtn.addEventListener('click', () => {
    closeMenu();
    const modal = document.getElementById('confirmModal');
    if (modal) {
      modal.classList.add('active');
    } else {
      console.warn('Confirm modal not found for restart');
    }
  });

  menu.appendChild(switchBtn);
  const accountBtn = document.createElement('button');
  accountBtn.type = 'button';
  accountBtn.className = 'account-menu__item';
  accountBtn.textContent = 'Account';
  accountBtn.addEventListener('click', () => {
    closeMenu();
  });
  menu.appendChild(accountBtn);
  menu.appendChild(logoutBtn);
  menu.appendChild(restartBtn);
  chip.addEventListener('click', (event) => toggleMenu(event, chip));
  accountArea.appendChild(chip);
  accountArea.appendChild(menu);

  if (badgeAvatarBtn) {
    badgeAvatarBtn.onclick = (event) => toggleMenu(event, badgeAvatarBtn);
  }
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
