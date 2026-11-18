# Guia de contribucion

Gracias por colaborar con IncidenciasTRANS.

## Antes de empezar

1. Usa una rama corta basada en `main`.
2. No incluyas bases de datos, archivos `.env`, credenciales ni datos reales de incidencias.
3. Conserva el comportamiento existente salvo que el cambio sea necesario y esté documentado.

## Preparacion local

Requisitos:

* Node.js 24 recomendado.
* npm.

```bash
npm install
npm run lint
npm test
npm run build
npm run dev
```

La aplicación usa SQLite nativo de Node.js y crea `data/incidencias.db` al ejecutarse.

## Cambios

* Mantén los cambios pequeños y centrados.
* Sigue TypeScript, React y los patrones existentes.
* Añade o actualiza tests solo cuando cubran un comportamiento observable.
* Ejecuta lint, test y build antes de abrir la solicitud de cambios.
* No incluyas artefactos `dist/`, `node_modules/` ni `data/`.

## Solicitudes de cambios

Describe el problema, la solución y las validaciones realizadas. Vincula cualquier incidencia relacionada y señala cambios incompatibles o configuraciones nuevas.
