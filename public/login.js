const loginForm = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const switchBtn = document.getElementById('switchBtn');
const formTitle = document.getElementById('formTitle');
const authCard = document.getElementById('authCard');
const otpCard = document.getElementById('otpCard');
const authError = document.getElementById('authError');
localStorage.removeItem('cbc_token');

function saveSession(data) {
    localStorage.removeItem('cbc_token');
    localStorage.setItem('cbc_email', data.email);
    localStorage.setItem('cbc_name', data.name || data.username || '');
    localStorage.setItem('cbc_username', data.username || '');
    if (data.role) localStorage.setItem('cbc_role', data.role);
    window.location.href = data.role === 'parent' ? '/parent_dashboard.html' : '/dashboard.html';
}

// ── Auto-Redirect if Already Logged In ──
const existingRole = localStorage.getItem('cbc_role');
if (window.location.pathname.includes('login.html')) {
    fetch('/api/auth/me')
        .then(async res => {
            if (!res.ok) return;
            const user = await res.json();
            const role = user.role || existingRole;
            window.location.href = role === 'parent' ? '/parent_dashboard.html' : '/dashboard.html';
        })
        .catch(() => {});
}

function showError(msg) {
    if (authError) {
        authError.textContent = msg;
        authError.style.display = 'block';
    }
}

let isLoginMode = true;
let registeredEmail = sessionStorage.getItem('pending_email') || '';

// Auto-show OTP if registration was interrupted before verification.
if (registeredEmail) {
    window.addEventListener('DOMContentLoaded', () => showOTP());
}

// Toggle Password Visibility
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');

if (togglePassword) {
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        const isVisible = type === 'text';
        togglePassword.textContent = isVisible ? 'Hide' : 'Show';
        togglePassword.setAttribute('aria-label', isVisible ? 'Hide password' : 'Show password');
        togglePassword.setAttribute('aria-pressed', String(isVisible));
    });
}

function selectLoginRole(role) {
    const btnTeacher = document.getElementById('roleBtnTeacher');
    const btnParent = document.getElementById('roleBtnParent');
    const formTitle = document.getElementById('formTitle');
    const emailInput = document.getElementById('email');
    const nameInput = document.getElementById('name');
    
    // Set active radio in the background form
    const radio = document.querySelector(`input[name="role"][value="${role}"]`);
    if (radio) {
        radio.checked = true;
        // Trigger style update for registration radio buttons if visible
        if (typeof updateRoleStyle === 'function') {
            updateRoleStyle(radio);
        }
    }
    
    if (role === 'teacher') {
        document.documentElement.style.setProperty('--accent', '#7c6bff');
        document.documentElement.style.setProperty('--accent-glow', 'rgba(124, 107, 255, 0.3)');
        
        if (btnTeacher) {
            btnTeacher.style.background = 'var(--accent)';
            btnTeacher.style.color = 'white';
        }
        if (btnParent) {
            btnParent.style.background = 'transparent';
            btnParent.style.color = '#8080a0';
        }
        
        if (formTitle) {
            formTitle.textContent = isLoginMode ? 'Facilitator Portal' : 'Join Pedagogy';
        }
        if (emailInput) {
            emailInput.placeholder = isLoginMode ? "mwalimu@school.com or username" : "mwalimu@school.com";
        }
        if (nameInput) {
            nameInput.placeholder = "Mwalimu Juma";
        }
    } else {
        document.documentElement.style.setProperty('--accent', '#00d4aa');
        document.documentElement.style.setProperty('--accent-glow', 'rgba(0, 212, 170, 0.3)');
        
        if (btnParent) {
            btnParent.style.background = 'var(--accent)';
            btnParent.style.color = 'white';
        }
        if (btnTeacher) {
            btnTeacher.style.background = 'transparent';
            btnTeacher.style.color = '#8080a0';
        }
        
        if (formTitle) {
            formTitle.textContent = isLoginMode ? 'Parent Portal' : 'Join Pedagogy';
        }
        if (emailInput) {
            emailInput.placeholder = isLoginMode ? "parent@email.com or username" : "parent@email.com";
        }
        if (nameInput) {
            nameInput.placeholder = "Mama/Baba Juma";
        }
    }
}
window.selectLoginRole = selectLoginRole;

