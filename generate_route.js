// ── Generate Document (AI) ──
app.post('/api/generate', authenticateToken, async (req, res) => {
    const { documentType, grade, term, subject, strand, extraInstructions, teacherName, schoolName, isTemplate, projectTitle, projectOutcomes, projectTime, resources } = req.body;
    console.log(`[GENERATING] ${documentType} (Template: ${isTemplate}) for ${teacherName} at ${schoolName}`);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const TS = `width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;`;
        const TD = `border:1px solid #000;padding:8px;vertical-align:top;`;
        const TH = `border:1px solid #000;padding:9px;background:#f0f0f0;text-align:left;font-weight:bold;font-size:12px;`;
        const H4 = `font-size:14px;margin:20px 0 8px;text-transform:uppercase;border-bottom:1px solid #ccc;padding-bottom:4px;`;

        const adminHeader = `<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:24px;font-family:Arial,sans-serif;">
<h2 style="margin:0;text-transform:uppercase;font-size:18px;">${schoolName || '________________________________'}</h2>
<p style="margin:4px 0;font-weight:bold;">REPUBLIC OF KENYA — MINISTRY OF EDUCATION</p>
<p style="margin:4px 0;font-style:italic;font-size:13px;">Competency-Based Curriculum (CBC)</p>
<table style="${TS}margin-top:12px;"><tbody>
<tr><td style="${TD}width:25%;"><strong>Facilitator:</strong> ${teacherName || '________________'}</td><td style="${TD}width:25%;"><strong>Learning Area:</strong> ${subject || '________________'}</td><td style="${TD}width:25%;"><strong>Grade:</strong> ${grade || '________________'}</td><td style="${TD}width:25%;"><strong>Term:</strong> ${term || '________________'}</td></tr>
<tr><td colspan="4" style="${TD}"><strong>Strand/Sub-strand:</strong> ${strand || '________________'}</td></tr>
</tbody></table></div>`;

        const sigBlock = `<div style="margin-top:40px;border-top:1px solid #000;padding-top:16px;display:flex;justify-content:space-between;font-size:13px;">
<div><p>Facilitator's Signature: ___________________</p><p>Date: ___________________</p></div>
<div style="text-align:right;"><p>HOD / Headteacher's Stamp: ___________________</p><p>Date: ___________________</p></div>
</div>`;

        const NO_MD = `\nIMPORTANT: Output ONLY valid HTML. No markdown. No backticks. No code fences. Start directly with an HTML element.`;

        // ── BLANK TEMPLATE ──
        if (isTemplate) {
            const hdrs = {
                sow:  ['Week','Lesson','Strand','Sub-strand','Specific Learning Outcomes','Key Inquiry Questions','Core Competencies','Learning Resources','Assessment Method','Remarks'],
                plan: ['Phase','Facilitator Activity','Learner Activity','Time (mins)','Resources'],
                rubric: ['Assessment Criteria','Exceeding (EE)','Meeting (ME)','Approaching (AE)','Below (BE)'],
                checklist: ['No.','Learner Name','Learning Outcome','Observation','L','P','B','Date','Remarks']
            };
            const cols = hdrs[documentType] || ['Column 1','Column 2','Column 3'];
            const rows = Array(12).fill(0).map(()=>`<tr>${cols.map(()=>`<td style="${TD}height:32px;"></td>`).join('')}</tr>`).join('');
            const tbl = `<table style="${TS}"><thead><tr>${cols.map(c=>`<th style="${TH}">${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
            return res.json({ html: `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;">${documentType.toUpperCase()} — BLANK TEMPLATE</h3>${tbl}${sigBlock}`, markdown: 'Template' });
        }

        let html = '';

        // ── SCHEME OF WORK ──
        if (documentType === 'sow') {
            const prompt = `You are a KICD CBC specialist. Generate a complete 12-week Scheme of Work (SOW) for:
Grade: ${grade} | Learning Area: ${subject} | Term: ${term} | Strands: ${strand}
Facilitator: ${teacherName} | School: ${schoolName}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}

Output ONE HTML <table> with these 10 columns:
Week | Lesson | Strand | Sub-strand | Specific Learning Outcomes | Key Inquiry Questions | Core Competencies, Values & PCIs | Learning Resources | Assessment Method | Remarks

Requirements:
- 12 weeks, at least 2 lessons per week (24+ rows)
- SLOs start with action verbs (identify, describe, demonstrate, compare)
- Week 7 = Mid-Term Review; Week 12 = End-Term Assessment
- Resources: KICD textbooks, charts, models, locally available materials
- Assessment: Observation, Oral questions, Written exercise, Practical, Portfolio
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i,'').replace(/```$/i,'').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">SCHEME OF WORK — ${subject} | ${grade} | Term ${term}</h3>${raw}${sigBlock}`;
        }

        // ── LESSON PLAN ──
        else if (documentType === 'plan') {
            const prompt = `You are a KICD CBC expert. Generate a complete Lesson Plan for ONE lesson:
Grade: ${grade} | Learning Area: ${subject} | Term: ${term} | Strand: ${strand}
Facilitator: ${teacherName} | School: ${schoolName}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}

Output HTML only with these clearly labelled sections using <h4 style="${H4}">:

1. ADMINISTRATIVE DETAILS — <table> with: School, Grade, Learning Area, Strand, Sub-strand, Date (blank line), Time (blank), Duration (40 mins), No. of Learners (blank)

2. SPECIFIC LEARNING OUTCOMES — <ol> with 3-4 outcomes (Bloom's action verbs)

3. KEY INQUIRY QUESTIONS — <ol> with 2-3 open-ended questions

4. CORE COMPETENCIES & VALUES — <ul> (Communication, Critical Thinking, Creativity, Collaboration, Citizenship)

5. PCIs — <ul> (Pertinent & Contemporary Issues relevant to topic)

6. LEARNING RESOURCES — <ul> (KICD textbooks, charts, locally available materials)

7. LESSON DEVELOPMENT — <table> columns: Phase | Facilitator Activity | Learner Activity | Time (mins)
   Rows: Introduction (5 min) | Development—Core Activity (25 min) | Application/Practice (7 min) | Conclusion (3 min)

8. DIFFERENTIATED ACTIVITIES — <table>: Fast Learners | Slow Learners

9. FACILITATOR'S REFLECTION — <table>: What went well? | What needs improvement? | Follow-up action?

10. TEACHER GUIDANCE NOTES — <ul><li>Key points to emphasize during delivery</li><li>Potential misconceptions and how to address them</li><li>Suggested assessment focus and probing questions</li></ul>

Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i,'').replace(/```$/i,'').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">LESSON PLAN — ${subject} | ${grade} | Term ${term}</h3>${raw}${sigBlock}`;
        }

        // ── RUBRIC ──
        else if (documentType === 'rubric') {
            const prompt = `KICD CBC assessment specialist. Generate a complete Assessment Rubric for:
Grade: ${grade} | Learning Area: ${subject} | Topic: ${strand || subject}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}

Output ONE HTML <table> columns: Assessment Criteria | Exceeding (EE) | Meeting (ME) | Approaching (AE) | Below (BE)
- 5-6 criteria rows with specific observable descriptors per cell
- Final row: TOTAL SCORE | /[max] | | |
After table: <p><strong>Key:</strong> EE=4 | ME=3 | AE=2 | BE=1</p>
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i,'').replace(/```$/i,'').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">ASSESSMENT RUBRIC — ${subject} | ${grade}</h3>${raw}${sigBlock}`;
        }

        // ── CHECKLIST ──
        else if (documentType === 'checklist') {
            const prompt = `KICD CBC assessment specialist. Generate an Observation Checklist for:
Grade: ${grade} | Learning Area: ${subject} | Topic: ${strand || subject}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}

Output:
1. ONE HTML <table> columns: No. | Learner Name | Specific Learning Outcome | Observation Notes | L | P | B | Date | Remarks — with 20 blank rows
2. <p><strong>Key:</strong> L=Learnt &nbsp; P=Progressing &nbsp; B=Beginning</p>
3. Small summary <table>: Total Learners | Achieved Outcome | Need Support | Facilitator Action
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i,'').replace(/```$/i,'').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">OBSERVATION CHECKLIST — ${subject} | ${grade}</h3>${raw}${sigBlock}`;
        }

        // ── PROJECT GUIDE ──
        else if (documentType === 'project') {
            const prompt = `KICD CBC expert. Generate a complete CBC Project Guide:
Title: ${projectTitle} | Grade: ${grade} | Learning Area: ${subject}
Duration: ${projectTime} | School: ${schoolName} | Facilitator: ${teacherName}
Outcomes: ${projectOutcomes} | Resources: ${resources || 'AI-suggested'}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}

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
            const raw = r.response.text().replace(/^```[a-z]*\n?/i,'').replace(/```$/i,'').trim();
            const hdr = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">PROJECT GUIDE: ${(projectTitle||'').toUpperCase()}</h3>`;
            return res.json({ html: `${hdr}${raw}${sigBlock}`, markdown: raw });
        }

        // ── PEER ASSESSMENT ──
        else if (documentType === 'peer') {
            const prompt = `KICD CBC assessment specialist. Peer Assessment Guide for:
Grade: ${grade} | Learning Area: ${subject} | Topic: ${strand || subject}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}
Output HTML sections (<h4 style="${H4}">):
1. PURPOSE — <p>
2. INSTRUCTIONS FOR LEARNERS — <ol> (how to assess a peer respectfully)
3. PEER CHECKLIST — <table>: Criteria | Yes | Partially | Not Yet | Comments (6-8 topic-specific criteria)
4. OPEN-ENDED FEEDBACK — <ul>: "One thing my peer did well...", "One suggestion I have...", "What I learnt from my peer..."
5. SCORE SUMMARY — <table>: Total Criteria | Achieved | Score /[max]
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i,'').replace(/```$/i,'').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">PEER ASSESSMENT GUIDE — ${subject} | ${grade}</h3>${raw}${sigBlock}`;
        }

        // ── ORAL QUESTIONING ──
        else if (documentType === 'oral') {
            const prompt = `KICD CBC assessment specialist. Oral Questioning Framework for:
Grade: ${grade} | Learning Area: ${subject} | Topic: ${strand || subject}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}
Output HTML sections (<h4 style="${H4}">):
1. PURPOSE — <p>
2. QUESTION BANK — <table>: Cognitive Level | Question | Expected Response | Assessment Focus
   (2 questions per Bloom's level: Remembering, Understanding, Applying, Analysing, Evaluating, Creating)
3. OBSERVATION RECORD — <table>: Learner Name | Question Asked | Response Quality (1-4) | Notes | Follow-up (10 blank rows)
4. RATING SCALE — <p>: 1=No response | 2=Partial | 3=Adequate | 4=Excellent
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i,'').replace(/```$/i,'').trim();
            html = `${adminHeader}<h3 style="text-align:center;margin-bottom:20px;font-size:15px;">ORAL QUESTIONING FRAMEWORK — ${subject} | ${grade}</h3>${raw}${sigBlock}`;
        }

        // ── SELF-ASSESSMENT ──
        else if (documentType === 'self') {
            const prompt = `KICD CBC assessment specialist. Self-Assessment Journal for:
Grade: ${grade} | Learning Area: ${subject} | Topic: ${strand || subject}
${extraInstructions ? `Extra: ${extraInstructions}` : ''}
Use learner-friendly language. Output HTML sections (<h4 style="${H4}">):
1. MY LEARNING GOALS — <table>: Goal | Did I achieve it? (Yes/Partly/Not Yet) | Evidence (4-5 goals)
2. HOW I LEARNT TODAY — <table>: Strategy | I used this ✓ | Comments (Group work, Observation, Research, Experiment, Drawing, Presentation)
3. MY REFLECTION — <table>: What I learnt | What I found challenging | How I will improve | One question I still have
4. MY EFFORT RATING — <p> with 5 stars: ★★★★★ (learner circles one) and a blank line for reason
5. FACILITATOR'S FEEDBACK — blank lined <table> for written feedback + signature line
Table style: ${TS} TH: ${TH} TD: ${TD}${NO_MD}`;
            const r = await model.generateContent(prompt);
            const raw = r.response.text().replace(/^```[a-z]*\n?/i,'').replace(/```$/i,'').trim();
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

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
