import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './src/server/api.ts';
import { db } from './src/server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON body parser with limit for compressed image uploads
app.use(express.json({ limit: '10mb' }));

// Mount IncidenciasTRANS API
app.use('/api', apiRouter);

// Serve static frontend files built in dist/
const distPath = path.resolve(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head><title>IncidenciasTRANS Server</title></head>
      <body style="font-family:sans-serif;padding:2rem;">
        <h1>Servidor IncidenciasTRANS</h1>
        <p>El servicio backend esta en ejecucion en el puerto ${PORT}.</p>
        <p>Para la interfaz de usuario, ejecute <code>npm run dev</code> en desarrollo o <code>npm run build</code> para produccion.</p>
      </body>
      </html>
    `);
  });
}

// Graceful shutdown handling for SQLite WAL checkpoint
process.on('SIGINT', () => {
  console.log('\n[IncidenciasTRANS] Cerrando servidor y optimizando SQLite...');
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (e) {
    // ignore
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[IncidenciasTRANS] Deteniendo servicio...');
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (e) {
    // ignore
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`[IncidenciasTRANS] Servidor HTTP activo en http://0.0.0.0:${PORT}`);
  console.log(`[IncidenciasTRANS] Base de datos SQLite activa con modo WAL`);
  console.log(`[ClienteINCIDENCIAS] Interfaz web lista`);
});
