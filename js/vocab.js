// ===== My Study Page =====

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
        <div class="studied-post-item" onclick="toggleStudiedItem(this)">
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
function toggleStudiedItem(el) {
    el.classList.toggle('expanded');
}
