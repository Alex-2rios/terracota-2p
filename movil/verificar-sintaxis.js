/*
 * Comprueba que todos los archivos JS/JSX de la app se parsean sin errores.
 *
 *   node verificar-sintaxis.js
 *
 * No sustituye a probar la app, pero atrapa erratas antes de abrir Expo.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const RAIZ = __dirname;
const CARPETAS = ['screens', 'components', 'services', 'utils'];
const SUELTOS = ['App.js', 'index.js'];

const archivos = [
  ...SUELTOS.map((nombre) => path.join(RAIZ, nombre)),
  ...CARPETAS.flatMap((carpeta) => {
    const ruta = path.join(RAIZ, carpeta);
    if (!fs.existsSync(ruta)) return [];
    return fs.readdirSync(ruta)
      .filter((nombre) => nombre.endsWith('.js'))
      .map((nombre) => path.join(ruta, nombre));
  }),
].filter((ruta) => fs.existsSync(ruta));

let errores = 0;

for (const archivo of archivos) {
  const relativo = path.relative(RAIZ, archivo);
  try {
    parser.parse(fs.readFileSync(archivo, 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    });
    console.log(`  OK  ${relativo}`);
  } catch (error) {
    errores += 1;
    console.log(`  ERR ${relativo}: ${error.message}`);
  }
}

console.log(`\n${archivos.length} archivos revisados, ${errores} con error.`);
process.exit(errores ? 1 : 0);
