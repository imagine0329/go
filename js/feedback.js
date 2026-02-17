// ===== Feedback & Suggestions =====

let allFeedbacks = [];
let unsubFeedbacks = null;
let feedbackFilter = 'all';
let feedbackImages = []; // base64 array

function toggleFeedbackForm() {
    document.getElementById('feedbackForm').classList.toggle('show');
    if (!document.getElementById('feedbackForm').classList.contains('show')) {
        feedbackImages = [];
        const preview = document.getElementById('feedbackImagePreview');
        if (preview) preview.innerHTML = '';
    } else {
        initFeedbackPaste();
    }
}

function previewFeedbackImages(input) {
    const preview = document.getElementById('feedbackImagePreview');
    const files = Array.from(input.files);
    const maxSize = 500 * 1024; // 500KB per image
    const maxImages = 3;

    if (feedbackImages.length + files.length > maxImages) {
        showToast(`⚠️ Maximum ${maxImages} images allowed.`);
        input.value = '';
        return;
    }

    files.forEach(file => {
        if (file.size > maxSize) {
            showToast(`⚠️ "${file.name}" is too large. Max 500KB per image.`);
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            // Compress image via canvas
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const maxDim = 800;
                let w = img.width, h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                    else { w = Math.round(w * maxDim / h); h = maxDim; }
                }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const compressed = canvas.toDataURL('image/jpeg', 0.7);
                feedbackImages.push(compressed);
                renderFeedbackImagePreview();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
}

function renderFeedbackImagePreview() {
    const preview = document.getElementById('feedbackImagePreview');
    preview.innerHTML = feedbackImages.map((src, i) => `
        <div class="fb-preview-item">
            <img src="${src}" alt="Preview">
            <button class="fb-preview-remove" onclick="removeFeedbackImage(${i})">✕</button>
        </div>
    `).join('');
}

function removeFeedbackImage(index) {
    feedbackImages.splice(index, 1);
    renderFeedbackImagePreview();
}

function initFeedbackPaste() {
    const textarea = document.getElementById('feedbackContent');
    if (!textarea || textarea.dataset.pasteInit) return;
    textarea.dataset.pasteInit = 'true';
    textarea.addEventListener('paste', function(e) {
        const items = (e.clipboardData || window.clipboardData).items;
        if (!items) return;
        for (const item of items) {
            if (item.type.indexOf('image') === -1) continue;
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;
            if (feedbackImages.length >= 3) {
                showToast('⚠️ Maximum 3 images allowed.');
                return;
            }
            const reader = new FileReader();
            reader.onload = function(ev) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const maxDim = 800;
                    let w = img.width, h = img.height;
                    if (w > maxDim || h > maxDim) {
                        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                        else { w = Math.round(w * maxDim / h); h = maxDim; }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    const compressed = canvas.toDataURL('image/jpeg', 0.7);
                    feedbackImages.push(compressed);
                    renderFeedbackImagePreview();
                    showToast('📷 Image pasted!');
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            break;
        }
    });
}

async function submitFeedback() {
    const type    = document.getElementById('feedbackType').value;
    const title   = document.getElementById('feedbackTitle').value.trim();
    const content = document.getElementById('feedbackContent').value.trim();
    if (!title || !content) { showToast('⚠️ Please enter a title and description.'); return; }

    await db.collection('feedbacks').add({
        authorUid:  currentUser.uid,
        authorName: currentUser.name,
        type,
        title,
        content,
        images: feedbackImages.length > 0 ? feedbackImages : [],
        votes: [],
        replies: [],
        status: 'open',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById('feedbackTitle').value   = '';
    document.getElementById('feedbackContent').value = '';
    feedbackImages = [];
    const preview = document.getElementById('feedbackImagePreview');
    if (preview) preview.innerHTML = '';
    toggleFeedbackForm();
    showToast('✅ Feedback submitted! Thank you.');
}

function setFeedbackFilter(filter, btn) {
    feedbackFilter = filter;
    document.querySelectorAll('.fb-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFeedback();
}

function attachFeedbackListener() {
    unsubFeedbacks = db.collection('feedbacks')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
            allFeedbacks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderFeedback();
        });
}

function detachFeedbackListener() {
    if (unsubFeedbacks) unsubFeedbacks();
}

function renderFeedback() {
    const sortBy = document.getElementById('feedbackSort')?.value || 'newest';

    let list = allFeedbacks;
    if (feedbackFilter !== 'all') {
        list = list.filter(f => f.type === feedbackFilter);
    }

    if (sortBy === 'votes') {
        list = [...list].sort((a, b) => (b.votes || []).length - (a.votes || []).length);
    }

    const el = document.getElementById('feedbackList');
    if (!el) return;

    if (list.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="emoji">💡</div><p>No feedback yet.<br>Be the first to share your ideas!</p></div>';
        return;
    }

    el.innerHTML = list.map(f => {
        const votes     = f.votes || [];
        const voted     = votes.includes(currentUser.uid);
        const replies   = f.replies || [];
        const dateStr   = f.createdAt ? f.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const isAuthor  = f.authorUid === currentUser.uid;
        const isAdmin   = currentUser.role === 'admin';

        const typeClass = f.type === 'Feature Request' ? 'feature'
                        : f.type === 'Improvement' ? 'improvement'
                        : f.type === 'Bug Report' ? 'bug' : 'other';

        const cardClass = f.type === 'Feature Request' ? 'type-feature'
                        : f.type === 'Improvement' ? 'type-improvement'
                        : f.type === 'Bug Report' ? 'type-bug' : 'type-other';

        const statusHtml = isAdmin
            ? `<select class="fb-status-select" onchange="updateFeedbackStatus('${f.id}', this.value)">
                <option value="open" ${f.status==='open'?'selected':''}>🟢 Open</option>
                <option value="in-progress" ${f.status==='in-progress'?'selected':''}>🟠 In Progress</option>
                <option value="done" ${f.status==='done'?'selected':''}>🔵 Done</option>
                <option value="declined" ${f.status==='declined'?'selected':''}>🔴 Declined</option>
               </select>`
            : `<span class="fb-status-badge ${f.status}">${
                f.status === 'open' ? '🟢 Open'
              : f.status === 'in-progress' ? '🟠 In Progress'
              : f.status === 'done' ? '🔵 Done'
              : '🔴 Declined'}</span>`;

        const repliesHtml = replies.map(r => `
            <div class="fb-reply">
                <strong>${esc(r.authorName)}</strong>
                <span>${esc(r.text)}</span>
                <span class="fb-reply-date">${r.date || ''}</span>
            </div>
        `).join('');

        return `
        <div class="feedback-card ${cardClass}">
            <div class="fb-card-header">
                <div class="fb-vote-section">
                    <button class="fb-vote-btn ${voted ? 'voted' : ''}" onclick="toggleFeedbackVote('${f.id}')">▲</button>
                    <div class="fb-vote-count">${votes.length}</div>
                </div>
                <div class="fb-card-info">
                    <div>
                        <span class="fb-type-badge ${typeClass}">${
                            f.type === 'Feature Request' ? '🚀 Feature'
                          : f.type === 'Improvement' ? '✨ Improvement'
                          : f.type === 'Bug Report' ? '🐛 Bug'
                          : '💬 Other'
                        }</span>
                        ${statusHtml}
                    </div>
                    <div class="fb-title">${esc(f.title)}</div>
                    <div class="fb-content">${esc(f.content)}</div>
                    ${(f.images && f.images.length > 0) ? `
                    <div class="fb-images">
                        ${f.images.map(src => `<img src="${src}" alt="Feedback image" class="fb-image" onclick="openFeedbackImage(this.src)">`).join('')}
                    </div>` : ''}
                    <div class="fb-meta">
                        <span>👤 ${esc(f.authorName)}</span>
                        <span>📅 ${dateStr}</span>
                        <span>💬 ${replies.length} replies</span>
                        ${(isAuthor || isAdmin) ? `<button class="fb-delete-btn" onclick="editFeedback('${f.id}')" title="Edit">✏️</button>` : ''}
                        ${(isAuthor || isAdmin) ? `<button class="fb-delete-btn" onclick="deleteFeedback('${f.id}')" title="Delete">🗑️</button>` : ''}
                    </div>
                </div>
            </div>
            <button class="fb-replies-toggle" onclick="toggleReplies(this)">
                💬 ${replies.length > 0 ? `Show ${replies.length} replies` : 'Reply'}
            </button>
            <div class="fb-replies">
                ${repliesHtml}
                <div class="fb-reply-form">
                    <input type="text" id="fbReply_${f.id}" placeholder="Write a reply..." onkeydown="if(event.key==='Enter')addFeedbackReply('${f.id}')">
                    <button onclick="addFeedbackReply('${f.id}')">Send</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function toggleFeedbackVote(id) {
    const ref = db.collection('feedbacks').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return;
    const votes = doc.data().votes || [];
    if (votes.includes(currentUser.uid)) {
        await ref.update({ votes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
    } else {
        await ref.update({ votes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    }
}

async function addFeedbackReply(id) {
    const input = document.getElementById('fbReply_' + id);
    const text = input?.value.trim();
    if (!text) return;

    const ref = db.collection('feedbacks').doc(id);
    await ref.update({
        replies: firebase.firestore.FieldValue.arrayUnion({
            authorUid: currentUser.uid,
            authorName: currentUser.name,
            text,
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        })
    });
    input.value = '';
    showToast('💬 Reply added!');
}

async function updateFeedbackStatus(id, status) {
    await db.collection('feedbacks').doc(id).update({ status });
    showToast('✅ Status updated.');
}

async function deleteFeedback(id) {
    if (!confirm('Are you sure you want to delete this feedback?')) return;
    await db.collection('feedbacks').doc(id).delete();
    showToast('🗑️ Feedback deleted.');
}

// ===== Edit Feedback =====
function editFeedback(id) {
    const fb = allFeedbacks.find(f => f.id === id);
    if (!fb) return;
    showEditModal({
        title: 'Edit Feedback',
        fields: [
            { id: 'editFbType', type: 'select', value: fb.type, options: [
                { value: 'Feature Request', label: '🚀 Feature Request' },
                { value: 'Improvement', label: '✨ Improvement' },
                { value: 'Bug Report', label: '🐛 Bug Report' },
                { value: 'Other', label: '💬 Other' }
            ]},
            { id: 'editFbTitle', type: 'text', value: fb.title, placeholder: 'Title' },
            { id: 'editFbContent', type: 'textarea', value: fb.content, placeholder: 'Description' }
        ],
        onSave: () => saveFeedbackEdit(id)
    });
}

async function saveFeedbackEdit(id) {
    const type = document.getElementById('editFbType').value;
    const title = document.getElementById('editFbTitle').value.trim();
    const content = document.getElementById('editFbContent').value.trim();
    if (!title || !content) { showToast('⚠️ Please enter a title and description.'); return; }
    await db.collection('feedbacks').doc(id).update({ type, title, content });
    closeEditModal();
    showToast('✅ Feedback updated!');
}

function toggleReplies(btn) {
    const repliesDiv = btn.nextElementSibling;
    repliesDiv.classList.toggle('show');
    if (repliesDiv.classList.contains('show')) {
        btn.textContent = '💬 Hide replies';
    } else {
        const count = repliesDiv.querySelectorAll('.fb-reply').length;
        btn.textContent = count > 0 ? `💬 Show ${count} replies` : '💬 Reply';
    }
}

function openFeedbackImage(src) {
    const overlay = document.createElement('div');
    overlay.className = 'fb-lightbox';
    overlay.onclick = () => overlay.remove();
    overlay.innerHTML = `<img src="${src}" alt="Full image">`;
    document.body.appendChild(overlay);
}
