import fs from 'node:fs';
import path from 'node:path';

/** Code always comes from this repository; interpreter may be explicitly configured. */
export function resolveScraperRuntime(root, env = process.env) {
  const scraper = path.join(root, 'scraper');
  const executable = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
  const candidates = env.SCRAPER_PYTHON
    ? [path.resolve(root, env.SCRAPER_PYTHON)]
    : ['.venv', 'venv'].map(folder => path.join(scraper, folder, executable));
  const python = candidates.find(candidate => fs.existsSync(candidate));
  if (!python) throw new Error('scraper Python environment missing: create scraper/.venv or run scraper/start.bat; alternatively set SCRAPER_PYTHON');
  if (!fs.existsSync(path.join(scraper, 'poc_ingest_real.py'))) throw new Error('Bundled source worker is missing');
  return { scraper, python };
}
