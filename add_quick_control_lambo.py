from pathlib import Path

root = Path('/home/ubuntu/New140869')
index = root / 'index.html'
css = root / 'app.css'

html = '''
    <section class="quick-control-center" aria-labelledby="quick-control-title">
      <div class="quick-control-heading">
        <div>
          <p class="kicker">QUICK CONTROL · LAMBO GREY</p>
          <h2 id="quick-control-title">ศูนย์ควบคุมด่วน</h2>
          <p class="helper">คำสั่งสำคัญสำหรับตรวจสอบสถานะและสั่งงานจากจุดเดียว</p>
        </div>
        <div class="quick-control-health"><i></i><span>ระบบพร้อมใช้งาน</span><small>อัปเดตล่าสุด 09:42</small></div>
      </div>
      <div class="quick-control-grid">
        <button class="quick-control-card quick-control-card-primary" type="button" data-quick-action="monitor">
          <span class="quick-control-icon" aria-hidden="true">◉</span>
          <span class="quick-control-card-copy"><strong>เปิดโหมดเฝ้าระวัง</strong><small>ติดตามสัญญาณสำคัญแบบต่อเนื่อง</small></span>
          <span class="quick-control-arrow" aria-hidden="true">↗</span>
        </button>
        <button class="quick-control-card" type="button" data-quick-action="task">
          <span class="quick-control-icon" aria-hidden="true">＋</span>
          <span class="quick-control-card-copy"><strong>สร้างงานด่วน</strong><small>ส่งต่อภารกิจให้ทีมที่เกี่ยวข้อง</small></span>
          <span class="quick-control-arrow" aria-hidden="true">↗</span>
        </button>
        <button class="quick-control-card" type="button" data-quick-action="security">
          <span class="quick-control-icon" aria-hidden="true">✓</span>
          <span class="quick-control-card-copy"><strong>ตรวจสอบความปลอดภัย</strong><small>เช็กการเชื่อมต่อและสิทธิ์การเข้าถึง</small></span>
          <span class="quick-control-arrow" aria-hidden="true">↗</span>
        </button>
        <button class="quick-control-card" type="button" data-quick-action="support">
          <span class="quick-control-icon" aria-hidden="true">⌁</span>
          <span class="quick-control-card-copy"><strong>เรียกทีมช่วยเหลือ</strong><small>แจ้งผู้รับผิดชอบเมื่อเกิดเหตุสำคัญ</small></span>
          <span class="quick-control-arrow" aria-hidden="true">↗</span>
        </button>
      </div>
      <div class="quick-control-meta" aria-label="สรุปสถานะอย่างย่อ">
        <span><b>18</b> งานกำลังทำ</span><span><b>94.2%</b> เสร็จตามเวลา</span><span><b>2m 14s</b> เวลาตอบสนอง</span>
      </div>
    </section>
'''

marker = '    <section class="mqtt-live-panel section"'
source = index.read_text()
if 'class="quick-control-center"' not in source:
    if marker not in source:
        raise SystemExit('Cannot find insertion marker in index.html')
    source = source.replace(marker, html + marker, 1)
    index.write_text(source)

