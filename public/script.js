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
        loadSavedSowDropdown();
        loadProgressRecords();
        initWalkthrough();
        console.log("Pedagogy Engine: All systems green.");
    } catch (e) {
        console.error("Initialization Error:", e);
    }
});


let userProfileCache = null;

async function populateProfileFields() {
    try {
        const res = await fetch('/api/profile', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.status === 401 || res.status === 403) return logout();
        const profile = await res.json();
        userProfileCache = profile;

        const pTeacher = document.getElementById('profile-teacher');
        const pSchool = document.getElementById('profile-school');
        const uEmail = document.getElementById('userEmailDisplay');

        if (pTeacher) pTeacher.value = profile.name || '';
        if (pSchool) pSchool.value = profile.school || '';
        if (uEmail) uEmail.textContent = userEmail || 'facilitator@pedagogy.com';

        // Update the welcome header
        const header = document.getElementById('welcomeHeader');
        if (header) {
            const firstName = profile.name ? profile.name.split(' ')[0] : 'Facilitator';
            header.textContent = `Welcome back, ${firstName}`;
        }

        // Populate subjects
        const pSubjects = document.getElementById('profile-subjects');
        if (pSubjects) pSubjects.value = profile.subjects || '';

        // Show profile picture everywhere
        if (profile.profilePicture) {
            setProfilePictureUI(profile.profilePicture, profile.name);
        } else if (profile.name) {
            setProfilePictureUI(null, profile.name);
        }

        // Initialize Dual Workspace
        initWorkspaceSelector(profile);

        // Toggle generator form based on whether active workspace has a curriculum uploaded
        const activeText = activeSubjectNum === 2 ? (profile.curriculumText2 || profile.curriculumText) : (profile.curriculumText1 || profile.curriculumText);
        const genForm = document.getElementById('curriculum-generator-form');
        if (genForm) {
            genForm.style.display = activeText ? 'block' : 'none';
        }
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
                if (target === 'view-sow') loadSavedSowDropdown();
                if (target === 'view-progress') loadProgressRecords();

                // Reset UI
                const preview = document.getElementById('preview-area');
                const dlBar = document.getElementById('download-bar');
                if (preview) preview.style.display = 'none';
                if (dlBar) dlBar.style.display = 'none';

                // Close sidebar on mobile
                const sidebar = document.querySelector('.sidebar');
                if (sidebar && window.innerWidth <= 900) {
                    sidebar.classList.remove('open');
                }
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

window.toggleSidebar = function() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('open');
};

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
function setSowMode(mode) {
    const panels = ['upload', 'template', 'ai'];
    panels.forEach(m => {
        const p = document.getElementById(`sow-panel-${m}`);
        if (p) p.style.display = m === mode ? 'block' : 'none';
    });

    const btns = {
        upload: 'btn-upload-sow',
        template: 'btn-template-sow',
        ai: 'btn-ai-sow'
    };

    Object.keys(btns).forEach(key => {
        const btn = document.getElementById(btns[key]);
        if (btn) btn.classList.toggle('active', key === mode);
    });
}
window.setSowMode = setSowMode;

function setLpMode(mode) {
    const panels = ['library', 'template', 'ai'];
    panels.forEach(m => {
        const p = document.getElementById(`lp-panel-${m}`);
        if (p) p.style.display = m === mode ? 'block' : 'none';
    });

    const btns = {
        library: 'btn-library-lp',
        template: 'btn-template-lp',
        ai: 'btn-ai-lp'
    };

    Object.keys(btns).forEach(key => {
        const btn = document.getElementById(btns[key]);
        if (btn) btn.classList.toggle('active', key === mode);
    });
}
window.setLpMode = setLpMode;

// ── Fetch Strands for Range Selection ──
async function fetchStrandsDropdown() {
    const select = document.getElementById('sow-strand');
    const grade = document.getElementById('gradeSelect-sow').value;
    const subject = document.getElementById('sow-subject').value;
    const term = document.getElementById('termSelect-sow').value;

    if (!subject) return alert("Please enter a subject first.");

    select.innerHTML = '<option value="" disabled selected>Fetching KICD Strands...</option>';

    try {
        const res = await fetch('/api/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ field: 'strands', grade, subject, term })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const strands = data.suggestion.split('\n').filter(s => s.trim() && s.length > 2);
        select.innerHTML = strands.map((s, i) => {
            const cleanStrand = s.replace(/^[-*0-9.)\s]+/, '').trim();
            return `<option value="${cleanStrand}">${cleanStrand}</option>`;
        }).join('');
    } catch (e) { 
        select.innerHTML = `<option value="" disabled selected>Error fetching strands.</option>`;
    }
}
window.fetchStrandsDropdown = fetchStrandsDropdown;

function toggleGenType(type) {
    const isSow = type === 'sow';

    // Show/hide mode selectors
    const sowModeToggle = document.getElementById('sow-mode-toggle');
    const lpModeToggle = document.getElementById('lp-mode-toggle');
    if (sowModeToggle) sowModeToggle.style.display = isSow ? 'flex' : 'none';
    if (lpModeToggle) lpModeToggle.style.display = isSow ? 'none' : 'flex';

    // Hide all panels first
    const sowPanels = ['upload', 'template', 'ai'];
    const lpPanels = ['library', 'template', 'ai'];

    sowPanels.forEach(m => {
        const p = document.getElementById(`sow-panel-${m}`);
        if (p) p.style.display = 'none';
    });

    lpPanels.forEach(m => {
        const p = document.getElementById(`lp-panel-${m}`);
        if (p) p.style.display = 'none';
    });

    // Show active panel based on the active tab button
    if (isSow) {
        if (document.getElementById('btn-upload-sow') && document.getElementById('btn-upload-sow').classList.contains('active')) {
            document.getElementById('sow-panel-upload').style.display = 'block';
        } else if (document.getElementById('btn-ai-sow') && document.getElementById('btn-ai-sow').classList.contains('active')) {
            document.getElementById('sow-panel-ai').style.display = 'block';
        } else {
            document.getElementById('sow-panel-template').style.display = 'block';
        }
    } else {
        if (document.getElementById('btn-template-lp') && document.getElementById('btn-template-lp').classList.contains('active')) {
            document.getElementById('lp-panel-template').style.display = 'block';
        } else if (document.getElementById('btn-ai-lp') && document.getElementById('btn-ai-lp').classList.contains('active')) {
            document.getElementById('lp-panel-ai').style.display = 'block';
        } else {
            document.getElementById('lp-panel-library').style.display = 'block';
        }
    }

    const select = document.getElementById('saved-sow-select');
    const hasSow = select && select.value;
    const generateBtn = document.getElementById('btn-generate-doc');
    const guideBtn = document.getElementById('btn-generate-guide');
    const lessonNumGroup = document.getElementById('lp-lesson-number-group');

    if (!isSow) {
        const isLpLibraryMode = document.getElementById('btn-library-lp') && document.getElementById('btn-library-lp').classList.contains('active');
        if (isLpLibraryMode && hasSow) {
            if (guideBtn) guideBtn.style.display = 'block';
            if (lessonNumGroup) lessonNumGroup.style.display = 'block';
            if (generateBtn) generateBtn.innerText = '⚡ Extract Lesson Plan (No AI)';
        } else {
            if (guideBtn) guideBtn.style.display = 'block';
            if (lessonNumGroup) lessonNumGroup.style.display = 'none';
            if (generateBtn) generateBtn.innerText = '⚡ Generate Lesson Plan';
        }
    }
}
window.toggleGenType = toggleGenType;

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
    } else if (context === 'lp') {
        grade = document.getElementById('gradeSelect-lp').value;
        subject = document.getElementById('lp-subject').value;
        strand = document.getElementById('lp-strand').value;
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
            body: JSON.stringify({ field: fieldType, grade, subject, strand, term, activeWorkspace: activeSubjectNum })
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
async function generateDocument(isTemplate = false) {
    try {
        const type = document.querySelector('input[name="gentype-sow"]:checked').value;
        let payload = {
            documentType: type,
            teacherName: document.getElementById('profile-teacher').value || 'Facilitator',
            schoolName: document.getElementById('profile-school').value || 'Institution',
            isTemplate: isTemplate
        };

        if (type === 'sow') {
            payload.grade = document.getElementById('gradeSelect-sow').value;
            payload.term = document.getElementById('termSelect-sow').value;
            payload.subject = document.getElementById('sow-subject').value;
            payload.strand = document.getElementById('sow-strand').value;
            payload.extraInstructions = document.getElementById('extra-sow').value || '';
            const holidays = document.getElementById('sow-holidays').value;
            if (holidays) {
                payload.extraInstructions += `\nInclude these holidays/breaks: ${holidays}`;
            }
        } else {
            const isLpLibraryMode = document.getElementById('btn-library-lp') && document.getElementById('btn-library-lp').classList.contains('active');
            const select = document.getElementById('saved-sow-select');
            if (isLpLibraryMode && select && select.value) {
                payload.sowId = select.value;
                payload.lessonNumber = parseInt(document.getElementById('lp-lesson-number').value) || 1;
                payload.subject = document.getElementById('lp-subject').value;
                payload.strand = document.getElementById('lp-strand').value;
            } else {
                payload.grade = document.getElementById('gradeSelect-lp').value;
                payload.term = document.getElementById('termSelect-lp').value;
                payload.subject = document.getElementById('lp-subject').value;
                payload.strand = document.getElementById('lp-strand').value;
                payload.subStrand = document.getElementById('lp-substrand').value;
                payload.learningOutcomes = document.getElementById('lp-outcomes-input').value;
                payload.competencies = document.getElementById('lp-competencies-input').value;
                payload.extendedActivity = document.getElementById('lp-extended-input').value;
            }
            payload.extraInstructions = document.getElementById('extra-lp').value || '';
        }

        if (!isTemplate && !payload.sowId && (!payload.subject || !payload.strand)) return alert("Subject and Strands are required.");

        showProgress(20, "Referring to KICD format...");
        setTimeout(() => showProgress(50, "Mapping learning outcomes..."), 1000);
        setTimeout(() => showProgress(80, "Finalizing document structure..."), 2000);

        payload.activeWorkspace = activeSubjectNum;

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

            if (type === 'sow' && !isTemplate) {
                lastGeneratedSow = {
                    grade: payload.grade,
                    term: payload.term,
                    subject: payload.subject,
                    strands: payload.strand,
                    html: data.html
                };
                const saveBtn = document.getElementById('btn-save-sow-lib');
                const pushLpBtn = document.getElementById('btn-push-lp');
                if (saveBtn) saveBtn.style.display = 'inline-block';
                if (pushLpBtn) pushLpBtn.style.display = 'inline-block';
            } else {
                const saveBtn = document.getElementById('btn-save-sow-lib');
                const pushLpBtn = document.getElementById('btn-push-lp');
                if (saveBtn) saveBtn.style.display = 'none';
                if (pushLpBtn) pushLpBtn.style.display = 'none';
            }
        }, 500);
    } catch (err) {
        alert("Generation Error: " + err.message);
        hideProgress();
    }
}

