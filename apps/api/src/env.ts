// Loads apps/api/.env into process.env, if there is one, for settings such as
// DATABASE_URL (see .env.example). Variables already set in the shell win.
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));

export function loadLocalEnv(): void {
  if (existsSync(ENV_FILE)) loadEnvFile(ENV_FILE);
}
