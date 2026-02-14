// ===== Ranking & Competition =====

let rankPeriod = 'all';

function setRankPeriod(period, btn) {
    rankPeriod = period;
    document.querySelectorAll('.ranking-period-tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderRanking();
}

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

function getRankingData(period) {
    return allMembers.map(u => ({
        uid: u.uid,
        name: u.name || '?',
        score: getStudiedCount(u.uid, period)
    })).sort((a, b) => b.score - a.score);
}

const RANK_COLORS = ['#1a73e8', '#0d47a1', '#1558b0', '#5c6bc0', '#7986cb', '#90a4ae'];

function renderRanking() {
    const data = getRankingData(rankPeriod);
    const maxScore = Math.max(1, ...data.map(d => d.score));

    // Podium (top 3)
    const podiumEl = document.getElementById('rankingPodium');
    if (data.length >= 3) {
        const order = [data[1], data[0], data[2]]; // 2nd, 1st, 3rd
        const medals = ['🥈', '🥇', '🥉'];
        const colors = ['#90a4ae', '#f9a825', '#e65100'];
        podiumEl.innerHTML = order.map((d, i) => `
            <div class="podium-item">
                <div class="podium-avatar" style="background:${colors[i]};">${d.name.charAt(0)}</div>
                <div class="podium-name">${esc(d.name)}</div>
                <div class="podium-score">${d.score} studied</div>
                <div class="podium-bar">${medals[i]}</div>
            </div>
        `).join('');
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
        return `
        <li class="ranking-item ${isMe ? 'my-rank' : ''}">
            <div class="rank-number ${rankClass}">${medal}</div>
            <div class="rank-info">
                <div class="rank-name">${esc(d.name)} ${isMe ? '(Me)' : ''}</div>
                <div class="rank-detail">${d.score} posts studied</div>
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

// Achievements
const ACHIEVEMENTS = [
    { id: 'first',   icon: '🌱', title: 'First Step',      desc: 'Study your first post',     check: s => s >= 1 },
    { id: 'five',    icon: '⭐', title: 'Getting Started',  desc: 'Study 5 posts',             check: s => s >= 5 },
    { id: 'ten',     icon: '🔥', title: 'On Fire',          desc: 'Study 10 posts',            check: s => s >= 10 },
    { id: 'twenty',  icon: '💪', title: 'Dedicated',        desc: 'Study 20 posts',            check: s => s >= 20 },
    { id: 'fifty',   icon: '🏅', title: 'Study Master',     desc: 'Study 50 posts',            check: s => s >= 50 },
    { id: 'hundred', icon: '👑', title: 'Legend',            desc: 'Study 100 posts',           check: s => s >= 100 },
    { id: 'top1',    icon: '🏆', title: '#1 Rank',          desc: 'Reach the #1 rank',         check: (s, r) => r === 1 },
    { id: 'top3',    icon: '🎖️', title: 'Top 3',            desc: 'Reach the top 3',           check: (s, r) => r <= 3 },
];

function renderAchievements() {
    const myScore = getStudiedCount(currentUser.uid, 'all');
    const ranking = getRankingData('all');
    const myRank = ranking.findIndex(d => d.uid === currentUser.uid) + 1;
    const grid = document.getElementById('achievementGrid');

    grid.innerHTML = ACHIEVEMENTS.map(a => {
        const unlocked = a.check(myScore, myRank);
        return `
        <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
            <div class="ach-icon">${a.icon}</div>
            <div class="ach-title">${a.title}</div>
            <div class="ach-desc">${a.desc}</div>
        </div>`;
    }).join('');
}