async function generateSowFromCurriculum() {
    try {
        const grade = document.getElementById('gradeSelect-curriculum').value;
        const term = document.getElementById('termSelect-curriculum').value;
        const subject = document.getElementById('subject-curriculum').value;
        const strandRange = document.getElementById('strandRange-curriculum').value;
        const previousProgress = document.getElementById('previousProgress-curriculum').value;
        const holidays = document.getElementById('holidays-curriculum').value;
        let extraInstructions = document.getElementById('extra-curriculum').value || '';

        if (!subject || !strandRange) {
            return alert("Subject and Strand Range are required to generate SOW.");
        }

        showProgress(20, "Referring to curriculum text...");
        setTimeout(() => showProgress(50, "Aligning strand range..."), 1000);
        setTimeout(() => showProgress(80, "Structuring termly SOW..."), 2000);

        const payload = {
            documentType: 'sow',
            grade,
            term,
            subject,
            strand: strandRange,
            previousProgress,
            extraInstructions,
            holidays,
            activeWorkspace: activeSubjectNum
        };

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

            lastGeneratedSow = {
                grade: payload.grade,
                term: payload.term,
                subject: payload.subject,
                strands: payload.strand,
                html: data.html
            };

            const saveBtn = document.getElementById('btn-save-sow-lib');
            const pushLpBtn = document.getElementById('btn-push-lp');
            if (saveBtn) saveBtn.style.display = 'inline-block';
            if (pushLpBtn) pushLpBtn.style.display = 'inline-block';
        }, 500);

    } catch (err) {
        alert("Extraction Error: " + err.message);
        hideProgress();
    }
}
window.generateSowFromCurriculum = generateSowFromCurriculum;

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

