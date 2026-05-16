// ── State Management ──
let currentParent = {
    email: localStorage.getItem('cbc_email'),
    name: localStorage.getItem('cbc_name') || 'Parent'
};

// ── Authentication Check ──
if (!localStorage.getItem('cbc_token')) {
    window.location.href = '/login.html';
}

// ── Navigation ──
function showSection(sectionId) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`view-${sectionId}`).classList.add('active');
    event.currentTarget.classList.add('active');

    if (sectionId === 'records') loadRecords();
    if (sectionId === 'chat') startChatPolling();
    else stopChatPolling();
}

function logout() {
    localStorage.clear();
    window.location.href = '/login.html';
}

// ── Load Shared Records ──
async function loadRecords() {
    const container = document.getElementById('records-container');
    try {
        const res = await fetch('/api/parent/records', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('cbc_token')}` }
        });
        const records = await res.json();

        if (records.length === 0) {
            container.innerHTML = `
                <div class="card" style="grid-column: 1/-1; text-align: center; padding: 60px;">
                    <p style="color:var(--muted);">No shared records found yet. Records appear here when a teacher shares them with your email.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = records.map(record => `
            <div class="card" style="padding:0; overflow:hidden;">
                <div class="port-gallery">
                    <img src="${record.photos && record.photos[0] ? record.photos[0] : 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800'}" alt="Project Photo">
                </div>
                <div class="port-header">
                    <h3>${record.projectTitle}</h3>
                    <p style="font-size:12px; color:var(--accent2);">${record.studentName}</p>
                </div>
                <div class="port-body">
                    <p style="font-size:13px; color:var(--muted); line-height:1.4;">${record.description ? record.description.substring(0, 100) + '...' : 'No description provided.'}</p>
                    <button class="btn-generate" style="padding:10px; font-size:12px; margin-top:15px;" onclick='viewRecordDetails(${JSON.stringify(record).replace(/'/g, "&apos;")})'>View Full Record</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Failed to load records:", err);
    }
}

function viewRecordDetails(record) {
    const modal = document.getElementById('recordModal');
    const content = document.getElementById('modal-content');
    
    // Check if description contains HTML (usually from generated documents)
    const isHtmlContent = record.description && record.description.includes('<table');

    content.innerHTML = `
        <h2 style="font-family:'Syne', sans-serif; margin-bottom:10px;">${record.projectTitle}</h2>
        <p style="color:var(--accent2); font-weight:700; margin-bottom:20px;">Student: ${record.studentName}</p>
        
        ${!isHtmlContent && record.photos && record.photos.length > 0 ? `
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:15px; margin-bottom:25px;">
                ${(record.photos || []).map(p => `<img src="${p}" style="width:100%; border-radius:12px; border:1px solid var(--border);">`).join('')}
            </div>
        ` : ''}
        
        <div style="background:rgba(255,255,255,0.03); padding:20px; border-radius:12px; line-height:1.6; overflow-x:auto;">
            <h4 style="margin-bottom:10px; color:var(--accent);">Record Details</h4>
            <div id="record-body-content" style="${isHtmlContent ? 'background:white; color:#1a1a1a; padding:20px; border-radius:8px;' : ''}">
                ${record.description || 'No details provided.'}
            </div>
        </div>
        
        <div style="margin-top:25px; text-align:right;">
            <p style="font-size:12px; color:var(--muted);">Shared by: ${record.userEmail}</p>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('recordModal').style.display = 'none';
}

// ── Parent Hub (Chat) ──
let chatInterval;
function startChatPolling() {
    loadMessages();
    chatInterval = setInterval(loadMessages, 3000);
}

function stopChatPolling() {
    clearInterval(chatInterval);
}

async function loadMessages() {
    try {
        const res = await fetch('/api/chat/parent-community', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('cbc_token')}` }
        });
        const messages = await res.json();
        const chatBox = document.getElementById('chat-messages');
        
        chatBox.innerHTML = messages.map(msg => `
            <div class="chat-msg ${msg.sender === currentParent.email ? 'sent' : 'received'}">
                <div class="chat-sender">${msg.sender === currentParent.email ? 'You' : msg.sender.split('@')[0]}</div>
                <div>${msg.text}</div>
                <span class="chat-time">${msg.time}</span>
            </div>
        `).join('');
        
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (err) { console.error("Chat error:", err); }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    try {
        await fetch('/api/chat', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('cbc_token')}`
            },
            body: JSON.stringify({ text, channel: 'parent-community' })
        });
        input.value = '';
        loadMessages();
    } catch (err) { console.error("Send error:", err); }
}

// ── Initialization ──
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('parent-name').textContent = currentParent.name;
    document.getElementById('parent-email').textContent = currentParent.email;
    loadRecords();
});
