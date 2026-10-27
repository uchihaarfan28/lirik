// Membuat link login Spotify sekali pakai dari server yang sedang berjalan.
// Pakai: npm run login   (server harus sudah jalan: npm run dev / di VPS)
const base = (process.env.SERVER_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const key = process.env.API_KEY;

if (!base || !key) {
  console.error('PUBLIC_URL dan API_KEY harus diisi di .env');
  process.exit(1);
}

try {
  const res = await fetch(`${base}/api/login-link`, { method: 'POST', headers: { 'x-api-key': key } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  console.log('\nBuka link ini di browser (berlaku 10 menit), lalu login Spotify:\n');
  console.log(`  ${json.url}\n`);
} catch (e) {
  console.error(`Gagal menghubungi server di ${base}: ${e.message}`);
  console.error('Pastikan server sudah berjalan (npm run dev).');
  process.exit(1);
}