// ── Community Chat (Real-time Socket.io) ──
let currentChatChannel = 'staff';
let chatSocket = null;

function initChatSocket() {
    if (chatSocket) return; // Already connected
    chatSocket = io();

    chatSocket.on('connect', () => {
        console.log('🛰️  Chat socket connected:', chatSocket.id);
        chatSocket.emit('joinChannel', currentChatChannel);
    });

    // Listen for messages on any channel
    ['staff', 'parent-community'].forEach(ch => {
        chatSocket.on(`chat:${ch}`, (msg) => {
            if (ch === currentChatChannel) appendChatMessage(msg);
        });
    });

    chatSocket.on('disconnect', () => console.warn('Chat socket disconnected'));
}

function setChatChannel(chan) {
    currentChatChannel = chan;
    const staffBtn = document.getElementById('btn-chan-staff');
    const parentsBtn = document.getElementById('btn-chan-parents');

    if (staffBtn) staffBtn.classList.toggle('active', chan === 'staff');
    if (parentsBtn) parentsBtn.classList.toggle('active', chan === 'parent-community');

    // Update header
    const title = document.getElementById('current-chat-title');
    const avatar = document.getElementById('current-chat-avatar');
    const statusEl = document.getElementById('chat-online-status');
    if (title && avatar) {
        title.innerText = chan === 'staff' ? 'Staff Room' : 'Parents Hub';
        avatar.innerText = chan === 'staff' ? '👨‍🏫' : '👪';
        avatar.style.background = chan === 'staff'
            ? 'linear-gradient(135deg, #7c6bff, #5643e6)'
            : 'linear-gradient(135deg, #00d4aa, #00a388)';
    }
    if (statusEl) statusEl.textContent = chan === 'staff' ? 'Staff & Faculty' : 'Parents Community';

    if (chatSocket) chatSocket.emit('joinChannel', chan);
    loadChat();
}
window.setChatChannel = setChatChannel;

