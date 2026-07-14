# Login Page Templates

LOGIN_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login - Auto OTP</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--primary:#4f46e5;--danger:#ef4444;--bg:#f8fafc;--card:#fff;--text:#0f172a;--border:#e2e8f0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,var(--primary) 0%,#4338ca 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
.login-card{background:var(--card);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:3rem;width:100%;max-width:400px}
h1{font-size:2rem;font-weight:700;color:var(--text);margin-bottom:.5rem;text-align:center}
.subtitle{color:#64748b;font-size:.875rem;text-align:center;margin-bottom:2rem}
.form-group{margin-bottom:1.5rem}
label{display:block;font-size:.875rem;font-weight:600;color:var(--text);margin-bottom:.5rem}
input{width:100%;padding:.75rem 1rem;border:1px solid var(--border);border-radius:8px;font-size:1rem;transition:all .2s}
input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(79,70,229,.1)}
button{width:100%;padding:.875rem;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;transition:all .2s}
button:hover{background:#4338ca;transform:translateY(-1px);box-shadow:0 4px 12px rgba(79,70,229,.4)}
button:active{transform:translateY(0)}
.error{background:rgba(239,68,68,.1);border:1px solid var(--danger);color:var(--danger);padding:.75rem;border-radius:8px;font-size:.875rem;margin-bottom:1.5rem;text-align:center}
.footer{text-align:center;margin-top:2rem;color:#64748b;font-size:.75rem}
</style>
</head>
<body>
<div class="login-card">
<h1>Auto OTP Dashboard</h1>
<p class="subtitle">Sign in to access the monitoring dashboard</p>
<form method="POST" action="/login">
<div class="form-group">
<label for="email">Email Address</label>
<input type="email" id="email" name="email" placeholder="test21@gmail.com" required autofocus>
</div>
<div class="form-group">
<label for="password">Password</label>
<input type="password" id="password" name="password" placeholder="Enter your password" required>
</div>
<button type="submit">Sign In</button>
</form>
<div class="footer">
Auto OTP Monitoring System v1.0
</div>
</div>
</body>
</html>
"""

LOGIN_TEMPLATE_ERROR = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login - Auto OTP</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--primary:#4f46e5;--danger:#ef4444;--bg:#f8fafc;--card:#fff;--text:#0f172a;--border:#e2e8f0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,var(--primary) 0%,#4338ca 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
.login-card{background:var(--card);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:3rem;width:100%;max-width:400px}
h1{font-size:2rem;font-weight:700;color:var(--text);margin-bottom:.5rem;text-align:center}
.subtitle{color:#64748b;font-size:.875rem;text-align:center;margin-bottom:2rem}
.form-group{margin-bottom:1.5rem}
label{display:block;font-size:.875rem;font-weight:600;color:var(--text);margin-bottom:.5rem}
input{width:100%;padding:.75rem 1rem;border:1px solid var(--border);border-radius:8px;font-size:1rem;transition:all .2s}
input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(79,70,229,.1)}
button{width:100%;padding:.875rem;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;transition:all .2s}
button:hover{background:#4338ca;transform:translateY(-1px);box-shadow:0 4px 12px rgba(79,70,229,.4)}
button:active{transform:translateY(0)}
.error{background:rgba(239,68,68,.1);border:1px solid var(--danger);color:var(--danger);padding:.75rem;border-radius:8px;font-size:.875rem;margin-bottom:1.5rem;text-align:center}
.footer{text-align:center;margin-top:2rem;color:#64748b;font-size:.75rem}
</style>
</head>
<body>
<div class="login-card">
<h1>Auto OTP Dashboard</h1>
<p class="subtitle">Sign in to access the monitoring dashboard</p>
<div class="error">{{ error }}</div>
<form method="POST" action="/login">
<div class="form-group">
<label for="email">Email Address</label>
<input type="email" id="email" name="email" placeholder="test21@gmail.com" required autofocus>
</div>
<div class="form-group">
<label for="password">Password</label>
<input type="password" id="password" name="password" placeholder="Enter your password" required>
</div>
<button type="submit">Sign In</button>
</form>
<div class="footer">
Auto OTP Monitoring System v1.0
</div>
</div>
</body>
</html>
"""
