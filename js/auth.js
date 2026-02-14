// ===== Authentication =====

// Auth State Observer (auto login)
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            currentUser = { uid: user.uid, ...doc.data() };
        } else {
            currentUser = {
                uid: user.uid,
                email: user.email,
                name: user.email.split('@')[0],
                role: 'member',
                joinDate: new Date().toISOString().slice(0, 10)
            };
        }
        showMainApp();
    } else {
        currentUser = null;
        detachListeners();
        showAuth();
    }
});

// UI Toggle
function showAuth() {
    document.getElementById('authPage').style.display = '';
    document.getElementById('mainApp').style.display = 'none';
}
function showMainApp() {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('mainApp').style.display = '';
    document.getElementById('currentUserName').textContent = '👤 ' + currentUser.name;
    attachListeners();
    requestNotificationPermission();
}

// ===== Desktop Notifications =====
function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function sendDesktopNotification(title, subtitle, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    // Don't notify if the tab is focused
    if (document.hasFocus()) {
        // Show in-app toast instead
        showToast(`🔔 ${subtitle}`);
        return;
    }
    const preview = (body || '').substring(0, 100).replace(/[#*>\-`\n]/g, ' ');
    const notif = new Notification(title, {
        body: `${subtitle}\n${preview}`,
        icon: '📢',
        tag: 'go-new-post',
        requireInteraction: false
    });
    notif.onclick = function() {
        window.focus();
        switchTab('feed', document.querySelector('.tab-nav button:first-child'));
        notif.close();
    };
}
function showLogin() {
    document.getElementById('loginBox').style.display = '';
    document.getElementById('registerBox').style.display = 'none';
    document.getElementById('loginError').textContent = '';
}
function showRegister() {
    document.getElementById('loginBox').style.display = 'none';
    document.getElementById('registerBox').style.display = '';
    document.getElementById('registerError').textContent = '';
}

// Register
async function handleRegister() {
    const name  = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pw    = document.getElementById('regPw').value;
    const pwc   = document.getElementById('regPwConfirm').value;
    const errEl = document.getElementById('registerError');
    errEl.textContent = '';

    if (!name || !email || !pw) { errEl.textContent = 'Please fill in all fields.'; return; }
    if (!email.endsWith('@siemens-healthineers.com')) {
        errEl.innerHTML = '<span style="font-size:2em;font-weight:900;color:#d32f2f;display:block;text-align:center;padding:18px 0;line-height:1.4;">🚫 You are NOT qualified to join our study group.<br>GO AWAY! 🚫</span>';
        return;
    }
    if (pw.length < 6)          { errEl.textContent = 'Password must be at least 6 characters.'; return; }
    if (pw !== pwc)             { errEl.textContent = 'Passwords do not match.'; return; }

    const btn = document.getElementById('regBtn');
    btn.disabled = true;
    btn.textContent = 'Signing up...';

    try {
        const cred = await auth.createUserWithEmailAndPassword(email, pw);
        const today = new Date().toISOString().slice(0, 10);
        await db.collection('users').doc(cred.user.uid).set({
            email, name, role: 'member', joinDate: today
        });
        showToast('🎉 Registration complete!');
    } catch (e) {
        errEl.textContent = firebaseErrorMsg(e.code);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign Up';
    }
}

// Login
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const pw    = document.getElementById('loginPw').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';

    if (!email || !pw) { errEl.textContent = 'Please enter email and password.'; return; }

    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    try {
        await auth.signInWithEmailAndPassword(email, pw);
    } catch (e) {
        errEl.textContent = firebaseErrorMsg(e.code);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Log In';
    }
}

// Logout
function handleLogout() { auth.signOut(); }

// Error Messages
function firebaseErrorMsg(code) {
    const m = {
        'auth/email-already-in-use': 'This email is already in use.',
        'auth/invalid-email':        'Invalid email format.',
        'auth/weak-password':        'Password is too weak. (min 6 characters)',
        'auth/user-not-found':       'No account found with this email.',
        'auth/wrong-password':       'Incorrect password.',
        'auth/invalid-credential':   'Invalid email or password.',
        'auth/too-many-requests':    'Too many attempts. Please try again later.',
    };
    return m[code] || 'An error occurred. Please try again.';
}

// Realtime Listeners
function attachListeners() {
    postsInitialized = false;

    // Posts
    unsubPosts = db.collection('posts')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
            if (postsInitialized) {
                // Detect newly added posts (not by me)
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const p = change.doc.data();
                        if (p.authorUid !== currentUser.uid) {
                            sendDesktopNotification(
                                `📢 New Post by ${p.authorName}`,
                                `[${p.category}] ${p.title}`,
                                p.content
                            );
                        }
                    }
                });
            }
            allPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderFeed();
            postsInitialized = true;
        });

    // Member List
    unsubMembers = db.collection('users')
        .onSnapshot(snap => {
            allMembers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
            renderMembers();
        });

    // Feedbacks
    attachFeedbackListener();
}

function detachListeners() {
    if (unsubPosts)   unsubPosts();
    if (unsubMembers) unsubMembers();
    detachFeedbackListener();
    postsInitialized = false;
}

// Tab Switch
function switchTab(tab, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(tab + 'Page').classList.add('active');
    btn.classList.add('active');
    if (tab === 'ranking') renderRanking();
    if (tab === 'study') renderStudiedPosts();
    if (tab === 'feedback') renderFeedback();
}