function switchMode() {
    isLoginMode = !isLoginMode;
    if (authError) authError.style.display = 'none'; // Clear errors when switching
    
    const activeRole = document.querySelector('input[name="role"]:checked')?.value || 'teacher';
    
    submitBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
    switchBtn.textContent = isLoginMode ? "Don't have an account? Sign Up" : "Already have an account? Log In";
    document.getElementById('nameGroup').style.display = isLoginMode ? 'none' : 'block';
    const usernameGroup = document.getElementById('usernameGroup');
    const usernameInput = document.getElementById('username');
    if (usernameGroup) usernameGroup.style.display = isLoginMode ? 'none' : 'block';
    if (usernameInput) usernameInput.required = !isLoginMode;
    const identifierLabel = document.getElementById('identifierLabel');
    const emailInput = document.getElementById('email');
    if (identifierLabel) identifierLabel.textContent = isLoginMode ? 'Email or Username' : 'Email Address';
    if (emailInput) {
        emailInput.type = isLoginMode ? 'text' : 'email';
        emailInput.autocomplete = isLoginMode ? 'username' : 'email';
    }
    const passInput = document.getElementById('password');
    if (passInput) {
        if (isLoginMode) passInput.removeAttribute('minlength');
        else passInput.minLength = 8;
    }
    
    const subjectsGroup = document.getElementById('subjectsGroup');
    if (subjectsGroup) {
        subjectsGroup.style.display = (!isLoginMode && activeRole === 'teacher') ? 'block' : 'none';
    }
    
    // Hide portal selector switch during sign up (since role is chosen explicitly via radio buttons)
    const portalSelector = document.getElementById('roleSelectorPill');
    if (portalSelector) {
        portalSelector.style.display = isLoginMode ? 'flex' : 'none';
    }
    
    // Update autocomplete for password field when signing up
    if (passInput) passInput.autocomplete = isLoginMode ? "current-password" : "new-password";

    // Refresh titles & placeholders using the active role
    selectLoginRole(activeRole);
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    // Standard form data extraction for browser compatibility
    const formData = new FormData(loginForm);
    const identifier = formData.get('email').trim().toLowerCase();
    const password = formData.get('password');
    const name = formData.get('name');
    const username = formData.get('username');
    const role = formData.get('role');

    let subject1 = '';
    let subject2 = '';
    if (!isLoginMode && role === 'teacher') {
        subject1 = document.getElementById('subject1').value.trim();
        subject2 = document.getElementById('subject2').value.trim();
        if (!subject1 || !subject2) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign Up';
            return alert("Please enter both teaching subjects.");
        }
    }

    try {
        const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
        const body = isLoginMode
            ? { identifier, password, role }
            : { email: identifier, username, password, name, role, subject1, subject2 };

        console.log(`Attempting ${isLoginMode ? 'Login' : 'Registration'} for:`, identifier);

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok) {
            if (data.needsVerify) {
                registeredEmail = data.email || identifier;
                sessionStorage.setItem('pending_email', registeredEmail);
                showOTP();
                
                return;
            }
            throw new Error(data.error || 'Authentication failed');
        }

        if (isLoginMode) {
            saveSession(data);
        } else {
            console.log("Registration successful! Waiting for OTP...");
            registeredEmail = identifier;
            sessionStorage.setItem('pending_email', identifier);
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

        sessionStorage.removeItem('pending_email'); // Cleanup
        saveSession(data);
    } catch (err) { showError(err.message); }
}

async function initializeGoogleSignIn() {
    const configResponse = await fetch('/api/auth/config');
    if (!configResponse.ok) throw new Error('Could not load sign-in configuration.');
    const { googleClientId } = await configResponse.json();
    if (!googleClientId) return;

    const googleScript = document.createElement('script');
    googleScript.src = 'https://accounts.google.com/gsi/client';
    googleScript.async = true;
    googleScript.defer = true;
    googleScript.onload = () => {
        google.accounts.id.initialize({
            client_id: googleClientId,
            callback: async ({ credential }) => {
                const selectedRole = document.querySelector('input[name="role"]:checked')?.value || 'teacher';
                try {
                    const response = await fetch('/api/auth/google', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ credential, role: selectedRole })
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Google sign-in failed.');
                    saveSession(data);
                } catch (err) {
                    showError(err.message);
                }
            }
        });
        document.getElementById('googleSignInSection').style.display = 'block';
        google.accounts.id.renderButton(document.getElementById('googleSignInButton'), {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            width: 320
        });
    };
    googleScript.onerror = () => showError('Google sign-in could not be loaded.');
    document.head.appendChild(googleScript);
}

initializeGoogleSignIn().catch(err => showError(err.message));

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
        
        let otp = prompt("Enter the reset code sent to your email:");
        const newPass = prompt("Enter your new password:");
        if (!otp || !newPass) return;

        const res2 = await fetch('/api/auth/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, newPassword: newPass })
        });
        const data2 = await res2.json();
        if (data2.error) throw new Error(data2.error);
        alert(" Password updated! Log in now.");
    } catch (err) { showError(err.message); }
}
