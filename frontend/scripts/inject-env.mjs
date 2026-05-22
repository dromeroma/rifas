#!/usr/bin/env node
/**
 * Inyecta valores dinámicos en los archivos de environment de Angular antes
 * de que compile.
 *
 *  - version  → siempre se toma de package.json (única fuente de verdad)
 *  - apiUrl   → en producción, se toma de la variable de entorno API_URL
 *               (configurable en Vercel). En desarrollo se deja el valor
 *               existente (localhost:8000).
 *  - whatsappNumber / whatsappDefaultMessage → se PRESERVAN del archivo
 *               existente (o se sobreescriben con env vars si están seteadas).
 *               Hubo un bug histórico: este script reescribía el archivo y
 *               eliminaba estos campos, rompiendo el build en Vercel porque
 *               varios componentes importan `environment.whatsappNumber`.
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

const DEFAULT_API_URL = 'https://rifas-nehd.onrender.com';
const DEFAULT_WHATSAPP_NUMBER = '573135487605';
const DEFAULT_WHATSAPP_MESSAGE =
  'Hola Boletera, quiero más información para administrar mis rifas con su plataforma.';

const apiUrl = process.env.API_URL || DEFAULT_API_URL;

// Extrae un literal string de un environment.ts existente. Devuelve null si
// no encuentra la propiedad. Esto nos deja preservar valores que el dev cambió
// manualmente sin que el script los borre.
function readStringField(filePath, field) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf8');
  // Match: `field: "valor"` o `field: 'valor'` (puede tener salto de línea
  // antes del valor, ej. mensaje en varias líneas).
  const re = new RegExp(`${field}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`, 'm');
  const m = content.match(re);
  return m ? m[2] : null;
}

const existingProdWa = readStringField(envProd, 'whatsappNumber');
const existingProdMsg = readStringField(envProd, 'whatsappDefaultMessage');
const whatsappNumber = process.env.WHATSAPP_NUMBER || existingProdWa || DEFAULT_WHATSAPP_NUMBER;
const whatsappDefaultMessage =
  process.env.WHATSAPP_DEFAULT_MESSAGE || existingProdMsg || DEFAULT_WHATSAPP_MESSAGE;

const prodContent = `export const environment = {
  production: true,
  apiUrl: ${JSON.stringify(apiUrl)},
  version: ${JSON.stringify(version)},
  // Número de WhatsApp en formato internacional sin espacios ni +.
  whatsappNumber: ${JSON.stringify(whatsappNumber)},
  whatsappDefaultMessage: ${JSON.stringify(whatsappDefaultMessage)},
};
`;
writeFileSync(envProd, prodContent, 'utf8');
console.log(`[inject-env] environment.prod.ts → apiUrl=${apiUrl}, version=${version}, whatsapp=${whatsappNumber}`);

// En desarrollo: preserva apiUrl que el dev haya configurado (típicamente
// localhost), pero refresca version y whatsapp con los mismos defaults.
if (existsSync(envDev)) {
  const existingDevApi = readStringField(envDev, 'apiUrl') || 'http://localhost:8000';
  const existingDevWa = readStringField(envDev, 'whatsappNumber') || whatsappNumber;
  const existingDevMsg = readStringField(envDev, 'whatsappDefaultMessage') || whatsappDefaultMessage;
  const devContent = `export const environment = {
  production: false,
  apiUrl: ${JSON.stringify(existingDevApi)},
  version: ${JSON.stringify(version)},
  whatsappNumber: ${JSON.stringify(existingDevWa)},
  whatsappDefaultMessage: ${JSON.stringify(existingDevMsg)},
};
`;
  writeFileSync(envDev, devContent, 'utf8');
  console.log(`[inject-env] environment.ts → apiUrl=${existingDevApi}, version=${version}`);
}
