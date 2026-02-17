// ===== Memorize (Flashcards + Spaced Repetition) =====
let allCards = [];
let cardFilter = 'all';
let memorizeMode = 'cards'; // 'cards' | 'practice' | 'review' | 'quiz'
let practiceCards = [];
let practiceIndex = 0;
let practiceResults = { correct: 0, wrong: 0, skip: 0 };
let unsubCards = null;
let cardFeedRefCount = 0;

// Leitner Box intervals (in days)
const LEITNER_INTERVALS = {
    1: 0,    // Box 1: review immediately / daily
    2: 1,    // Box 2: after 1 day
    3: 3,    // Box 3: after 3 days
    4: 7,    // Box 4: after 7 days
    5: 14    // Box 5: after 14 days (mastered)
};

// ===== Firestore Listener =====
function attachCardsListener() {
    if (unsubCards) return;
    unsubCards = db.collection('cards')
        .onSnapshot(snap => {
            allCards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            allCards.sort((a, b) => {
                const ta = a.createdAt?.toMillis?.() || 0;
                const tb = b.createdAt?.toMillis?.() || 0;
                return tb - ta;
            });
            renderMemorize();
            updateReviewCount();
        }, err => {
            console.error('Cards listener error:', err);
        });
}
function detachCardsListener() {
    if (unsubCards) { unsubCards(); unsubCards = null; }
}

// ===== Leitner Helpers =====
function getCardBox(card) {
    return card.box || 1;
}

function getNextReviewDate(card) {
    const box = getCardBox(card);
    const lastPracticed = card.lastPracticed?.toDate?.() || card.createdAt?.toDate?.() || new Date();
    const intervalDays = LEITNER_INTERVALS[box] || 0;
    const next = new Date(lastPracticed);
    next.setDate(next.getDate() + intervalDays);
    next.setHours(0, 0, 0, 0);
    return next;
}

function isDueForReview(card) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const nextReview = getNextReviewDate(card);
    return nextReview <= now;
}

function getDueCards() {
    return allCards.filter(c => c.status !== 'mastered' && isDueForReview(c));
}

