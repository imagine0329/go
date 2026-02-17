// ===== My Study Page =====

// ===== Study Tab Switching =====
function switchStudyTab(tab, btn) {
    document.querySelectorAll('.my-study-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#studyPage .study-section').forEach(s => s.classList.remove('active'));
    if (tab === 'studied') {
        document.getElementById('studiedSection').classList.add('active');
    } else if (tab === 'notes') {
        document.getElementById('notesSection').classList.add('active');
        renderNotes();
    }
}

// ===== Studied Posts =====
function renderStudiedPosts() {
    const q = (document.getElementById('studiedSearch')?.value || '').toLowerCase();

    // Filter posts that current user has studied
    const studiedPosts = allPosts.filter(p => {
        const studied = (p.studiedBy || []).find(s => s.uid === currentUser.uid);
        if (!studied) return false;
        if (q) {
            return (p.title || '').toLowerCase().includes(q) ||
                   (p.content || '').toLowerCase().includes(q) ||
                   (p.authorName || '').toLowerCase().includes(q);
        }
        return true;
    });

    // Sort by studied date (most recent first)
    studiedPosts.sort((a, b) => {
        const dateA = (a.studiedBy || []).find(s => s.uid === currentUser.uid)?.date || '';
        const dateB = (b.studiedBy || []).find(s => s.uid === currentUser.uid)?.date || '';
        return dateB.localeCompare(dateA);
    });

    // Stats
    const totalStudied = studiedPosts.length;
    const thisWeek = studiedPosts.filter(p => {
        const d = (p.studiedBy || []).find(s => s.uid === currentUser.uid)?.date;
        if (!d) return false;
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(d) >= weekAgo;
    }).length;
    const thisMonth = studiedPosts.filter(p => {
        const d = (p.studiedBy || []).find(s => s.uid === currentUser.uid)?.date;
        if (!d) return false;
        const now = new Date();
        const sd = new Date(d);
        return sd.getMonth() === now.getMonth() && sd.getFullYear() === now.getFullYear();
    }).length;

    document.getElementById('studiedStats').innerHTML = `
        <div class="stat-card"><div class="stat-number">${totalStudied}</div><div class="stat-label">Total Studied</div></div>
        <div class="stat-card"><div class="stat-number">${thisWeek}</div><div class="stat-label">This Week</div></div>
        <div class="stat-card"><div class="stat-number">${thisMonth}</div><div class="stat-label">This Month</div></div>
    `;

    const el = document.getElementById('studiedPostList');

    if (studiedPosts.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="emoji">📚</div><p>No studied posts yet.<br>Go to Study Feed and mark posts as studied!</p></div>';
        return;
    }

    el.innerHTML = studiedPosts.map((p, idx) => {
        const studiedEntry = (p.studiedBy || []).find(s => s.uid === currentUser.uid);
        const studiedDate = studiedEntry?.date ? new Date(studiedEntry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const preview = (p.content || '').substring(0, 120).replace(/[#*>\-`]/g, '');
        const fullContent = formatContent(p.content || '');
        const videoHtml = p.videoUrl ? buildVideoEmbed(p.videoUrl) : '';

        return `
        <div class="studied-post-item" onclick="toggleStudiedItem(this, event)">
            <div class="studied-item-header">
                <div class="studied-check">📗</div>
                <div class="studied-header-info">
                    <div class="studied-post-title">${esc(p.title)}</div>
                    <div class="studied-post-meta">
                        <span>✍️ ${esc(p.authorName)}</span>
                        <span>📂 ${esc(p.category)}</span>
                        <span>❤️ ${(p.likes||[]).length}</span>
                        <span>💬 ${(p.comments||[]).length}</span>
                    </div>
                </div>
                <div class="studied-item-right">
                    <div class="studied-date-badge">✅ ${studiedDate}</div>
                    <div class="studied-expand-icon">▼</div>
                </div>
            </div>
            <div class="studied-post-preview">${esc(preview)}${(p.content||'').length > 120 ? '...' : ''}</div>
            <div class="studied-item-body">
                ${videoHtml}
                <div class="studied-full-content">${fullContent}</div>
                <div class="studied-item-actions">
                    ${p.authorUid === currentUser.uid ? `<button class="mem-action-btn" onclick="event.stopPropagation(); editPost('${p.id}')">✏️ Edit</button>` : ''}
                    ${p.authorUid === currentUser.uid ? `<button class="mem-action-btn delete" onclick="event.stopPropagation(); deletePost('${p.id}')">🗑️ Delete</button>` : ''}
                    <button class="mem-action-btn" onclick="event.stopPropagation(); toggleStudied('${p.id}')">📖 Unstudy</button>
                </div>
                ${(p.comments||[]).length > 0 ? `
                <div class="studied-comments-section">
                    <div class="studied-comments-title">💬 Comments (${p.comments.length})</div>
                    ${p.comments.map(c => `
                        <div class="studied-comment">
                            <strong>${esc(c.authorName)}</strong>
                            <span class="studied-comment-text">${esc(c.text)}</span>
                        </div>
                    `).join('')}
                </div>` : ''}
            </div>
        </div>`;
    }).join('');
}

// Toggle expand/collapse a studied post item
function toggleStudiedItem(el, event) {
    if (event && event.target.closest('.studied-item-actions')) return;
    el.classList.toggle('expanded');
}

// ===== My Notes (Private) =====
let allNotes = [];
let unsubNotes = null;

function attachNotesListener() {
    if (unsubNotes) return;
    unsubNotes = db.collection('notes')
        .where('uid', '==', currentUser.uid)
        .onSnapshot(snap => {
            allNotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            allNotes.sort((a, b) => {
                const ta = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
                const tb = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
                return tb - ta;
            });
            renderNotes();
        }, err => {
            console.error('Notes listener error:', err);
        });
}

function detachNotesListener() {
    if (unsubNotes) { unsubNotes(); unsubNotes = null; }
}

function toggleNoteForm() {
    const form = document.getElementById('noteForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'block') {
        document.getElementById('noteTitle').focus();
    }
}

async function submitNote() {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    if (!content) { showToast('⚠️ Please write something.'); return; }

    await db.collection('notes').add({
        uid: currentUser.uid,
        title,
        content,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteForm').style.display = 'none';
    showToast('📝 Note saved!');
}

function renderNotes() {
    const q = (document.getElementById('noteSearch')?.value || '').toLowerCase();
    let notes = allNotes;
    if (q) {
        notes = notes.filter(n =>
            (n.title || '').toLowerCase().includes(q) ||
            (n.content || '').toLowerCase().includes(q)
        );
    }

    const el = document.getElementById('notesList');
    if (!el) return;

    if (notes.length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="emoji">📝</div><p>No notes yet.<br>Create your first personal study note!</p></div>`;
        return;
    }

    el.innerHTML = notes.map(n => {
        const date = n.updatedAt?.toDate?.() || n.createdAt?.toDate?.() || new Date();
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const preview = (n.content || '').substring(0, 150);
        const formattedContent = formatContent(n.content || '');

        return `
        <div class="note-item" onclick="toggleNoteItem(this, event)">
            <div class="note-item-header">
                <div class="note-icon">📝</div>
                <div class="note-header-info">
                    <div class="note-title">${esc(n.title || 'Untitled Note')}</div>
                    <div class="note-date">🕐 ${dateStr} ${timeStr}</div>
                </div>
                <div class="note-expand-icon">▼</div>
            </div>
            <div class="note-preview">${esc(preview)}${(n.content||'').length > 150 ? '...' : ''}</div>
            <div class="note-body">
                <div class="note-full-content">${formattedContent}</div>
                <div class="note-actions">
                    <button class="mem-action-btn" onclick="event.stopPropagation(); editNote('${n.id}')">✏️ Edit</button>
                    <button class="mem-action-btn delete" onclick="event.stopPropagation(); deleteNote('${n.id}')">🗑️ Delete</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function toggleNoteItem(el, event) {
    if (event && event.target.closest('.note-actions')) return;
    el.classList.toggle('expanded');
}

function editNote(noteId) {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    showEditModal({
        title: 'Edit Note',
        fields: [
            { id: 'editNoteTitle', type: 'text', value: note.title || '', placeholder: 'Note title...' },
            { id: 'editNoteContent', type: 'textarea', value: note.content || '', placeholder: 'Write your note...' }
        ],
        onSave: () => saveNoteEdit(noteId)
    });
}

async function saveNoteEdit(noteId) {
    const title = document.getElementById('editNoteTitle').value.trim();
    const content = document.getElementById('editNoteContent').value.trim();
    if (!content) { showToast('⚠️ Please write something.'); return; }
    await db.collection('notes').doc(noteId).update({
        title,
        content,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeEditModal();
    showToast('✅ Note updated!');
}

async function deleteNote(noteId) {
    if (!confirm('Delete this note?')) return;
    await db.collection('notes').doc(noteId).delete();
    showToast('🗑️ Note deleted');
}