css_block = r'''
/* Quick Control Center — Lambo Grey prototype
   Palette: graphite #24282D, lambo grey #5F6368, silver #B8BDC3,
   porcelain #F4F5F6, signal red #D94D3F. Keep this scope isolated so
   Firebase, MQTT, relay controls, and existing dashboard logic remain intact. */
.quick-control-center {
  position:relative; overflow:hidden; margin:0 0 22px; padding:24px;
  border:1px solid rgba(36,40,45,.12); border-radius:22px;
  color:#f4f5f6; background:linear-gradient(145deg,#24282d 0%,#3b4046 64%,#5f6368 100%);
  box-shadow:0 18px 42px rgba(36,40,45,.16);
}
.quick-control-center::after { content:""; position:absolute; width:360px; height:360px; right:-130px; top:-210px; border:1px solid rgba(244,245,246,.14); border-radius:50%; box-shadow:0 0 0 22px rgba(244,245,246,.025),0 0 0 44px rgba(244,245,246,.025); pointer-events:none; }
.quick-control-heading { position:relative; z-index:1; display:flex; align-items:flex-start; justify-content:space-between; gap:18px; padding-bottom:20px; border-bottom:1px solid rgba(244,245,246,.14); }
.quick-control-heading h2 { margin:6px 0 4px; color:#f4f5f6; font-size:clamp(24px,3vw,34px); letter-spacing:-.04em; }
.quick-control-heading .helper { color:rgba(244,245,246,.64); }
.quick-control-health { display:grid; grid-template-columns:auto 1fr; align-items:center; column-gap:8px; min-width:150px; padding:10px 12px; border:1px solid rgba(244,245,246,.16); border-radius:12px; background:rgba(244,245,246,.07); font-size:12px; }
.quick-control-health i { width:8px; height:8px; border-radius:50%; background:#b8d8bf; box-shadow:0 0 0 4px rgba(184,216,191,.12); }
.quick-control-health small { grid-column:2; margin-top:3px; color:rgba(244,245,246,.5); font:10px/1.3 "DM Mono",monospace; }
.quick-control-grid { position:relative; z-index:1; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:18px; }
.quick-control-card { position:relative; display:flex; min-height:132px; flex-direction:column; align-items:flex-start; gap:14px; padding:16px; overflow:hidden; color:#f4f5f6; text-align:left; border:1px solid rgba(244,245,246,.14); border-radius:16px; background:rgba(244,245,246,.075); transition:transform .18s ease,background .18s ease,border-color .18s ease,box-shadow .18s ease; }
.quick-control-card:hover { transform:translateY(-3px); border-color:rgba(244,245,246,.38); background:rgba(244,245,246,.13); box-shadow:0 12px 22px rgba(0,0,0,.15); }
.quick-control-card:active { transform:scale(.98); }
.quick-control-card:focus-visible { outline:3px solid rgba(184,216,191,.62); outline-offset:3px; }
.quick-control-card-primary { border-color:rgba(217,75,63,.72); background:linear-gradient(145deg,rgba(217,75,63,.96),rgba(165,56,49,.86)); }
.quick-control-card-primary:hover { border-color:#f1aaa2; background:linear-gradient(145deg,#df5e52,#b9443b); }
.quick-control-icon { display:grid; width:38px; height:38px; place-items:center; border:1px solid rgba(244,245,246,.22); border-radius:12px; color:#24282d; background:#b8bdc3; font-size:20px; font-weight:700; }
.quick-control-card-primary .quick-control-icon { color:#fff; background:rgba(36,40,45,.36); }
.quick-control-card-copy { display:grid; gap:4px; }
.quick-control-card-copy strong { font-size:14px; letter-spacing:-.01em; }
.quick-control-card-copy small { color:rgba(244,245,246,.62); font-size:11px; line-height:1.45; }
.quick-control-arrow { position:absolute; top:17px; right:17px; color:rgba(244,245,246,.54); font-size:17px; }
.quick-control-meta { position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:22px; margin-top:17px; color:rgba(244,245,246,.58); font-size:11px; }
.quick-control-meta span { display:flex; align-items:baseline; gap:5px; }
.quick-control-meta b { color:#f4f5f6; font-size:16px; letter-spacing:-.02em; }
@media (max-width:900px) { .quick-control-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:640px) { .quick-control-center { margin-bottom:14px; padding:16px; border-radius:18px; } .quick-control-heading { display:grid; gap:14px; } .quick-control-health { width:max-content; } .quick-control-grid { grid-template-columns:1fr; gap:8px; margin-top:14px; } .quick-control-card { min-height:98px; padding:13px; } .quick-control-meta { gap:10px 15px; } .quick-control-meta b { font-size:14px; } }
@media (prefers-reduced-motion:reduce) { .quick-control-card { transition:none; } .quick-control-card:hover,.quick-control-card:active { transform:none; } }
'''
css_source = css.read_text()
if 'Quick Control Center — Lambo Grey prototype' not in css_source:
    css.write_text(css_source.rstrip() + '\n\n' + css_block + '\n')
print('patched index.html and app.css')
''
