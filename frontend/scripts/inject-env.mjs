#!/usr/bin/env node
/**
 * Inyecta valores dinámicos en los archivos de environment de Angular antes
 * de que compile.
 *
 *  - version  → siempre se toma de package.json (única fuente de verdad)
 *  - apiUrl   → en producción, se toma de la variable de entorno API_URL
 *               (configurable en Vercel). En desarrollo se deja el valor
 *               existente (localhost:8000).
 *
 * Se ejecuta tanto en `npm run build` (prebuild) como en `npm start` (prestart).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const here = import.meta.dirname;
const pkgPath = resolve(here, '..', 'package.json');
const envDir = resolve(here, '..', 'src', 'environments');
const envDev = resolve(envDir, 'environment.ts');
const envProd = resolve(envDir, 'environment.prod.ts');

if (!existsSync(pkgPath)) {
  console.error(`[inject-env] no se encontró ${pkgPath}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = pkg.version || '0.0.0';
const apiUrl = process.env.API_URL ?? '/api';

const prodContent = `export const environment = {
  production: true,
  apiUrl: ${JSON.stringify(apiUrl)},
  version: ${JSON.stringify(version)},
};
`;
writeFileSync(envProd, prodContent, 'utf8');
console.log(`[inject-env] environment.prod.ts → apiUrl=${apiUrl}, version=${version}`);

// En desarrollo solo actualizamos la version. Mantenemos cualquier apiUrl que
// el dev haya configurado para hablar con su backend local.
if (existsSync(envDev)) {
  const existing = readFileSync(envDev, 'utf8');
  const m = existing.match(/apiUrl:\s*(['"])([^'"]+)\1/);
  const devApiUrl = m ? m[2] : 'http://localhost:8000';
  const devContent = `export const environment = {
  production: false,
  apiUrl: ${JSON.stringify(devApiUrl)},
  version: ${JSON.stringify(version)},
};
`;
  writeFileSync(envDev, devContent, 'utf8');
  console.log(`[inject-env] environment.ts → apiUrl=${devApiUrl}, version=${version}`);
}
