const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const htmlToDocx = require('html-to-docx');
const multer = require('multer');
const pdfParse = require('pdf-parse');
require('dotenv').config();
const { User, ChatMessage, Portfolio, WeeklyPlan, SavedSOW, LearnerProgress, connectDB } = require('./db');

const upload = multer({ dest: 'uploads/' });

connectDB();

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cbc_prod_secure_928173645';

// ── Rate Limiting ──
const loginAttempts = new Map();
function rateLimit(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || [];
    const recentAttempts = attempts.filter(time => now - time < 60000);
    if (recentAttempts.length >= 5) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
    recentAttempts.push(now);
    loginAttempts.set(ip, recentAttempts);
    next();
}

const generateAttempts = new Map();
function generateRateLimit(req, res, next) {
    const identifier = req.user ? req.user.email : req.ip;
    const now = Date.now();
    const attempts = generateAttempts.get(identifier) || [];
    // Limit to 10 generations per hour (3600000 ms)
    const recentAttempts = attempts.filter(time => now - time < 3600000);
    if (recentAttempts.length >= 10) return res.status(429).json({ error: 'AI Generation limit reached (10 per hour). Please try again later.' });
    recentAttempts.push(now);
    generateAttempts.set(identifier, recentAttempts);
    next();
}

// ── ROOT ROUTE (HOMEPAGE FIRST) ──
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Add global retry logic for 503 Service Unavailable errors
const originalGetModel = genAI.getGenerativeModel.bind(genAI);
genAI.getGenerativeModel = function(options) {
    const model = originalGetModel(options);
    const originalGenerate = model.generateContent.bind(model);
    model.generateContent = async function(prompt, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                return await originalGenerate(prompt);
            } catch (err) {
                if (i === retries - 1 || !err.message.includes('503')) throw err;
                console.warn(`[Gemini API] 503 error, retrying in ${1500 * (i + 1)}ms...`);
                await new Promise(r => setTimeout(r, 1500 * (i + 1)));
            }
        }
    };
    return model;
};

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ── Auth Middleware ──
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// ── Auth Endpoints ──
app.post('/api/auth/register', rateLimit, async (req, res) => {
    let { name, email, password, role, subject1, subject2 } = req.body;
    email = email.toLowerCase();
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'User exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`[AUTH] New Registration Attempt: ${email} (OTP: ${otp})`);

        const newUser = new User({ 
            name, 
            email, 
            password: hashedPassword, 
            otp, 
            role: role || 'teacher',
            subject1: subject1 || '',
            subject2: subject2 || '',
            subjects: (subject1 && subject2) ? `${subject1}, ${subject2}` : (subject1 || subject2 || '')
        });
        await newUser.save();

        transporter.sendMail({
            from: `"Pedagogy" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Verify your Pedagogy Account',
            text: `Your OTP is: ${otp}`
        }).catch(err => console.error("Email error:", err));

        res.json({ message: 'OTP sent', debugOtp: otp });
    } catch (err) { res.status(500).json({ error: 'Registration error: ' + err.message }); }
});

app.post('/api/auth/verify', async (req, res) => {
    let { email, otp } = req.body;
    email = email.toLowerCase();
    try {
        const user = await User.findOne({ email, otp });
        if (!user) return res.status(400).json({ error: 'Invalid OTP' });

        user.isVerified = true;
        user.otp = null;
        await user.save();

        const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, email, name: user.name, role: user.role || 'teacher' });
    } catch (err) { res.status(500).json({ error: 'Verification error' }); }
});

app.post('/api/auth/login', rateLimit, async (req, res) => {
    let { email, password, role } = req.body;
    email = email.toLowerCase();
    try {
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            console.warn(`[AUTH] Failed login attempt for: ${email}`);
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Distinct portal boundary validation
        const userRole = user.role || 'teacher';
        if (role && userRole !== role) {
            const prettyRole = role === 'teacher' ? 'Facilitator' : 'Parent';
            const otherRole = userRole === 'teacher' ? 'Facilitator' : 'Parent';
            return res.status(400).json({
                error: `This account is registered as a ${otherRole}. Please switch to the ${otherRole} Portal to log in.`
            });
        }

        if (!user.isVerified) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            user.otp = otp;
            await user.save();

            transporter.sendMail({
                from: `"Pedagogy" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Verify your Pedagogy Account',
                text: `Your new OTP is: ${otp}`
            }).catch(err => console.error("Email error:", err));

            return res.status(400).json({
                error: 'Please verify email',
                needsVerify: true,
                debugOtp: otp
            });
        }

        const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, email, name: user.name, role: user.role || 'teacher' });
    } catch (err) { res.status(500).json({ error: 'Login error' }); }
});