function getBoxColor(box) {
    const colors = { 1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6', 4: '#8b5cf6', 5: '#10b981' };
    return colors[box] || '#888';
}

function getBoxLabel(box) {
    const labels = { 1: 'New', 2: 'Learning', 3: 'Reviewing', 4: 'Familiar', 5: 'Mastered' };
    return labels[box] || 'Unknown';
}

// ===== Update Review Badge Count =====
function updateReviewCount() {
    const due = getDueCards();
    const badge = document.getElementById('reviewBadge');
    if (badge) {
        if (due.length > 0) {
            badge.textContent = due.length;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ===== Toggle Card Form =====
function toggleCardForm() {
    const form = document.getElementById('cardForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'none') {
        closeCardFeedRef();
        closeCardFeedSelector();
    }
}

// ===== Feed Reference for Card Creation =====
function openCardFeedSelector() {
    // Close if already open
    if (document.getElementById('cardFeedSelectorOverlay')) {
        closeCardFeedSelector();
        return;
    }

    const posts = (typeof allPosts !== 'undefined') ? allPosts : [];
    if (posts.length === 0) {
        showToast('⚠️ No feed posts available.');
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'cardFeedSelectorOverlay';
    overlay.className = 'card-feed-selector-overlay';
    overlay.innerHTML = `
        <div class="card-feed-selector">
            <div class="card-feed-selector-header">
                <h3>📢 Select a Feed Post</h3>
                <button onclick="closeCardFeedSelector()">✕</button>
            </div>
            <input type="text" class="card-feed-selector-search" id="cardFeedSelectorSearch" placeholder="🔍 Search posts..." oninput="filterCardFeedSelector()">
            <div class="card-feed-selector-list" id="cardFeedSelectorList">
                ${renderCardFeedSelectorList(posts)}
            </div>
        </div>
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCardFeedSelector();
    });
    document.body.appendChild(overlay);
}

function renderCardFeedSelectorList(posts) {
    return posts.map(p => {
        const dateStr = p.createdAt ? p.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const preview = (p.content || '').substring(0, 80).replace(/\n/g, ' ');
        return `
            <div class="card-feed-selector-item" onclick="selectCardFeedRef('${p.id}')">
                <div class="card-feed-selector-title">${p.title ? esc(p.title) : '<span style="color:#aaa;">Untitled</span>'}</div>
                <div class="card-feed-selector-meta">
                    <span>${esc(p.authorName)}</span> · <span>${dateStr}</span> · <span class="card-feed-selector-cat">${esc(p.category)}</span>
                </div>
                <div class="card-feed-selector-preview">${esc(preview)}${p.content.length > 80 ? '...' : ''}</div>
            </div>
        `;
    }).join('');
}

function filterCardFeedSelector() {
    const q = (document.getElementById('cardFeedSelectorSearch')?.value || '').toLowerCase();
    const posts = (typeof allPosts !== 'undefined') ? allPosts : [];
    const filtered = q ? posts.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.content || '').toLowerCase().includes(q) ||
        (p.authorName || '').toLowerCase().includes(q)
    ) : posts;
    document.getElementById('cardFeedSelectorList').innerHTML = renderCardFeedSelectorList(filtered);
}

function selectCardFeedRef(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;

    cardFeedRefCount = 0;
    const refBody = document.getElementById('cardFeedRefBody');
    refBody.innerHTML = `
        <div class="card-feed-ref-category">${esc(post.category)}</div>
        ${post.title ? `<div class="card-feed-ref-title">${esc(post.title)}</div>` : ''}
        <div class="card-feed-ref-content">${formatContent(post.content)}</div>
        <div class="card-feed-ref-author">— ${esc(post.authorName)}</div>
    `;
    document.getElementById('cardFeedRef').style.display = 'block';
    updateCardFeedRefHeader();
    closeCardFeedSelector();

    // Auto-match category
    const catMap = { 'Vocabulary': 'Vocabulary', 'Grammar': 'Grammar', 'Conversation': 'Phrase', 'Tips': 'Vocabulary', 'Questions': 'Vocabulary' };
    const mapped = catMap[post.category] || 'Vocabulary';
    document.getElementById('cardCategory').value = mapped;
}

function closeCardFeedRef() {
    const ref = document.getElementById('cardFeedRef');
    if (ref) {
        ref.style.display = 'none';
        document.getElementById('cardFeedRefBody').innerHTML = '';
    }
    cardFeedRefCount = 0;
}

function updateCardFeedRefHeader() {
    const headerSpan = document.querySelector('.card-feed-ref-header span');
    if (headerSpan) {
        headerSpan.innerHTML = cardFeedRefCount > 0
            ? `📢 Reference Feed <span style="background:#1a73e8;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;margin-left:6px;">${cardFeedRefCount} card${cardFeedRefCount > 1 ? 's' : ''} added</span>`
            : '📢 Reference Feed';
    }
}

function closeCardFeedSelector() {
    const overlay = document.getElementById('cardFeedSelectorOverlay');
    if (overlay) overlay.remove();
}

// ===== Submit Card =====
async function submitCard() {
    const front = document.getElementById('cardFront').value.trim();
    const back = document.getElementById('cardBack').value.trim();
    const category = document.getElementById('cardCategory').value;
    const example = document.getElementById('cardExample')?.value.trim() || '';
    if (!front || !back) { showToast('⚠️ Please fill in both sides of the card.'); return; }

    await db.collection('cards').add({
        uid: currentUser.uid,
        userName: currentUser.name,
        front,
        back,
        example,
        category,
        status: 'learning',
        box: 1,
        correctCount: 0,
        wrongCount: 0,
        streak: 0,
        lastPracticed: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById('cardFront').value = '';
    document.getElementById('cardBack').value = '';
    if (document.getElementById('cardExample')) document.getElementById('cardExample').value = '';

    // If feed reference is open, keep form open for multiple cards
    const feedRef = document.getElementById('cardFeedRef');
    if (feedRef && feedRef.style.display !== 'none') {
        cardFeedRefCount++;
        updateCardFeedRefHeader();
        showToast('✅ Card added! Keep adding more from this feed.');
        document.getElementById('cardFront').focus();
    } else {
        document.getElementById('cardForm').style.display = 'none';
        showToast('✅ Card added to Box 1!');
    }
}

// ===== Filters =====
function setCardFilter(filter, btn) {
    cardFilter = filter;
    document.querySelectorAll('.mem-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMemorize();
}

function setMemorizeMode(mode, btn) {
    memorizeMode = mode;
    document.querySelectorAll('.mem-mode-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    document.getElementById('cardsListView').style.display = 'none';
    document.getElementById('practiceView').style.display = 'none';
    document.getElementById('reviewView').style.display = 'none';
    document.getElementById('quizView').style.display = 'none';

    if (mode === 'cards') {
        document.getElementById('cardsListView').style.display = '';
    } else if (mode === 'practice') {
        document.getElementById('practiceView').style.display = '';
        startPractice();
    } else if (mode === 'review') {
        document.getElementById('reviewView').style.display = '';
        startReview();
    } else if (mode === 'quiz') {
        document.getElementById('quizView').style.display = '';
        showQuizSetup();
    }
}

// ===== Get Filtered Cards =====
function getFilteredCards() {
    let cards = [...allCards];
    if (cardFilter !== 'all') {
        cards = cards.filter(c => c.category === cardFilter);
    }
    const statusFilter = document.getElementById('cardStatusFilter')?.value || 'all';
    if (statusFilter !== 'all') {
        cards = cards.filter(c => c.status === statusFilter);
    }
    const search = (document.getElementById('cardSearch')?.value || '').toLowerCase();
    if (search) {
        cards = cards.filter(c =>
            c.front.toLowerCase().includes(search) ||
            c.back.toLowerCase().includes(search)
        );
    }
    return cards;
}

// ===== Render Cards List =====
function renderMemorize() {
    const cards = getFilteredCards();
    const total = allCards.length;
    const mastered = allCards.filter(c => c.status === 'mastered').length;
    const dueCount = getDueCards().length;

    // Box distribution
    const boxCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    allCards.forEach(c => {
        const box = getCardBox(c);
        boxCounts[box] = (boxCounts[box] || 0) + 1;
    });

    // Stats
    const statsEl = document.getElementById('memorizeStats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="mem-stat-card">
                <div class="mem-stat-num">${total}</div>
                <div class="mem-stat-label">Total Cards</div>
            </div>
            <div class="mem-stat-card learning">
                <div class="mem-stat-num">${dueCount}</div>
                <div class="mem-stat-label">📅 Due Today</div>
            </div>
            <div class="mem-stat-card mastered">
                <div class="mem-stat-num">${mastered}</div>
                <div class="mem-stat-label">✅ Mastered</div>
            </div>
        `;
    }

    // Leitner Box Visual
    const boxEl = document.getElementById('leitnerBoxes');
    if (boxEl && total > 0) {
        const maxCount = Math.max(...Object.values(boxCounts), 1);
        boxEl.innerHTML = `
            <div class="leitner-box-header">
                <span class="leitner-title">📦 Leitner Boxes</span>
                <span class="leitner-subtitle">Cards progress through boxes as you learn</span>
            </div>
            <div class="leitner-boxes-row">
                ${[1,2,3,4,5].map(box => `
                    <div class="leitner-box" style="--box-color: ${getBoxColor(box)}">
                        <div class="lbox-bar-wrap">
                            <div class="lbox-bar" style="height: ${Math.max((boxCounts[box]/maxCount)*100, 8)}%"></div>
                        </div>
                        <div class="lbox-count">${boxCounts[box]}</div>
                        <div class="lbox-label">Box ${box}</div>
                        <div class="lbox-name">${getBoxLabel(box)}</div>
                        <div class="lbox-interval">${box === 1 ? 'Daily' : LEITNER_INTERVALS[box] + 'd'}</div>
                    </div>
                `).join('')}
            </div>
        `;
    } else if (boxEl) {
        boxEl.innerHTML = '';
    }

    // Cards list
    const listEl = document.getElementById('cardsList');
    if (!listEl) return;

    if (cards.length === 0) {
        listEl.innerHTML = `<div class="empty-state"><div class="emoji">🧠</div><p>No cards yet. Add your first flashcard!</p></div>`;
        return;
    }

    listEl.innerHTML = cards.map(c => {
        const catIcons = { 'Vocabulary': '📗', 'Phrase': '📙', 'Sentence': '📘', 'Grammar': '📕' };
        const icon = catIcons[c.category] || '📗';
        const box = getCardBox(c);
        const due = isDueForReview(c) && c.status !== 'mastered';
        const stats = c.correctCount + c.wrongCount > 0
            ? `<span class="card-practice-stats">✅${c.correctCount} ❌${c.wrongCount}</span>`
            : '';
        const streakBadge = (c.streak || 0) >= 3
            ? `<span class="card-streak-badge">🔥${c.streak}</span>`
            : '';
        const isOwner = c.uid === currentUser.uid;

        return `
            <div class="mem-card-item ${c.status} ${due ? 'due' : ''}">
                <div class="mem-card-top">
                    <span class="mem-card-category">${icon} ${c.category}</span>
                    <span class="mem-card-author">👤 ${esc(c.userName || 'Unknown')}</span>
                    <span class="card-box-badge" style="background: ${getBoxColor(box)}15; color: ${getBoxColor(box)}; border: 1px solid ${getBoxColor(box)}40;">
                        📦 Box ${box}
                    </span>
                    ${due ? '<span class="card-due-badge">📅 Due</span>' : ''}
                    ${streakBadge}
                    ${stats}
                </div>
                <div class="mem-card-front">${esc(c.front)}</div>
                <div class="mem-card-back">${esc(c.back)}</div>
                ${c.example ? `<div class="mem-card-example">💡 ${esc(c.example)}</div>` : ''}
                ${renderContributions(c)}
                <div class="mem-card-actions">
                    <button onclick="toggleMastered('${c.id}', '${c.status}')" class="mem-action-btn">
                        ${c.status === 'mastered' ? '🔄 Set Learning' : '✅ Mark Mastered'}
                    </button>
                    <button onclick="showAddContribution('${c.id}')" class="mem-action-btn contrib-btn">💬 Add Meaning</button>
                    ${isOwner ? `<button onclick="editCard('${c.id}')" class="mem-action-btn">✏️ Edit</button>` : ''}
                    ${isOwner ? `<button onclick="deleteCard('${c.id}')" class="mem-action-btn delete">🗑️ Delete</button>` : ''}
                </div>
                <div class="contrib-form-area" id="contribForm_${c.id}" style="display:none;"></div>
            </div>
        `;
    }).join('');
}

// ===== Toggle Mastered =====
async function toggleMastered(cardId, currentStatus) {
    const newStatus = currentStatus === 'mastered' ? 'learning' : 'mastered';
    const updates = { status: newStatus };
    if (newStatus === 'mastered') { updates.box = 5; }
    if (newStatus === 'learning') { updates.box = 1; updates.streak = 0; }
    await db.collection('cards').doc(cardId).update(updates);
    showToast(newStatus === 'mastered' ? '✅ Marked as mastered!' : '🔄 Back to learning');
}

// ===== Delete Card =====
async function deleteCard(cardId) {
    if (!confirm('Delete this card?')) return;
    await db.collection('cards').doc(cardId).delete();
    showToast('🗑️ Card deleted');
}

// ===== Contributions (Collaborative Meanings & Examples) =====
function renderContributions(card) {
    const contribs = card.contributions || [];
    if (contribs.length === 0) return '';

    const items = contribs.map((ct, i) => {
        const isContribOwner = ct.uid === currentUser.uid;
        return `
            <div class="contrib-item">
                <div class="contrib-header">
                    <span class="contrib-author">👤 ${esc(ct.userName || 'Unknown')}</span>
                    ${isContribOwner ? `<button class="contrib-delete-btn" onclick="deleteContribution('${card.id}', ${i})" title="Delete">✕</button>` : ''}
                </div>
                ${ct.meaning ? `<div class="contrib-meaning">${esc(ct.meaning)}</div>` : ''}
                ${ct.example ? `<div class="contrib-example">💡 ${esc(ct.example)}</div>` : ''}
            </div>
        `;
    }).join('');

    return `
        <div class="contrib-section">
            <div class="contrib-section-title">💬 Additional Meanings & Examples (${contribs.length})</div>
            ${items}
        </div>
    `;
}

function showAddContribution(cardId) {
    const formArea = document.getElementById(`contribForm_${cardId}`);
    if (!formArea) return;

    if (formArea.style.display !== 'none') {
        formArea.style.display = 'none';
        formArea.innerHTML = '';
        return;
    }

    formArea.style.display = 'block';
    formArea.innerHTML = `
        <div class="contrib-form">
            <textarea id="contribMeaning_${cardId}" placeholder="Add another meaning or definition..." rows="2"></textarea>
            <input type="text" id="contribExample_${cardId}" placeholder="Example sentence (optional)">
            <div class="contrib-form-actions">
                <button class="btn-cancel" onclick="hideContribForm('${cardId}')">Cancel</button>
                <button class="btn-new-post" onclick="saveContribution('${cardId}')" style="padding:8px 20px;font-size:13px;">💬 Add</button>
            </div>
        </div>
    `;
}

function hideContribForm(cardId) {
    const formArea = document.getElementById(`contribForm_${cardId}`);
    if (formArea) {
        formArea.style.display = 'none';
        formArea.innerHTML = '';
    }
}

async function saveContribution(cardId) {
    const meaning = document.getElementById(`contribMeaning_${cardId}`)?.value.trim() || '';
    const example = document.getElementById(`contribExample_${cardId}`)?.value.trim() || '';

    if (!meaning && !example) {
        showToast('⚠️ Please enter a meaning or an example.');
        return;
    }

    const contribution = {
        uid: currentUser.uid,
        userName: currentUser.name,
        meaning,
        example,
        createdAt: new Date().toISOString()
    };

    await db.collection('cards').doc(cardId).update({
        contributions: firebase.firestore.FieldValue.arrayUnion(contribution)
    });

    hideContribForm(cardId);
    showToast('💬 Contribution added!');
}

async function deleteContribution(cardId, index) {
    if (!confirm('Delete this contribution?')) return;

    const card = allCards.find(c => c.id === cardId);
    if (!card) return;

    const contribs = [...(card.contributions || [])];
    if (index < 0 || index >= contribs.length) return;

    contribs.splice(index, 1);
    await db.collection('cards').doc(cardId).update({ contributions: contribs });
    showToast('🗑️ Contribution deleted');
}

// ===== Edit Card =====
function editCard(cardId) {
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;
    showEditModal({
        title: 'Edit Card',
        fields: [
            { id: 'editCardCategory', type: 'select', value: card.category, options: [
                { value: 'Vocabulary', label: '📗 Vocabulary' },
                { value: 'Phrase', label: '📙 Phrase' },
                { value: 'Sentence', label: '📘 Sentence' },
                { value: 'Grammar', label: '📕 Grammar' }
            ]},
            { id: 'editCardFront', type: 'text', value: card.front, placeholder: 'Front — English word or phrase' },
            { id: 'editCardBack', type: 'textarea', value: card.back, placeholder: 'Back — Meaning, example, notes...' },
            { id: 'editCardExample', type: 'text', value: card.example || '', placeholder: 'Example sentence (optional)' }
        ],
        onSave: () => saveCardEdit(cardId)
    });
}

async function saveCardEdit(cardId) {
    const category = document.getElementById('editCardCategory').value;
    const front = document.getElementById('editCardFront').value.trim();
    const back = document.getElementById('editCardBack').value.trim();
    const example = document.getElementById('editCardExample')?.value.trim() || '';
    if (!front || !back) { showToast('⚠️ Please fill in both sides.'); return; }
    await db.collection('cards').doc(cardId).update({ category, front, back, example });
    closeEditModal();
    showToast('✅ Card updated!');
}

// ===== Daily Review (Spaced Repetition) =====
let reviewAnswered = false;

function startReview() {
    const dueCards = getDueCards();
    const reviewEl = document.getElementById('reviewContent');

    if (dueCards.length === 0) {
        reviewEl.innerHTML = `
            <div class="review-complete">
                <div class="review-complete-icon">🎉</div>
                <h3>All caught up!</h3>
                <p>No cards due for review today. Great job!</p>
                <p class="review-next-info">${getNextReviewInfo()}</p>
                <button class="btn-new-post" onclick="setMemorizeMode('practice', document.querySelectorAll('.mem-mode-btn')[1])" style="padding:12px 28px;font-size:15px;margin-top:16px;">🎯 Practice All Cards Instead</button>
            </div>
        `;
        return;
    }

    // Sort by box (lower boxes first = harder cards first)
    dueCards.sort((a, b) => getCardBox(a) - getCardBox(b));

    practiceCards = dueCards;
    practiceIndex = 0;
    practiceResults = { correct: 0, wrong: 0, skip: 0 };
    reviewAnswered = false;

    reviewEl.innerHTML = `
        <div class="review-header-info">
            <span class="review-due-count">📅 ${dueCards.length} cards due for review</span>
        </div>
        <div class="practice-progress" id="reviewProgress"></div>
        <div class="practice-card-area" id="reviewCardArea"></div>
        <div class="review-answer-area" id="reviewAnswerArea"></div>
        <div class="review-difficulty" id="reviewDifficulty" style="display:none;"></div>
        <div class="practice-info" id="reviewInfo"></div>
    `;

    showReviewCard();
}

function getNextReviewInfo() {
    const futureCards = allCards.filter(c => c.status !== 'mastered' && !isDueForReview(c));
    if (futureCards.length === 0 && allCards.filter(c => c.status !== 'mastered').length === 0) return 'All cards mastered! 🏆';
    if (futureCards.length === 0) return 'Check back tomorrow!';
    const dates = futureCards.map(c => getNextReviewDate(c)).sort((a, b) => a - b);
    const next = dates[0];
    const now = new Date(); now.setHours(0,0,0,0);
    const diff = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return 'Check back soon!';
    if (diff === 1) return `Next review: tomorrow (${futureCards.length} cards)`;
    return `Next review: in ${diff} days (${futureCards.length} cards)`;
}

function showReviewCard() {
    if (practiceIndex >= practiceCards.length) {
        showReviewResult();
        return;
    }

    reviewAnswered = false;
    const card = practiceCards[practiceIndex];
    const box = getCardBox(card);
    const catIcons = { 'Vocabulary': '📗', 'Phrase': '📙', 'Sentence': '📘', 'Grammar': '📕' };

    document.getElementById('reviewProgress').innerHTML = `
        <span>${practiceIndex + 1} / ${practiceCards.length}</span>
        <div class="progress-bar">
            <div class="progress-fill" style="width:${((practiceIndex) / practiceCards.length) * 100}%"></div>
        </div>
    `;

    document.getElementById('reviewCardArea').innerHTML = `
        <div class="practice-show-card" style="border-color: ${getBoxColor(box)}30;">
            <div class="review-card-meta">
                <span class="fc-category">${catIcons[card.category] || '📗'} ${card.category}</span>
                <span class="card-box-badge" style="background: ${getBoxColor(box)}15; color: ${getBoxColor(box)}; border: 1px solid ${getBoxColor(box)}40;">
                    📦 Box ${box} · ${getBoxLabel(box)}
                </span>
                ${(card.streak || 0) >= 2 ? `<span class="card-streak-badge">🔥${card.streak} streak</span>` : ''}
            </div>
            <div class="psc-text">${esc(card.front)}</div>
            ${card.example ? `<div class="review-example">💡 "${esc(card.example)}"</div>` : ''}
        </div>
    `;

    document.getElementById('reviewAnswerArea').innerHTML = `
        <div class="reveal-answer-wrap">
            <button class="btn-show-answer" onclick="reviewReveal()">👀 Show Answer</button>
        </div>
    `;

    document.getElementById('reviewDifficulty').style.display = 'none';

    document.getElementById('reviewInfo').innerHTML = `
        ✅ ${practiceResults.correct} &nbsp; ❌ ${practiceResults.wrong}
    `;
}

function reviewReveal() {
    if (reviewAnswered) return;
    reviewAnswered = true;

    const card = practiceCards[practiceIndex];
    const correctAnswer = card.back;
    const contribs = card.contributions || [];
    const contribHtml = contribs.length > 0 ? `
        <div class="revealed-contribs">
            <div class="contrib-section-title" style="margin-top:10px;">💬 Additional Meanings (${contribs.length})</div>
            ${contribs.map(ct => `
                <div class="contrib-inline">
                    <span class="contrib-author">👤 ${esc(ct.userName || 'Unknown')}</span>
                    ${ct.meaning ? `<span class="contrib-meaning-inline">${esc(ct.meaning)}</span>` : ''}
                    ${ct.example ? `<span class="contrib-example-inline">💡 ${esc(ct.example)}</span>` : ''}
                </div>
            `).join('')}
        </div>
    ` : '';

    // Show the answer
    document.getElementById('reviewAnswerArea').innerHTML = `
        <div class="revealed-answer-box">
            <div class="revealed-label">📖 Answer</div>
            <div class="revealed-text">${esc(correctAnswer)}</div>
            ${contribHtml}
        </div>
    `;

    // Show difficulty rating
    const diffEl = document.getElementById('reviewDifficulty');
    diffEl.style.display = '';
    diffEl.innerHTML = `
        <div class="difficulty-prompt">How well did you know this?</div>
        <div class="difficulty-buttons">
            <button class="diff-btn diff-again" onclick="reviewRate('again')">
                <span class="diff-icon">🔄</span>
                <span class="diff-label">Again</span>
                <span class="diff-desc">→ Box 1</span>
            </button>
            <button class="diff-btn diff-hard" onclick="reviewRate('hard')">
                <span class="diff-icon">😓</span>
                <span class="diff-label">Hard</span>
                <span class="diff-desc">Stay</span>
            </button>
            <button class="diff-btn diff-good" onclick="reviewRate('good')">
                <span class="diff-icon">👍</span>
                <span class="diff-label">Good</span>
                <span class="diff-desc">→ Box +1</span>
            </button>
            <button class="diff-btn diff-easy" onclick="reviewRate('easy')">
                <span class="diff-icon">🌟</span>
                <span class="diff-label">Easy</span>
                <span class="diff-desc">→ Box +2</span>
            </button>
        </div>
    `;
}

async function reviewRate(difficulty) {
    const card = practiceCards[practiceIndex];
    const currentBox = getCardBox(card);
    let newBox = currentBox;
    let newStreak = card.streak || 0;

    switch (difficulty) {
        case 'again':
            newBox = 1;
            newStreak = 0;
            practiceResults.wrong++;
            break;
        case 'hard':
            newBox = Math.max(1, currentBox);
            newStreak = 0;
            practiceResults.wrong++;
            break;
        case 'good':
            newBox = Math.min(5, currentBox + 1);
            newStreak++;
            practiceResults.correct++;
            break;
        case 'easy':
            newBox = Math.min(5, currentBox + 2);
            newStreak++;
            practiceResults.correct++;
            break;
    }

    const isNowCorrect = difficulty === 'good' || difficulty === 'easy';
    const updates = {
        box: newBox,
        streak: newStreak,
        correctCount: (card.correctCount || 0) + (isNowCorrect ? 1 : 0),
        wrongCount: (card.wrongCount || 0) + (!isNowCorrect ? 1 : 0),
        lastPracticed: firebase.firestore.FieldValue.serverTimestamp(),
        status: newBox >= 5 ? 'mastered' : 'learning'
    };

    await db.collection('cards').doc(card.id).update(updates);

    practiceIndex++;
    reviewAnswered = false;
    showReviewCard();
}

function showReviewResult() {
    const total = practiceResults.correct + practiceResults.wrong;
    const pct = total > 0 ? Math.round((practiceResults.correct / total) * 100) : 0;

    let grade = '🎉 Perfect!';
    if (pct < 100) grade = '👏 Great job!';
    if (pct < 70) grade = '💪 Keep going!';
    if (pct < 50) grade = '📚 Need more practice';

    saveStudySession(total, practiceResults.correct);

    const reviewEl = document.getElementById('reviewContent');
    reviewEl.innerHTML = `
        <div class="practice-result">
            <div class="result-grade">${grade}</div>
            <div class="result-score">${pct}%</div>
            <div class="result-detail">
                <span class="result-correct">✅ ${practiceResults.correct} Knew it</span>
                <span class="result-wrong">❌ ${practiceResults.wrong} Didn't know</span>
            </div>
            <div class="review-result-tip">
                ${pct >= 80 ? '📈 Cards are progressing through boxes. Keep reviewing daily!' : '💡 Tip: Cards you marked "Again" go back to Box 1 for more frequent review.'}
            </div>
            <button class="btn-new-post" onclick="startReview()" style="margin-top:24px;padding:12px 32px;font-size:15px;">🔄 Review Again</button>
        </div>
    `;
}

// ===== Study Session Tracking =====
async function saveStudySession(totalCards, correctCards) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const sessionRef = db.collection('studySessions').doc(`${currentUser.uid}_${today}`);
        const doc = await sessionRef.get();
        if (doc.exists) {
            await sessionRef.update({
                totalReviewed: firebase.firestore.FieldValue.increment(totalCards),
                totalCorrect: firebase.firestore.FieldValue.increment(correctCards),
                sessions: firebase.firestore.FieldValue.increment(1),
                lastSession: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await sessionRef.set({
                uid: currentUser.uid,
                date: today,
                totalReviewed: totalCards,
                totalCorrect: correctCards,
                sessions: 1,
                lastSession: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (e) {
        console.error('Save session error:', e);
    }
}

// ===== Practice Mode (Free practice) =====
let practiceAnswered = false;

function startPractice() {
    let cards = getFilteredCards().filter(c => c.status === 'learning');
    if (cards.length === 0) cards = getFilteredCards();

    if (cards.length === 0) {
        document.getElementById('practiceCardArea').innerHTML =
            '<div class="empty-state"><div class="emoji">🎉</div><p>No cards to practice! Add some cards first.</p></div>';
        document.getElementById('practiceProgress').innerHTML = '';
        document.getElementById('practiceInfo').innerHTML = '';
        document.getElementById('practiceInputArea').innerHTML = '';
        document.getElementById('practiceControls').style.display = 'none';
        return;
    }

    practiceCards = cards.sort(() => Math.random() - 0.5);
    practiceIndex = 0;
    practiceResults = { correct: 0, wrong: 0, skip: 0 };
    document.getElementById('practiceControls').style.display = '';
    showPracticeCard();
}

function showPracticeCard() {
    if (practiceIndex >= practiceCards.length) {
        showPracticeResult();
        return;
    }

    practiceAnswered = false;
    const card = practiceCards[practiceIndex];
    const catIcons = { 'Vocabulary': '📗', 'Phrase': '📙', 'Sentence': '📘', 'Grammar': '📕' };
    const box = getCardBox(card);

    document.getElementById('practiceCardArea').innerHTML = `
        <div class="practice-show-card">
            <div class="review-card-meta">
                <span class="fc-category">${catIcons[card.category] || '📗'} ${card.category}</span>
                <span class="card-box-badge" style="background: ${getBoxColor(box)}15; color: ${getBoxColor(box)}; border: 1px solid ${getBoxColor(box)}40;">
                    📦 Box ${box}
                </span>
            </div>
            <div class="psc-text">${esc(card.front)}</div>
            ${card.example ? `<div class="review-example">💡 "${esc(card.example)}"</div>` : ''}
        </div>
    `;

    document.getElementById('practiceInputArea').innerHTML = `
        <div class="reveal-answer-wrap">
            <button class="btn-show-answer" onclick="practiceReveal()">👀 Show Answer</button>
        </div>
    `;

    document.getElementById('practiceControls').style.display = 'none';

    document.getElementById('practiceProgress').innerHTML = `
        <span>${practiceIndex + 1} / ${practiceCards.length}</span>
        <div class="progress-bar">
            <div class="progress-fill" style="width:${((practiceIndex) / practiceCards.length) * 100}%"></div>
        </div>
    `;

    document.getElementById('practiceInfo').innerHTML = `
        ✅ ${practiceResults.correct} &nbsp; ❌ ${practiceResults.wrong}
    `;
}

function practiceReveal() {
    if (practiceAnswered) return;
    practiceAnswered = true;

    const card = practiceCards[practiceIndex];
    if (!card) return;

    const correctAnswer = card.back;
    const contribs = card.contributions || [];
    const contribHtml = contribs.length > 0 ? `
        <div class="revealed-contribs">
            <div class="contrib-section-title" style="margin-top:10px;">💬 Additional Meanings (${contribs.length})</div>
            ${contribs.map(ct => `
                <div class="contrib-inline">
                    <span class="contrib-author">👤 ${esc(ct.userName || 'Unknown')}</span>
                    ${ct.meaning ? `<span class="contrib-meaning-inline">${esc(ct.meaning)}</span>` : ''}
                    ${ct.example ? `<span class="contrib-example-inline">💡 ${esc(ct.example)}</span>` : ''}
                </div>
            `).join('')}
        </div>
    ` : '';

    // Show the answer
    document.getElementById('practiceInputArea').innerHTML = `
        <div class="revealed-answer-box">
            <div class="revealed-label">📖 Answer</div>
            <div class="revealed-text">${esc(correctAnswer)}</div>
            ${contribHtml}
        </div>
    `;

    // Show difficulty buttons
    document.getElementById('practiceControls').style.display = '';
    document.getElementById('practiceControls').innerHTML = `
        <div class="difficulty-prompt">How well did you know this?</div>
        <div class="difficulty-buttons">
            <button class="diff-btn diff-again" onclick="practiceRate('again')">
                <span class="diff-icon">🔄</span>
                <span class="diff-label">Again</span>
                <span class="diff-desc">→ Box 1</span>
            </button>
            <button class="diff-btn diff-hard" onclick="practiceRate('hard')">
                <span class="diff-icon">😓</span>
                <span class="diff-label">Hard</span>
                <span class="diff-desc">Stay</span>
            </button>
            <button class="diff-btn diff-good" onclick="practiceRate('good')">
                <span class="diff-icon">👍</span>
                <span class="diff-label">Good</span>
                <span class="diff-desc">→ Box +1</span>
            </button>
            <button class="diff-btn diff-easy" onclick="practiceRate('easy')">
                <span class="diff-icon">🌟</span>
                <span class="diff-label">Easy</span>
                <span class="diff-desc">→ Box +2</span>
            </button>
        </div>
    `;

    document.getElementById('practiceInfo').innerHTML = `
        ✅ ${practiceResults.correct} &nbsp; ❌ ${practiceResults.wrong}
    `;
}

async function practiceRate(difficulty) {
    const card = practiceCards[practiceIndex];
    const currentBox = getCardBox(card);
    let newBox = currentBox;
    let newStreak = card.streak || 0;

    switch (difficulty) {
        case 'again':
            newBox = 1;
            newStreak = 0;
            practiceResults.wrong++;
            break;
        case 'hard':
            newBox = Math.max(1, currentBox);
            newStreak = 0;
            practiceResults.wrong++;
            break;
        case 'good':
            newBox = Math.min(5, currentBox + 1);
            newStreak++;
            practiceResults.correct++;
            break;
        case 'easy':
            newBox = Math.min(5, currentBox + 2);
            newStreak++;
            practiceResults.correct++;
            break;
    }

    const isNowCorrect = difficulty === 'good' || difficulty === 'easy';
    const updates = {
        box: newBox,
        streak: newStreak,
        correctCount: (card.correctCount || 0) + (isNowCorrect ? 1 : 0),
        wrongCount: (card.wrongCount || 0) + (!isNowCorrect ? 1 : 0),
        lastPracticed: firebase.firestore.FieldValue.serverTimestamp(),
        status: newBox >= 5 ? 'mastered' : 'learning'
    };

    await db.collection('cards').doc(card.id).update(updates);

    practiceIndex++;
    practiceAnswered = false;
    showPracticeCard();
}

function showPracticeResult() {
    const total = practiceResults.correct + practiceResults.wrong;
    const pct = total > 0 ? Math.round((practiceResults.correct / total) * 100) : 0;

    let grade = '🎉 Perfect!';
    if (pct < 100) grade = '👏 Great job!';
    if (pct < 70) grade = '💪 Keep going!';
    if (pct < 50) grade = '📚 Need more practice';

    saveStudySession(total, practiceResults.correct);

    document.getElementById('practiceCardArea').innerHTML = '';
    document.getElementById('practiceInputArea').innerHTML = `
        <div class="practice-result">
            <div class="result-grade">${grade}</div>
            <div class="result-score">${pct}%</div>
            <div class="result-detail">
                <span class="result-correct">✅ ${practiceResults.correct} Knew it</span>
                <span class="result-wrong">❌ ${practiceResults.wrong} Didn't know</span>
            </div>
            <button class="btn-new-post" onclick="startPractice()" style="margin-top:24px;padding:12px 32px;font-size:15px;">🔄 Practice Again</button>
        </div>
    `;
    document.getElementById('practiceControls').style.display = 'none';
    document.getElementById('practiceProgress').innerHTML = `
        <span>Done!</span>
        <div class="progress-bar"><div class="progress-fill" style="width:100%"></div></div>
    `;
    document.getElementById('practiceInfo').innerHTML = '';
}

// ===== Quiz Mode (Multiple Choice + Timer + Interleaving) =====
// Based on research: low-stakes quizzing, interleaving, desirable difficulty (timed)
let quizCards = [];
let quizIndex = 0;
let quizScore = { correct: 0, wrong: 0 };
let quizTimer = null;
let quizTimeLeft = 0;
let quizTimerMax = 15;
let quizAnswered = false;
let quizQuestionCount = 10;
let quizStreak = 0;
let quizBestStreak = 0;
let quizQuestionType = ''; // 'meaning' | 'word'
let quizCurrentChoices = [];
let quizCorrectIndex = -1;
let quizIncludeMastered = false;

function showQuizSetup() {
    const allFiltered = getFilteredCards();
    const nonMastered = allFiltered.filter(c => c.status !== 'mastered');
    const masteredCount = allFiltered.length - nonMastered.length;
    const availableCards = quizIncludeMastered ? allFiltered : nonMastered;
    const totalCards = availableCards.length;
    const setupEl = document.getElementById('quizSetup');
    const contentEl = document.getElementById('quizContent');
    const resultEl = document.getElementById('quizResult');

    contentEl.style.display = 'none';
    resultEl.style.display = 'none';
    setupEl.style.display = '';

    if (totalCards < 4) {
        setupEl.innerHTML = `
            <div class="empty-state">
                <div class="emoji">🧩</div>
                <p>You need at least <strong>4 cards</strong> to start a quiz.</p>
                ${!quizIncludeMastered && masteredCount > 0 ? `
                <div style="margin-top:16px;padding:14px 20px;background:#f0f4ff;border-radius:12px;border:1px solid #d0ddfb;">
                    <p style="color:#555;font-size:14px;margin-bottom:10px;">You have <strong style="color:#1a73e8;">${masteredCount}</strong> mastered card${masteredCount > 1 ? 's' : ''} currently excluded.</p>
                    <button class="btn-new-post" onclick="toggleQuizMastered()" style="padding:8px 20px;font-size:13px;">✅ Include Mastered Cards</button>
                </div>
                ` : '<p style="color:#888;font-size:13px;">Add more cards and come back!</p>'}
            </div>
        `;
        return;
    }

    const maxQ = Math.min(totalCards, 30);
    const defaultQ = Math.min(totalCards, 10);

    setupEl.innerHTML = `
        <div class="quiz-setup-card">
            <div class="quiz-setup-icon">🧩</div>
            <h3 class="quiz-setup-title">Multiple Choice Quiz</h3>
            <p class="quiz-setup-desc">
                Test your knowledge with timed multiple-choice questions!<br>
                <span class="quiz-setup-tip">⏱️ Timed questions · 🔀 Interleaved categories · 📊 Score tracking</span>
            </p>
            <div class="quiz-setup-options">
                <div class="quiz-option-row">
                    <label class="quiz-option-label">📝 Questions</label>
                    <div class="quiz-option-control">
                        <input type="range" id="quizCountSlider" min="4" max="${maxQ}" value="${defaultQ}" oninput="document.getElementById('quizCountDisplay').textContent=this.value">
                        <span class="quiz-count-display" id="quizCountDisplay">${defaultQ}</span>
                    </div>
                </div>
                <div class="quiz-option-row">
                    <label class="quiz-option-label">⏱️ Timer</label>
                    <div class="quiz-option-control quiz-timer-options">
                        <button class="quiz-timer-btn" onclick="selectQuizTimer(10, this)">10s</button>
                        <button class="quiz-timer-btn active" onclick="selectQuizTimer(15, this)">15s</button>
                        <button class="quiz-timer-btn" onclick="selectQuizTimer(20, this)">20s</button>
                        <button class="quiz-timer-btn" onclick="selectQuizTimer(0, this)">∞</button>
                    </div>
                </div>
                <div class="quiz-option-row">
                    <label class="quiz-option-label">✅ Mastered Cards</label>
                    <div class="quiz-option-control">
                        <label class="quiz-toggle">
                            <input type="checkbox" id="quizMasteredToggle" ${quizIncludeMastered ? 'checked' : ''} onchange="toggleQuizMastered()">
                            <span class="quiz-toggle-slider"></span>
                        </label>
                        <span class="quiz-mastered-label" style="font-size:13px;color:#888;margin-left:8px;">${quizIncludeMastered ? 'Included' : 'Excluded'}${masteredCount > 0 ? ` (${masteredCount})` : ''}</span>
                    </div>
                </div>
            </div>
            <button class="btn-new-post quiz-start-btn" onclick="startQuiz()" style="padding:14px 36px;font-size:16px;">🚀 Start Quiz</button>
            <div class="quiz-available-info">${totalCards} cards available</div>
        </div>
    `;
}

function toggleQuizMastered() {
    quizIncludeMastered = !quizIncludeMastered;
    showQuizSetup();
}

function selectQuizTimer(seconds, btn) {
    quizTimerMax = seconds;
    document.querySelectorAll('.quiz-timer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function startQuiz() {
    const count = parseInt(document.getElementById('quizCountSlider').value) || 10;
    quizQuestionCount = count;

    // Interleaving: shuffle cards from different categories
    let cards = getFilteredCards();
    if (!quizIncludeMastered) {
        cards = cards.filter(c => c.status !== 'mastered');
    }
    cards = cards.sort(() => Math.random() - 0.5).slice(0, quizQuestionCount);

    quizCards = cards;
    quizIndex = 0;
    quizScore = { correct: 0, wrong: 0 };
    quizStreak = 0;
    quizBestStreak = 0;

    document.getElementById('quizSetup').style.display = 'none';
    document.getElementById('quizContent').style.display = '';
    document.getElementById('quizResult').style.display = 'none';

    showQuizQuestion();
}

function generateQuizChoices(correctCard) {
    // Randomly decide question type: meaning→word or word→meaning
    const type = Math.random() < 0.5 ? 'meaning' : 'word';
    quizQuestionType = type;

    let question, correctAnswer;
    let distractors = [];

    if (type === 'meaning') {
        // Show meaning → pick the correct English word
        question = correctCard.back;
        correctAnswer = correctCard.front;
        // Get distractors from other cards' fronts
        const otherCards = allCards.filter(c => c.id !== correctCard.id && c.front !== correctCard.front);
        const shuffled = otherCards.sort(() => Math.random() - 0.5);
        distractors = shuffled.slice(0, 3).map(c => c.front);
    } else {
        // Show English word → pick the correct meaning
        question = correctCard.front;
        correctAnswer = correctCard.back;
        // Get distractors from other cards' backs
        const otherCards = allCards.filter(c => c.id !== correctCard.id && c.back !== correctCard.back);
        const shuffled = otherCards.sort(() => Math.random() - 0.5);
        distractors = shuffled.slice(0, 3).map(c => c.back);
    }

    // If not enough distractors, fill with dummy
    while (distractors.length < 3) {
        distractors.push('—');
    }

    // Combine and shuffle choices
    const choices = [correctAnswer, ...distractors].sort(() => Math.random() - 0.5);
    const correctIndex = choices.indexOf(correctAnswer);

    return { question, correctAnswer, choices, type, correctIndex };
}

function showQuizQuestion() {
    if (quizIndex >= quizCards.length) {
        showQuizResult();
        return;
    }

    quizAnswered = false;
    const card = quizCards[quizIndex];
    const { question, correctAnswer, choices, type, correctIndex } = generateQuizChoices(card);
    const catIcons = { 'Vocabulary': '📗', 'Phrase': '📙', 'Sentence': '📘', 'Grammar': '📕' };

    // Store choices and correct index
    quizCurrentChoices = choices;
    quizCorrectIndex = correctIndex;

    // Header
    document.getElementById('quizHeaderBar').innerHTML = `
        <span class="quiz-q-number">Q${quizIndex + 1}</span>
        <span class="quiz-category-tag">${catIcons[card.category] || '📗'} ${card.category}</span>
        ${quizStreak >= 2 ? `<span class="quiz-streak-badge">🔥 ${quizStreak} streak!</span>` : ''}
    `;

    // Progress
    document.getElementById('quizProgress').innerHTML = `
        <span>${quizIndex + 1} / ${quizCards.length}</span>
        <div class="progress-bar">
            <div class="progress-fill" style="width:${(quizIndex / quizCards.length) * 100}%"></div>
        </div>
    `;

    // Timer bar
    if (quizTimerMax > 0) {
        quizTimeLeft = quizTimerMax;
        document.getElementById('quizTimerBar').innerHTML = `
            <div class="quiz-timer-track">
                <div class="quiz-timer-fill" id="quizTimerFill" style="width:100%"></div>
            </div>
            <span class="quiz-timer-text" id="quizTimerText">${quizTimeLeft}s</span>
        `;
        document.getElementById('quizTimerBar').style.display = '';
        startQuizTimer();
    } else {
        document.getElementById('quizTimerBar').style.display = 'none';
        document.getElementById('quizTimerBar').innerHTML = '';
    }

    // Question
    const directionLabel = type === 'meaning'
        ? '📖 What word matches this meaning?'
        : '🤔 What is the meaning of this word?';

    document.getElementById('quizQuestionArea').innerHTML = `
        <div class="quiz-direction-label">${directionLabel}</div>
        <div class="quiz-question-text">${esc(question)}</div>
        ${card.example && type === 'word' ? `<div class="quiz-hint">💡 "${esc(card.example)}"</div>` : ''}
    `;

    // Choices
    document.getElementById('quizChoicesArea').innerHTML = choices.map((choice, i) => `
        <button class="quiz-choice-btn" onclick="selectQuizChoice(${i})" data-index="${i}">
            <span class="quiz-choice-letter">${['A', 'B', 'C', 'D'][i]}</span>
            <span class="quiz-choice-text">${esc(choice)}</span>
        </button>
    `).join('');

    // Feedback area clear
    document.getElementById('quizFeedbackArea').innerHTML = '';

    // Info
    document.getElementById('quizInfo').innerHTML = `
        ✅ ${quizScore.correct} &nbsp; ❌ ${quizScore.wrong}
    `;
}

function startQuizTimer() {
    clearInterval(quizTimer);
    const fillEl = document.getElementById('quizTimerFill');
    const textEl = document.getElementById('quizTimerText');
    if (!fillEl || !textEl) return;

    quizTimer = setInterval(() => {
        quizTimeLeft -= 0.1;
        if (quizTimeLeft <= 0) {
            quizTimeLeft = 0;
            clearInterval(quizTimer);
            if (!quizAnswered) {
                quizTimedOut();
            }
        }
        const pct = (quizTimeLeft / quizTimerMax) * 100;
        fillEl.style.width = pct + '%';
        if (quizTimeLeft <= 5) {
            fillEl.style.background = '#ef4444';
        } else if (quizTimeLeft <= 10) {
            fillEl.style.background = '#f59e0b';
        } else {
            fillEl.style.background = '#10b981';
        }
        textEl.textContent = Math.ceil(quizTimeLeft) + 's';
    }, 100);
}

function quizTimedOut() {
    quizAnswered = true;
    quizScore.wrong++;
    quizStreak = 0;

    // Highlight correct answer
    document.querySelectorAll('.quiz-choice-btn').forEach(btn => {
        btn.disabled = true;
        btn.classList.add('disabled');
        const idx = parseInt(btn.dataset.index);
        if (idx === quizCorrectIndex) {
            btn.classList.add('correct');
        }
    });

    // Update card stats
    const card = quizCards[quizIndex];
    db.collection('cards').doc(card.id).update({
        wrongCount: (card.wrongCount || 0) + 1,
        lastPracticed: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById('quizFeedbackArea').innerHTML = `
        <div class="quiz-feedback timeout">
            <span class="quiz-feedback-icon">⏰</span>
            <span class="quiz-feedback-text">Time's up!</span>
        </div>
    `;

    setTimeout(() => {
        quizIndex++;
        showQuizQuestion();
    }, 1500);
}

function selectQuizChoice(selectedIndex) {
    if (quizAnswered) return;
    quizAnswered = true;
    clearInterval(quizTimer);

    const isCorrect = selectedIndex === quizCorrectIndex;
    const card = quizCards[quizIndex];
    const btn = document.querySelectorAll('.quiz-choice-btn')[selectedIndex];

    if (isCorrect) {
        quizScore.correct++;
        quizStreak++;
        if (quizStreak > quizBestStreak) quizBestStreak = quizStreak;
        btn.classList.add('correct');

        document.getElementById('quizFeedbackArea').innerHTML = `
            <div class="quiz-feedback correct">
                <span class="quiz-feedback-icon">✅</span>
                <span class="quiz-feedback-text">Correct!</span>
                ${quizStreak >= 3 ? `<span class="quiz-feedback-streak">🔥 ${quizStreak} in a row!</span>` : ''}
            </div>
        `;

        // Update card stats
        db.collection('cards').doc(card.id).update({
            correctCount: (card.correctCount || 0) + 1,
            lastPracticed: firebase.firestore.FieldValue.serverTimestamp()
        });
    } else {
        quizScore.wrong++;
        quizStreak = 0;
        btn.classList.add('wrong');

        // Highlight correct answer
        document.querySelectorAll('.quiz-choice-btn').forEach((b, i) => {
            if (i === quizCorrectIndex) {
                b.classList.add('correct');
            }
        });

        document.getElementById('quizFeedbackArea').innerHTML = `
            <div class="quiz-feedback wrong">
                <span class="quiz-feedback-icon">❌</span>
                <span class="quiz-feedback-text">Incorrect</span>
            </div>
        `;

        // Update card stats
        db.collection('cards').doc(card.id).update({
            wrongCount: (card.wrongCount || 0) + 1,
            lastPracticed: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    // Disable all buttons
    document.querySelectorAll('.quiz-choice-btn').forEach(b => {
        b.disabled = true;
        b.classList.add('disabled');
    });

    // Update info
    document.getElementById('quizInfo').innerHTML = `
        ✅ ${quizScore.correct} &nbsp; ❌ ${quizScore.wrong}
    `;

    setTimeout(() => {
        quizIndex++;
        showQuizQuestion();
    }, isCorrect ? 1000 : 2000);
}

function showQuizResult() {
    clearInterval(quizTimer);

    const total = quizScore.correct + quizScore.wrong;
    const pct = total > 0 ? Math.round((quizScore.correct / total) * 100) : 0;

    let grade = '🎉 Perfect!';
    let gradeClass = 'perfect';
    if (pct < 100) { grade = '👏 Excellent!'; gradeClass = 'excellent'; }
    if (pct < 80) { grade = '👍 Good job!'; gradeClass = 'good'; }
    if (pct < 60) { grade = '💪 Keep trying!'; gradeClass = 'keep'; }
    if (pct < 40) { grade = '📚 Study more!'; gradeClass = 'study'; }

    saveStudySession(total, quizScore.correct);

    document.getElementById('quizContent').style.display = 'none';
    document.getElementById('quizResult').style.display = '';
    document.getElementById('quizResult').innerHTML = `
        <div class="quiz-result-card">
            <div class="quiz-result-header">
                <div class="quiz-result-icon">🧩</div>
                <div class="quiz-result-grade ${gradeClass}">${grade}</div>
            </div>
            <div class="quiz-result-score-ring">
                <svg viewBox="0 0 120 120" class="score-ring-svg">
                    <circle class="score-ring-bg" cx="60" cy="60" r="50" />
                    <circle class="score-ring-fill" cx="60" cy="60" r="50"
                        stroke-dasharray="${Math.PI * 100}"
                        stroke-dashoffset="${Math.PI * 100 * (1 - pct / 100)}" />
                </svg>
                <div class="score-ring-text">${pct}%</div>
            </div>
            <div class="quiz-result-stats">
                <div class="quiz-stat correct">
                    <span class="quiz-stat-num">${quizScore.correct}</span>
                    <span class="quiz-stat-label">✅ Correct</span>
                </div>
                <div class="quiz-stat wrong">
                    <span class="quiz-stat-num">${quizScore.wrong}</span>
                    <span class="quiz-stat-label">❌ Wrong</span>
                </div>
                <div class="quiz-stat streak">
                    <span class="quiz-stat-num">${quizBestStreak}</span>
                    <span class="quiz-stat-label">🔥 Best Streak</span>
                </div>
            </div>
            <div class="quiz-result-actions">
                <button class="btn-new-post" onclick="showQuizSetup()" style="padding:12px 28px;font-size:15px;">🔄 Try Again</button>
                <button class="btn-cancel" onclick="setMemorizeMode('cards', document.querySelectorAll('.mem-mode-btn')[0])" style="padding:12px 28px;border-radius:12px;">📋 Back to Cards</button>
            </div>
        </div>
    `;
}



