/**
 * PEDAGOGY ENGINE v2.0 - PRODUCTION EDITION
 * KICD CBC Compliant.
 */

console.log("Pedagogy Engine: Initializing...");

const token = localStorage.getItem('cbc_token');
const userEmail = localStorage.getItem('cbc_email');

// ── Auth Guard ──
const publicPages = ['login.html', 'home.html', '/'];
const isPublicPage = publicPages.some(page => window.location.pathname.endsWith(page) || window.location.pathname === page);

if (!token && !isPublicPage) {
    console.warn("Unauthorized access. Redirecting to login...");
    window.location.href = '/login.html';
}

function logout() {
    localStorage.removeItem('cbc_token');
    localStorage.removeItem('cbc_email');
    localStorage.removeItem('cbc_name');
    window.location.href = '/login.html';
}

// ── GLOBAL DASHBOARD INITIALIZATION ──
window.addEventListener('DOMContentLoaded', () => {
    console.log("Pedagogy Engine: Dashboard DOM Ready.");

    try {
        setupNavigation();
        populateProfileFields();
        loadPortfolio();
        updateTerms('sow');
        updateStorageUsage();
        console.log("Pedagogy Engine: All systems green.");
    } catch (e) {
        console.error("Initialization Error:", e);
    }
});


async function populateProfileFields() {
    try {
        const res = await fetch('/api/profile', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.status === 401 || res.status === 403) return logout();
        const profile = await res.json();

        const pTeacher = document.getElementById('profile-teacher');
        const pSchool = document.getElementById('profile-school');
        const uEmail = document.getElementById('userEmailDisplay');

        if (pTeacher) pTeacher.value = profile.name || '';
        if (pSchool) pSchool.value = profile.school || '';
        if (uEmail) uEmail.textContent = userEmail || 'facilitator@pedagogy.com';

        // Also update the welcome header - Use only first name
        const header = document.getElementById('welcomeHeader');
        if (header) {
            const firstName = profile.name ? profile.name.split(' ')[0] : 'Facilitator';
            header.textContent = `Welcome back, ${firstName}`;
        }

        // Populate subjects
        const pSubjects = document.getElementById('profile-subjects');
        if (pSubjects) pSubjects.value = profile.subjects || '';
    } catch (e) { console.error("Profile load error:", e); }
}

function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.classList.contains('logout-btn')) return;
        btn.onclick = () => {
            try {
                const target = btn.getAttribute('data-target');
                if (!target) return;

                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

                btn.classList.add('active');
                const targetEl = document.getElementById(target);
                if (targetEl) {
                    targetEl.classList.add('active');
                    clearFormInputs(targetEl);
                }

                // Tab-specific actions
                if (target === 'view-chat') loadChat();
                if (target === 'view-planner') renderPlanner();

                // Reset UI
                const preview = document.getElementById('preview-area');
                const dlBar = document.getElementById('download-bar');
                if (preview) preview.style.display = 'none';
                if (dlBar) dlBar.style.display = 'none';
            } catch (err) {
                console.error("Navigation error:", err);
            }
        };
    });
}

function logout() {
    console.log("Logging out...");
    localStorage.clear();
    window.location.href = '/';
}

// ── KICD Dynamic Terms ──
function updateTerms(context) {
    try {
        const gradeId = context === 'sow' ? 'gradeSelect-sow' : 'gradeSelect-row';
        const termId = context === 'sow' ? 'termSelect-sow' : 'termSelect-row';
        const labelId = context === 'sow' ? 'termLabel-sow' : 'termLabel-row';

        const gradeEl = document.getElementById(gradeId);
        const termSel = document.getElementById(termId);
        const label = document.getElementById(labelId);

        if (!gradeEl || !termSel || !label) return;

        const grade = gradeEl.value;
        label.textContent = 'Term';
        let options = [{ value: '1', text: 'Term 1' }, { value: '2', text: 'Term 2' }];
        if (!['PP1', 'PP2'].includes(grade)) options.push({ value: '3', text: 'Term 3' });

        const currentVal = termSel.value;
        termSel.innerHTML = options.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
        if ([...termSel.options].some(o => o.value === currentVal)) termSel.value = currentVal;
    } catch (e) { console.error("Term Update Error:", e); }
}

