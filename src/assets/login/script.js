document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value.trim();

    const submit = event.target.querySelector('button[type="submit"]');
    const passwordError = document.getElementById('passwordError');
    passwordError.textContent = '';
    submit.disabled = true;
    try {
        const response = await fetch('./login/authenticate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                password
            })
        });

        const { success, status, message } = await response.json();
        if (!success) {
            passwordError.textContent = 'Unable to sign in. Check your email and password.';
            throw new Error(`Login failed with status ${status}: ${message}`);
        }

        window.location.href = './panel';
    } catch (error) {
        if (!passwordError.textContent) passwordError.textContent = 'Unable to reach your workspace. Please try again.';
        console.error('Login error:', error.message || error);
    } finally {
        submit.disabled = false;
    }
});

document.getElementById('togglePassword').addEventListener('click', function () {
    const passwordInput = document.getElementById('password');
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    this.textContent = isPassword ? 'visibility_off' : 'visibility';
    this.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    this.setAttribute('aria-pressed', String(isPassword));
});
