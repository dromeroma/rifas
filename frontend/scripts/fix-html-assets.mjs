#!/usr/bin/env node
/**
 * Post-build fix para el HTML generado por Angular 21.
 *
 * Bug: el builder @angular-devkit/build-angular:application inyecta
 *   <link rel="stylesheet" href="styles-XYZ.css">
 * ANTES del <!doctype html> y del <base href="/">. Al abrir directamente
 * una URL profunda (F5 en /admin/raffles/3 o /rifa/3/comprar), el
 * navegador resuelve el CSS relativo a la ruta actual y pide
 * /admin/raffles/styles-XYZ.css, que no existe. Vercel devuelve
 * index.html con Content-Type text/html y el sitio se queda sin estilos
 * (fondo negro).
 *
 * Este script parsea el index.html de salida y reemplaza los href/src
 * relativos por rutas absolutas con "/" para que el navegador siempre
 * los resuelva desde raíz sin importar dónde esté.
 *
 * También mueve el <link href="styles-XYZ.css"> que estaba antes del
 * <!doctype> al inicio del <head> (donde debe estar).
 *
 * Se ejecuta como `postbuild` — Angular termina, este corre.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const here = import.meta.dirname;
const distIndex = resolve(here, '..', 'dist', 'sistema-rifas', 'browser', 'index.html');

if (!existsSync(distIndex)) {
  console.log(`[fix-html-assets] ${distIndex} no existe — skip`);
  process.exit(0);
}

let html = readFileSync(distIndex, 'utf8');
const originalLength = html.length;

// PASO 1: si Angular puso un <link rel="stylesheet"> ANTES del <!doctype html>,
// extraerlo y moverlo al inicio del <head>. Necesitamos que quede DENTRO
// del head y DESPUÉS del <base href>.
const doctypeIdx = html.indexOf('<!doctype');
if (doctypeIdx > 0) {
  const beforeDoctype = html.slice(0, doctypeIdx);
  const linkRe = /<link[^>]*rel="stylesheet"[^>]*>/gi;
  const preambulos = [...beforeDoctype.matchAll(linkRe)].map((m) => m[0]);
  if (preambulos.length > 0) {
    console.log(`[fix-html-assets] Moviendo ${preambulos.length} <link> del preámbulo al <head>`);
    html = html.slice(doctypeIdx); // remueve todo lo que estaba antes del doctype
    // Los insertamos justo después del </base>
    const baseIdx = html.indexOf('<base href="/">');
    if (baseIdx >= 0) {
      const insertAt = html.indexOf('>', baseIdx) + 1;
      html = html.slice(0, insertAt) + '\n  ' + preambulos.join('\n  ') + html.slice(insertAt);
    } else {
      // Sin <base>, los ponemos al inicio del <head>
      html = html.replace('<head>', `<head>\n  ${preambulos.join('\n  ')}`);
    }
  }
}

// PASO 2: reescribir hrefs relativos (styles-XYZ.css, chunk-XYZ.js, etc)
// a rutas absolutas con "/" al inicio. Aplica solo si NO empiezan ya con /,
// http://, https://, //, o data:.
const assetRe = /(href|src)="((?!\/|https?:\/\/|\/\/|data:|#)([^"]*\.(?:css|js|webmanifest|svg|ico|png|jpg|jpeg|webp)))"/g;
let count = 0;
html = html.replace(assetRe, (_, attr, path) => {
  count++;
  return `${attr}="/${path}"`;
});
if (count > 0) {
  console.log(`[fix-html-assets] Convertí ${count} href/src relativos a absolutos "/"`);
}

if (html.length !== originalLength) {
  writeFileSync(distIndex, html, 'utf8');
  console.log(`[fix-html-assets] index.html actualizado (${originalLength} → ${html.length} bytes)`);
} else {
  console.log('[fix-html-assets] no hay cambios — index.html ya estaba bien');
}
