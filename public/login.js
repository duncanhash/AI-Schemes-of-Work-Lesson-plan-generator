const loginForm = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const switchBtn = document.getElementById('switchBtn');
const formTitle = document.getElementById('formTitle');
const authCard = document.getElementById('authCard');
const otpCard = document.getElementById('otpCard');
const authError = document.getElementById('authError');

// ── Auto-Redirect if Already Logged In ──
const existingToken = localStorage.getItem('cbc_token');
const existingRole = localStorage.getItem('cbc_role');
if (existingToken && window.location.pathname.includes('login.html')) {
    console.log("Existing session found. Redirecting...");
    if (existingRole === 'parent') {
        window.location.href = '/parent_dashboard.html';
    } else {
        window.location.href = '/dashboard.html';
    }
}

function showError(msg) {
    if (authError) {
        authError.textContent = msg;
        authError.style.display = 'block';
    }
}

let isLoginMode = true;
let registeredEmail = sessionStorage.getItem('pending_email') || '';

// Auto-show OTP if we were in the middle of it
if (registeredEmail && !localStorage.getItem('cbc_token')) {
    window.addEventListener('DOMContentLoaded', () => showOTP());
}

// Toggle Password Visibility
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');

if (togglePassword) {
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.textContent = type === 'password' ? '👁️' : '🙈';
    });
}

function switchMode() {
    isLoginMode = !isLoginMode;
    if (authError) authError.style.display = 'none'; // Clear errors when switching
    formTitle.textContent = isLoginMode ? 'Welcome Back' : 'Join Pedagogy';
    submitBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
    switchBtn.textContent = isLoginMode ? "Don't have an account? Sign Up" : "Already have an account? Log In";
    document.getElementById('nameGroup').style.display = isLoginMode ? 'none' : 'block';
    // Update autocomplete for password field when signing up
    const passInput = document.getElementById('password');
    passInput.autocomplete = isLoginMode ? "current-password" : "new-password";
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    // Standard form data extraction for browser compatibility
    const formData = new FormData(loginForm);
    const email = formData.get('email').toLowerCase();
    const password = formData.get('password');
    const name = formData.get('name');
    const role = formData.get('role');

    try {
        const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
        const body = isLoginMode ? { email, password } : { email, password, name, role };

        console.log(`Attempting ${isLoginMode ? 'Login' : 'Registration'} for:`, email);

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok) {
            if (data.needsVerify) {
                registeredEmail = email;
                sessionStorage.setItem('pending_email', email);
                document.getElementById('otp-card').style.display = 'block';
                document.getElementById('login-card').style.display = 'none';
                
                if (data.debugOtp) {
                    const otpInput = document.getElementById('otp');
                    otpInput.value = data.debugOtp;
                    showError("Verifying OTP automatically...");
                    setTimeout(verifyOTP, 1500);
                }
                return;
            }
            throw new Error(data.error || 'Authentication failed');
        }

        if (isLoginMode) {
            console.log("Login successful!");
            localStorage.setItem('cbc_token', data.token);
            localStorage.setItem('cbc_email', data.email);
            localStorage.setItem('cbc_name', data.name);
            if (data.role) localStorage.setItem('cbc_role', data.role);
            
            // Small delay to let browser's password manager catch the 'success' event
            setTimeout(() => {
                if (data.role === 'parent') {
                    window.location.href = '/parent_dashboard.html';
                } else {
                    window.location.href = '/dashboard.html';
                }
            }, 500);
        } else {
            console.log("Registration successful! Waiting for OTP...");
            registeredEmail = email;
            sessionStorage.setItem('pending_email', email);
            showOTP();

            // ── AUTOREAD OTP (Debug/Testing Convenience) ──
            if (data.debugOtp) {
                console.log("Autoreading OTP...");
                const otpInput = document.getElementById('otpInput');
                if (otpInput) {
                    otpInput.value = data.debugOtp;
                    // Auto-verify after a short delay for visual feedback
                    setTimeout(() => verifyOTP(), 800);
                }
            }
        }
    } catch (err) {
        showError(err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
    }
});

function showOTP() {
    authCard.style.display = 'none';
    otpCard.style.display = 'block';
}

async function verifyOTP() {
    const otpInput = document.getElementById('otpInput');
    const otp = otpInput.value;
    if (!otp) return alert("Enter OTP");

    try {
        const res = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: registeredEmail, otp })
        });
        const data = await res.json();
        
        if (!res.ok) {
            otpInput.value = ''; // Reset input
            throw new Error(data.error || 'Invalid OTP');
        }

        localStorage.setItem('cbc_token', data.token);
        localStorage.setItem('cbc_email', data.email);
        localStorage.setItem('cbc_name', data.name);
        if (data.role) localStorage.setItem('cbc_role', data.role);
        sessionStorage.removeItem('pending_email'); // Cleanup
        
        if (data.role === 'parent') {
            window.location.href = '/parent_dashboard.html';
        } else {
            window.location.href = '/dashboard.html';
        }
    } catch (err) { showError(err.message); }
}

async function forgotPassword() {
    const email = prompt("Enter your registered email:");
    if (!email) return;
    try {
        const res = await fetch('/api/auth/forgot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        let otp = data.debugOtp || prompt("Enter the reset code sent to your email:");
        const newPass = prompt("Enter your new password:");
        if (!otp || !newPass) return;

        const res2 = await fetch('/api/auth/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, newPassword: newPass })
        });
        const data2 = await res2.json();
        if (data2.error) throw new Error(data2.error);
        alert("✅ Password updated! Log in now."); 
    } catch (err) { showError(err.message); }
}
