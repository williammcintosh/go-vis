import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC37VzJ-rhwu8OgadesHqoxXimgmcM_zZ8',
  authDomain: 'go-vis.firebaseapp.com',
  projectId: 'go-vis',
  storageBucket: 'go-vis.firebasestorage.app',
  messagingSenderId: '351693325278',
  appId: '1:351693325278:web:ffd1b76056a4ed2732534f',
  measurementId: 'G-NYMBSY6R27',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

window.goVisAuth = {
  login: () => signInWithPopup(auth, provider),
  logout: () => signOut(auth),
  onChange: (cb) => onAuthStateChanged(auth, cb),
};

window.goVisData = {
  loadProgress: async (uid) => {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  },
  saveProgress: async (uid, progress) => {
    await setDoc(
      doc(db, 'users', uid),
      {
        ...progress,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },
};

function requireUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('[CLOUD] No logged in user found.');
  return user;
}

window.goVisDB = {
  saveProgress: async (progressObj) => {
    const user = requireUser();
    const payload = {
      progress: progressObj || {},
      updatedAt: serverTimestamp(),
    };
    console.log('[CLOUD] Saving progress for', user.uid, payload);
    await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
  },
  loadProgress: async () => {
    const user = requireUser();
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return data?.progress ?? null;
  },
};

function getLocalProgress() {
  try {
    const storedPlayer = localStorage.getItem('goVizPlayerProgress');
    if (storedPlayer) {
      const parsed = JSON.parse(storedPlayer);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (err) {
    console.warn('[CLOUD] Failed to read goVizPlayerProgress', err);
  }

  try {
    const stored = localStorage.getItem('goVizProgress');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        if (parsed.progress && typeof parsed.progress === 'object') {
          return parsed.progress;
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[CLOUD] Failed to read goVizProgress', err);
  }

  return {};
}
window.getLocalProgress = getLocalProgress;

function initCloudDebugUI() {
  const container = document.getElementById('cloudDebug');
  if (!container) return;

  const userStatusEl = document.getElementById('cloudUserStatus');
  const saveStatusEl = document.getElementById('cloudSaveStatus');
  const outputEl = document.getElementById('cloudLoadOutput');
  const saveBtn = document.getElementById('cloudSaveBtn');
  const loadBtn = document.getElementById('cloudLoadBtn');
  const clearBtn = document.getElementById('cloudClearBtn');

  const setVisibility = (user) => {
    const isLoggedIn = Boolean(user);
    container.style.display = isLoggedIn ? 'block' : 'none';
    if (userStatusEl) {
      userStatusEl.textContent = isLoggedIn
        ? `Logged in as ${user.email || user.uid}`
        : 'Log in to use cloud save debug';
    }
    if (!isLoggedIn && outputEl) {
      outputEl.textContent = '';
    }
  };

  onAuthStateChanged(auth, (user) => {
    console.log('[CLOUD] Auth state changed', user?.uid);
    setVisibility(user);
  });

  saveBtn?.addEventListener('click', async () => {
    try {
      const localProgress = getLocalProgress();
      console.log('[CLOUD] Save button clicked with local progress', localProgress);
      await window.goVisDB.saveProgress(localProgress);
      const ts = new Date().toISOString();
      if (saveStatusEl) {
        saveStatusEl.textContent = `Last cloud save: ${ts}`;
      }
      console.log('[CLOUD] Saved at', ts);
    } catch (err) {
      console.error('[CLOUD] Save failed', err);
    }
  });

  loadBtn?.addEventListener('click', async () => {
    try {
      const cloudProgress = await window.goVisDB.loadProgress();
      console.log('[CLOUD] Loaded progress from cloud', cloudProgress);
      if (outputEl) {
        outputEl.textContent = cloudProgress
          ? JSON.stringify(cloudProgress, null, 2)
          : 'null';
      }
    } catch (err) {
      console.error('[CLOUD] Load failed', err);
    }
  });

  clearBtn?.addEventListener('click', async () => {
    try {
      console.log('[CLOUD] Clearing progress in cloud');
      await window.goVisDB.saveProgress({});
      if (outputEl) {
        outputEl.textContent = '{}';
      }
    } catch (err) {
      console.error('[CLOUD] Clear failed', err);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCloudDebugUI);
} else {
  initCloudDebugUI();
}