function buildChatBubble(m) {
    const isMine = m.sender === userEmail;
    const isBot = m.sender && (m.sender.includes('Bot') || m.sender.includes('🤖'));
    const sidebarImg = document.getElementById('sidebar-avatar-img');
    const sidebarInitials = document.getElementById('sidebar-avatar-initials');
    const myPic = sidebarImg && sidebarImg.style.display !== 'none' ? sidebarImg.src : null;
    const myInitials = sidebarInitials ? sidebarInitials.textContent : '?';
    const senderLabel = isBot ? m.sender : isMine ? 'You' : m.sender.split('@')[0];

    const avatarHtml = isBot
        ? `<div class="chat-avatar" style="background:linear-gradient(135deg,#00d4aa,#00a388);font-size:18px;">🤖</div>`
        : isMine
            ? (myPic
                ? `<div class="chat-avatar"><img src="${myPic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>`
                : `<div class="chat-avatar" style="background:linear-gradient(135deg,var(--accent),#5643e6);">${myInitials}</div>`)
            : `<div class="chat-avatar" style="background:rgba(255,255,255,0.1);">${m.sender ? m.sender[0].toUpperCase() : '?'}</div>`;

    return `
        <div class="chat-msg ${isMine ? 'sent' : 'received'}" data-id="${m._id || ''}">
            ${!isMine ? avatarHtml : ''}
            <div class="chat-bubble">
                <span class="chat-sender">${senderLabel}</span>
                <span>${m.text}</span>
                <span class="chat-time">${m.time || ''}</span>
            </div>
            ${isMine ? avatarHtml : ''}
        </div>`;
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const placeholder = container.querySelector('.chat-info');
    if (placeholder) placeholder.remove();
    container.insertAdjacentHTML('beforeend', buildChatBubble(msg));
    container.scrollTop = container.scrollHeight;
}

async function loadChat() {
    try {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        container.innerHTML = `<div class="chat-info" style="text-align:center;padding:20px;opacity:0.5;">Loading messages...</div>`;

        const res = await fetch(`/api/chat/${currentChatChannel}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.status === 401 || res.status === 403) return logout();
        const messages = await res.json();

        if (!messages.length) {
            container.innerHTML = `<div class="chat-info" style="text-align:center;padding:40px;opacity:0.4;">No messages yet. Start the conversation! 👋</div>`;
            return;
        }
        container.innerHTML = messages.map(buildChatBubble).join('');
        container.scrollTop = container.scrollHeight;
    } catch (err) { console.error("Chat load error:", err); }
}

async function sendChatMessage() {
    try {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';

        // Optimistically add message to UI immediately
        const optimistic = {
            sender: userEmail,
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _id: 'opt-' + Date.now()
        };
        appendChatMessage(optimistic);

        // Send via REST (server will broadcast to all sockets)
        await fetch(`/api/chat/${currentChatChannel}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ text })
        });
    } catch (e) { console.error("Send error:", e); }
}
window.sendChatMessage = sendChatMessage;

// Initialize socket when chat view becomes active
document.addEventListener('DOMContentLoaded', () => {
    const chatNavBtn = document.querySelector('[onclick*="view-chat"], [onclick*="chat"]');
    const observer = new MutationObserver(() => {
        const chatView = document.getElementById('view-chat');
        if (chatView && chatView.classList.contains('active')) {
            initChatSocket();
            loadChat();
        }
    });
    const viewsContainer = document.querySelector('.main-content');
    if (viewsContainer) observer.observe(viewsContainer, { subtree: true, attributeFilter: ['class'] });
});

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

// ── Profile Picture Helpers ──
let pendingProfilePicBase64 = null;

function setProfilePictureUI(picUrl, name) {
    const initials = name ? name.trim().split(' ').map(p => p[0]).join('').toUpperCase().substring(0, 2) : '👤';
    
    // Sidebar avatar
    const sidebarImg = document.getElementById('sidebar-avatar-img');
    const sidebarInitials = document.getElementById('sidebar-avatar-initials');
    if (sidebarImg && sidebarInitials) {
        if (picUrl) {
            sidebarImg.src = picUrl;
            sidebarImg.style.display = 'block';
            sidebarInitials.style.display = 'none';
        } else {
            sidebarInitials.textContent = initials;
            sidebarInitials.style.display = 'block';
            sidebarImg.style.display = 'none';
        }
    }

    // Profile page preview
    const profileImg = document.getElementById('profile-pic-img');
    const profileInitials = document.getElementById('profile-pic-initials');
    if (profileImg && profileInitials) {
        if (picUrl) {
            profileImg.src = picUrl;
            profileImg.style.display = 'block';
            profileInitials.style.display = 'none';
        } else {
            profileInitials.textContent = initials;
            profileInitials.style.display = 'block';
            profileImg.style.display = 'none';
        }
    }
}

window.previewProfilePicture = function(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return alert('Photo must be under 2MB.');
    toBase64(file).then(base64 => {
        pendingProfilePicBase64 = base64;
        // Show preview immediately
        const profileImg = document.getElementById('profile-pic-img');
        const profileInitials = document.getElementById('profile-pic-initials');
        const sidebarImg = document.getElementById('sidebar-avatar-img');
        const sidebarInitials = document.getElementById('sidebar-avatar-initials');
        if (profileImg) { profileImg.src = base64; profileImg.style.display = 'block'; }
        if (profileInitials) profileInitials.style.display = 'none';
        if (sidebarImg) { sidebarImg.src = base64; sidebarImg.style.display = 'block'; }
        if (sidebarInitials) sidebarInitials.style.display = 'none';
    });
};

async function saveProfile() {
    try {
        const name = document.getElementById('profile-teacher').value;
        const school = document.getElementById('profile-school').value;
        const subjects = document.getElementById('profile-subjects').value;

        // Limit to 2 subjects
        const subList = subjects.split(',').map(s => s.trim()).filter(s => s);
        if (subList.length > 2) return alert('Teachers are limited to a maximum of 2 subjects.');

        const body = { name, school, subjects };
        if (pendingProfilePicBase64) body.profilePicture = pendingProfilePicBase64;

        const res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            pendingProfilePicBase64 = null;
            await populateProfileFields(); // Re-fetch and refresh all UI
            const msg = document.getElementById('profile-msg');
            if (msg) {
                msg.style.display = 'block';
                setTimeout(() => msg.style.display = 'none', 3000);
            }
        }
    } catch (e) { console.error('Profile Save Error:', e); }
}

