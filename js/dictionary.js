// ===== Dictionary Panel (Free Dictionary API) =====
const DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
let dictPanelOpen = false;
let dictHistory = [];
let currentAudio = null;

function toggleDictPanel() {
    dictPanelOpen = !dictPanelOpen;
    const panel = document.getElementById('dictPanel');
    const toggle = document.getElementById('dictToggleBtn');
    if (dictPanelOpen) {
        panel.classList.add('open');
        toggle.classList.add('active');
        document.body.classList.add('dict-open');
        document.getElementById('dictSearchInput').focus();
    } else {
        panel.classList.remove('open');
        toggle.classList.remove('active');
        document.body.classList.remove('dict-open');
    }
}

function closeDictPanel() {
    dictPanelOpen = false;
    document.getElementById('dictPanel').classList.remove('open');
    document.getElementById('dictToggleBtn').classList.remove('active');
    document.body.classList.remove('dict-open');
}

async function searchDictionary(word) {
    if (!word) word = document.getElementById('dictSearchInput').value.trim();
    if (!word) return;

    document.getElementById('dictSearchInput').value = word;
    const resultEl = document.getElementById('dictResult');
    resultEl.innerHTML = '<div class="dict-loading"><div class="spinner"></div>Searching...</div>';

    try {
        const res = await fetch(DICT_API + encodeURIComponent(word));
        if (!res.ok) {
            if (res.status === 404) {
                resultEl.innerHTML = `
                    <div class="dict-not-found">
                        <div class="dict-not-found-icon">🔍</div>
                        <h4>Word not found</h4>
                        <p>"${esc(word)}" was not found in the dictionary.</p>
                        <p class="dict-tip">Try checking the spelling or search for a different word.</p>
                    </div>
                `;
            } else {
                resultEl.innerHTML = '<div class="dict-error">⚠️ Error fetching data. Please try again.</div>';
            }
            return;
        }

        const data = await res.json();
        if (!data || data.length === 0) {
            resultEl.innerHTML = '<div class="dict-not-found"><div class="dict-not-found-icon">🔍</div><h4>No results found</h4></div>';
            return;
        }

        // Add to history
        if (!dictHistory.includes(word.toLowerCase())) {
            dictHistory.unshift(word.toLowerCase());
            if (dictHistory.length > 20) dictHistory.pop();
            renderDictHistory();
        }

        renderDictResult(data);
    } catch (err) {
        console.error('Dictionary error:', err);
        resultEl.innerHTML = '<div class="dict-error">⚠️ Network error. Please check your connection.</div>';
    }
}

function renderDictResult(data) {
    const entry = data[0];
    const word = entry.word || '';
    const phonetic = entry.phonetic || '';

    // Gather all phonetics with audio
    const phonetics = (entry.phonetics || []).filter(p => p.text || p.audio);

    // Build phonetics section
    let phoneticHtml = '';
    if (phonetics.length > 0) {
        phoneticHtml = phonetics.map(p => {
            const audioBtn = p.audio ? `<button class="dict-audio-btn" onclick="playDictAudio('${p.audio}')" title="Listen">🔊</button>` : '';
            return `<span class="dict-phonetic-item">${esc(p.text || '')} ${audioBtn}</span>`;
        }).join(' ');
    } else if (phonetic) {
        phoneticHtml = `<span class="dict-phonetic-item">${esc(phonetic)}</span>`;
    }

    // Build meanings
    const meanings = entry.meanings || [];
    const meaningsHtml = meanings.map(m => {
        const pos = m.partOfSpeech || '';
        const defs = (m.definitions || []).slice(0, 5); // max 5 defs per part of speech
        const syns = m.synonyms || [];
        const ants = m.antonyms || [];

        const defsHtml = defs.map((d, i) => {
            let html = `<div class="dict-def-item">`;
            html += `<span class="dict-def-num">${i + 1}.</span>`;
            html += `<div class="dict-def-content">`;
            html += `<div class="dict-def-text">${esc(d.definition)}</div>`;
            if (d.example) {
                html += `<div class="dict-def-example">"${esc(d.example)}"</div>`;
            }
            if (d.synonyms && d.synonyms.length > 0) {
                html += `<div class="dict-def-syns">
                    <span class="dict-syn-label">Syn:</span>
                    ${d.synonyms.slice(0, 5).map(s => `<a class="dict-word-link" onclick="searchDictionary('${esc(s)}')">${esc(s)}</a>`).join(', ')}
                </div>`;
            }
            html += `</div></div>`;
            return html;
        }).join('');

        let extraHtml = '';
        if (syns.length > 0) {
            extraHtml += `<div class="dict-synonyms"><span class="dict-syn-label">Synonyms:</span> ${syns.slice(0, 8).map(s => `<a class="dict-word-link" onclick="searchDictionary('${esc(s)}')">${esc(s)}</a>`).join(', ')}</div>`;
        }
        if (ants.length > 0) {
            extraHtml += `<div class="dict-antonyms"><span class="dict-ant-label">Antonyms:</span> ${ants.slice(0, 8).map(a => `<a class="dict-word-link" onclick="searchDictionary('${esc(a)}')">${esc(a)}</a>`).join(', ')}</div>`;
        }

        return `
            <div class="dict-meaning-block">
                <div class="dict-pos">${esc(pos)}</div>
                <div class="dict-defs">${defsHtml}</div>
                ${extraHtml}
            </div>
        `;
    }).join('');

    // Source URLs
    const sources = entry.sourceUrls || [];
    const sourceHtml = sources.length > 0
        ? `<div class="dict-source">📎 <a href="${sources[0]}" target="_blank" rel="noopener">${sources[0]}</a></div>`
        : '';

    document.getElementById('dictResult').innerHTML = `
        <div class="dict-entry">
            <div class="dict-word-header">
                <h3 class="dict-word">${esc(word)}</h3>
                <div class="dict-phonetics">${phoneticHtml}</div>
            </div>
            ${entry.origin ? `<div class="dict-origin"><span class="dict-origin-label">Origin:</span> ${esc(entry.origin)}</div>` : ''}
            <div class="dict-meanings">${meaningsHtml}</div>
            ${sourceHtml}
        </div>
    `;
}

function playDictAudio(url) {
    if (!url) return;
    // Ensure https
    if (url.startsWith('//')) url = 'https:' + url;
    if (url.startsWith('http://')) url = url.replace('http://', 'https://');
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    currentAudio = new Audio(url);
    currentAudio.play().catch(err => console.error('Audio play error:', err));
}

function renderDictHistory() {
    const histEl = document.getElementById('dictHistory');
    if (!histEl) return;
    if (dictHistory.length === 0) {
        histEl.innerHTML = '';
        return;
    }
    histEl.innerHTML = `
        <div class="dict-history-title">🕐 Recent Searches</div>
        <div class="dict-history-list">
            ${dictHistory.map(w => `<button class="dict-history-item" onclick="searchDictionary('${esc(w)}')">${esc(w)}</button>`).join('')}
        </div>
    `;
}

function handleDictKeydown(e) {
    if (e.key === 'Enter') {
        searchDictionary();
    }
}