// ── SOW / LP Modes ──
let outputMode = 'template';
function setOutputMode(mode) {
    outputMode = mode;
    document.getElementById('btn-template-sow').classList.toggle('active', mode === 'template');
    document.getElementById('btn-ai-sow').classList.toggle('active', mode === 'ai');
    document.getElementById('sow-extra-card').style.display = mode === 'ai' ? 'block' : 'none';
    document.getElementById('sow-template-card').style.display = mode === 'template' ? 'block' : 'none';
}

// ── Fetch Strands for Range Selection ──
async function fetchStrands() {
    const bubble = document.getElementById('bubble-sow-strand');
    const grade = document.getElementById('gradeSelect-sow').value;
    const subject = document.getElementById('sow-subject').value;
    const term = document.getElementById('termSelect-sow').value;

    if (!subject) return alert("Please enter a subject first.");

    bubble.innerHTML = '<div style="text-align:center; padding:10px;">Fetching KICD Strands...</div>';
    bubble.style.display = 'block';

    try {
        const res = await fetch('/api/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ field: 'strands', grade, subject, term })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const strands = data.suggestion.split('\n').filter(s => s.trim());
        bubble.innerHTML = `
            <div style="font-size:12px; font-weight:700; margin-bottom:10px;">Select Strands to Include:</div>
            <div style="max-height:150px; overflow-y:auto; margin-bottom:10px;">
                ${strands.map((s, i) => `
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <input type="checkbox" id="st-${i}" value="${s}" checked>
                        <label for="st-${i}" style="margin:0; font-size:12px; cursor:pointer;">${s}</label>
                    </div>
                `).join('')}
            </div>
            <div style="display:flex; gap:10px;">
                <button class="suggest-action accept" onclick="applyStrandsSelection()">Apply Range</button>
                <button class="suggest-action reject" onclick="closeBubble('sow-strand')">Cancel</button>
            </div>
        `;
    } catch (e) { bubble.innerHTML = `<div style="color:#ff6b6b; padding:10px;">Error fetching strands.</div>`; }
}

function applyStrandsSelection() {
    const checkboxes = document.querySelectorAll('#bubble-sow-strand input:checked');
    const selected = Array.from(checkboxes).map(c => c.value).join(', ');
    document.getElementById('sow-strand').value = selected;
    closeBubble('sow-strand');
}

// ── AI Suggestions ──
async function suggestField(inputId, fieldType, context) {
    const bubble = document.getElementById(`bubble-${inputId}`);
    let grade, subject, strand;

    if (context === 'assess') {
        grade = document.getElementById('assess-grade-subject').value;
        subject = document.getElementById('assess-grade-subject').value;
        strand = document.getElementById('assess-topic').value;
    } else if (context === 'project') {
        grade = document.getElementById('proj-grade').value;
        subject = document.getElementById('proj-subject').value;
        strand = document.getElementById('proj-title').value;
    } else {
        grade = document.getElementById('gradeSelect-sow').value;
        subject = document.getElementById('sow-subject').value;
        strand = document.getElementById('sow-strand').value;
    }

    bubble.innerHTML = '<div style="text-align:center; padding:10px;">Suggesting KICD content...</div>';
    bubble.style.display = 'block';

    try {
        const term = (context === 'assess' || context === 'project') ? '1' : document.getElementById(`termSelect-${context}`).value;
        const res = await fetch('/api/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ field: fieldType, grade, subject, strand, term })
        });
        const data = await res.json();
        const suggestionText = data.suggestion || "No suggestion found.";
        const safeSuggestion = suggestionText.replace(/`/g, '\\`').replace(/\n/g, '\\n');

        bubble.innerHTML = `
            <div style="margin-bottom:10px; font-size:13px; opacity:0.9;">${suggestionText}</div>
            <div style="display:flex; gap:10px;">
                <button class="suggest-action accept" onclick="applySuggestion('${inputId}', \`${safeSuggestion}\`)">Use This</button>
                <button class="suggest-action reject" onclick="closeBubble('${inputId}')">Dismiss</button>
            </div>
        `;
    } catch (err) { bubble.innerHTML = `<div style="color:#ff6b6b; padding:10px;">Suggestion failed.</div>`; }
}

function applySuggestion(id, val) { document.getElementById(id).value = val; closeBubble(id); }
function closeBubble(id) { document.getElementById(`bubble-${id}`).style.display = 'none'; }

// ── Generation ──
// ── Generation ──
async function generateDocument(isTemplate = false) {
    try {
        const type = document.querySelector('input[name="gentype-sow"]:checked').value;
        const payload = {
            documentType: type,
            grade: document.getElementById('gradeSelect-sow').value,
            term: document.getElementById('termSelect-sow').value,
            subject: document.getElementById('sow-subject').value,
            strand: document.getElementById('sow-strand').value,
            extraInstructions: document.getElementById('extra-sow').value,
            teacherName: document.getElementById('profile-teacher').value || 'Facilitator',
            schoolName: document.getElementById('profile-school').value || 'Institution',
            isTemplate: isTemplate
        };

        if (!payload.subject || !payload.strand) return alert("Subject and Strands are required.");

        showProgress(20, "Referring to KICD format...");
        setTimeout(() => showProgress(50, "Mapping learning outcomes..."), 1000);
        setTimeout(() => showProgress(80, "Finalizing document structure..."), 2000);

        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (res.status === 401 || res.status === 403) return logout();
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed');

        showProgress(100, "Done!");
        setTimeout(() => {
            displayOutput(data.html);
            hideProgress();
        }, 500);
    } catch (err) {
        alert("Generation Error: " + err.message);
        hideProgress();
    }
}

function downloadTemplate() { generateDocument(true); }

async function generateProject() {
    try {
        const payload = {
            documentType: 'project',
            grade: document.getElementById('proj-grade').value,
            subject: document.getElementById('proj-subject').value,
            projectTitle: document.getElementById('proj-title').value,
            projectTime: document.getElementById('proj-time').value,
            projectOutcomes: document.getElementById('proj-outcomes').value,
            resources: document.getElementById('proj-resources').value,
            extraInstructions: document.getElementById('extra-proj').value,
            teacherName: document.getElementById('profile-teacher').value || 'Facilitator',
            schoolName: document.getElementById('profile-school').value || 'Institution'
        };

        if (!payload.projectTitle || !payload.projectOutcomes) return alert('Project Title and Learning Outcomes are required.');

        showProgress(20, 'Designing project guide...');
        setTimeout(() => showProgress(60, 'Building phases and rubric...'), 1200);
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (res.status === 401 || res.status === 403) return logout();
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Project generation failed');

        showProgress(100, 'Done!');
        setTimeout(() => {
            displayOutput(data.html);
            hideProgress();
        }, 500);
    } catch (err) {
        alert('Error: ' + err.message);
        hideProgress();
    }
}

// Called when assessment tool type changes (show/hide specific inputs)
function onAssessTypeChange() {
    // Anecdotal record needs no topic — all other types do
    const type = document.getElementById('assess-tool-type').value;
    const commonInputs = document.getElementById('assess-common-inputs');
    if (commonInputs) commonInputs.style.display = type === 'anecdotal' ? 'none' : 'block';
}

function downloadROWTemplate() {
    const payload = {
        documentType: 'checklist', // Use checklist as base for ROW
        isTemplate: true,
        schoolName: document.getElementById('profile-school').value || 'Institution'
    };
    generateDocument(true); // Simplified for now
}

function displayOutput(html) {
    const preview = document.getElementById('preview-area');
    const dlBar = document.getElementById('download-bar');
    if (!preview || !dlBar) return;

    // XSS Protection
    const sanitizedHtml = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
    preview.innerHTML = sanitizedHtml;
    preview.style.display = 'block';
    dlBar.style.display = 'block';
    preview.scrollIntoView({ behavior: 'smooth' });
}

// ── Assessment Suites ──
async function handleAssessmentGeneration() {
    try {
        const type = document.getElementById('assess-tool-type').value;
        const gradeSubject = document.getElementById('assess-grade-subject').value;
        const topic = document.getElementById('assess-topic').value;

        showProgress(50, "Crafting assessment tool...");
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                documentType: type,
                grade: gradeSubject,
                subject: gradeSubject,
                strand: topic,
                extraInstructions: document.getElementById('extra-assess').value,
                schoolName: document.getElementById('profile-school').value || 'Institution'
            })
        });
        if (res.status === 401 || res.status === 403) return logout();
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Assessment generation failed');

        showProgress(100, "Done!");
        setTimeout(() => {
            displayOutput(data.html);
            hideProgress();
        }, 500);
    } catch (err) {
        alert(err.message);
        hideProgress();
    }
}

