const supabaseUrl = 'https://ixizwkzpuwjijtrmztub.supabase.co';
const supabaseKey = 'sb_publishable_hhHysg3Z4R7WCXzCzw6btg_m9gH2ZCE';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Redirect out if already logged in
async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.replace('index.html');
  }
}
checkAuth();

async function loginUser() {
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  err.style.display = 'none';

  if (!email || !pass) {
    err.style.display = 'block';
    err.innerText = 'Por favor ingresa tu correo y contraseña.';
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  if (error) { 
    err.style.display = 'block'; 
    err.innerText = error.message; 
    return; 
  }
  window.location.replace('index.html');
}

async function signUpUser() {
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  err.style.display = 'none';

  if (!email || !pass) {
    err.style.display = 'block';
    err.innerText = 'Por favor ingresa un correo y contraseña.';
    return;
  }

  const { error } = await supabaseClient.auth.signUp({ email, password: pass });
  if (error) { 
    err.style.display = 'block'; 
    err.innerText = error.message; 
    return; 
  }
  // After signup, user might need to confirm email depending on Supabase settings
  // But usually auto-logs in if email confirmation is disabled.
  window.location.replace('index.html');
}

document.getElementById('btnLogin').addEventListener('click', loginUser);
document.getElementById('btnSignUp').addEventListener('click', signUpUser);

// Enter key support
document.getElementById('loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') loginUser(); });
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') loginUser(); });
