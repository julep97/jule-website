// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages deploy: project site at https://julep97.github.io/jule-website/
export default defineConfig({
  site: 'https://julep97.github.io',
  base: '/jule-website',
  trailingSlash: 'ignore',
  build: {
    assets: '_astro',
    inlineStylesheets: 'auto',
  },
  vite: {
    server: {
      // do not collide with python http.server on 8080
      port: 4321,
    },
  },
});
