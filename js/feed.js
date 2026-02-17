// ===== Study Feed =====

let feedPeriod = 'all'; // default: show all posts
let feedUnstudiedOnly = false; // filter: show only unstudied posts

function togglePostForm() {
    document.getElementById('postForm').classList.toggle('show');
}

async function submitPost() {
    const category = document.getElementById('postCategory').value;
    const title    = document.getElementById('postTitle').value.trim();
    const content  = document.getElementById('postContent').value.trim();
    const videoUrl = document.getElementById('postVideoUrl').value.trim();
    if (!content) { showToast('⚠️ Please enter content.'); return; }

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
        const comments = (p.comments || []).map((c, idx) => {
            const isOwner = c.authorUid === currentUser.uid;
            const isAdmin = currentUser.role === 'admin';
            const canEdit = isOwner || isAdmin;
            return `<div class="comment-item" id="comment-${p.id}-${idx}">
                <div class="comment-text"><strong>${esc(c.authorName)}</strong>: <span class="comment-body">${esc(c.text)}</span></div>
                ${canEdit ? `<div class="comment-actions">
                    <button onclick="editComment('${p.id}', ${idx})" title="Edit">✏️</button>
                    <button onclick="deleteComment('${p.id}', ${idx})" title="Delete">🗑️</button>
                </div>` : ''}
            </div>`;
        }).join('');

        return `
        <div class="post-card" id="post-card-${p.id}">
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
                <button onclick="toggleComments('${p.id}')">
                    💬 Comments ${(p.comments||[]).length}
                </button>
                <button onclick="feedToCard('${p.id}')">🃏 To Card</button>
                ${p.authorUid === currentUser.uid ? `<button onclick="editPost('${p.id}')">✏️ Edit</button>` : ''}
                ${p.authorUid === currentUser.uid ? `<button onclick="deletePost('${p.id}')">🗑️ Delete</button>` : ''}
            </div>
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

function editComment(postId, index) {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    const comment = (post.comments || [])[index];
    if (!comment) return;

    const el = document.getElementById(`comment-${postId}-${index}`);
    if (!el) return;

    const textEl = el.querySelector('.comment-body');
    const oldText = comment.text;

    el.innerHTML = `
        <div class="comment-edit-row">
            <input type="text" class="comment-edit-input" id="ce-${postId}-${index}" value="${esc(oldText)}">
            <button class="comment-edit-save" onclick="saveCommentEdit('${postId}', ${index})">Save</button>
            <button class="comment-edit-cancel" onclick="renderFeed()">Cancel</button>
        </div>
    `;
    const input = document.getElementById(`ce-${postId}-${index}`);
    input.focus();
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveCommentEdit(postId, index);
        if (e.key === 'Escape') renderFeed();
    });
}

async function saveCommentEdit(postId, index) {
    const input = document.getElementById(`ce-${postId}-${index}`);
    const newText = input?.value.trim();
    if (!newText) { showToast('⚠️ Comment cannot be empty.'); return; }

    const ref = db.collection('posts').doc(postId);
    const doc = await ref.get();
    if (!doc.exists) return;

    const comments = doc.data().comments || [];
    comments[index].text = newText;
    await ref.update({ comments });
    showToast('✏️ Comment updated.');
}

async function deleteComment(postId, index) {
    if (!confirm('Delete this comment?')) return;

    const ref = db.collection('posts').doc(postId);
    const doc = await ref.get();
    if (!doc.exists) return;

    const comments = doc.data().comments || [];
    comments.splice(index, 1);
    await ref.update({ comments });
    showToast('🗑️ Comment deleted.');
}

async function deletePost(id) {
    if (!confirm('Are you sure you want to delete this post?')) return;
    await db.collection('posts').doc(id).delete();
    showToast('🗑️ Post deleted.');
}

// ===== Edit Post (Inline) =====
function editPost(id) {
    const post = allPosts.find(p => p.id === id);
    if (!post) return;

    const card = document.getElementById('post-card-' + id);
    if (!card) return;

    const categoryOptions = [
        { value: 'Vocabulary', label: '📗 Vocabulary' },
        { value: 'Grammar', label: '📘 Grammar' },
        { value: 'Conversation', label: '📙 Conversation' },
        { value: 'Tips', label: '💡 Tips' },
        { value: 'Questions', label: '❓ Questions' }
    ];

    const optionsHtml = categoryOptions.map(o =>
        `<option value="${o.value}" ${post.category === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');

    card.classList.add('post-editing');
    card.innerHTML = `
        <div class="post-edit-inline">
            <select id="editPostCategory_${id}" class="post-edit-field">
                ${optionsHtml}
            </select>
            <input type="text" id="editPostTitle_${id}" class="post-edit-field" value="${esc(post.title)}" placeholder="Title (optional)">
            <div class="video-input-row">
                <span class="video-icon">🎬</span>
                <input type="text" id="editPostVideoUrl_${id}" class="post-edit-field" value="${esc(post.videoUrl || '')}" placeholder="Video URL (optional)">
            </div>
            <textarea id="editPostContent_${id}" class="post-edit-field post-edit-textarea" placeholder="Content">${esc(post.content)}</textarea>
            <div class="post-edit-actions">
                <button class="btn-cancel" onclick="renderFeed()">Cancel</button>
                <button class="btn-new-post" onclick="savePostEdit('${id}')">Save</button>
            </div>
        </div>
    `;

    const textarea = document.getElementById('editPostContent_' + id);
    textarea.focus();
    textarea.style.height = textarea.scrollHeight + 'px';
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });
}

async function savePostEdit(id) {
    const category = document.getElementById('editPostCategory_' + id).value;
    const title = document.getElementById('editPostTitle_' + id).value.trim();
    const content = document.getElementById('editPostContent_' + id).value.trim();
    const videoUrl = document.getElementById('editPostVideoUrl_' + id).value.trim();
    if (!content) { showToast('⚠️ Please enter content.'); return; }
    await db.collection('posts').doc(id).update({ category, title, content, videoUrl });
    showToast('✅ Post updated!');
    renderFeed();
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

// ===== Feed To Card =====
function feedToCard(postId) {
    // Switch to Memorize tab
    const memorizeBtn = document.querySelectorAll('.sidebar-btn')[2]; // Memorize is 3rd button
    switchTab('memorize', memorizeBtn);

    // Open card form
    const form = document.getElementById('cardForm');
    form.style.display = 'block';

    // Set cards mode
    const cardsBtn = document.querySelectorAll('.mem-mode-btn')[0];
    if (cardsBtn) setMemorizeMode('cards', cardsBtn);

    // Scroll to top immediately
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'instant' });

    // Load feed as reference
    setTimeout(() => {
        selectCardFeedRef(postId);
    }, 100);
}
