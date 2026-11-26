import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB4zieQ_WZvmN7FSvoHRqS94amvdVB80Ss",
    authDomain: "fantzawya-3ama.firebaseapp.com",
    projectId: "fantzawya-3ama",
    storageBucket: "fantzawya-3ama.firebasestorage.app",
    messagingSenderId: "734546290283",
    appId: "1:734546290283:web:f0e95605ad99ae5a69732e",
    measurementId: "G-X65PN7GYG7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
