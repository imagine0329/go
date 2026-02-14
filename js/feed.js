// ===== Study Feed =====

let feedPeriod = 'daily'; // default: show today's posts
let feedUnstudiedOnly = false; // filter: show only unstudied posts

function togglePostForm() {
    document.getElementById('postForm').classList.toggle('show');
}

async function submitPost() {
    const category = document.getElementById('postCategory').value;
    const title    = document.getElementById('postTitle').value.trim();
    const content  = document.getElementById('postContent').value.trim();
    const videoUrl = document.getElementById('postVideoUrl').value.trim();
    if (!title || !content) { showToast('⚠️ Please enter a title and content.'); return; }

    await db.collection('posts').add({
        authorUid:  currentUser.uid,
        authorName: currentUser.name,
        category, title, content, videoUrl,
        likes:     [],
        comments:  [],
        studiedBy: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById('postTitle').value    = '';
    document.getElementById('postContent').value  = '';
    document.getElementById('postVideoUrl').value = '';
    togglePostForm();
    showToast('✅ Posted successfully!');
}

function setFeedPeriod(period, btn) {
    feedPeriod = period;
    document.querySelectorAll('.period-btn:not(.unstudied-btn)').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const datePicker = document.getElementById('feedCustomDate');
    if (period === 'custom') {
        datePicker.style.display = '';
        if (!datePicker.value) {
            datePicker.value = new Date().toISOString().slice(0, 10);
        }
    } else {
        datePicker.style.display = 'none';
    }
    renderFeed();
}

function toggleUnstudiedFilter(btn) {
    feedUnstudiedOnly = !feedUnstudiedOnly;
    btn.classList.toggle('active', feedUnstudiedOnly);
    renderFeed();
}

function getFilterDateRange(period) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'daily') {
        return { from: startOfDay, to: new Date(startOfDay.getTime() + 86400000) };
    }
    if (period === 'weekly') {
        const day = startOfDay.getDay(); // 0=Sun
        const diff = day === 0 ? 6 : day - 1; // Monday start
        return { from: new Date(startOfDay.getTime() - diff * 86400000), to: null };
    }
    if (period === 'monthly') {
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null };
    }
    if (period === 'custom') {
        const val = document.getElementById('feedCustomDate')?.value;
        if (val) {
            const picked = new Date(val + 'T00:00:00');
            return { from: picked, to: new Date(picked.getTime() + 86400000) };
        }
        return { from: startOfDay, to: new Date(startOfDay.getTime() + 86400000) };
    }
    return null; // 'all'
}

