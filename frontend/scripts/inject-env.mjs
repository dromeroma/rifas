#!/usr/bin/env node
/**
 * Inyecta variables de entorno en src/environments/environment.prod.ts antes de
 * que Angular compile. Lo usa Vercel/CI para configurar la URL del backend sin
 * tocar el código fuente.
 *
 * Variables usadas:
 *   API_URL   → environment.apiUrl (default '/api')
 *
 * Si las variables no están definidas, deja los defaults sin cambiar.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(import.meta.dirname, '..', 'src', 'environments', 'environment.prod.ts');
if (!existsSync(file)) {
  console.error(`[inject-env] no se encontró ${file}`);
  process.exit(1);
}

const apiUrl = process.env.API_URL ?? '/api';

const content = `export const environment = {
  production: true,
  apiUrl: ${JSON.stringify(apiUrl)},
};
`;
writeFileSync(file, content, 'utf8');
console.log(`[inject-env] environment.prod.ts → apiUrl=${apiUrl}`);
