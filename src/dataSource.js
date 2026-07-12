// Live data source. The GitHub Actions cron commits fresh JSON to the repo on
// every 9 AM / 4 PM IST run, so the site reads data straight from the repo's raw
// URL at load time and always reflects the latest refresh — no redeploy needed.
// Falls back to the bundled copy under /data if the raw fetch fails.
const RAW_BASE = 'https://raw.githubusercontent.com/anubhavkrsahnse/brainvest-tv/main/public/data/'

// One random bust per page load: GitHub's CDN edge-caches each URL for ~5 min,
// so a unique query string per visit guarantees every reload sees fresh data.
const bust = Math.random().toString(36).slice(2)

export function fetchData(file) {
  return fetch(`${RAW_BASE}${file}?v=${bust}`, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('raw ' + r.status))))
    .catch(() => fetch(`/data/${file}`).then(r => r.json()))
}