async function uploadCurriculum() {
    try {
        const fileInput = document.getElementById('sow-curriculum') || document.getElementById('profile-curriculum');
        if (!fileInput || !fileInput.files.length) return alert("Please select a file first.");

        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('curriculum', file);
        formData.append('workspace', activeSubjectNum.toString());

        showProgress(50, "Uploading & Extracting Curriculum...");

        const res = await fetch('/api/profile/curriculum', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (res.ok) {
            hideProgress();
            const data = await res.json();

            // Refresh userProfileCache
            await populateProfileFields();

            // Reveal the termly generator form instantly
            const genForm = document.getElementById('curriculum-generator-form');
            if (genForm) genForm.style.display = 'block';

            const msg = document.getElementById('curriculum-msg');
            if (msg) {
                msg.style.display = 'block';
                setTimeout(() => msg.style.display = 'none', 4000);
            }

            // Show extracted text preview
            if (data.preview) {
                const preview = document.getElementById('curriculum-preview');
                const previewText = document.getElementById('curriculum-preview-text');
                const wsLabel = document.getElementById('curriculum-ws-label');
                if (preview && previewText) {
                    previewText.textContent = data.preview;
                    if (wsLabel) wsLabel.textContent = data.workspace || activeSubjectNum;
                    preview.style.display = 'block';
                }
            }

            // Change button to toggle the preview panel
            const btn = document.getElementById('upload-btn');
            if (btn) {
                btn.innerHTML = '📋 View Extracted SOW';
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const p = document.getElementById('curriculum-preview');
                    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
                };
            }
            
            const pushBtn = document.getElementById('push-lp-btn');
            if (pushBtn) pushBtn.style.display = 'inline-block';

            fileInput.value = '';
            const disp = document.getElementById('file-name-display');
            if (disp) disp.style.display = 'none';
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

// ── SAVED SOW LIBRARY SYSTEM ──
let lastGeneratedSow = null;
let savedSowsCache = [];

async function loadSavedSowDropdown() {
    try {
        const res = await fetch('/api/sow', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return;
        const sows = await res.json();
        savedSowsCache = sows;

        const select = document.getElementById('saved-sow-select');
        const group = document.getElementById('saved-sow-selector-group');
        
        if (select && group) {
            if (sows.length === 0) {
                group.style.display = 'none';
                return;
            }
            group.style.display = 'block';
            select.innerHTML = `<option value="">-- Choose a Saved SOW to pre-fill --</option>` + 
                sows.map(s => `<option value="${s._id}">${s.title || `${s.subject} (${s.grade} - Term ${s.term})`}</option>`).join('');
        }
    } catch (e) { console.error("Error loading saved sows", e); }
}

function loadSavedSowFields() {
    const select = document.getElementById('saved-sow-select');
    const lessonNumGroup = document.getElementById('lp-lesson-number-group');
    const standardFields = document.getElementById('lp-standard-fields');
    const guideBtn = document.getElementById('btn-generate-guide');

    if (!select) return;

    if (!select.value) {
        if (lessonNumGroup) lessonNumGroup.style.display = 'none';
        if (standardFields) standardFields.style.display = 'block';
        if (guideBtn) guideBtn.style.display = 'block';
        return;
    }

    const selectedSow = savedSowsCache.find(s => s._id === select.value);
    if (!selectedSow) return;

    if (lessonNumGroup) lessonNumGroup.style.display = 'block';
    if (standardFields) standardFields.style.display = 'none';
    if (guideBtn) guideBtn.style.display = 'block';

    const gradeSelect = document.getElementById('gradeSelect-lp');
    const termSelect = document.getElementById('termSelect-lp');
    const subjectInput = document.getElementById('lp-subject');
    const strandInput = document.getElementById('lp-strand');

    if (gradeSelect) {
        gradeSelect.value = selectedSow.grade;
        updateTerms('lp');
    }
    if (termSelect) {
        termSelect.value = selectedSow.term;
    }
    if (subjectInput) {
        subjectInput.value = selectedSow.subject;
    }
    if (strandInput) {
        strandInput.value = selectedSow.strands || '';
    }
}

async function generateTeacherGuideNotes() {
    try {
        const select = document.getElementById('saved-sow-select');
        let payload = {
            documentType: 'notes',
            extraInstructions: document.getElementById('extra-sow').value,
            teacherName: document.getElementById('profile-teacher').value || 'Facilitator',
            schoolName: document.getElementById('profile-school').value || 'Institution'
        };

        if (select && select.value) {
            payload.sowId = select.value;
            payload.lessonNumber = parseInt(document.getElementById('lp-lesson-number').value) || 1;
        } else {
            payload.grade = document.getElementById('gradeSelect-lp').value;
            payload.term = document.getElementById('termSelect-lp').value;
            payload.subject = document.getElementById('lp-subject').value;
            payload.strand = document.getElementById('lp-strand').value;
            payload.lessonNumber = 1;
            if (!payload.subject || !payload.strand) return alert("Subject and Strands are required.");
        }

        showProgress(25, "Analysing lesson details...");
        setTimeout(() => showProgress(60, "Generating pedagogical guide..."), 1200);

        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (res.status === 401 || res.status === 403) return logout();
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Notes generation failed');

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

window.generateTeacherGuideNotes = generateTeacherGuideNotes;

async function saveSOWToLibrary() {
    if (!lastGeneratedSow) return alert("No generated Scheme of Work found to save.");
    
    const defaultTitle = `${lastGeneratedSow.grade} ${lastGeneratedSow.subject} - Term ${lastGeneratedSow.term}`;
    const title = prompt("Enter a custom title for this Scheme of Work to save in library:", defaultTitle);
    if (title === null) return;
    if (!title.trim()) return alert("A valid title is required.");

    try {
        const body = {
            title: title.trim(),
            grade: lastGeneratedSow.grade,
            term: lastGeneratedSow.term,
            subject: lastGeneratedSow.subject,
            strands: lastGeneratedSow.strands,
            html: lastGeneratedSow.html
        };

        const res = await fetch('/api/sow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        alert(`🎉 Successfully saved "${body.title}" to your SOW Library!`);
        
        const saveBtn = document.getElementById('btn-save-sow-lib');
        if (saveBtn) saveBtn.style.display = 'none';

        loadSavedSowDropdown();
        return true;
    } catch (e) {
        alert("Failed to save Scheme of Work: " + e.message);
        return false;
    }
}

async function clearSowLibrary() {
    if (!confirm('Clear ALL saved SOWs from your library? This cannot be undone.')) return;
    try {
        const res = await fetch('/api/sow/all', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            alert('\u2705 SOW Library cleared!');
            loadSavedSowDropdown();
        } else {
            const err = await res.json();
            alert('Failed: ' + err.error);
        }
    } catch (e) { alert('Failed to clear library: ' + e.message); }
}
window.clearSowLibrary = clearSowLibrary;

async function pushSowToLessonPlan() {
    const saveBtn = document.getElementById('btn-save-sow-lib');
    if (saveBtn && saveBtn.style.display !== 'none') {
        const saved = await saveSOWToLibrary();
        if (!saved) return;
    }
    
    document.getElementById('r-plan').click();
    
    setTimeout(() => {
        const select = document.getElementById('saved-sow-select');
        if (select && select.options.length > 1) {
            select.selectedIndex = 1;
            loadSavedSowFields();
        }
    }, 500);
}
window.pushSowToLessonPlan = pushSowToLessonPlan;

function switchToLessonPlan() {
    document.getElementById('r-plan').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchToLessonPlan = switchToLessonPlan;

// ── DUAL SUBJECT WORKSPACE SELECTOR SYSTEM ──
let userSubject1 = '';
let userSubject2 = '';
let activeSubjectNum = 1;

function initWorkspaceSelector(profile) {
    const selector = document.getElementById('subject-workspace-selector');
    if (!selector) return;

    const userRole = localStorage.getItem('cbc_role') || profile.role || 'teacher';
    if (userRole !== 'teacher') {
        selector.style.display = 'none';
        return;
    }

    userSubject1 = profile.subject1 || '';
    userSubject2 = profile.subject2 || '';

    // Fallback if subject1/subject2 not populated but subjects exists
    if (!userSubject1 && !userSubject2 && profile.subjects) {
        const subList = profile.subjects.split(',').map(s => s.trim()).filter(s => s);
        userSubject1 = subList[0] || '';
        userSubject2 = subList[1] || '';
    }

    const t1 = document.getElementById('workspace-subject1-title');
    const t2 = document.getElementById('workspace-subject2-title');
    const card2 = document.getElementById('workspace-subject2');

    if (t1) t1.textContent = userSubject1 || 'Set in Profile';
    
    if (!userSubject2) {
        // No second subject — show a helpful prompt, dim the card slightly
        if (t2) t2.textContent = '+ Add 2nd Subject';
        if (card2) card2.style.opacity = '0.6';
    } else {
        if (t2) t2.textContent = userSubject2;
        if (card2) card2.style.opacity = '1';
    }

    selector.style.display = 'block';

    const savedActive = localStorage.getItem('active_workspace_subject');
    if (savedActive === '2' && userSubject2) {
        selectWorkspaceSubject(2, false);
    } else {
        selectWorkspaceSubject(1, false);
    }
}

function selectWorkspaceSubject(num, showNotification = true) {
    activeSubjectNum = num;
    localStorage.setItem('active_workspace_subject', num.toString());

    const card1 = document.getElementById('workspace-subject1');
    const card2 = document.getElementById('workspace-subject2');

    if (card1 && card2) {
        card1.classList.toggle('active', num === 1);
        card2.classList.toggle('active', num === 2);

        const status1 = card1.querySelector('.workspace-status');
        const status2 = card2.querySelector('.workspace-status');
        if (status1) status1.textContent = num === 1 ? '🟢 Active Workspace' : 'Click to activate';
        if (status2) status2.textContent = num === 2 ? '🟢 Active Workspace' : 'Click to activate';
    }

    const activeSubject = num === 1 ? userSubject1 : userSubject2;
    if (!activeSubject) return;

    // Auto-fill all subject fields in the UI
    const sowSub = document.getElementById('sow-subject');
    const lpSub = document.getElementById('lp-subject');
    const rowSub = document.getElementById('row-subject');
    const assessGradeSub = document.getElementById('assess-grade-subject');
    const projSub = document.getElementById('proj-subject');
    const curriculumSub = document.getElementById('subject-curriculum');

    if (sowSub) sowSub.value = activeSubject;
    if (lpSub) lpSub.value = activeSubject;
    if (rowSub) rowSub.value = activeSubject;
    if (projSub) projSub.value = activeSubject;
    if (curriculumSub) curriculumSub.value = activeSubject;

    if (assessGradeSub) {
        const currentVal = assessGradeSub.value || '';
        const gradeMatch = currentVal.match(/^(Grade\s+\d+|PP1|PP2)\s+/i);
        if (gradeMatch) {
            assessGradeSub.value = `${gradeMatch[1]} ${activeSubject}`;
        } else {
            assessGradeSub.value = `Grade 8 ${activeSubject}`;
        }
    }

    // Dynamic SOW termly generator form display based on cached curriculum text availability
    if (userProfileCache) {
        const activeText = num === 2 ? (userProfileCache.curriculumText2 || userProfileCache.curriculumText) : (userProfileCache.curriculumText1 || userProfileCache.curriculumText);
        const genForm = document.getElementById('curriculum-generator-form');
        if (genForm) {
            genForm.style.display = activeText ? 'block' : 'none';
        }
    }

    if (showNotification) {
        console.log(`Switched to active subject: ${activeSubject}`);
    }
}
window.selectWorkspaceSubject = selectWorkspaceSubject;

// ── ONBOARDING WALKTHROUGH ──
function initWalkthrough(force = false) {
    const loginCount = parseInt(localStorage.getItem('pedagogy_login_count') || '0');
    if (!force) localStorage.setItem('pedagogy_login_count', (loginCount + 1).toString());

    if ((force || loginCount < 2) && window.driver) {
        try {
            const driverFunc = window.driver.driver || window.driver;
            const driverObj = driverFunc({
            showProgress: true,
            steps: [
                { element: '#subject-workspace-selector', popover: { title: 'Workspace Switcher', description: 'Switch between your teaching subjects. Each workspace remembers its own uploaded curriculum.' } },
                { element: '#curriculum-upload-zone', popover: { title: 'Curriculum Upload', description: 'Upload a PDF or TXT of the curriculum here. We will extract the data to power the AI SOW generator.' } },
                { element: '#nav-profile', popover: { title: 'Profile Settings', description: 'Configure your school details, classes, and subjects.' } },
                { element: '[data-target="view-sow"]', popover: { title: 'SOW Generator', description: 'Generate highly accurate Schemes of Work using your uploaded curriculum.' } },
                { element: '[data-target="view-plan"]', popover: { title: 'Lesson Planning', description: 'Push your SOW here to generate detailed daily Lesson Plans and Teacher Guidance Notes.' } },
                { element: '#nav-progress', popover: { title: 'Learner Progress', description: 'Track CBC summative and formative assessments.' } }
            ]
        });
        setTimeout(() => driverObj.drive(), 1500);
        } catch (e) { console.warn('Driver walkthrough error:', e); }
    }
}

// ── LEARNER PROGRESS ──
function addProgressRow() {
    const tbody = document.getElementById('progress-tbody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border)';
    tr.innerHTML = `
        <td style="padding:4px; border-right:2px solid var(--border);"><input type="text" class="prog-name" placeholder="Name" style="width:100%; padding:4px; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);"></td>
        <td style="padding:4px; background:rgba(124,107,255,0.05);"><input type="text" class="prog-att" placeholder="e.g. 95%" style="width:100%; padding:4px; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);"></td>
        <td style="padding:4px; background:rgba(124,107,255,0.05);"><input type="text" class="prog-ass" placeholder="e.g. Good" style="width:100%; padding:4px; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);"></td>
        <td style="padding:4px; border-right:2px solid var(--border); background:rgba(124,107,255,0.05);"><input type="text" class="prog-grp" placeholder="e.g. Active" style="width:100%; padding:4px; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);"></td>
        <td style="padding:4px; background:rgba(0,212,170,0.05);"><input type="text" class="prog-cat" placeholder="Score" style="width:100%; padding:4px; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);"></td>
        <td style="padding:4px; background:rgba(0,212,170,0.05);"><input type="text" class="prog-pres" placeholder="Score" style="width:100%; padding:4px; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);"></td>
        <td style="padding:4px; background:rgba(0,212,170,0.05);"><input type="text" class="prog-proj" placeholder="Score" style="width:100%; padding:4px; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);"></td>
        <td style="padding:4px; background:rgba(0,212,170,0.05);"><input type="text" class="prog-oth" placeholder="Remarks" style="width:100%; padding:4px; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);"></td>
    `;
    tbody.appendChild(tr);
}
window.addProgressRow = addProgressRow;

async function saveClassProgress() {
    const term = document.getElementById('prog-term').value;
    const sharedWith = document.getElementById('prog-parent-email').value;
    const tbody = document.getElementById('progress-tbody');
    const rows = tbody.querySelectorAll('tr');
    const studentsData = [];
    
    rows.forEach(tr => {
        const name = tr.querySelector('.prog-name').value;
        if(name.trim() !== '') {
            studentsData.push({
                name: name.trim(),
                attendance: tr.querySelector('.prog-att').value,
                assignments: tr.querySelector('.prog-ass').value,
                groupwork: tr.querySelector('.prog-grp').value,
                cat: tr.querySelector('.prog-cat').value,
                presentation: tr.querySelector('.prog-pres').value,
                project: tr.querySelector('.prog-proj').value,
                other: tr.querySelector('.prog-oth').value
            });
        }
    });
    
    if (studentsData.length === 0) return alert("Please enter at least one student record.");
    
    try {
        const res = await fetch('/api/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ term, sharedWith, studentsData })
        });
        if (res.ok) {
            alert("✅ Class Progress Record Saved successfully!");
            document.getElementById('prog-parent-email').value = '';
            tbody.innerHTML = '';
            addProgressRow();
            loadProgressRecords();
        } else {
            const err = await res.json();
            alert("Error: " + err.error);
        }
    } catch(e) { alert("Failed to save progress."); }
}
window.saveClassProgress = saveClassProgress;

async function loadProgressRecords() {
    try {
        const res = await fetch('/api/progress', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return;
        const records = await res.json();
        
        const container = document.getElementById('progress-list-container');
        if (!container) return;
        
        if (records.length === 0) {
            container.innerHTML = '<div style="color:var(--muted); text-align:center; padding: 20px; grid-column: 1/-1;">No records saved yet.</div>';
            return;
        }
        
        container.innerHTML = records.map(r => {
            if (r.studentsData && r.studentsData.length > 0) {
                // New Format
                const rows = r.studentsData.map(s => `
                    <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:4px;">${s.name}</td>
                        <td style="padding:4px; color:var(--muted);">${s.attendance || '-'}</td>
                        <td style="padding:4px; color:var(--muted);">${s.assignments || '-'}</td>
                        <td style="padding:4px; color:var(--accent); font-weight:bold;">${s.cat || '-'}</td>
                        <td style="padding:4px; color:var(--accent2);">${s.project || '-'}</td>
                    </tr>
                `).join('');
                
                return `
                <div class="card" style="padding:20px; margin-bottom:0; width:100%; grid-column: 1/-1; max-width: 100%; overflow-x: auto;">
                    <h4 style="margin:0 0 10px; font-size:16px;">Class Record <span style="font-size:12px; font-weight:normal; color:var(--muted);">(${r.term})</span></h4>
                    <table style="width:100%; font-size:12px; text-align:left; border-collapse:collapse; min-width:500px;">
                        <thead><tr style="background:rgba(124,107,255,0.05);"><th style="padding:6px;">Student</th><th style="padding:6px;">Attnd.</th><th style="padding:6px;">Assign.</th><th style="padding:6px;">CAT</th><th style="padding:6px;">Project</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                    ${r.sharedWith ? `<div style="font-size:11px; margin-top:10px; color:#3b82f6;">Shared with: ${r.sharedWith}</div>` : ''}
                </div>
                `;
            } else {
                // Legacy Format
                return `
                <div class="card" style="padding:20px; margin-bottom:0;">
                    <h4 style="margin:0 0 10px; font-size:16px;">${r.studentName} <span style="font-size:12px; font-weight:normal; color:var(--muted);">(${r.term})</span></h4>
                    <div style="font-size:13px; margin-bottom:10px;">
                        <strong>Math:</strong> ${r.mathScore || '-'}% &nbsp; 
                        <strong>English:</strong> ${r.englishScore || '-'}% &nbsp; 
                        <strong>Science:</strong> ${r.scienceScore || '-'}%
                    </div>
                    <div style="font-size:13px; color:var(--accent2); margin-bottom:10px;"><strong>Level:</strong> ${r.rubric}</div>
                    <p style="font-size:12px; color:var(--muted); margin:0;">${r.remarks || 'No remarks.'}</p>
                    ${r.sharedWith ? `<div style="font-size:11px; margin-top:10px; color:#3b82f6;">Shared with: ${r.sharedWith}</div>` : ''}
                </div>
                `;
            }
        }).join('');
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if(document.getElementById('progress-tbody')) addProgressRow(); }, 500);
});
window.loadProgressRecords = loadProgressRecords;

window.updateFileName = function(input) {
    const display = document.getElementById('file-name-display');
    const btn = document.getElementById('upload-btn');
    if (input.files && input.files[0]) {
        display.textContent = 'Selected: ' + input.files[0].name;
        display.style.display = 'block';
        if (btn) {
            btn.innerHTML = '✨ Extract SOW';
            btn.style.background = 'linear-gradient(135deg, #00d4aa, #009688)';
        }
    } else {
        display.style.display = 'none';
        if (btn) {
            btn.innerHTML = '📁 Browse File';
            btn.style.background = 'linear-gradient(135deg, var(--accent), #5643e6)';
        }
    }
};

window.handleUploadBtnClick = function(btn) {
    const fileInput = document.getElementById('sow-curriculum');
    if (!fileInput) return;
    if (!fileInput.files || !fileInput.files.length) {
        fileInput.click();
    } else {
        uploadCurriculum();
    }
};
