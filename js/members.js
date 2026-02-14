// ===== Members =====

function renderMembers() {
    const q = (document.getElementById('memberSearch')?.value || '').toLowerCase();

    document.getElementById('memberStats').innerHTML = `
        <div class="stat-card"><div class="stat-number">${allMembers.length}</div><div class="stat-label">Total Members</div></div>
        <div class="stat-card"><div class="stat-number">${allPosts.length}</div><div class="stat-label">Shared Posts</div></div>
        <div class="stat-card"><div class="stat-number">${allPosts.filter(p => (p.studiedBy||[]).some(s => s.uid === currentUser.uid)).length}</div><div class="stat-label">My Studied</div></div>
    `;

    const list = allMembers.filter(u =>
        (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)
    );

    document.getElementById('memberList').innerHTML = list.map(u => {
        const posts   = allPosts.filter(p => p.authorUid === u.uid).length;
        const studied = allPosts.filter(p => (p.studiedBy||[]).some(s => s.uid === u.uid)).length;
        const isMe  = u.uid === currentUser.uid;
        return `
        <li class="member-item">
            <div class="member-info">
                <div class="member-avatar">${(u.name||'?').charAt(0)}</div>
                <div>
                    <div class="member-name">${esc(u.name||'')} ${isMe ? '(Me)' : ''}</div>
                    <div class="member-role">${u.role==='admin'?'👑 Admin':'👤 Member'} · Posts ${posts} · Studied ${studied} · Joined ${u.joinDate||''}</div>
                </div>
            </div>
            <div class="member-actions">
                ${currentUser.role==='admin' && !isMe ? `<button onclick="removeMember('${u.uid}')">Remove</button>` : ''}
            </div>
        </li>`;
    }).join('');
}

async function removeMember(uid) {
    if (!confirm('Are you sure you want to remove this member?\nAll posts and words by this member will also be deleted.')) return;

    // Delete posts
    const ps = await db.collection('posts').where('authorUid','==',uid).get();
    const b1 = db.batch();
    ps.forEach(d => b1.delete(d.ref));
    await b1.commit();

    // Delete words
    const vs = await db.collection('vocabs').where('uid','==',uid).get();
    const b2 = db.batch();
    vs.forEach(d => b2.delete(d.ref));
    await b2.commit();

    // Delete user
    await db.collection('users').doc(uid).delete();
    showToast('🗑️ Member removed.');
}
