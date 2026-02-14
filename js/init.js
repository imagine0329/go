// ===== Cross-module Integration =====
// This file wires together modules that need to call each other.

// Re-render ranking when posts or members change
const _origRenderFeed = renderFeed;
renderFeed = function() {
    _origRenderFeed();
    if (document.getElementById('rankingPage').classList.contains('active')) {
        renderRanking();
    }
};

const _origRenderMembers = renderMembers;
renderMembers = function() {
    _origRenderMembers();
    if (document.getElementById('rankingPage').classList.contains('active')) {
        renderRanking();
    }
};
