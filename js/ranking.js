// ===== Ranking & Competition =====

let rankPeriod = 'all';
let rankType = 'feed'; // 'feed' | 'memorize'
let allStudySessions = [];

function setRankType(type, btn) {
    rankType = type;
    document.querySelectorAll('.rank-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderRanking();
}

function setRankPeriod(period, btn) {
    rankPeriod = period;
    document.querySelectorAll('.ranking-period-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderRanking();
}

// ===== Feed Ranking =====
function getStudiedCount(uid, period) {
    const now = new Date();
    return allPosts.filter(p => {
        const studied = (p.studiedBy || []).find(s => s.uid === uid);
        if (!studied) return false;
        if (period === 'all') return true;
        const studiedDate = new Date(studied.date);
        if (period === 'week') {
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return studiedDate >= weekAgo;
        }
        if (period === 'month') {
            return studiedDate.getMonth() === now.getMonth() && studiedDate.getFullYear() === now.getFullYear();
        }
        return true;
    }).length;
}

function getFeedRankingData(period) {
    return allMembers.map(u => ({
        uid: u.uid,
        name: u.name || '?',
        score: getStudiedCount(u.uid, period)
    })).sort((a, b) => b.score - a.score);
}

// ===== Memorize Ranking =====
function loadStudySessions() {
    return db.collection('studySessions').get().then(snap => {
        allStudySessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }).catch(err => {
        console.error('Load study sessions error:', err);
        allStudySessions = [];
    });
}

function getMemorizeStats(uid, period) {
    const now = new Date();
    let sessions = allStudySessions.filter(s => s.uid === uid);

    if (period === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekStr = weekAgo.toISOString().split('T')[0];
        sessions = sessions.filter(s => s.date >= weekStr);
    } else if (period === 'month') {
        const monthStr = now.toISOString().split('T')[0].substring(0, 7); // YYYY-MM
        sessions = sessions.filter(s => s.date && s.date.startsWith(monthStr));
    }

    let totalReviewed = 0;
    let totalCorrect = 0;
    let totalSessions = 0;

    sessions.forEach(s => {
        totalReviewed += s.totalReviewed || 0;
        totalCorrect += s.totalCorrect || 0;
        totalSessions += s.sessions || 0;
    });

    return { totalReviewed, totalCorrect, totalSessions };
}

function getMemorizeRankingData(period) {
    return allMembers.map(u => {
        const stats = getMemorizeStats(u.uid, period);
        return {
            uid: u.uid,
            name: u.name || '?',
            score: stats.totalReviewed,
            correct: stats.totalCorrect,
            sessions: stats.totalSessions
        };
    }).sort((a, b) => b.score - a.score);
}

// ===== Render =====
const RANK_COLORS = ['#1a73e8', '#0d47a1', '#1558b0', '#5c6bc0', '#7986cb', '#90a4ae'];

async function renderRanking() {
    if (rankType === 'memorize' && allStudySessions.length === 0) {
        await loadStudySessions();
    }

    const isFeed = rankType === 'feed';
    const data = isFeed ? getFeedRankingData(rankPeriod) : getMemorizeRankingData(rankPeriod);
    const maxScore = Math.max(1, ...data.map(d => d.score));

    // Podium (top 3)
    const podiumEl = document.getElementById('rankingPodium');
    if (data.length >= 3) {
        const order = [data[1], data[0], data[2]]; // 2nd, 1st, 3rd
        const medals = ['🥈', '🥇', '🥉'];
        const colors = ['#90a4ae', '#f9a825', '#e65100'];
        podiumEl.innerHTML = order.map((d, i) => {
            const subtitle = isFeed
                ? `${d.score} studied`
                : `${d.score} cards · ${d.correct || 0} ✅`;
            return `
            <div class="podium-item">
                <div class="podium-avatar" style="background:${colors[i]};">${d.name.charAt(0)}</div>
                <div class="podium-name">${esc(d.name)}</div>
                <div class="podium-score">${subtitle}</div>
                <div class="podium-bar">${medals[i]}</div>
            </div>`;
        }).join('');
    } else {
        podiumEl.innerHTML = '';
    }

    // Full list
    const listEl = document.getElementById('rankingList');
    listEl.innerHTML = data.map((d, i) => {
        const isMe = d.uid === currentUser.uid;
        const pct = maxScore > 0 ? Math.round((d.score / maxScore) * 100) : 0;
        const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
        const detail = isFeed
            ? `${d.score} posts studied`
            : `${d.score} cards · ✅ ${d.correct || 0} · 📅 ${d.sessions || 0} sessions`;
        return `
        <li class="ranking-item ${isMe ? 'my-rank' : ''}">
            <div class="rank-number ${rankClass}">${medal}</div>
            <div class="rank-info">
                <div class="rank-name">${esc(d.name)} ${isMe ? '(Me)' : ''}</div>
                <div class="rank-detail">${detail}</div>
            </div>
            <div class="rank-bar-container">
                <div class="rank-bar-fill" style="width:${pct}%;"></div>
            </div>
            <div class="rank-score">${d.score}</div>
        </li>`;
    }).join('');

    // Achievements
    renderAchievements();
}

// ===== Achievements =====
const FEED_ACHIEVEMENTS = [
    { id: 'first',   icon: '🌱', title: 'First Step',      desc: 'Study your first post',     check: s => s >= 1 },
    { id: 'five',    icon: '⭐', title: 'Getting Started',  desc: 'Study 5 posts',             check: s => s >= 5 },
    { id: 'ten',     icon: '🔥', title: 'On Fire',          desc: 'Study 10 posts',            check: s => s >= 10 },
    { id: 'twenty',  icon: '💪', title: 'Dedicated',        desc: 'Study 20 posts',            check: s => s >= 20 },
    { id: 'fifty',   icon: '🏅', title: 'Study Master',     desc: 'Study 50 posts',            check: s => s >= 50 },
    { id: 'hundred', icon: '👑', title: 'Legend',            desc: 'Study 100 posts',           check: s => s >= 100 },
    { id: 'top1',    icon: '🏆', title: '#1 Rank',          desc: 'Reach the #1 rank',         check: (s, r) => r === 1 },
    { id: 'top3',    icon: '🎖️', title: 'Top 3',            desc: 'Reach the top 3',           check: (s, r) => r <= 3 },
];

const MEMORIZE_ACHIEVEMENTS = [
    { id: 'm_first',    icon: '🧠', title: 'Brain Start',     desc: 'Review your first card',      check: s => s >= 1 },
    { id: 'm_ten',      icon: '📝', title: 'Card Warrior',    desc: 'Review 10 cards',             check: s => s >= 10 },
    { id: 'm_fifty',    icon: '🎯', title: 'Sharp Mind',      desc: 'Review 50 cards',             check: s => s >= 50 },
    { id: 'm_hundred',  icon: '💡', title: 'Bright Scholar',  desc: 'Review 100 cards',            check: s => s >= 100 },
    { id: 'm_fiveh',    icon: '🔥', title: 'Memory Master',   desc: 'Review 500 cards',            check: s => s >= 500 },
    { id: 'm_thousand', icon: '👑', title: 'Card Legend',      desc: 'Review 1000 cards',           check: s => s >= 1000 },
    { id: 'm_top1',     icon: '🏆', title: '#1 Memorizer',    desc: 'Reach #1 in memorize rank',   check: (s, r) => r === 1 },
    { id: 'm_top3',     icon: '🎖️', title: 'Top 3 Memorizer', desc: 'Reach top 3 in memorize rank',check: (s, r) => r <= 3 },
];

function renderAchievements() {
    const grid = document.getElementById('achievementGrid');
    const isFeed = rankType === 'feed';

    if (isFeed) {
        const myScore = getStudiedCount(currentUser.uid, 'all');
        const ranking = getFeedRankingData('all');
        const myRank = ranking.findIndex(d => d.uid === currentUser.uid) + 1;

        grid.innerHTML = FEED_ACHIEVEMENTS.map(a => {
            const unlocked = a.check(myScore, myRank);
            return `
            <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
                <div class="ach-icon">${a.icon}</div>
                <div class="ach-title">${a.title}</div>
                <div class="ach-desc">${a.desc}</div>
            </div>`;
        }).join('');
    } else {
        const myStats = getMemorizeStats(currentUser.uid, 'all');
        const ranking = getMemorizeRankingData('all');
        const myRank = ranking.findIndex(d => d.uid === currentUser.uid) + 1;

        grid.innerHTML = MEMORIZE_ACHIEVEMENTS.map(a => {
            const unlocked = a.check(myStats.totalReviewed, myRank);
            return `
            <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
                <div class="ach-icon">${a.icon}</div>
                <div class="ach-title">${a.title}</div>
                <div class="ach-desc">${a.desc}</div>
            </div>`;
        }).join('');
    }
}
