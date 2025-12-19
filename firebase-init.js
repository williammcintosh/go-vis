import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyB4bQVxY0eYHI_FFCbXz0NfI7UCAA26E0M',
  authDomain: 'go-vis-dev.firebaseapp.com',
  projectId: 'go-vis-dev',
  appId: '1:429536570554:web:35b6456371cb69e406a683',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

window.goVisAuth = {
  login: () => signInWithPopup(auth, provider),
  logout: () => signOut(auth),
  onChange: (cb) => onAuthStateChanged(auth, cb),
};
