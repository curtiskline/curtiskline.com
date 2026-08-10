// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://curtiskline.com',
  output: 'static',
  // Silence Dart Sass legacy-JS-API deprecation while we port the HTML5 UP
  // SCSS, which still uses the `@import` syntax.
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['import', 'legacy-js-api', 'global-builtin', 'color-functions', 'slash-div', 'mixed-decls'],
        },
      },
    },
  },
});
