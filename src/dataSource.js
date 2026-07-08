// Live data source. The GitHub Actions cron commits fresh JSON to the repo on
// every 9 AM / 4 PM IST run, so the site reads data straight from the repo's raw
// URL at load time and always reflects the latest refresh — no redeploy needed.
// Falls back to the bundled copy under /data if the raw fetch fails.
const RAW_BASE = 'https://raw.githubusercontent.com/anubhavkrsahnse/brainvest-tv/main/public/data/'

export function fetchData(file) {
  const bust = Math.floor(Date.now() / 60000) // per-minute cache-bust vs GitHub CDN
  return fetch(`${RAW_BASE}${file}?t=${bust}`)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('raw ' + r.status))))
    .catch(() => fetch(`/data/${file}`).then(r => r.json()))
}
