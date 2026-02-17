// ===== Members =====

function renderMembers() {
    const q = (document.getElementById('memberSearch')?.value || '').toLowerCase();

    // Separate pending and approved members
    const pendingMembers = allMembers.filter(u => u.approved === false && u.role !== 'admin');
    const approvedMembers = allMembers.filter(u => u.approved !== false || u.role === 'admin');

    document.getElementById('memberStats').innerHTML = `
        <div class="stat-card"><div class="stat-number">${approvedMembers.length}</div><div class="stat-label">Members</div></div>
        <div class="stat-card"><div class="stat-number">${allPosts.length}</div><div class="stat-label">Shared Posts</div></div>
        <div class="stat-card"><div class="stat-number">${allPosts.filter(p => (p.studiedBy||[]).some(s => s.uid === currentUser.uid)).length}</div><div class="stat-label">My Studied</div></div>
        ${currentUser.role === 'admin' && pendingMembers.length > 0 ? `<div class="stat-card" style="background:#fff3e0;"><div class="stat-number" style="color:#e65100;">${pendingMembers.length}</div><div class="stat-label">⏳ Pending</div></div>` : ''}
    `;

    // Pending approval section (admin only)
    let pendingHtml = '';
    if (currentUser.role === 'admin' && pendingMembers.length > 0) {
        const pendingList = pendingMembers.filter(u =>
            (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)
        );
        if (pendingList.length > 0) {
            pendingHtml = `
                <div class="pending-section">
                    <h3>⏳ Pending Approval (${pendingList.length})</h3>
                    <ul class="member-list">
                        ${pendingList.map(u => `
                        <li class="member-item pending-item">
                            <div class="member-info">
                                <div class="member-avatar" style="background:#f57c00;">${(u.name||'?').charAt(0)}</div>
                                <div>
                                    <div class="member-name">${esc(u.name||'')}</div>
                                    <div class="member-role">📧 ${esc(u.email||'')} · Applied ${u.joinDate||''}</div>
                                </div>
                            </div>
                            <div class="member-actions">
                                <button class="approve-btn" onclick="approveMember('${u.uid}')">✅ Approve</button>
                                <button class="reject-btn" onclick="rejectMember('${u.uid}')">❌ Reject</button>
                            </div>
                        </li>`).join('')}
                    </ul>
                </div>`;
        }
    }

    const list = approvedMembers.filter(u =>
        (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)
    );

    document.getElementById('memberList').innerHTML = pendingHtml + list.map(u => {
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

async function approveMember(uid) {
    await db.collection('users').doc(uid).update({ approved: true });
    showToast('✅ Member approved!');
}

async function rejectMember(uid) {
    if (!confirm('Reject this member? Their account will be deleted.')) return;
    await db.collection('users').doc(uid).delete();
    showToast('❌ Member rejected.');
}
