// ===== Utility Functions =====

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ===== Shared Edit Modal =====
let _editModalSaveHandler = null;

function showEditModal({ title, fields, onSave }) {
    // Remove existing modal if any
    closeEditModal();

    const fieldsHtml = fields.map(f => {
        if (f.type === 'select') {
            const opts = f.options.map(o =>
                `<option value="${esc(o.value)}" ${o.value === f.value ? 'selected' : ''}>${esc(o.label)}</option>`
            ).join('');
            return `<select id="${f.id}">${opts}</select>`;
        }
        if (f.type === 'textarea') {
            return `<textarea id="${f.id}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
        }
        return `<input type="text" id="${f.id}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}">`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.className = 'edit-modal-overlay';
    overlay.id = 'editModalOverlay';
    overlay.innerHTML = `
        <div class="edit-modal">
            <div class="edit-modal-header">
                <h3>${esc(title)}</h3>
                <button class="edit-modal-close" onclick="closeEditModal()">✕</button>
            </div>
            <div class="edit-modal-body">
                ${fieldsHtml}
            </div>
            <div class="edit-modal-footer">
                <button class="btn-cancel" onclick="closeEditModal()">Cancel</button>
                <button class="btn-new-post" id="editModalSaveBtn">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Attach save handler
    _editModalSaveHandler = onSave;
    document.getElementById('editModalSaveBtn').addEventListener('click', onSave);

    // Show with animation
    requestAnimationFrame(() => overlay.classList.add('show'));

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeEditModal();
    });
}

function closeEditModal() {
    const overlay = document.getElementById('editModalOverlay');
    if (overlay) {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 200);
    }
    _editModalSaveHandler = null;
}