// ── Forgot Password ──
app.post('/api/auth/forgot', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'User not found' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetOtp = otp;
        user.resetExpiry = Date.now() + 900000; // 15 mins
        await user.save();

        transporter.sendMail({
            from: `"Pedagogy" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Pedagogy Password Reset',
            text: `Your reset code is: ${otp}`
        }).catch(err => console.error("Email error:", err));

        res.json({ message: 'Reset code sent', debugOtp: otp });
    } catch (err) { res.status(500).json({ error: 'Mail error' }); }
});

app.post('/api/auth/reset', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const user = await User.findOne({ email, resetOtp: otp, resetExpiry: { $gt: Date.now() } });
        if (!user) return res.status(400).json({ error: 'Invalid or expired code' });

        user.password = await bcrypt.hash(newPassword, 10);
        user.resetOtp = null;
        user.resetExpiry = null;
        await user.save();
        res.json({ message: 'Password updated' });
    } catch (err) { res.status(500).json({ error: 'Reset error' }); }
});

// ── AI Suggestions ──
app.post('/api/suggest', authenticateToken, async (req, res) => {
    let { field, grade, subject, strand, term, extraInstructions } = req.body;
    const email = req.user.email.toLowerCase();

    const user = await User.findOne({ email });
    const activeWs = req.body.activeWorkspace;
    const wsText = activeWs == 2 ? (user && (user.curriculumText2 || user.curriculumText)) : (user && (user.curriculumText1 || user.curriculumText));
    const curriculumContext = wsText ? `\n\nOFFICIAL CURRICULUM CONTEXT (Use strictly):\n${wsText}` : '';

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompts = {
        subject: `Suggest a KICD-compliant learning area (subject) for ${grade} in Kenya strictly aligned with the KICD syllabus. Return only the name.`,
        strand: `For ${grade} ${subject} Term ${term} strictly following the KICD CBC syllabus in Kenya, suggest 1 appropriate main strand. Return only the name.`,
        outcomes: `For ${grade} ${subject} Term ${term} strictly following the KICD CBC syllabus in Kenya, write 4 Specific Learning Outcomes starting with action verbs. Return as numbered list.`,
        inquiry: `For ${grade} ${subject} Term ${term} strictly following the KICD CBC syllabus in Kenya, write 3 Key Inquiry Questions. Return as numbered list.`,
        topic: `For ${grade} ${subject} Term ${term} strictly following the KICD CBC syllabus in Kenya, list 5 common topics/sub-strands. Return only names, one per line.`,
        criteria: `For assessing ${grade} ${subject} (topic: ${strand}) strictly according to KICD CBC standards in Kenya, list 4 assessment criteria for a rubric. Return only criteria names, one per line.`,
        anecdotal: `Suggest 3 possible learning behaviors or breakthrough observations to watch for in ${grade} ${subject} while teaching "${strand}" based on KICD CBC.`,
        resources: `Suggest 5 essential learning resources needed for a project on "${strand}" for ${grade} ${subject} in a Kenyan school setting based on KICD CBC.`,
        'lp-outcomes': `For ${grade} ${subject} on Strand: ${strand}, Term ${term} strictly following the KICD CBC syllabus in Kenya, write 3-4 specific learning outcomes starting with action verbs (Bloom's taxonomy).`,
        'lp-competencies': `Suggest KICD Core Competencies (e.g., Communication, Critical Thinking, Creativity) and Values (e.g., Respect, Love, Unity) to be developed for ${grade} ${subject} on Strand: ${strand}.`,
        'lp-extended': `Suggest 2 creative extended activities or homework ideas for ${grade} ${subject} on Strand: ${strand} aligned with the KICD CBC framework.`
    };
    if (field === 'strands') {
        prompts.strands = `For ${grade} ${subject} Term ${term} strictly following the KICD CBC syllabus in Kenya, list ALL the main strands (learning areas) for this term. Return as a plain list, one per line. No extra text.`;
    }
    if (!prompts[field]) return res.status(400).json({ error: 'Unknown field' });

    let finalPrompt = prompts[field];
    if (extraInstructions) {
        finalPrompt += `\n\nExtra Instructions: ${extraInstructions}`;
    }
    finalPrompt += curriculumContext;

    try {
        const result = await model.generateContent(finalPrompt);
        res.json({ suggestion: result.response.text().trim() });
    } catch (err) {
        console.error("Suggest error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── DOCX Export ──
app.post('/api/docx', authenticateToken, async (req, res) => {
    try {
        const { html } = req.body;
        let cleanHtml = html || '';

        // 1. Remove markdown fences if any slipped through
        cleanHtml = cleanHtml.replace(/```[a-zA-Z]*\n?/g, '');

        // 2. Remove script, style, comments, and xml instructions
        cleanHtml = cleanHtml.replace(/<(style|script|xml|meta|link)[^>]*>[\s\S]*?<\/\1>/gi, '');
        cleanHtml = cleanHtml.replace(/<!--[\s\S]*?-->/g, '');
        cleanHtml = cleanHtml.replace(/<\?[\s\S]*?\?>/g, '');
        cleanHtml = cleanHtml.replace(/<![\s\S]*?>/g, '');

        // 3. Flatten namespaces in tags (e.g., <w:sdt> -> <sdt>)
        cleanHtml = cleanHtml.replace(/<\/?[a-zA-Z0-9-]+:([a-zA-Z0-9-]+)/g, (m, p1) => m.startsWith('</') ? `</${p1}` : `<${p1}`);

        // 4. ULTIMATE ATTRIBUTE SANITIZER: Strip ALL attributes EXCEPT style, colspan, rowspan, width
        cleanHtml = cleanHtml.replace(/<([a-zA-Z0-9]+)([^>]*)>/g, (match, tag, attrs) => {
            let keep = '';
            let mStyle = attrs.match(/style=["']([^"']*)["']/i);
            if (mStyle) {
                // BUGFIX: html-to-docx v1.8.0 crashes with 'Invalid XML name: @w' when encountering width percentages in inline styles on certain elements (like td).
                let safeStyle = mStyle[1].replace(/width\s*:\s*\d+%\s*;?/gi, '');
                keep += ` style="${safeStyle}"`;
            }

            let mCol = attrs.match(/colspan=["']([^"']*)["']/i);
            if (mCol) keep += ` colspan="${mCol[1]}"`;

            let mRow = attrs.match(/rowspan=["']([^"']*)["']/i);
            if (mRow) keep += ` rowspan="${mRow[1]}"`;

            let mWidth = attrs.match(/width=["']([^"']*)["']/i);
            if (mWidth) keep += ` width="${mWidth[1]}"`;

            return `<${tag}${keep}>`;
        });

        const buffer = await htmlToDocx(cleanHtml, null, {
            margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
    } catch (err) {
        console.error("DOCX Error:", err);
        res.status(500).json({ error: 'DOCX failed: ' + err.message });
    }
});

// ── Profile Endpoints ──
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email });
        res.json({ 
            name: user.profileTeacher || user.name, 
            school: user.profileSchool || '', 
            subjects: user.subjects || '',
            subject1: user.subject1 || '',
            subject2: user.subject2 || '',
            role: user.role || 'teacher',
            profilePicture: user.profilePicture || '',
            curriculumText1: user.curriculumText1 || '',
            curriculumText2: user.curriculumText2 || '',
            curriculumSubject1: user.curriculumSubject1 || '',
            curriculumGrade1: user.curriculumGrade1 || '',
            curriculumSubject2: user.curriculumSubject2 || '',
            curriculumGrade2: user.curriculumGrade2 || ''
        });
    } catch (err) { res.status(500).json({ error: 'Profile load error' }); }
});

app.post('/api/profile', authenticateToken, async (req, res) => {
    const { name, school, subjects, profilePicture } = req.body;
    try {
        const subList = (subjects || '').split(',').map(s => s.trim()).filter(s => s);
        const subject1 = subList[0] || '';
        const subject2 = subList[1] || '';
        
        const updateData = { 
            profileTeacher: name, 
            profileSchool: school, 
            subjects: (subject1 && subject2) ? `${subject1}, ${subject2}` : (subject1 || subject2 || ''),
            subject1,
            subject2
        };

        // Only update picture if one was provided
        if (profilePicture) {
            updateData.profilePicture = profilePicture;
        }
        
        await User.findOneAndUpdate({ email: req.user.email }, updateData);
        res.json({ message: 'Profile updated' });
    } catch (err) { res.status(500).json({ error: 'Profile save error' }); }
});

app.post('/api/profile/curriculum', authenticateToken, upload.single('curriculum'), async (req, res) => {
    try {
        console.log(`[UPLOAD] Uploading curriculum file: ${req.file ? req.file.originalname : 'no file'}`);
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        let text = '';
        const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');

        if (isPdf) {
            const dataBuffer = fs.readFileSync(req.file.path);
            const data = await pdfParse(dataBuffer);
            text = data.text;
        } else {
            text = fs.readFileSync(req.file.path, 'utf8');
        }

        fs.unlinkSync(req.file.path);

        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'The uploaded file does not contain readable text. Please upload a digital PDF (not scanned) or a TXT document.' });
        }

        const workspace = req.body.workspace === '2' ? 2 : 1;
        const fieldName = workspace === 2 ? 'curriculumText2' : 'curriculumText1';
        const subjectFieldName = workspace === 2 ? 'curriculumSubject2' : 'curriculumSubject1';
        const gradeFieldName = workspace === 2 ? 'curriculumGrade2' : 'curriculumGrade1';

        // 1. Auto-extract Subject Name and Grade Level from cover page (first 5,000 characters)
        let extractedSubject = '';
        let extractedGrade = '';
        try {
            const metaModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const metaPrompt = `Analyze the cover page text of this KICD curriculum design and extract:
1. The exact Subject Name (Learning Area)
2. The Grade Level (e.g. Grade 7, Grade 8, Grade 10, PP1, PP2, Grade 1, etc.)

Format your response as a simple JSON object:
{
  "subject": "Subject Name",
  "grade": "Grade X"
}
Do not use markdown formatting, backticks or extra text, just raw JSON.

Text:
${text.substring(0, 5000)}`;

            const metaResult = await metaModel.generateContent(metaPrompt);
            const metaText = metaResult.response.text().replace(/```json/gi, '').replace(/```/gi, '').trim();
            const metaJson = JSON.parse(metaText);
            extractedSubject = metaJson.subject || '';
            extractedGrade = metaJson.grade || '';
        } catch (metaErr) {
            console.warn("Failed to extract metadata via AI:", metaErr.message);
            // Fallback: simple regex matching from text
            const firstLines = text.substring(0, 2000);
            const gradeMatch = firstLines.match(/(Grade\s+\d+|PP1|PP2)/i);
            if (gradeMatch) extractedGrade = gradeMatch[1];
        }

        // AI-Powered CBC Extractor: Slice a larger chunk to capture strands and outcomes deeper in the document
        let curriculumText = '';
        try {
            const sampleText = text.substring(0, 100000); // Slice up to 100k characters for Gemini to process
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const prompt = `You are a professional KICD CBC data extractor. Below is the raw text from an official Kenyan KICD Curriculum Design PDF. 
Analyze the text and extract ONLY the actual syllabus learning content. Specifically, identify and list:
1. The Subject Name and Grade level
2. The main Strands and their Sub-strands
3. The Specific Learning Outcomes (SLOs) and Suggested Learning Experiences for each sub-strand
4. The core competencies, values, and Pertinent & Contemporary Issues (PCIs) to be integrated.

CRITICAL: Completely ignore and omit all copyright notices, ISBNs, publisher pages, table of contents, general introductory remarks, prefaces, acknowledgements, and blank lines.
Provide a clean, beautifully structured, and highly detailed outline.

Raw PDF Text Snippet:
${sampleText}`;

            const genResult = await model.generateContent(prompt);
            curriculumText = genResult.response.text().trim();
        } catch (genErr) {
            console.warn("AI curriculum extraction failed, using raw fallback:", genErr.message);
            // Fallback: Use the first 8000 characters of raw text if AI fails
            curriculumText = text.substring(0, 8000);
        }

        // Save workspace-specific AND the legacy fields
        await User.findOneAndUpdate({ email: req.user.email }, {
            [fieldName]: curriculumText,
            curriculumText: curriculumText,
            [subjectFieldName]: extractedSubject,
            [gradeFieldName]: extractedGrade
        });

        res.json({
            message: 'Curriculum processed and saved',
            workspace,
            subject: extractedSubject,
            grade: extractedGrade,
            preview: curriculumText.substring(0, 800)
        });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        console.error("Curriculum upload error:", err);
        res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
});

// ── Storage Management Endpoints ──
const MAX_STORAGE_MB = 50;

app.get('/api/storage/usage', authenticateToken, async (req, res) => {
    try {
        const portfolios = await Portfolio.find({ userEmail: req.user.email });
        const planner = await WeeklyPlan.findOne({ userEmail: req.user.email });

        // Estimate size in bytes
        let totalBytes = JSON.stringify(portfolios).length + (planner ? JSON.stringify(planner).length : 0);
        const usageMB = (totalBytes / (1024 * 1024)).toFixed(2);

        res.json({
            usedMB: parseFloat(usageMB),
            totalMB: MAX_STORAGE_MB,
            percent: Math.min(((usageMB / MAX_STORAGE_MB) * 100).toFixed(1), 100)
        });
    } catch (err) { res.status(500).json({ error: 'Storage calculation failed' }); }
});

// ── Teacher Community Chat (Multi-Channel) ──
app.get('/api/chat/:channel', authenticateToken, async (req, res) => {
    const channel = req.params.channel || 'staff';
    try {
        // Secure staff channel: only teachers/facilitators can access
        if (channel === 'staff') {
            const user = await User.findOne({ email: req.user.email });
            if (!user || (user.role || 'teacher') !== 'teacher') {
                return res.status(403).json({ error: 'Access denied: Staff room is for facilitators only' });
            }
        }
        const messages = await ChatMessage.find({ channel }).sort({ timestamp: -1 }).limit(50);
        res.json(messages.reverse());
    } catch (err) { res.status(500).json({ error: 'Chat load error' }); }
});

// Legacy POST (kept for backward compat)
app.post('/api/chat', authenticateToken, async (req, res) => {
    const { text, channel } = req.body;
    if (!text) return res.status(400).json({ error: 'Message required' });
    try {
        const chan = channel || 'staff';
        const user = await User.findOne({ email: req.user.email });
        if (chan === 'staff' && (!user || (user.role || 'teacher') !== 'teacher')) {
            return res.status(403).json({ error: 'Access denied: Staff room is for facilitators only' });
        }
        const displayName = (user && user.profileTeacher) || req.user.email.split('@')[0];
        const newMessage = new ChatMessage({
            sender: req.user.email,
            senderName: displayName,
            text,
            channel: chan,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        await newMessage.save();
        res.json(newMessage);
    } catch (err) { res.status(500).json({ error: 'Chat send error' }); }
});

// ── Parent Integration: Share Portfolio ──
app.post('/api/share-portfolio', authenticateToken, async (req, res) => {
    const { parentEmail, studentName, projectTitle, portfolioHtml, recordId } = req.body;
    if (!parentEmail) return res.status(400).json({ error: 'Parent email required' });

    try {
        // If we have a recordId, update the portfolio in DB to include the parentEmail
        if (recordId) {
            await Portfolio.findOneAndUpdate({ _id: recordId }, { sharedWith: parentEmail.toLowerCase() });
        }

        transporter.sendMail({
            from: `"Pedagogy Portfolio" <${process.env.EMAIL_USER}>`,
            to: parentEmail,
            subject: `CBC Progress Update: ${studentName}`,
            html: `
                <div style="font-family:sans-serif; max-width:600px; margin:auto; border:1px solid #eee; padding:30px; border-radius:12px;">
                    <h2 style="color:#7c6bff;">Pedagogy Learner Update</h2>
                    <p>Hello, here is a project update for <strong>${studentName}</strong> regarding the project: <strong>"${projectTitle}"</strong>.</p>
                    <p>You can also view this and other records in your <a href="${process.env.APP_URL || 'http://localhost:3000'}/login.html">Parent Portal</a>.</p>
                    <hr style="border:none; border-top:1px solid #eee; margin:20px 0;"/>
                    <div style="background:#f9f9ff; padding:20px; border-radius:8px;">
                        ${portfolioHtml}
                    </div>
                    <h2 style="font-family:sans-serif; color:#7c6bff; margin-top:30px;">PEDAGOGY</h2>
                    <p style="color:#8080a0; font-size:14px;">The Heart of Modern CBC</p>
                </div>
            `
        }).catch(err => console.error("Email error:", err));
        res.json({ message: 'Portfolio shared with parent successfully!' });
    } catch (err) { res.status(500).json({ error: 'Failed to share: ' + err.message }); }
});

// ── Uptime Ping Endpoint ──
app.get('/api/ping', (req, res) => {
    res.json({ status: 'alive', timestamp: Date.now() });
});

// ── Real‑time Chat with Socket.io ──
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ── Online Presence Tracking ──
const onlineUsers = new Map(); // socketId -> { email, name }

function getOnlineCount() {
    const uniqueEmails = new Set();
    onlineUsers.forEach(u => uniqueEmails.add(u.email));
    return uniqueEmails.size;
}

function broadcastOnlineCount() {
    io.emit('onlineCount', getOnlineCount());
}

// Broadcast new messages to appropriate channel
io.on('connection', socket => {
    console.log(`🛰️  New client connected: ${socket.id}`);

    // Client identifies themselves
    socket.on('identify', ({ email, name }) => {
        onlineUsers.set(socket.id, { email: email || 'anonymous', name: name || 'User' });
        broadcastOnlineCount();
    });

    // Client joins a named room (channel)
    socket.on('joinChannel', (channel) => {
        Object.keys(socket.rooms).forEach(room => {
            if (room !== socket.id) socket.leave(room);
        });
        socket.join(channel);
        console.log(`📡 ${socket.id} joined channel: ${channel}`);
    });

    // Legacy: allow direct sendMessage via socket
    socket.on('sendMessage', async ({ channel, text, sender, senderName }) => {
        try {
            const newMsg = new ChatMessage({ sender, senderName: senderName || sender, text, channel, time: new Date().toLocaleTimeString() });
            await newMsg.save();
            io.emit(`chat:${channel}`, newMsg);
        } catch (err) {
            console.error('❌ Chat save error', err);
        }
    });

    socket.on('disconnect', () => {
        onlineUsers.delete(socket.id);
        broadcastOnlineCount();
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// ── Online count API ──
app.get('/api/chat/online/count', (req, res) => {
    res.json({ count: getOnlineCount() });
});

// ── Automated CBC News Bot (Twice Daily: 8AM & 6PM EAT) ──
let lastBotHour = -1;
setInterval(async () => {
    try {
        const now = new Date();
        // EAT = UTC+3
        const eatHour = (now.getUTCHours() + 3) % 24;
        const eatMinute = now.getUTCMinutes();

        // Fire at 8:00 AM or 6:00 PM EAT (within first 5 minutes of the hour)
        const isScheduledTime = (eatHour === 8 || eatHour === 18) && eatMinute < 5;
        if (!isScheduledTime || lastBotHour === eatHour) return;
        lastBotHour = eatHour;

        // Prevent duplicates on server restart by checking database
        const oneHourAgo = Date.now() - 3600000;
        const recentBotMsgs = await ChatMessage.find({ sender: 'CBC News Bot 🤖' });
        const hasRecentBotMsg = recentBotMsgs.some(m => m.timestamp >= oneHourAgo);
        if (hasRecentBotMsg) {
            console.log("🤖 CBC News Bot: Message already posted recently. Skipping duplicate.");
            return;
        }

        let quote = '';
        const period = eatHour === 8 ? 'morning' : 'evening';
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const prompt = `You are the Pedagogy CBC News Bot for Kenyan teachers. Generate ONE ${period} message for facilitators. Alternate randomly between these types:
- An inspiring motivational quote about teaching and education (attribute to a famous educator, philosopher, or leader)
- A practical CBC tip about competency-based curriculum implementation in Kenya
- A fun fact about education or child development
- An encouraging reminder about teacher self-care and wellbeing
- A creative classroom activity idea aligned with KICD CBC

Make it diverse, heartfelt, and ${period === 'morning' ? 'energizing to start the day' : 'reflective to close the day'}. Keep it under 180 characters. Do NOT use markdown. Output ONLY the message text, nothing else.`;
            const result = await model.generateContent(prompt);
            quote = result.response.text().trim();
        } catch (aiErr) {
            // Fallback quotes if AI fails
            const fallbacks = [
                "🌅 'The art of teaching is the art of assisting discovery.' — Mark Van Doren. Have a wonderful day, Mwalimu!",
                "🌟 CBC Tip: Let learners lead discussions today. Their curiosity is your greatest teaching tool!",
                "💪 You are shaping Kenya's future, one competency at a time. Keep going, Mwalimu!",
                "🌙 Reflect on today's wins — every 'aha!' moment you created matters. Rest well, Mwalimu!",
                "📚 Remember: Assessment is not just testing — it's understanding every learner's unique journey."
            ];
            quote = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }

        const emoji = eatHour === 8 ? '🌅' : '🌙';
        const prefix = eatHour === 8 ? 'Good Morning, Mwalimu!' : 'Good Evening, Mwalimu!';
        const fullText = quote.startsWith(emoji) || quote.startsWith('🌅') || quote.startsWith('🌙') || quote.startsWith('💪') || quote.startsWith('🌟') || quote.startsWith('📚')
            ? quote
            : `${emoji} ${prefix} ${quote}`;

        const newMsg = new ChatMessage({
            sender: 'CBC News Bot 🤖',
            senderName: 'CBC News Bot 🤖',
            text: fullText,
            channel: 'staff',
            time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        await newMsg.save();
        io.emit('chat:staff', newMsg);
        console.log(`🤖 CBC News Bot posted ${period} message`);
    } catch (err) {
        console.error('Bot error:', err.message);
    }
}, 60000); // Check every minute

// ── Chat API (Primary REST endpoints) ──
app.get('/api/chat/:channel', authenticateToken, async (req, res) => {
    const { channel } = req.params;
    try {
        const msgs = await ChatMessage.find({ channel })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();
        res.json(msgs.reverse());
    } catch (err) {
        res.status(500).json({ error: 'Failed to load chat' });
    }
});

// Post a new message (primary path - REST posts, socket broadcasts)
app.post('/api/chat/:channel', authenticateToken, async (req, res) => {
    const { channel } = req.params;
    const { text } = req.body;
    const senderEmail = req.user.email;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
    try {
        // Look up sender's display name
        const user = await User.findOne({ email: senderEmail });
        const displayName = (user && user.profileTeacher) || senderEmail.split('@')[0];
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const newMsg = new ChatMessage({ sender: senderEmail, senderName: displayName, text: text.trim(), channel, time });
        await newMsg.save();
        // Broadcast to ALL connected sockets
        io.emit(`chat:${channel}`, newMsg);
        res.json(newMsg);
    } catch (err) {
        console.error('Chat POST error:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ── Learner Progress API ──
app.get('/api/progress', authenticateToken, async (req, res) => {
    try {
        const records = await LearnerProgress.find({ teacherEmail: req.user.email });
        res.json(records);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch progress records' }); }
});

app.post('/api/progress', authenticateToken, async (req, res) => {
    const { term, sharedWith, studentsData, studentName, mathScore, englishScore, scienceScore, rubric, remarks } = req.body;
    try {
        const newRecord = new LearnerProgress({
            teacherEmail: req.user.email, term, sharedWith, studentsData,
            studentName, mathScore, englishScore, scienceScore, rubric, remarks // legacy fallback
        });
        await newRecord.save();
        res.json({ message: 'Progress saved', record: newRecord });
    } catch (err) { res.status(500).json({ error: 'Failed to save progress' }); }
});

app.get('/api/parent/progress', authenticateToken, async (req, res) => {
    try {
        const records = await LearnerProgress.find({ sharedWith: req.user.email });
        res.json(records);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch shared progress records' }); }
});

// Start server with Socket.io
server.listen(process.env.PORT || 3000, () => {
    console.log('🚀 Server with Socket.io listening on port', process.env.PORT || 3000);
});
app.post('/api/sow', authenticateToken, async (req, res) => {
    const { title, grade, subject, term, strands, html } = req.body;
    if (!title || !grade || !subject || !term || !strands || !html) {
        return res.status(400).json({ error: 'All fields are required to save SOW' });
    }
    try {
        const newSow = new SavedSOW({
            userEmail: req.user.email,
            title, grade, subject, term, strands, html
        });
        await newSow.save();
        res.json(newSow);
    } catch (err) { res.status(500).json({ error: 'Failed to save Scheme of Work' }); }
});

app.get('/api/sow', authenticateToken, async (req, res) => {
    try {
        const sows = await SavedSOW.find({ userEmail: req.user.email });
        res.json(sows.reverse());
    } catch (err) { res.status(500).json({ error: 'Failed to fetch saved Schemes of Work' }); }
});

// Clear entire SOW library — must be before /:id route so 'all' isn't matched as an ID
app.delete('/api/sow/all', authenticateToken, async (req, res) => {
    try {
        if (typeof SavedSOW.deleteMany === 'function') {
            await SavedSOW.deleteMany({ userEmail: req.user.email });
        } else {
            const all = await SavedSOW.find({ userEmail: req.user.email });
            for (const s of all) await SavedSOW.findOneAndDelete({ _id: s._id });
        }
        res.json({ success: true, message: 'Library cleared' });
    } catch (err) { res.status(500).json({ error: 'Failed to clear library' }); }
});

app.delete('/api/sow/:id', authenticateToken, async (req, res) => {
    try {
        const deleted = await SavedSOW.findOneAndDelete({ _id: req.params.id, userEmail: req.user.email });
        if (!deleted) return res.status(404).json({ error: 'Scheme of Work not found' });
        res.json({ success: true, message: 'Scheme of Work deleted successfully' });
    } catch (err) { res.status(500).json({ error: 'Failed to delete Scheme of Work' }); }
});

// ── Parent Dashboard Endpoints ──
app.get('/api/parent/records', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'parent') return res.status(403).json({ error: 'Access denied' });
        // Fetch both portfolios and generic records shared with this parent
        const portfolios = await Portfolio.find({ sharedWith: req.user.email.toLowerCase() });
        res.json(portfolios);
    } catch (err) { res.status(500).json({ error: 'Failed to load records' }); }
});

// Generic endpoint to push any observation/assessment to a parent
app.post('/api/parent/push-record', authenticateToken, async (req, res) => {
    const { parentEmail, studentName, title, content, type } = req.body;
    try {
        const newRecord = new Portfolio({
            userEmail: req.user.email,
            sharedWith: parentEmail.toLowerCase(),
            studentName,
            projectTitle: title,
            description: content,
            type: type || 'observation',
            timestamp: Date.now()
        });
        await newRecord.save();

        // Optional: Send email notification too
        transporter.sendMail({
            from: `"Pedagogy" <${process.env.EMAIL_USER}>`,
            to: parentEmail,
            subject: `New CBC Record for ${studentName}: ${title}`,
            html: `<h3>New Record Shared</h3><p>Your child's facilitator has shared a new record: <strong>${title}</strong></p><p>View it now in your <a href="${process.env.APP_URL || 'http://localhost:3000'}/login.html">Parent Portal</a>.</p>`
        }).catch(e => console.error("Email failed:", e));

        res.json({ message: 'Record pushed to parent dashboard!' });
    } catch (err) { res.status(500).json({ error: 'Push failed' }); }
});


// ── Portfolio Endpoints ──
app.get('/api/portfolio', authenticateToken, async (req, res) => {
    try {
        const items = await Portfolio.find({ userEmail: req.user.email }).sort({ timestamp: -1 });
        res.json(items);
    } catch (err) { res.status(500).json({ error: 'Failed to load portfolio' }); }
});

// Helper to save Base64 image to local uploads directory
function saveBase64Image(base64Str) {
    if (!base64Str || !base64Str.startsWith('data:image/')) return base64Str;
    try {
        const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return base64Str;

        const ext = matches[1].split('/')[1] || 'png';
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `img_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
        const filePath = path.join(__dirname, 'uploads', filename);

        // Ensure uploads directory exists
        if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
            fs.mkdirSync(path.join(__dirname, 'uploads'));
        }

        fs.writeFileSync(filePath, buffer);
        return `/uploads/${filename}`;
    } catch (e) {
        console.error("Base64 save error:", e);
        return base64Str;
    }
}

app.post('/api/portfolio', authenticateToken, async (req, res) => {
    const { studentName, projectTitle, description, photos } = req.body;
    try {
        // Save Base64 photos locally to save database storage quota space!
        const savedPhotos = (photos || []).map(p => saveBase64Image(p));

        // Quota check
        const portfolios = await Portfolio.find({ userEmail: req.user.email });
        const planner = await WeeklyPlan.findOne({ userEmail: req.user.email });
        let totalBytes = JSON.stringify(portfolios).length + (planner ? JSON.stringify(planner).length : 0);
        if (totalBytes / (1024 * 1024) > MAX_STORAGE_MB) {
            return res.status(400).json({ error: 'Storage quota exceeded (50MB limit)' });
        }

        const newItem = new Portfolio({
            userEmail: req.user.email,
            studentName,
            projectTitle,
            description,
            photos: savedPhotos
        });
        await newItem.save();
        res.json(newItem);
    } catch (err) { res.status(500).json({ error: 'Failed to save portfolio item' }); }
});

app.delete('/api/portfolio/:id', authenticateToken, async (req, res) => {
    try {
        await Portfolio.findOneAndDelete({ _id: req.params.id, userEmail: req.user.email });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});

// ── Weekly Planner Endpoints ──
app.get('/api/planner', authenticateToken, async (req, res) => {
    try {
        const plan = await WeeklyPlan.findOne({ userEmail: req.user.email });
        res.json(plan ? plan.data : {});
    } catch (err) { res.status(500).json({ error: 'Failed to load planner' }); }
});

app.post('/api/planner', authenticateToken, async (req, res) => {
    const { data } = req.body;
    try {
        let plan = await WeeklyPlan.findOne({ userEmail: req.user.email });
        if (plan) {
            plan.data = data;
        } else {
            plan = new WeeklyPlan({ userEmail: req.user.email, data });
        }
        await plan.save();
        res.json({ message: 'Saved' });
    } catch (err) { res.status(500).json({ error: 'Failed to save planner' }); }
});


// ── Generate Document (AI) ──
app.post('/api/generate', authenticateToken, generateRateLimit, async (req, res) => {
    let { documentType, grade, term, subject, strand, subStrand, learningOutcomes, competencies, extendedActivity, extraInstructions, teacherName, schoolName, isTemplate, projectTitle, projectOutcomes, projectTime, resources, previousProgress } = req.body;
    console.log(`[GENERATING] ${documentType} (Template: ${isTemplate}) for ${teacherName} at ${schoolName}`);
    try {
        const user = await User.findOne({ email: req.user.email });
        const activeWs = req.body.activeWorkspace;

        if (!grade && user) {
            grade = activeWs == 2 ? user.curriculumGrade2 : user.curriculumGrade1;
        }
        if (!subject && user) {
            subject = activeWs == 2 ? user.curriculumSubject2 : user.curriculumSubject1;
        }

        const wsText = activeWs == 2 ? (user && (user.curriculumText2 || user.curriculumText)) : (user && (user.curriculumText1 || user.curriculumText));
        const curriculumContext = wsText ? `\n\nOFFICIAL CURRICULUM CONTEXT (Strictly apply this to your generated content):\n${wsText}` : '';
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const TS = `width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;`;
        const TD = `border:1px solid #000;padding:8px;vertical-align:top;`;
        const TH = `border:1px solid #000;padding:9px;background:#f0f0f0;text-align:left;font-weight:bold;font-size:12px;`;
        const H4 = `font-size:14px;margin:20px 0 8px;text-transform:uppercase;border-bottom:1px solid #ccc;padding-bottom:4px;`;

        const displayTerm = term ? (term.toLowerCase().startsWith('term') ? term : 'Term ' + term) : 'Auto-Detected';
        const adminHeader = `<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:24px;font-family:Arial,sans-serif;">
${user && user.schoolLogo ? `<img src="${user.schoolLogo}" style="max-height:80px; margin-bottom:10px; display:block; margin-left:auto; margin-right:auto;">` : ''}
<p style="margin:4px 0;font-style:italic;font-size:13px;">Competency-Based Curriculum (CBC)</p>
<table style="${TS}margin-top:12px;"><tbody>
<tr><td style="${TD}" width="25%"><strong>Facilitator:</strong> ${teacherName || '________________'}</td><td style="${TD}" width="25%"><strong>Learning Area:</strong> ${subject || '________________'}</td><td style="${TD}" width="25%"><strong>Grade:</strong> ${grade || '________________'}</td><td style="${TD}" width="25%"><strong>Term:</strong> ${displayTerm}</td></tr>
<tr><td colspan="4" style="${TD}"><strong>Strand/Sub-strand:</strong> ${strand || '________________'}${subStrand ? ' / ' + subStrand : ''}</td></tr>
</tbody></table></div>`;

        const sigBlock = `<div style="margin-top:40px;border-top:1px solid #000;padding-top:16px;display:flex;justify-content:space-between;font-size:13px;">
<div><p>Facilitator's Signature: ___________________</p><p>Date: ___________________</p></div>
<div style="text-align:right;"><p>HOD / Headteacher's Stamp: ___________________</p><p>Date: ___________________</p></div>
</div>`;

        const NO_MD = `\nIMPORTANT: Output ONLY valid HTML. Do NOT use markdown formatting like ** or ||. Do NOT wrap output in \`\`\`html. Start directly with the first HTML element.`;

        // ── BLANK TEMPLATE ──
        if (isTemplate) {
            const hdrs = {
                sow: ['Week', 'Lesson', 'Strand', 'Sub-strand', 'Specific Learning Outcomes', 'Key Inquiry Questions', 'Core Competencies', 'Learning Resources', 'Assessment Method', 'Remarks'],
                plan: ['Phase', 'Facilitator Activity', 'Learner Activity', 'Time (mins)', 'Resources'],
                rubric: ['Assessment Criteria', 'Exceeding (EE)', 'Meeting (ME)', 'Approaching (AE)', 'Below (BE)'],
                checklist: ['No.', 'Learner Name', 'Learning Outcome', 'Observation', 'L', 'P', 'B', 'Date', 'Remarks']
            };
            const cols = hdrs[documentType] || ['Column 1', 'Column 2', 'Column 3'];
            const rows = Array(12).fill(0).map(() => `<tr>${cols.map(() => `<td style="${TD}height:32px;"></td>`).join('')}</tr>`).join('');
            const tbl = `<table style="${TS}"><thead><tr>${cols.map(c => `<th style="${TH}">${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
            return res.json({ html: `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;">${documentType.toUpperCase()} — BLANK TEMPLATE</h3>${tbl}${sigBlock}`, markdown: 'Template' });
        }

        let html = '';

        // ── SCHEME OF WORK ──
        if (documentType === 'sow') {
            let prompt = '';
            if (wsText) {
                prompt = `You are a strict KICD (Kenya Institute of Curriculum Development) CBC curriculum expert. Directly extract and strictly align this termly Scheme of Work (SOW) with the official KICD CBC syllabus designs, learning outcomes, and guidelines for:
Learning Area (Subject): ${subject} | Grade: ${grade} | Term: ${term || 'Auto-Detect (deduce the term from the strands in the curriculum context)'}
Target Strands / Sub-strands to include: ${strand}
${previousProgress ? `Teacher's Previous Progress (Start the SOW exactly where the teacher left off): ${previousProgress}` : ''}
Facilitator: ${teacherName}
${extraInstructions ? `Extra Instructions: ${extraInstructions}` : ''}

OFFICIAL CURRICULUM CONTEXT (Strictly apply this to your generated content):
${wsText}

Output ONE HTML <table> with these 10 columns:
Week | Lesson | Strand | Sub-strand | Specific Learning Outcomes | Key Inquiry Questions | Core Competencies, Values & PCIs | Learning Resources | Assessment Method | Remarks

Requirements:
- CRITICAL: DO NOT use AI generation or automation from scratch. You MUST perform a pure, accurate extraction strictly from the provided OFFICIAL CURRICULUM CONTEXT. Do not hallucinate or invent new content.
- Focus ONLY on the strands specified for this single Term (${term || 'automatically detected term'}). Do NOT generate for other terms.
- 12 weeks, at least 2 lessons per week (24+ rows).
- SLOs start with action verbs (identify, describe, demonstrate, compare) and focus on specific competencies.
- Week 7 = Mid-Term Review; Week 12 = End-Term Assessment.
- Resources: KICD-approved textbooks, charts, models, locally available materials.
- Assessment: Observation, Oral questions, Written exercise, Practical, Portfolio.
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            } else {
                prompt = `You are a strict KICD (Kenya Institute of Curriculum Development) CBC curriculum expert. Directly generate and align this termly Scheme of Work (SOW) with the official KICD CBC syllabus designs, learning outcomes, and guidelines for:
Learning Area (Subject): ${subject} | Grade: ${grade} | Term: ${term || 'Auto-Detect (deduce the term from the strands)'}
Target Strands / Sub-strands to include: ${strand}
${previousProgress ? `Teacher's Previous Progress (Start the SOW exactly where the teacher left off): ${previousProgress}` : ''}
Facilitator: ${teacherName}
${extraInstructions ? `Extra Instructions: ${extraInstructions}` : ''}

Output ONE HTML <table> with these 10 columns:
Week | Lesson | Strand | Sub-strand | Specific Learning Outcomes | Key Inquiry Questions | Core Competencies, Values & PCIs | Learning Resources | Assessment Method | Remarks

Requirements:
- Focus ONLY on the strands specified for this single Term (${term || 'automatically detected term'}). Do NOT generate for other terms.
- 12 weeks, at least 2 lessons per week (24+ rows).
- SLOs start with action verbs (identify, describe, demonstrate, compare) and focus on specific competencies.
- Week 7 = Mid-Term Review; Week 12 = End-Term Assessment.
- Resources: KICD-approved textbooks, charts, models, locally available materials.
- Assessment: Observation, Oral questions, Written exercise, Practical, Portfolio.
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            }

            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">SCHEME OF WORK — ${subject} | ${grade} | Term ${term}</h3>${raw}${sigBlock}`;
        }

        // ── LESSON PLAN ──
        else if (documentType === 'plan') {
            const { sowId, lessonNumber } = req.body;
            let sowContext = '';
            let targetGrade = grade;
            let targetTerm = term;
            let targetSubject = subject;
            let targetStrand = strand;
            let targetSubStrand = subStrand;

            if (sowId) {
                const sowObj = await SavedSOW.findOne({ _id: sowId, userEmail: req.user.email });
                if (sowObj) {
                    targetGrade = sowObj.grade;
                    targetTerm = sowObj.term;
                    targetSubject = sowObj.subject;
                    targetStrand = sowObj.strands;
                    
                    let extractedSLO = '________________';
                    let extractedKIQ = '________________';
                    let extractedCompetencies = '________________';
                    let extractedResources = '________________';
                    let extractedSubStrand = '________________';
                    
                    const rows = sowObj.html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
                    if (rows) {
                        for (let r of rows) {
                            const cells = r.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                            if (cells && cells.length >= 10) {
                                const rowLessonText = cells[1].replace(/<[^>]+>/g, '').trim();
                                if (rowLessonText === lessonNumber.toString() || rowLessonText.includes(` ${lessonNumber} `) || rowLessonText.includes(`Lesson ${lessonNumber}`)) {
                                    extractedSubStrand = cells[3].replace(/<td[^>]*>/i, '').replace(/<\/td>/i, '').trim() || '________________';
                                    extractedSLO = cells[4].replace(/<td[^>]*>/i, '').replace(/<\/td>/i, '').trim() || '________________';
                                    extractedKIQ = cells[5].replace(/<td[^>]*>/i, '').replace(/<\/td>/i, '').trim() || '________________';
                                    extractedCompetencies = cells[6].replace(/<td[^>]*>/i, '').replace(/<\/td>/i, '').trim() || '________________';
                                    extractedResources = cells[7].replace(/<td[^>]*>/i, '').replace(/<\/td>/i, '').trim() || '________________';
                                    break;
                                }
                            }
                        }
                    }

                    targetSubStrand = extractedSubStrand;
                    learningOutcomes = extractedSLO;
                    competencies = extractedCompetencies;
                    sowContext = `Key Inquiry Questions: ${extractedKIQ}\nLearning Resources: ${extractedResources}`;
                }
            }

            const prompt = `You are a strict KICD (Kenya Institute of Curriculum Development) CBC curriculum expert. Directly extract details for Lesson Number ${lessonNumber} and strictly align this Lesson Plan with the official KICD syllabus designs and guidelines for:
Grade: ${targetGrade} | Learning Area (Subject): ${targetSubject} | Term: ${targetTerm}
Strand: ${targetStrand}
${sowContext ? `SOW Context: ${sowContext}` : `Sub-strand: ${targetSubStrand || '________________'}`}
Facilitator: ${teacherName} | School: ${schoolName}

${learningOutcomes ? `SPECIFIC LEARNING OUTCOMES (Use these exact outcomes provided by the teacher): ${learningOutcomes}` : 'SPECIFIC LEARNING OUTCOMES: Generate 3-4 highly specific learning outcomes directly extracted from the official KICD syllabus or SOW row context starting with action verbs (Bloom\'s taxonomy).'}
${competencies ? `CORE COMPETENCIES & VALUES (Use these exact competencies provided by the teacher): ${competencies}` : 'CORE COMPETENCIES & VALUES: Generate 4 relevant competencies and values to be developed (e.g., Critical Thinking, Collaboration, Respect).'}
${extendedActivity ? `EXTENDED ACTIVITY / HOMEWORK (Use this exact activity provided by the teacher): ${extendedActivity}` : 'EXTENDED ACTIVITY / HOMEWORK: Suggest 1-2 creative extended activities or homework ideas relevant to the lesson.'}
${extraInstructions ? `Extra Instructions: ${extraInstructions}` : ''}${curriculumContext}

Output HTML only with these clearly labelled sections using <h4 style="${H4}">:

1. ADMINISTRATIVE DETAILS — <table> with: School, Grade, Learning Area, Strand, Sub-strand, Date (blank line), Time (blank), Duration (40 mins), No. of Learners (blank)

2. SPECIFIC LEARNING OUTCOMES — <ol> displaying the specific learning outcomes.

3. KEY INQUIRY QUESTIONS — <ol> with 2-3 open-ended questions directly related to this KICD sub-strand.

4. CORE COMPETENCIES & VALUES — <ul> displaying the core competencies and values.

5. PCIs — <ul> (Pertinent & Contemporary Issues relevant to topic).

6. LEARNING RESOURCES — <ul> (KICD-approved textbooks, charts, locally available materials).

7. LESSON DEVELOPMENT — <table> columns: Phase | Facilitator Activity | Learner Activity | Time (mins)
   Rows: 
   - Introduction (5 min) with KICD-compliant active learning activities.
   - Development—Core Activity (25 min) with KICD-compliant active learning activities.
   - Application/Practice (7 min) with KICD-compliant active learning activities.
   - Conclusion (3 min) — IMPORTANT: Both 'Facilitator Activity' and 'Learner Activity' cells MUST be left completely empty (just blank space or underscores) for the teacher to fill manually.

8. EXTENDED ACTIVITY — <p> displaying the extended activity or homework.

9. DIFFERENTIATED ACTIVITIES — <table> columns: Fast Learners | Slow Learners with KICD standard suggestions.

10. FACILITATOR'S REFLECTION — <table> columns: What went well? | What needs improvement? | Follow-up action? — IMPORTANT: All cells in this table MUST be left completely empty (blank space or underscores) so the teacher can fill them in manually.

Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">LESSON PLAN — ${targetSubject} | ${targetGrade} | Term ${targetTerm}</h3>${raw}${sigBlock}`;
        }

        // ── TEACHER'S GUIDE NOTES ──
        else if (documentType === 'notes') {
            const { sowId, lessonNumber } = req.body;
            let sowContext = '';
            let targetGrade = grade;
            let targetTerm = term;
            let targetSubject = subject;
            let targetStrand = strand;

            if (sowId) {
                const sowObj = await SavedSOW.findOne({ _id: sowId, userEmail: req.user.email });
                if (sowObj) {
                    targetGrade = sowObj.grade;
                    targetTerm = sowObj.term;
                    targetSubject = sowObj.subject;
                    targetStrand = sowObj.strands;
                    sowContext = `
SCHEME OF WORK REFERENCE (Strictly extract details for Lesson Number ${lessonNumber} from this Scheme of Work table):
${sowObj.html}
`;
                }
            }

            const prompt = `You are a strict KICD (Kenya Institute of Curriculum Development) CBC curriculum expert and facilitator. Write detailed, step-by-step Teacher's Guide / Instructional Guidance Notes for delivering Lesson Number ${lessonNumber} from the following Scheme of Work context:
Grade: ${targetGrade} | Subject: ${targetSubject} | Term: ${targetTerm}
Strand: ${targetStrand}
${sowContext ? `SOW Context: ${sowContext}` : ''}
Facilitator: ${teacherName} | School: ${schoolName}

${extraInstructions ? `Extra Instructions: ${extraInstructions}` : ''}${curriculumContext}

Requirements:
1. Deliver a comprehensive guide (Teacher's Guide Notes) containing:
   - Lesson Theme & Specific Learning Outcomes to focus on.
   - Step-by-Step Lesson Flow (Detailed facilitation guidance for Introduction, Core activity, and Conclusion phases).
   - Pedagogical cues & teaching methods (e.g., experiential learning, inquiry, group discussions).
   - Anticipated learner misconceptions/difficulties and how to handle them.
   - Assessment tips (formative assessment cues to monitor learning).
   - Inclusion & Differentiated support guidelines for diverse learners.

Output HTML only with these clearly labelled sections using <h4 style="${H4}">:
- LESSON DETAILS & OUTCOMES
- STEP-BY-STEP FACILITATION INSTRUCTIONS
- PEDAGOGICAL CUES & CLASSROOM MANAGEMENT
- MISCONCEPTIONS & CORRECTION STRATEGIES
- FORMATIVE ASSESSMENT CUES & REMARKS

Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">TEACHER'S GUIDE NOTES — Lesson ${lessonNumber} | ${targetSubject}</h3>${raw}${sigBlock}`;
        }

        // ── RUBRIC ──
        else if (documentType === 'rubric') {
            const prompt = `KICD CBC assessment specialist. Generate a complete Assessment Rubric strictly aligned with KICD standards for:
Grade: ${grade} | Learning Area: ${subject} | Topic: ${strand || subject}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}${curriculumContext}

Output ONE HTML <table> columns: Assessment Criteria | Exceeding (EE) | Meeting (ME) | Approaching (AE) | Below (BE)
- 5-6 criteria rows with specific observable descriptors per cell
- Final row: TOTAL SCORE | /[max] | | |
After table: <p><strong>Key:</strong> EE=4 | ME=3 | AE=2 | BE=1</p>
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">ASSESSMENT RUBRIC — ${subject} | ${grade}</h3>${raw}${sigBlock}`;
        }

        // ── CHECKLIST ──
        else if (documentType === 'checklist') {
            const prompt = `KICD CBC assessment specialist. Generate an Observation Checklist strictly aligned with KICD standards for:
Grade: ${grade} | Learning Area: ${subject} | Topic: ${strand || subject}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}${curriculumContext}

Output:
1. ONE HTML <table> columns: No. | Learner Name | Specific Learning Outcome | Observation Notes | L | P | B | Date | Remarks — with 20 blank rows
2. <p><strong>Key:</strong> L=Learnt &nbsp; P=Progressing &nbsp; B=Beginning</p>
3. Small summary <table>: Total Learners | Achieved Outcome | Need Support | Facilitator Action
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">OBSERVATION CHECKLIST — ${subject} | ${grade}</h3>${raw}${sigBlock}`;
        }

        // ── PROJECT GUIDE ──
        else if (documentType === 'project') {
            const prompt = `KICD CBC expert. Generate a complete CBC Project Guide strictly aligned with the KICD curriculum:
Title: ${projectTitle} | Grade: ${grade} | Learning Area: ${subject}
Duration: ${projectTime} | Facilitator: ${teacherName}
Outcomes: ${projectOutcomes} | Resources: ${resources || 'AI-suggested'}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}${curriculumContext}

Output HTML sections using <h4 style="${H4}"> headings:
1. PROJECT OVERVIEW — <table>: Title, Learning Area, Grade, Duration, Group Size, Term
2. RATIONALE — <p> (real-world Kenyan context, 2-3 sentences)
3. SPECIFIC LEARNING OUTCOMES — <ol> (action verbs, KICD-aligned)
4. CORE COMPETENCIES & VALUES — <table>: Competency | How It Is Developed
5. REQUIRED RESOURCES — <table>: Resource | Quantity | Where to Source (Kenya)
6. PROJECT PHASES — <table>: Phase | Activities | Facilitator's Role | Learner's Role | Duration
   (Preparation → Investigation → Design/Action → Presentation → Reflection)
7. ASSESSMENT RUBRIC — <table>: Criteria | EE | ME | AE | BE (3-4 project-specific criteria)
8. SAFETY GUIDELINES — <ul>
9. FACILITATOR'S REFLECTION — blank <table>: What worked | Improvements | Next steps
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            const hdr = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">PROJECT GUIDE: ${(projectTitle || '').toUpperCase()}</h3>`;
            return res.json({ html: `${hdr}${raw}${sigBlock}`, markdown: raw });
        }

        // ── PEER ASSESSMENT ──
        else if (documentType === 'peer') {
            const prompt = `KICD CBC assessment specialist. Peer Assessment Guide strictly aligned with KICD standards for:
Grade: ${grade} | Learning Area: ${subject} | Topic: ${strand || subject}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}${curriculumContext}
Output HTML sections (<h4 style="${H4}">):
1. PURPOSE — <p>
2. INSTRUCTIONS FOR LEARNERS — <ol> (how to assess a peer respectfully)
3. PEER CHECKLIST — <table>: Criteria | Yes | Partially | Not Yet | Comments (6-8 topic-specific criteria)
4. OPEN-ENDED FEEDBACK — <ul>: "One thing my peer did well...", "One suggestion I have...", "What I learnt from my peer..."
5. SCORE SUMMARY — <table>: Total Criteria | Achieved | Score /[max]
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">PEER ASSESSMENT GUIDE — ${subject} | ${grade}</h3>${raw}${sigBlock}`;
        }

        // ── ORAL QUESTIONING ──
        else if (documentType === 'oral') {
            const prompt = `KICD CBC assessment specialist. Oral Questioning Framework strictly aligned with KICD standards for:
Grade: ${grade} | Learning Area: ${subject} | Topic: ${strand || subject}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}${curriculumContext}
Output HTML sections (<h4 style="${H4}">):
1. PURPOSE — <p>
2. QUESTION BANK — <table>: Cognitive Level | Question | Expected Response | Assessment Focus
   (2 questions per Bloom's level: Remembering, Understanding, Applying, Analysing, Evaluating, Creating)
3. OBSERVATION RECORD — <table>: Learner Name | Question Asked | Response Quality (1-4) | Notes | Follow-up (10 blank rows)
4. RATING SCALE — <p>: 1=No response | 2=Partial | 3=Adequate | 4=Excellent
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">ORAL QUESTIONING FRAMEWORK — ${subject} | ${grade}</h3>${raw}${sigBlock}`;
        }

        // ── SELF-ASSESSMENT ──
        else if (documentType === 'self') {
            const prompt = `KICD CBC assessment specialist. Self-Assessment Journal strictly aligned with KICD standards for:
Grade: ${grade} | Learning Area: ${subject} | Topic: ${strand || subject}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}${curriculumContext}
Use learner-friendly language. Output HTML sections (<h4 style="${H4}">):
1. MY LEARNING GOALS — <table>: Goal | Did I achieve it? (Yes/Partly/Not Yet) | Evidence (4-5 goals)
2. HOW I LEARNT TODAY — <table>: Strategy | I used this ✓ | Comments (Group work, Observation, Research, Experiment, Drawing, Presentation)
3. MY REFLECTION — <table>: What I learnt | What I found challenging | How I will improve | One question I still have
4. MY EFFORT RATING — <p> with 5 stars: ★★★★★ (learner circles one) and a blank line for reason
5. FACILITATOR'S FEEDBACK — blank lined <table> for written feedback + signature line
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">SELF-ASSESSMENT JOURNAL — ${subject} | ${grade}</h3>${raw}${sigBlock}`;
        }

        // ── ANECDOTAL RECORD ──
        else if (documentType === 'anecdotal') {
            html = `${adminHeader}
<h3 style="text-align:center;font-size:15px;margin-bottom:20px;">ANECDOTAL RECORD</h3>
<table style="${TS}"><tbody>
<tr><td style="${TD}width:25%;"><strong>Learner Name:</strong></td><td style="${TD}">________________________________</td><td style="${TD}width:20%;"><strong>Adm. No.:</strong></td><td style="${TD}">____________</td></tr>
<tr><td style="${TD}"><strong>Date:</strong></td><td style="${TD}">________________________________</td><td style="${TD}"><strong>Time:</strong></td><td style="${TD}">____________</td></tr>
<tr><td style="${TD}"><strong>Context/Setting:</strong></td><td colspan="3" style="${TD}">________________________________</td></tr>
</tbody></table>
<div style="border:1px solid #000;min-height:110px;padding:10px;margin-bottom:14px;"><strong>Observation (Objective, factual description):</strong><br><br>________________________________________________________________________________<br><br>________________________________________________________________________________</div>
<div style="border:1px solid #000;min-height:90px;padding:10px;margin-bottom:14px;"><strong>Interpretation / Competency Demonstrated:</strong><br><br>________________________________________________________________________________</div>
<div style="border:1px solid #000;min-height:70px;padding:10px;margin-bottom:14px;"><strong>Follow-up Action / Support Needed:</strong><br><br>________________________________________________________________________________</div>
${sigBlock}`;
            return res.json({ html, markdown: 'Anecdotal Template' });
        }

        if (!html) return res.status(400).json({ error: `Unknown document type: ${documentType}` });
        res.json({ html, markdown: '' });
    } catch (error) {
        console.error('[GENERATE ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});


