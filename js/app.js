// ===== Firebase Configuration =====
const firebaseConfig = {
    apiKey: "AIzaSyAjtK1_9ZonzhCSmZRtMq1ivx0JoPEZZlc",
    authDomain: "imagine-ba6c2.firebaseapp.com",
    projectId: "imagine-ba6c2",
    storageBucket: "imagine-ba6c2.firebasestorage.app",
    messagingSenderId: "859919770205",
    appId: "1:859919770205:web:56c5fbdff4c8411df663b4",
    measurementId: "G-VENT6D51EV"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ===== App State =====
let currentUser = null;   // { uid, email, name, role, joinDate }
let allPosts    = [];
let allMembers  = [];
let postsInitialized = false; // skip notification on initial load

// Realtime listener cleanup
let unsubPosts   = null;
let unsubMembers = null;
