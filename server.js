const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const htmlToDocx = require('html-to-docx');
require('dotenv').config();
const { User, ChatMessage, Portfolio, WeeklyPlan, connectDB } = require('./db');

connectDB();

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_cbc_key';

// ── ROOT ROUTE (HOMEPAGE FIRST) ──
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'User exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`[TESTING] OTP for ${email}: ${otp}`);
        
        const newUser = new User({ name, email, password: hashedPassword, otp });
        await newUser.save();

        transporter.sendMail({
            from: `"Pedagogy" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Verify your Pedagogy Account',
            text: `Your OTP is: ${otp}`
        }).catch(err => console.error("Email error:", err));
        res.json({ message: 'OTP sent' });
    } catch (err) { res.status(500).json({ error: 'Registration error: ' + err.message }); }
});

app.post('/api/auth/verify', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email, otp });
        if (!user) return res.status(400).json({ error: 'Invalid OTP' });

        user.isVerified = true;
        user.otp = null;
        await user.save();

        const token = jwt.sign({ email }, JWT_SECRET);
        res.json({ token, email, name: user.name });
    } catch (err) { res.status(500).json({ error: 'Verification error' }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: 'Invalid credentials' });
        if (!user.isVerified) return res.status(400).json({ error: 'Please verify email', needsVerify: true });

        const token = jwt.sign({ email }, JWT_SECRET);
        res.json({ token, email, name: user.name });
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
        res.json({ message: 'Reset code sent' });
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
    const { field, grade, subject, strand, term } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompts = {
        subject: `Suggest a KICD-compliant learning area (subject) for ${grade} in Kenya. Return only the name.`,
        strand: `For ${grade} ${subject} Term ${term} KICD CBC Kenya, suggest 1 appropriate main strand. Return only the name.`,
        outcomes: `For ${grade} ${subject} Term ${term} KICD CBC Kenya, write 4 Specific Learning Outcomes starting with action verbs. Return as numbered list.`,
        inquiry: `For ${grade} ${subject} Term ${term} KICD CBC Kenya, write 3 Key Inquiry Questions. Return as numbered list.`,
        topic: `For ${grade} ${subject} Term ${term} KICD CBC Kenya, list 5 common topics/sub-strands. Return only names, one per line.`,
        criteria: `For assessing ${grade} ${subject} (topic: ${strand}) in KICD CBC Kenya, list 4 assessment criteria for a rubric. Return only criteria names, one per line.`,
        anecdotal: `Suggest 3 possible learning behaviors or breakthrough observations to watch for in ${grade} ${subject} while teaching "${strand}".`,
        resources: `Suggest 5 essential learning resources needed for a project on "${strand}" for ${grade} ${subject} in a Kenyan school setting.`
    };
    if (field === 'strands') {
        prompts.strands = `For ${grade} ${subject} Term ${term} KICD CBC Kenya, list ALL the main strands (learning areas) for this term. Return as a plain list, one per line. No extra text.`;
    }
    if (!prompts[field]) return res.status(400).json({ error: 'Unknown field' });
    try {
        const result = await model.generateContent(prompts[field]);
        res.json({ suggestion: result.response.text().trim() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DOCX Export ──
app.post('/api/docx', authenticateToken, async (req, res) => {
    try {
        const { html } = req.body;
        const buffer = await htmlToDocx(html, null, {
            margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
    } catch (err) { res.status(500).json({ error: 'DOCX failed: ' + err.message }); }
});

// ── Profile Endpoints ──
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email });
        res.json({ name: user.profileTeacher || user.name, school: user.profileSchool || '' });
    } catch (err) { res.status(500).json({ error: 'Profile load error' }); }
});

app.post('/api/profile', authenticateToken, async (req, res) => {
    const { name, school } = req.body;
    try {
        await User.findOneAndUpdate({ email: req.user.email }, { profileTeacher: name, profileSchool: school });
        res.json({ message: 'Profile updated' });
    } catch (err) { res.status(500).json({ error: 'Profile save error' }); }
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
        const messages = await ChatMessage.find({ channel }).sort({ timestamp: -1 }).limit(50);
        res.json(messages.reverse());
    } catch (err) { res.status(500).json({ error: 'Chat load error' }); }
});

app.post('/api/chat', authenticateToken, async (req, res) => {
    const { text, channel } = req.body;
    if (!text) return res.status(400).json({ error: 'Message required' });
    try {
        const newMessage = new ChatMessage({
            sender: req.user.email,
            text,
            channel: channel || 'staff',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        await newMessage.save();
        res.json(newMessage);
    } catch (err) { res.status(500).json({ error: 'Chat send error' }); }
});

// ── Parent Integration: Share Portfolio ──
app.post('/api/share-portfolio', authenticateToken, async (req, res) => {
    const { parentEmail, studentName, projectTitle, portfolioHtml } = req.body;
    if (!parentEmail) return res.status(400).json({ error: 'Parent email required' });
    
    try {
        transporter.sendMail({
            from: `"Pedagogy Portfolio" <${process.env.EMAIL_USER}>`,
            to: parentEmail,
            subject: `CBC Progress Update: ${studentName}`,
            html: `
                <div style="font-family:sans-serif; max-width:600px; margin:auto; border:1px solid #eee; padding:30px; border-radius:12px;">
                    <h2 style="color:#7c6bff;">Pedagogy Learner Update</h2>
                    <p>Hello, here is a project update for <strong>${studentName}</strong> regarding the project: <strong>"${projectTitle}"</strong>.</p>
                    <hr style="border:none; border-top:1px solid #eee; margin:20px 0;"/>
                    <div style="background:#f9f9ff; padding:20px; border-radius:8px;">
                        ${portfolioHtml}
                    </div>
                    <h2 class="logo">PEDAGOGY</h2>
            <p style="color:var(--muted); font-size:14px; margin-bottom:30px;">The Heart of Modern CBC</p>erated and shared by the class facilitator via Pedagogy Dashboard.</p>
                </div>
            `
        }).catch(err => console.error("Email error:", err));
        res.json({ message: 'Portfolio shared with parent successfully!' });
    } catch (err) { res.status(500).json({ error: 'Failed to send email: ' + err.message }); }
});


// ── Portfolio Endpoints ──
app.get('/api/portfolio', authenticateToken, async (req, res) => {
    try {
        const items = await Portfolio.find({ userEmail: req.user.email }).sort({ timestamp: -1 });
        res.json(items);
    } catch (err) { res.status(500).json({ error: 'Failed to load portfolio' }); }
});

app.post('/api/portfolio', authenticateToken, async (req, res) => {
    const { studentName, projectTitle, description, photos } = req.body;
    try {
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
            photos
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
app.post('/api/generate', authenticateToken, async (req, res) => {
    const { documentType, grade, term, subject, strand, extraInstructions, teacherName, schoolName, isTemplate } = req.body;
    console.log(`[GENERATING] ${documentType} (Template: ${isTemplate}) for ${teacherName} at ${schoolName}`);
    
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const adminHeader = `
            <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:20px; color:#000; background:#fff;">
                <h2 style="margin:0; text-transform:uppercase; font-size:20px;">${schoolName || '________________'}</h2>
                <p style="margin:5px 0; font-weight:bold; font-size:16px;">REPUBLIC OF KENYA - MINISTRY OF EDUCATION</p>
                <p style="margin:5px 0; font-style:italic;">Competency-Based Curriculum (CBC)</p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; text-align:left; margin-top:15px; border:1px solid #000; padding:10px;">
                    <div><strong>Facilitator:</strong> ${teacherName}</div>
                    <div><strong>Learning Area:</strong> ${subject}</div>
                    <div><strong>Grade:</strong> ${grade}</div>
                    <div><strong>Term:</strong> ${term}</div>
                    <div style="grid-column: span 2;"><strong>Strands / Sub-strands:</strong> ${strand || '________________'}</div>
                </div>
            </div>
        `;
        const sigBlock = `
            <div style="margin-top:50px; display:flex; justify-content:space-between; border-top:1px solid #000; padding-top:20px; color:#000;">
                <div><p>Facilitator's Signature: ________________</p><p>Date: ________________</p></div>
                <div style="text-align:right;"><p>HOD / Headteacher's Stamp: ________________</p><p>Date: ________________</p></div>
            </div>
        `;

        let prompt = "";
        let mdResult = "";

        if (isTemplate) {
            const headers = {
                sow: ['Week', 'Lesson', 'Strand', 'Sub-strand', 'Specific Learning Outcomes', 'Key Inquiry Questions', 'Core Competencies', 'Learning Resources', 'Assessment Method', 'Remarks'],
                plan: ['Phase', 'Facilitator Activity', 'Learner Activity', 'Time', 'Resources'],
                rubric: ['Assessment Criteria', 'Exceeding (EE)', 'Meeting (ME)', 'Approaching (AE)', 'Below (BE)'],
                checklist: ['Learner Name', 'Learning Outcome', 'Observation', 'Date', 'Remarks']
            };
            const currentHeaders = headers[documentType] || ['Header 1', 'Header 2', 'Header 3'];
            const tableHtml = `
                <table style="width:100%; border-collapse:collapse; margin-top:20px; border:1px solid #000;">
                    <thead><tr style="background:#fff;">${currentHeaders.map(h => `<th style="border:1px solid #000; padding:10px; text-align:left;">${h}</th>`).join('')}</tr></thead>
                    <tbody>${Array(10).fill(0).map(() => `<tr>${currentHeaders.map(() => `<td style="border:1px solid #000; padding:15px; height:30px;"></td>`).join('')}</tr>`).join('')}</tbody>
                </table>
            `;
            return res.json({ html: `${adminHeader}<h3 style="text-align:center; border-bottom:1px solid #000; padding-bottom:10px;">${documentType.toUpperCase()} DOCUMENT</h3>${tableHtml}${sigBlock}`, markdown: 'Template' });
        }

        if (documentType === 'sow') {
            prompt = `As a KICD CBC expert, generate a professional termly Scheme of Work for:
Grade: ${grade} | Subject: ${subject} | Term: ${term} | Strands: ${strand}
School: ${schoolName} | Facilitator: ${teacherName}

Return ONLY a professional HTML table with columns: Week, Lesson, Strand, Sub-strand, Specific Learning Outcomes, Key Inquiry Questions, Core Competencies/Values/PCIs, Learning Resources, Assessment Method, Remarks.
Populate for a 12-week term based on the provided strands. Tone: Professional Facilitator.`;
        } else if (documentType === 'plan') {
            prompt = `Generate a detailed KICD CBC Lesson Plan for ONE lesson:
Grade: ${grade} | Subject: ${subject} | Term: ${term} | Strand/Sub-strand: ${strand}
Facilitator: ${teacherName} | Institution: ${schoolName}

Structure in HTML:
1. Detailed Administrative Box (Grade, Learning Area, Date, Time, Number of Learners)
2. Specific Learning Outcomes (mapped to Blooms Taxonomy)
3. Core Competencies & Values integration
4. Learning Resources
5. Lesson Development Table (Phases: Introduction, Lesson Development/Core Activities, Conclusion)
Columns for table: Phase, Facilitator Activity, Learner Activity, Time.
6. Reflection section for the facilitator.
Ensure highly specific, learner-centered activities.`;
        } else if (documentType === 'rubric') {
            prompt = `Generate a KICD Assessment Rubric for:
Grade: ${grade} | Subject: ${subject} | Topic: ${strand || 'Any'}

Return ONLY an HTML table with 4 columns:
Assessment Criteria | Exceeding Expectation (EE) | Meeting Expectation (ME) | Approaching Expectation (AE) | Below Expectation (BE)
Provide detailed, competency-based descriptors in each cell.
Add a legend below explaining the EE/ME/AE/BE ratings.`;
        } else if (documentType === 'checklist') {
            prompt = `Generate a KICD CBC Observation Checklist for:
Grade: ${grade} | Subject: ${subject} | Topic: ${strand || 'Any'}

Return ONLY a professional HTML table with columns:
Learner Name, Specific Learning Outcome, Observation (Objective description of competency), Date, Remarks.
Include at least 5 rows of blank spaces for learners.
Add a 'Key to Observation' at the bottom (e.g., L - Learnt, P - Progressing, B - Beginning).`;
        } else if (documentType === 'project') {
            const { projectTitle, projectOutcomes, projectTime, projectValues, resources } = req.body;
            prompt = `Create a CBC Project Guide for:
Title: ${projectTitle} | Grade: ${grade} | Subject: ${subject} | School: ${schoolName}
Time: ${projectTime} | Outcomes: ${projectOutcomes} | Values: ${projectValues}
Resources: ${resources || 'Suggested by AI'}

Include:
1. Title & Introduction
2. Required Resources (KICD-aligned)
3. Step-by-Step Instructions
4. Assessment Rubric for the teacher.
Professional KICD layout. Output in HTML.`;
            const r = await model.generateContent(prompt);
            mdResult = r.response.text().replace(/^```[a-z]*\n?/, '').replace(/```$/, '');
            const projHeader = `${adminHeader}<h3 style="text-align:center;">PROJECT GUIDE: ${projectTitle.toUpperCase()}</h3>`;
            const html = `${projHeader}${mdResult.replace(/\n/g,'<br>')}${sigBlock}`;
            return res.json({ html, markdown: mdResult });
        }

        // ── New Assessment Tools ──
        if (['peer', 'oral', 'self'].includes(documentType)) {
            const toolNames = { peer: 'Peer Assessment Guide', oral: 'Oral Questioning Framework', self: 'Self-Assessment Journal' };
            prompt = `You are a KICD CBC assessment specialist. Generate a ${toolNames[documentType]} for:
Grade: ${grade} | Subject: ${subject} | Topic: ${strand || 'Any'}

Output in clean Markdown with headings:
## ${toolNames[documentType].toUpperCase()}
- For ${documentType === 'peer' ? 'Learner to Learner' : documentType === 'self' ? 'Learner Reflection' : 'Teacher questioning'}
- Include a specific list of ${documentType === 'oral' ? 'Open-ended Questions' : 'Reflective Statements'}
- Add a small blank observation/score table if applicable.
Align strictly with Kenyan CBC and learner-centered values.`;
            const r = await model.generateContent(prompt);
            mdResult = r.response.text().replace(/^```[a-z]*\n?/, '').replace(/```$/, '');
            const html = `${adminHeader}<h3 style="text-align:center;">${toolNames[documentType].toUpperCase()}</h3><div>${mdResult.replace(/\n/g,'<br>')}</div>${sigBlock}`;
            return res.json({ html, markdown: mdResult });
        }

        // ── Anecdotal Record (Blueprint Template) ──
        if (documentType === 'anecdotal') {
            const html = `
                ${adminHeader}
                <h3 style="text-align:center;">ANECDOTAL RECORD (BLUEPRINT)</h3>
                <table style="width:100%; border-collapse:collapse;">
                    <tr><td style="border:1px solid #000; padding:8px; width:25%;"><strong>Learner Name:</strong></td><td style="border:1px solid #000; padding:8px;">________________________________</td></tr>
                    <tr><td style="border:1px solid #000; padding:8px;"><strong>Date/Time:</strong></td><td style="border:1px solid #000; padding:8px;">________________________________</td></tr>
                    <tr><td style="border:1px solid #000; padding:8px;"><strong>Context / Setting:</strong></td><td style="border:1px solid #000; padding:8px;">________________________________</td></tr>
                </table>
                <br/>
                <div style="border:1px solid #000; min-height:150px; padding:10px;">
                    <strong>Observation (Objective Description of Behavior):</strong><br/>
                    ________________________________________________________________<br/>
                    ________________________________________________________________
                </div>
                <br/>
                <div style="border:1px solid #000; min-height:100px; padding:10px;">
                    <strong>Interpretation / Competency Demonstrated:</strong><br/>
                    ________________________________________________________________
                </div>
                ${sigBlock}
            `;
            return res.json({ html, markdown: 'Anecdotal Template' });
        }

        const r = await model.generateContent(prompt);
        mdResult = r.response.text().replace(/^```[a-z]*\n?/, '').replace(/```$/, '');
        const finalHtml = `${adminHeader}${mdResult}${sigBlock}`;
        res.json({ html: finalHtml, markdown: mdResult });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
