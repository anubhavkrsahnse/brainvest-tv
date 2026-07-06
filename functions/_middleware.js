// Server-side password gate for the whole site.
// The password lives in the DASHBOARD_PASSWORD env var (Pages secret), never in
// the repo. On success a signed cookie is set for 30 days; every request —
// HTML, JS, JSON data — is blocked until then.

const COOKIE = 'bv_auth'
const MAX_AGE = 60 * 60 * 24 * 30

async function expectedToken(password) {
  const data = new TextEncoder().encode(`${password}::brainvest-v1`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || ''
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? match[1] : null
}

const LOGIN_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>brAInvest — enter password</title>
<style>
  body { margin:0; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
         background:#000; color:#f5f5f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  .bar { position:fixed; top:0; left:0; right:0; background:#ff453a; color:#fff; text-align:center;
         font-size:13px; font-weight:700; padding:8px 16px; }
  h1 { font-size:40px; margin:0 0 6px; } h1 span { color:#0a84ff; }
  p { color:#86868b; margin:0 0 28px; }
  form { display:flex; gap:10px; }
  input { background:#1a1a20; border:1px solid #2c2c31; border-radius:12px; color:#f5f5f7;
          padding:14px 18px; font-size:16px; width:240px; outline:none; }
  input:focus { border-color:#0a84ff; }
  button { background:#0a84ff; border:0; border-radius:12px; color:#fff; font-size:16px; font-weight:600;
           padding:14px 24px; cursor:pointer; }
  .err { color:#ff453a; font-size:14px; height:20px; margin-top:14px; }
</style></head>
<body>
  <div class="bar">⚠️ FOR EDUCATIONAL PURPOSES ONLY · NOT SEBI REGISTERED · NOT FINANCIAL ADVICE ⚠️</div>
  <h1>br<span>AI</span>nvest</h1>
  <p>Private dashboard — enter the password to continue.</p>
  <form method="POST" action="/__login">
    <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password">
    <button type="submit">Enter</button>
  </form>
  <div class="err">{{ERROR}}</div>
</body></html>`

function loginResponse(error = '', status = 401) {
  return new Response(LOGIN_PAGE.replace('{{ERROR}}', error), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function onRequest({ request, env, next }) {
  const password = env.DASHBOARD_PASSWORD
  if (!password) return next() // gate disabled until the secret is configured

  const token = await expectedToken(password)
  const url = new URL(request.url)

  if (request.method === 'POST' && url.pathname === '/__login') {
    const form = await request.formData()
    if (form.get('password') === password) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/',
          'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        },
      })
    }
    return loginResponse('Wrong password — try again.')
  }

  if (getCookie(request, COOKIE) === token) return next()
  return loginResponse()
}
