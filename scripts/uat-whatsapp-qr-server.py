from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.request import Request,urlopen
import json,html,os
TENANT=os.getenv('WSB_UAT_TENANT','2b03ca54-f990-4f5a-a8ef-f635bccd8aae'); API='http://127.0.0.1:15280'; HDR={'x-wsadmin-role':'TENANT_OWNER','x-wsadmin-tenant-id':TENANT,'x-wsadmin-user-id':'uat-qr'}
def call(path,method='GET'):
 r=Request(API+path,method=method,headers={**HDR,'content-type':'application/json'},data=b'{}' if method=='POST' else None)
 with urlopen(r,timeout=20) as x:return json.loads(x.read())
class H(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path not in ('/','/index.html'): self.send_error(404); return
  try:
   st=call(f'/api/v1/tenants/{TENANT}/whatsapp/instance/status'); status=st.get('status','UNKNOWN')
   if status=='CONNECTED': body=f'<h1>WSadmin Business WhatsApp</h1><div class="ok">CONNECTED</div><p>{html.escape(str(st.get("phoneE164") or "WhatsApp linked"))}</p>'
   else:
    pair=call(f'/api/v1/tenants/{TENANT}/whatsapp/instance/pair','POST'); qr=pair.get('qrCode',''); exp=(pair.get('instance') or {}).get('qrExpiresAt','')
    body=f'<h1>Pair WSadmin Business</h1><p>WhatsApp → Linked devices → Link a device</p><img src="{qr}" alt="WhatsApp QR"><p>QR expires: {html.escape(exp)}</p><p>Page refreshes automatically.</p>'
  except Exception as e: body=f'<h1>QR unavailable</h1><pre>{html.escape(str(e))}</pre><p>Reload this page.</p>'
  page=f'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="45"><title>WSadmin Business QR</title><style>body{{font-family:Arial;background:#f5f7f6;color:#18221d;text-align:center;padding:30px}}img{{width:min(78vw,420px);background:white;padding:18px;border-radius:18px;box-shadow:0 8px 30px #0002}}.ok{{display:inline-block;padding:12px 20px;background:#dcfce7;color:#166534;border-radius:999px;font-weight:700}}pre{{white-space:pre-wrap}}</style>{body}'
  data=page.encode(); self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
 def log_message(self,fmt,*args): print(fmt%args,flush=True)
ThreadingHTTPServer(('192.168.0.102',18789),H).serve_forever()
