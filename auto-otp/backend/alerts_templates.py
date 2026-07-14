# Alerts Page Template
ALERTS_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Alerts - Auto OTP</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--primary:#4f46e5;--success:#10b981;--danger:#ef4444;--warning:#f59e0b;--bg:#f8fafc;--card:#fff;--text:#0f172a;--text-secondary:#475569;--text-muted:#64748b;--border:#e2e8f0;--shadow:0 1px 3px rgba(0,0,0,.1)}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh;margin:0}
.header{background:linear-gradient(135deg,var(--primary) 0%,#4338ca 100%);padding:2rem;color:#fff;box-shadow:0 4px 6px rgba(0,0,0,.1)}
.header-content{max-width:1400px;margin:0 auto;display:flex;justify-content:space-between;align-items:center}
h1{font-size:1.875rem;font-weight:700}
.back-link{color:#fff;text-decoration:none;padding:.5rem 1rem;border:1px solid rgba(255,255,255,.3);border-radius:6px;transition:all .2s}
.back-link:hover{background:rgba(255,255,255,.1)}
.container{max-width:1400px;margin:2rem auto;padding:0 2rem}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.5rem;margin-bottom:2rem}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1.5rem;box-shadow:var(--shadow)}
.stat-value{font-size:2rem;font-weight:700;color:var(--text)}
.stat-label{font-size:.875rem;color:var(--text-secondary);margin-top:.5rem}
.alerts-container{background:var(--card);border-radius:12px;box-shadow:var(--shadow);overflow:hidden}
.alert-item{padding:1.5rem;border-bottom:1px solid var(--border);display:flex;gap:1.5rem;align-items:flex-start}
.alert-item:last-child{border-bottom:none}
.alert-icon{font-size:2rem;flex-shrink:0}
.alert-content{flex:1}
.alert-type{font-size:.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem}
.alert-message{font-size:1rem;font-weight:600;color:var(--text);margin-bottom:.5rem}
.alert-meta{font-size:.875rem;color:var(--text-secondary);display:flex;gap:1.5rem;flex-wrap:wrap}
.alert-meta span{display:flex;align-items:center;gap:.25rem}
.severity-badge{padding:.25rem .75rem;border-radius:12px;font-size:.75rem;font-weight:700;text-transform:uppercase}
.severity-critical{background:rgba(239,68,68,.1);color:var(--danger)}
.severity-warning{background:rgba(245,158,11,.1);color:var(--warning)}
.severity-info{background:rgba(59,130,246,.1);color:#3b82f6}
.empty-state{text-align:center;padding:4rem 2rem;color:var(--text-muted)}
.auto-refresh{font-size:.875rem;color:var(--text-muted);text-align:center;margin-top:1rem}
</style>
</head>
<body>
<div class="header">
<div class="header-content">
<h1>System Alerts</h1>
<a href="/" class="back-link">Back to Dashboard</a>
</div>
</div>
<div class="container">
<div class="stats">
<div class="stat-card">
<div class="stat-value">{{ alert_count }}</div>
<div class="stat-label">Total Alerts (24h)</div>
</div>
<div class="stat-card">
<div class="stat-value">{{ current_time }}</div>
<div class="stat-label">Last Updated</div>
</div>
</div>

<div class="alerts-container">
{% if alerts %}
{% for alert in alerts %}
<div class="alert-item">
<div class="alert-icon">
{% if 'sim_removed' in alert.type %}📵
{% elif 'sim_inserted' in alert.type %}📱
{% elif 'network_offline' in alert.type %}📡
{% elif 'network_online' in alert.type %}✅
{% elif 'offline' in alert.type %}⚠️
{% else %}⚠️{% endif %}
</div>
<div class="alert-content">
<div class="alert-type">{{ alert.type.replace('_', ' ') }}</div>
<div class="alert-message">{{ alert.message }}</div>
<div class="alert-meta">
<span>📱 Phone: {{ alert.phone }}</span>
<span>🔷 Device: {{ alert.device_id[:8] }}...</span>
<span>🕐 {{ alert.time_formatted }}</span>
<span class="severity-badge severity-{{ alert.severity }}">{{ alert.severity }}</span>
</div>
</div>
</div>
{% endfor %}
{% else %}
<div class="empty-state">
<div style="font-size:3rem;opacity:.3">✅</div>
<h3 style="margin-top:1rem">No Alerts</h3>
<p>All systems running smoothly</p>
</div>
{% endif %}
</div>

<div class="auto-refresh">Page auto-refreshes every 10 seconds</div>
</div>

<script>
setTimeout(()=>{window.location.reload()},10000);
</script>
</body>
</html>
"""