// ── Community Chat ──
let currentChatChannel = 'staff';
function setChatChannel(chan) {
    currentChatChannel = chan;
    const staffBtn = document.getElementById('btn-chan-staff');
    const parentsBtn = document.getElementById('btn-chan-parents');

    if (staffBtn) staffBtn.classList.toggle('active', chan === 'staff');
    if (parentsBtn) parentsBtn.classList.toggle('active', chan === 'parents');

    // Update Premium UI Header
    const title = document.getElementById('current-chat-title');
    const avatar = document.getElementById('current-chat-avatar');
    if (title && avatar) {
        title.innerText = chan === 'staff' ? 'Staff Room' : 'Parents Hub';
        avatar.innerText = chan === 'staff' ? '👨‍🏫' : '👪';
        avatar.style.background = chan === 'staff' ? 'linear-gradient(135deg, #7c6bff, #5643e6)' : 'linear-gradient(135deg, #00d4aa, #00a388)';
    }

    loadChat();
}

async function loadChat() {
    try {
        const res = await fetch(`/api/chat/${currentChatChannel}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.status === 401 || res.status === 403) return logout();
        const messages = await res.json();
        const container = document.getElementById('chat-messages');
        if (!container) return;

        container.innerHTML = messages.map(m => `
            <div class="chat-msg ${m.sender === userEmail ? 'sent' : 'received'}">
                <span class="chat-sender">${m.sender === userEmail ? 'You' : m.sender}</span>
                ${m.text}
                <span class="chat-time">${m.time}</span>
            </div>
        `).join('');
        container.scrollTop = container.scrollHeight;
    } catch (err) { console.error("Chat error:", err); }
}

async function sendChatMessage() {
    try {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ text, channel: currentChatChannel })
        });
        loadChat();
    } catch (e) { console.error("Send error:", e); }
}

setInterval(() => {
    const chatView = document.getElementById('view-chat');
    if (chatView && chatView.classList.contains('active')) loadChat();
}, 4000);

// ── Portfolio ──
async function addPortfolioEntry() {
    try {
        const studentName = document.getElementById('port-student').value;
        const projectTitle = document.getElementById('port-title').value;
        const description = document.getElementById('port-description').value;
        const files = document.getElementById('port-photos').files;

        if (!studentName || !projectTitle || files.length === 0) return alert("All fields and photos required.");

        const photos = [];
        for (let f of files) {
            if (f.size > 2 * 1024 * 1024) return alert(`File ${f.name} is too large. Max 2MB per photo.`);
            photos.push(await toBase64(f));
        }

        const res = await fetch('/api/portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ studentName, projectTitle, description, photos })
        });

        if (res.ok) {
            document.getElementById('port-student').value = '';
            document.getElementById('port-title').value = '';
            document.getElementById('port-description').value = '';
            document.getElementById('port-photos').value = '';
            loadPortfolio();
            updateStorageUsage();
        }
    } catch (e) { alert("Portfolio Error: " + e.message); }
}

async function loadPortfolio() {
    try {
        const grid = document.getElementById('portfolio-grid');
        if (!grid) return;

        const res = await fetch('/api/portfolio', { headers: { 'Authorization': `Bearer ${token}` } });
        const items = await res.json();

        grid.innerHTML = items.map(item => `
            <div class="portfolio-card">
                <div class="port-header"><h3>${item.projectTitle}</h3><p>Learner: ${item.studentName}</p></div>
                <div class="port-gallery"><img src="${item.photos[0]}"></div>
                <div class="port-body">
                    <p>${item.description ? item.description.substring(0, 60) + '...' : ''}</p>
                    <div class="port-actions">
                        <button class="share" onclick="shareWithParent('${item._id}', '${item.studentName}', '${item.projectTitle}', \`${item.description || ''}\`)">📤 Share</button>
                        <button class="del" onclick="deletePortfolioEntry('${item._id}')">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) { console.error("Portfolio Load Error:", e); }
}

async function deletePortfolioEntry(id) {
    if (!confirm("Delete this entry?")) return;
    try {
        await fetch(`/api/portfolio/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        loadPortfolio();
    } catch (e) { alert("Delete failed"); }
}

async function shareWithParent(recordId, studentName, projectTitle, description) {
    const parentEmail = prompt(`Enter Parent's Email to share ${studentName}'s work:`);
    if (!parentEmail) return;

    try {
        const portfolioHtml = `
            <div style="border:1px solid #ddd; padding:15px; border-radius:10px;">
                <h3>${projectTitle}</h3>
                <p><strong>Learner:</strong> ${studentName}</p>
                <p>${description}</p>
            </div>
        `;

        const res = await fetch('/api/share-portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ parentEmail, studentName, projectTitle, portfolioHtml, recordId })
        });
        const data = await res.json();
        if (res.ok) alert("✅ Shared successfully!");
        else alert("Failed: " + data.error);
    } catch (e) { alert("Share error: " + e.message); }
}

// ── Weekly Planner ──
const timeSlots = ["08:00 - 08:35", "08:35 - 09:10", "09:10 - 09:45", "10:15 - 10:50", "10:50 - 11:25", "11:25 - 12:00", "14:00 - 14:35"];
let plannerData = {};

async function renderPlanner() {
    try {
        const body = document.getElementById('planner-body');
        if (!body) return;

        const res = await fetch('/api/planner', { headers: { 'Authorization': `Bearer ${token}` } });
        plannerData = await res.json();

        body.innerHTML = '';
        timeSlots.forEach((time, tIdx) => {
            const row = document.createElement('tr');
            const timeId = `time-${tIdx}`;
            const timeVal = plannerData[timeId] || time;

            let rowHtml = `<td><input type="text" value="${timeVal}" class="planner-input" oninput="updatePlannerData('${timeId}', this.value)" style="font-weight:700; color:var(--accent);"></td>`;

            [1, 2, 3, 4, 5].forEach(day => {
                const id = `d${day}-t${tIdx}`;
                rowHtml += `<td><textarea class="planner-slot-input" oninput="updatePlannerData('${id}', this.value)">${plannerData[id] || ''}</textarea></td>`;
            });
            row.innerHTML = rowHtml;
            body.appendChild(row);
        });
    } catch (e) { console.error("Planner Render Error:", e); }
}

function updatePlannerData(id, val) {
    plannerData[id] = val;
}

function clearPlanner() {
    if (!confirm("Clear all slots for this week?")) return;
    plannerData = {};
    renderPlanner();
}

async function savePlanner() {
    try {
        const res = await fetch('/api/planner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ data: plannerData })
        });
        if (res.ok) {
            alert("✅ Weekly Plan Saved to Cloud!");
            updateStorageUsage();
        }
    } catch (e) { alert("Save failed"); }
}

// ── Profile & Helpers ──
async function saveProfile() {
    try {
        const name = document.getElementById('profile-teacher').value;
        const school = document.getElementById('profile-school').value;
        const subjects = document.getElementById('profile-subjects').value;

        // Limit to 2 subjects
        const subList = subjects.split(',').map(s => s.trim()).filter(s => s);
        if (subList.length > 2) return alert("Teachers are limited to a maximum of 2 subjects.");

        const res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, school, subjects })
        });

        if (res.ok) {
            populateProfileFields();
            const msg = document.getElementById('profile-msg');
            if (msg) {
                msg.style.display = 'block';
                setTimeout(() => msg.style.display = 'none', 3000);
            }
        }
    } catch (e) { console.error("Profile Save Error:", e); }
}

async function uploadCurriculum() {
    try {
        const fileInput = document.getElementById('profile-curriculum');
        if (!fileInput.files.length) return alert("Please select a file first.");

        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('curriculum', file);

        showProgress(50, "Uploading & Processing Curriculum...");

        const res = await fetch('/api/profile/curriculum', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (res.ok) {
            hideProgress();
            const msg = document.getElementById('curriculum-msg');
            if (msg) {
                msg.style.display = 'block';
                setTimeout(() => msg.style.display = 'none', 3000);
            }
            fileInput.value = '';
        } else {
            const err = await res.json();
            throw new Error(err.error || "Upload failed");
        }
    } catch (e) {
        hideProgress();
        alert("Upload Error: " + e.message);
    }
}

function clearFormInputs(section) {
    if (!section || section.id === 'view-profile' || section.id === 'view-chat') return;
    const inputs = section.querySelectorAll('input[type="text"], textarea');
    inputs.forEach(input => input.value = '');
}

function showProgress(pct, label) {
    const wrap = document.getElementById('progress-wrap');
    if (wrap) {
        wrap.style.display = 'block';
        document.getElementById('progress-bar-inner').style.width = pct + '%';
        document.getElementById('progress-label').textContent = label;
    }
}
function hideProgress() {
    const wrap = document.getElementById('progress-wrap');
    if (wrap) wrap.style.display = 'none';
}
function toBase64(f) {
    return new Promise((res, rej) => {
        const r = new FileReader(); r.readAsDataURL(f); r.onload = () => res(r.result); r.onerror = e => rej(e);
    });
}

function getGeneratedFilename(ext) {
    let filename = 'Pedagogy_Document';
    const h3 = document.querySelector('#preview-area h3');
    if (h3 && h3.textContent) {
        filename = h3.textContent.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    }
    return `${filename}.${ext}`;
}

async function downloadDocx() {
    try {
        const html = document.getElementById('preview-area').innerHTML;
        const res = await fetch('/api/docx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ html })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "DOCX export failed");
        }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = getGeneratedFilename('docx');
        a.click();
    } catch (e) { alert("Download failed: " + e.message); }
}

function downloadHTML() {
    const blob = new Blob([document.getElementById('preview-area').innerHTML], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = getGeneratedFilename('html');
    a.click();
}

async function updateStorageUsage() {
    try {
        const res = await fetch('/api/storage/usage', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();

        const bar = document.getElementById('storage-bar-inner');
        const text = document.getElementById('storage-text');

        if (bar && text) {
            bar.style.width = data.percent + '%';
            text.textContent = `${data.usedMB} MB / ${data.totalMB} MB`;

            // Visual warning if high
            if (data.percent > 80) bar.style.background = '#ff6b6b';
            else if (data.percent > 50) bar.style.background = '#ffcc00';
            else bar.style.background = 'linear-gradient(90deg, var(--accent), var(--accent2))';
        }
    } catch (e) { console.error("Storage update error:", e); }
}

async function pushToParent() {
    const parentEmail = prompt("Enter Parent's Email to push this record:");
    const studentName = prompt("Enter Learner's Full Name:");
    if (!parentEmail || !studentName) return;

    const preview = document.getElementById('preview-area');
    const title = preview.querySelector('h3') ? preview.querySelector('h3').innerText : "Assessment Record";
    const content = preview.innerHTML;

    try {
        const res = await fetch('/api/parent/push-record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ parentEmail, studentName, title, content })
        });
        const data = await res.json();
        if (res.ok) alert("✅ Record pushed successfully to Parent's Dashboard!");
        else alert("Push failed: " + data.error);
    } catch (e) { alert("Error: " + e.message); }
}
