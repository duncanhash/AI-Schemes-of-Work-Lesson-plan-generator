const http = require('http');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function request(path, method, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}${path}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
        
        const req = http.request(url, options, (res) => {
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
    
    if (regRes.status !== 200 || !regRes.body.debugOtp) {
        console.error("❌ Registration failed:", regRes.status, regRes.body);
        process.exit(1);
    }
    const otp = regRes.body.debugOtp;
    console.log("✅ Registration successful. OTP:", otp);
    
    // 2. Verify OTP
    console.log("2. Verifying OTP...");
    const verifyRes = await request('/api/auth/verify', 'POST', {
        email: testEmail,
        otp
    });
    
    if (verifyRes.status !== 200 || !verifyRes.body.token) {
        console.error("❌ OTP Verification failed:", verifyRes.status, verifyRes.body);
        process.exit(1);
    }
    const token = verifyRes.body.token;
    console.log("✅ OTP Verification successful. Received Token.");
    
    // 3. Login
    console.log("3. Logging in...");
    const loginRes = await request('/api/auth/login', 'POST', {
        email: testEmail,
        password: testPassword
    });
    if (loginRes.status !== 200 || !loginRes.body.token) {
        console.error("❌ Login failed:", loginRes.status, loginRes.body);
        process.exit(1);
    }
    console.log("✅ Login successful.");
    
    // 4. Fetch Profile
    console.log("4. Fetching Profile...");
    const profileRes = await request('/api/profile', 'GET', null, token);
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
    }, token);
    
    if (updateProfileRes.status !== 200) {
        console.error("❌ Profile update failed:", updateProfileRes.status, updateProfileRes.body);
        process.exit(1);
    }
    console.log("✅ Profile updated successfully.");
    
    // Re-verify profile picture is stored
    const profileCheck = await request('/api/profile', 'GET', null, token);
    if (profileCheck.body.profilePicture !== dummyBase64) {
        console.error("❌ Profile picture did not persist correctly:", profileCheck.body.profilePicture);
        process.exit(1);
    }
    console.log("✅ Profile picture persistence verified.");
    
    // 6. Test Chat API
    console.log("6. Testing Chat API (Post & Get)...");
    const chatMsgText = `Hello teachers! Test message at ${new Date().toLocaleTimeString()}`;
    const chatPostRes = await request('/api/chat/staff', 'POST', { text: chatMsgText }, token);
    if (chatPostRes.status !== 200 || chatPostRes.body.text !== chatMsgText) {
        console.error("❌ Chat post failed:", chatPostRes.status, chatPostRes.body);
        process.exit(1);
    }
    console.log("✅ Chat post successful. SenderName:", chatPostRes.body.senderName);
    
    const chatGetRes = await request('/api/chat/staff', 'GET', null, token);
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
    
    // 7. Clean up database
    console.log("7. Cleaning up test user from database...");
    const db = require('./db.js');
    await db.connectDB();
    await db.User.findOneAndDelete({ email: testEmail });
    console.log("✅ Database cleaned successfully.");
    
    console.log("\n=== ALL WEBSITE API INTEGRATION TESTS PASSED SUCCESSFULLY! ===");
    process.exit(0);
}

runTests().catch(err => {
    console.error("❌ Unexpected test runner error:", err);
    process.exit(1);
});