function renderFeed() {
    const q = (document.getElementById('feedSearch')?.value || '').toLowerCase();
    const range = getFilterDateRange(feedPeriod);
    const list = allPosts.filter(p => {
        const matchSearch = (p.title || '').toLowerCase().includes(q) ||
            (p.content || '').toLowerCase().includes(q) ||
            (p.authorName || '').toLowerCase().includes(q);
        if (!matchSearch) return false;
        if (feedUnstudiedOnly && (p.studiedBy || []).some(s => s.uid === currentUser.uid)) return false;
        if (range && p.createdAt) {
            const postDate = p.createdAt.toDate();
            if (postDate < range.from) return false;
            if (range.to && postDate >= range.to) return false;
            return true;
        }
        if (range && !p.createdAt) return false;
        return true;
    });
    const el = document.getElementById('feedList');

    if (list.length === 0) {
        const periodLabels = { daily: "today", weekly: "this week", monthly: "this month", all: "", custom: "" };
        let periodText = feedPeriod === 'all' ? '' : ` ${periodLabels[feedPeriod]}`;
        if (feedPeriod === 'custom') {
            const val = document.getElementById('feedCustomDate')?.value;
            periodText = val ? ` on ${val}` : ' for selected date';
        }
        el.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>No posts${periodText}.<br>Write the first post!</p></div>`;
        return;
    }

    el.innerHTML = list.map(p => {
        const liked    = (p.likes || []).includes(currentUser.uid);
        const studied  = (p.studiedBy || []).some(s => s.uid === currentUser.uid);
        const studiedList = p.studiedBy || [];
        const dateStr  = p.createdAt ? p.createdAt.toDate().toLocaleDateString('en-US') : '';
        const comments = (p.comments || []).map(c =>
            `<div class="comment-item"><strong>${esc(c.authorName)}</strong>: ${esc(c.text)}</div>`
        ).join('');

        const studiedChips = studiedList.map(s =>
            `<span class="studied-chip">✅ ${esc(s.name)}</span>`
        ).join('');

        return `
        <div class="post-card">
            <div class="post-meta">
                <span class="post-author">${esc(p.authorName)}</span>
                <span class="post-date">${dateStr}</span>
            </div>
            <span class="post-category">${esc(p.category)}</span>
            <div class="post-title">${esc(p.title)}</div>
            <div class="post-body">${formatContent(p.content)}${buildVideoEmbed(p.videoUrl)}</div>
            <div class="post-actions">
                <button class="${liked ? 'liked' : ''}" onclick="toggleLike('${p.id}')">
                    ${liked ? '❤️' : '🤍'} Like ${(p.likes||[]).length}
                </button>
                <button class="${studied ? 'studied' : ''}" onclick="toggleStudied('${p.id}')">
                    ${studied ? '📗' : '📖'} Studied ${studiedList.length}
                </button>
                ${studiedList.length > 0 ? `<button onclick="toggleStudiedSection('${p.id}')">👥 Who Studied</button>` : ''}
                <button onclick="toggleComments('${p.id}')">
                    💬 Comments ${(p.comments||[]).length}
                </button>
                ${p.authorUid === currentUser.uid ? `<button onclick="deletePost('${p.id}')">🗑️ Delete</button>` : ''}
            </div>
            ${studiedList.length > 0 ? `
            <div class="studied-section" id="studied-${p.id}">
                <div class="studied-label">📗 Studied by (${studiedList.length})</div>
                <div class="studied-avatars">${studiedChips}</div>
            </div>` : ''}
            <div class="comments-section" id="comments-${p.id}">
                ${comments}
                <div class="comment-input-row">
                    <input type="text" id="ci-${p.id}" placeholder="Write a comment..."
                        onkeydown="if(event.key==='Enter')addComment('${p.id}')">
                    <button onclick="addComment('${p.id}')">Submit</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function toggleLike(id) {
    const ref = db.collection('posts').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return;
    const likes = doc.data().likes || [];
    if (likes.includes(currentUser.uid)) {
        await ref.update({ likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
    } else {
        await ref.update({ likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    }
}

async function toggleStudied(id) {
    const ref = db.collection('posts').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return;
    const studiedBy = doc.data().studiedBy || [];
    const already = studiedBy.find(s => s.uid === currentUser.uid);
    if (already) {
        await ref.update({ studiedBy: firebase.firestore.FieldValue.arrayRemove(already) });
        showToast('📖 Unmarked as studied.');
    } else {
        await ref.update({
            studiedBy: firebase.firestore.FieldValue.arrayUnion({
                uid: currentUser.uid,
                name: currentUser.name,
                date: new Date().toISOString()
            })
        });
        showToast('📗 Marked as studied!');
    }
}

function toggleStudiedSection(id) {
    const el = document.getElementById('studied-' + id);
    if (el) el.classList.toggle('show');
}

function toggleComments(id) {
    document.getElementById('comments-' + id).classList.toggle('show');
}

async function addComment(postId) {
    const input = document.getElementById('ci-' + postId);
    const text  = input.value.trim();
    if (!text) return;

    await db.collection('posts').doc(postId).update({
        comments: firebase.firestore.FieldValue.arrayUnion({
            authorUid:  currentUser.uid,
            authorName: currentUser.name,
            text,
            date: new Date().toISOString()
        })
    });
    input.value = '';
    showToast('💬 Comment posted.');
    setTimeout(() => {
        const el = document.getElementById('comments-' + postId);
        if (el) el.classList.add('show');
    }, 300);
}

async function deletePost(id) {
    if (!confirm('Are you sure you want to delete this post?')) return;
    await db.collection('posts').doc(id).delete();
    showToast('🗑️ Post deleted.');
}

// Post Form Write/Preview Tabs
function showWriteTab(btn) {
    document.querySelectorAll('.post-form-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('postContent').style.display = '';
    document.getElementById('formatHelp').style.display = '';
    document.getElementById('postPreview').classList.remove('show');
}

function showPreviewTab(btn) {
    document.querySelectorAll('.post-form-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('postContent').style.display = 'none';
    document.getElementById('formatHelp').style.display = 'none';
    const raw = document.getElementById('postContent').value;
    const videoUrl = document.getElementById('postVideoUrl').value.trim();
    const preview = document.getElementById('postPreview');
    if (!raw.trim() && !videoUrl) {
        preview.innerHTML = '<span style="color:#ccc;">Nothing to preview yet...</span>';
    } else {
        preview.innerHTML = formatContent(raw) + buildVideoEmbed(videoUrl);
    }
    preview.classList.add('show');
}
