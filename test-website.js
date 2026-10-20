const http = require('http');
require('dotenv').config();
const db = require('./db');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;
let sessionCookie = '';

async function request(path, method, body = null) {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}${path}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        if (sessionCookie) options.headers.Cookie = sessionCookie;
        
        const req = http.request(url, options, (res) => {
            const setCookie = res.headers['set-cookie'];
            if (setCookie) sessionCookie = setCookie[0].split(';', 1)[0];
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, body: json });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        
        req.on('error', (err) => reject(err));
        
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log("=== STARTING WEBSITE API INTEGRATION TESTS ===");
    await db.connectDB();
    
    const testEmail = `tester_${Date.now()}@pedagogy.com`;
    const testPassword = "Password123!";
    
    // 1. Register User
    console.log("1. Registering user:", testEmail);
    const regRes = await request('/api/auth/register', 'POST', {
        name: "Test Facilitator",
        email: testEmail,
        password: testPassword,
        role: "teacher",
        subject1: "Computer Science",
        subject2: "Mathematics"
    });
    
    if (regRes.status !== 200) {
        console.error("❌ Registration failed:", regRes.status, regRes.body);
        process.exit(1);
    }
    const pendingUser = await db.User.findOne({ email: testEmail });
    if (!pendingUser || !pendingUser.otp) {
        console.error("❌ Registration did not create a verification code.");
        process.exit(1);
    }
    const otp = pendingUser.otp;
    console.log("✅ Registration successful.");
    
    // 2. Verify OTP
    console.log("2. Verifying OTP...");
    const verifyRes = await request('/api/auth/verify', 'POST', {
        email: testEmail,
        otp
    });
    
    if (verifyRes.status !== 200 || !sessionCookie) {
        console.error("❌ OTP Verification failed:", verifyRes.status, verifyRes.body);
        process.exit(1);
    }
    console.log("✅ OTP Verification successful. Session cookie received.");
    
    // 3. Login
    console.log("3. Logging in...");
    const loginRes = await request('/api/auth/login', 'POST', {
        email: testEmail,
        password: testPassword
    });
    if (loginRes.status !== 200 || !sessionCookie) {
        console.error("❌ Login failed:", loginRes.status, loginRes.body);
        process.exit(1);
    }
    console.log("✅ Login successful.");
    
    // 4. Fetch Profile
    console.log("4. Fetching Profile...");
    const profileRes = await request('/api/profile', 'GET');
    if (profileRes.status !== 200 || profileRes.body.name !== "Test Facilitator") {
        console.error("❌ Profile retrieval failed:", profileRes.status, profileRes.body);
        process.exit(1);
    }
    console.log("✅ Profile retrieved successfully:", profileRes.body.name);
    
    // 5. Update Profile with Base64 picture
    console.log("5. Updating Profile with profilePicture...");
    const dummyBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const updateProfileRes = await request('/api/profile', 'POST', {
        name: "Mwalimu Tester",
        school: "Antigravity Academy",
        subjects: "Computer Science, Mathematics",
        profilePicture: dummyBase64
    });
    
    if (updateProfileRes.status !== 200) {
        console.error("❌ Profile update failed:", updateProfileRes.status, updateProfileRes.body);
        process.exit(1);
    }
    console.log("✅ Profile updated successfully.");
    
    // Re-verify profile picture is stored
    const profileCheck = await request('/api/profile', 'GET');
    if (profileCheck.body.profilePicture !== dummyBase64) {
        console.error("❌ Profile picture did not persist correctly:", profileCheck.body.profilePicture);
        process.exit(1);
    }
    console.log("✅ Profile picture persistence verified.");
    
    // 6. Test Chat API
    console.log("6. Testing Chat API (Post & Get)...");
    const chatMsgText = `Hello teachers! Test message at ${new Date().toLocaleTimeString()}`;
    const chatPostRes = await request('/api/chat/staff', 'POST', { text: chatMsgText });
    if (chatPostRes.status !== 200 || chatPostRes.body.text !== chatMsgText) {
        console.error("❌ Chat post failed:", chatPostRes.status, chatPostRes.body);
        process.exit(1);
    }
    console.log("✅ Chat post successful. SenderName:", chatPostRes.body.senderName);
    
    const chatGetRes = await request('/api/chat/staff', 'GET');
    if (chatGetRes.status !== 200 || !Array.isArray(chatGetRes.body)) {
        console.error("❌ Chat get failed:", chatGetRes.status, chatGetRes.body);
        process.exit(1);
    }
    const foundMsg = chatGetRes.body.find(m => m.text === chatMsgText);
    if (!foundMsg) {
        console.error("❌ Posted message was not found in chat log!");
        process.exit(1);
    }
    console.log("✅ Chat retrieval successful.");

    const logoutRes = await request('/api/auth/logout', 'POST');
    if (logoutRes.status !== 200) {
        console.error("❌ Logout failed:", logoutRes.status, logoutRes.body);
        process.exit(1);
    }
    const sessionRes = await request('/api/auth/me', 'GET');
    if (sessionRes.status !== 401) {
        console.error("❌ Session remained active after logout:", sessionRes.status, sessionRes.body);
        process.exit(1);
    }
    console.log("✅ Logout cleared the session cookie.");
    
    // 7. Clean up database
    console.log("7. Cleaning up test user from database...");
    await db.User.findOneAndDelete({ email: testEmail });
    console.log("✅ Database cleaned successfully.");
    
    console.log("\n=== ALL WEBSITE API INTEGRATION TESTS PASSED SUCCESSFULLY! ===");
    process.exit(0);
}

runTests().catch(err => {
    console.error("❌ Unexpected test runner error:", err);
    process.exit(1);
});
