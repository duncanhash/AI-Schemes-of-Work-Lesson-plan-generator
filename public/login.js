const loginForm = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const switchBtn = document.getElementById('switchBtn');
const formTitle = document.getElementById('formTitle');
const authCard = document.getElementById('authCard');
const otpCard = document.getElementById('otpCard');
const authError = document.getElementById('authError');

function showError(msg) {
    if (authError) {
        authError.textContent = msg;
        authError.style.display = 'block';
    }
}

let isLoginMode = true;
let registeredEmail = '';

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
    const email = formData.get('email');
    const password = formData.get('password');
    const name = formData.get('name');

    try {
        const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
        const body = isLoginMode ? { email, password } : { email, password, name };

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
                showOTP();
                return;
            }
            throw new Error(data.error || 'Authentication failed');
        }

        if (isLoginMode) {
            console.log("Login successful!");
            localStorage.setItem('cbc_token', data.token);
            localStorage.setItem('cbc_email', data.email);
            localStorage.setItem('cbc_name', data.name);
            
            // Small delay to let browser's password manager catch the 'success' event
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 500);
        } else {
            console.log("Registration successful! Waiting for OTP...");
            registeredEmail = email;
            showOTP();
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
    const otp = document.getElementById('otpInput').value;
    if (!otp) return alert("Enter OTP");

    try {
        const res = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: registeredEmail, otp })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        localStorage.setItem('cbc_token', data.token);
        localStorage.setItem('cbc_email', data.email);
        localStorage.setItem('cbc_name', data.name);
        window.location.href = '/dashboard.html';
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
        
        const otp = prompt("Enter the reset code sent to your email:");
        const newPass = prompt("Enter your new password:");
        if (!otp || !newPass) return;

        const res2 = await fetch('/api/auth/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, newPassword: newPass })
        });
        const data2 = await res2.json();
        if (data2.error) throw new Error(data2.error);
        alert("✅ Password updated! Log in now."); // Keep this alert as it's a final success message
    } catch (err) { showError(err.message); }
}
