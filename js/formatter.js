// ===== Markdown-like Content Formatter =====

function formatContent(raw) {
    if (!raw) return '';
    const lines = raw.split('\n');
    let html = '';
    let inList = false;
    let inQuote = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Divider ---
        if (/^-{3,}$/.test(line.trim())) {
            if (inList) { html += '</ul>'; inList = false; }
            if (inQuote) { html += '</blockquote>'; inQuote = false; }
            html += '<hr class="divider">';
            continue;
        }

        // Heading ### or ####
        const h3Match = line.match(/^###\s+(.+)/);
        if (h3Match) {
            if (inList) { html += '</ul>'; inList = false; }
            if (inQuote) { html += '</blockquote>'; inQuote = false; }
            html += '<h3>' + inlineFormat(h3Match[1]) + '</h3>';
            continue;
        }
        const h4Match = line.match(/^####\s+(.+)/);
        if (h4Match) {
            if (inList) { html += '</ul>'; inList = false; }
            if (inQuote) { html += '</blockquote>'; inQuote = false; }
            html += '<h4>' + inlineFormat(h4Match[1]) + '</h4>';
            continue;
        }

        // Blockquote >
        const quoteMatch = line.match(/^>\s?(.*)/);
        if (quoteMatch) {
            if (inList) { html += '</ul>'; inList = false; }
            if (!inQuote) { html += '<blockquote>'; inQuote = true; }
            html += inlineFormat(quoteMatch[1]) + '<br>';
            continue;
        } else if (inQuote) {
            html += '</blockquote>';
            inQuote = false;
        }

        // List item - or *  (but not ** bold)
        const liMatch = line.match(/^[-*]\s+(.+)/);
        if (liMatch && !line.match(/^\*\*[^*]/)) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += '<li>' + inlineFormat(liMatch[1]) + '</li>';
            continue;
        } else if (inList && line.trim() === '') {
            html += '</ul>';
            inList = false;
        }

        // Empty line
        if (line.trim() === '') {
            if (inList) { html += '</ul>'; inList = false; }
            html += '<br>';
            continue;
        }

        // Normal paragraph
        html += '<p>' + inlineFormat(line) + '</p>';
    }

    if (inList) html += '</ul>';
    if (inQuote) html += '</blockquote>';
    return html;
}

function inlineFormat(text) {
    // Extract URLs before escaping
    const urlPlaceholders = [];
    text = text.replace(/(https?:\/\/[^\s]+)/g, function(url) {
        const idx = urlPlaceholders.length;
        urlPlaceholders.push(url);
        return `%%URL_${idx}%%`;
    });
    // Escape HTML
    text = esc(text);
    // Bold **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*  (but not inside bold)
    text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    // Inline code `text`
    text = text.replace(/`(.+?)`/g, '<code style="background:#f0f0f0;padding:1px 5px;border-radius:4px;font-size:13px;color:#c62828;">$1</code>');
    // Restore URLs — embed videos or render as links
    text = text.replace(/%%URL_(\d+)%%/g, function(_, idx) {
        const url = urlPlaceholders[parseInt(idx)];
        const info = parseVideoInfo(url);
        if (info && info.type === 'youtube') {
            return `</p><div class="embed-video-thumb" onclick="window.open('${info.watch}','_blank')" style="position:relative;cursor:pointer;border-radius:12px;overflow:hidden;margin:12px 0;max-width:320px;">
                <img src="https://img.youtube.com/vi/${info.id}/mqdefault.jpg" style="width:100%;display:block;border-radius:12px;" alt="YouTube Video">
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:50px;height:36px;background:rgba(255,0,0,0.85);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="8,5 20,12 8,19"/></svg>
                </div>
                <div style="position:absolute;bottom:0;left:0;right:0;padding:5px 10px;background:linear-gradient(transparent,rgba(0,0,0,0.7));color:#fff;font-size:0.75em;">▶ Watch on YouTube</div>
            </div><p>`;
        }
        if (info && info.type === 'vimeo') {
            return `</p><div style="margin:12px 0;"><a href="${info.watch}" target="_blank" rel="noopener" style="display:block;padding:16px;background:#1ab7ea;color:#fff;border-radius:12px;text-align:center;text-decoration:none;font-weight:600;font-size:1.1em;">▶ Watch on Vimeo</a></div><p>`;
        }
        return `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:#1a73e8;text-decoration:underline;">${esc(url)}</a>`;
    });
    return text;
}

// ===== Video Embed Helpers =====
function parseVideoInfo(url) {
    if (!url) return null;
    url = url.trim();
    // YouTube: multiple URL formats
    let m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (m) return { type: 'youtube', id: m[1], watch: `https://www.youtube.com/watch?v=${m[1]}` };
    // Vimeo
    m = url.match(/vimeo\.com\/(\d+)/);
    if (m) return { type: 'vimeo', id: m[1], watch: `https://vimeo.com/${m[1]}` };
    return null;
}

function buildVideoEmbed(url) {
    if (!url || url === 'undefined') return '';
    const info = parseVideoInfo(url);
    if (info && info.type === 'youtube') {
        return `<div class="embed-video-thumb" onclick="window.open('${info.watch}','_blank')" style="position:relative;cursor:pointer;border-radius:12px;overflow:hidden;margin:12px 0;max-width:320px;">
            <img src="https://img.youtube.com/vi/${info.id}/mqdefault.jpg" style="width:100%;display:block;border-radius:12px;" alt="YouTube Video">
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:50px;height:36px;background:rgba(255,0,0,0.85);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="8,5 20,12 8,19"/></svg>
            </div>
            <div style="position:absolute;bottom:0;left:0;right:0;padding:5px 10px;background:linear-gradient(transparent,rgba(0,0,0,0.7));color:#fff;font-size:0.75em;">▶ Watch on YouTube</div>
        </div>`;
    }
    if (info && info.type === 'vimeo') {
        return `<div style="margin:12px 0;"><a href="${info.watch}" target="_blank" rel="noopener" style="display:block;padding:16px;background:#1ab7ea;color:#fff;border-radius:12px;text-align:center;text-decoration:none;font-weight:600;font-size:1.1em;">▶ Watch on Vimeo</a></div>`;
    }
    // Fallback: direct video file link (.mp4, .webm, .ogg)
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
        return `<div style="margin:12px 0;"><video controls style="width:100%;border-radius:10px;" src="${esc(url)}"></video></div>`;
    }
    // Unknown video URL — show as link
    return `<div style="margin:8px 0;"><a href="${esc(url)}" target="_blank" rel="noopener" style="color:#1a73e8; text-decoration:underline;">🎬 ${esc(url)}</a></div>`;
}
