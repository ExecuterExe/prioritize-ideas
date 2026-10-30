import {defineConfig} from 'vite'
import {viteSingleFile} from 'vite-plugin-singlefile'

// mode "single" собирает один HTML-файл для режима «Один экран» без сети
export default defineConfig(({mode}) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  define: {__SINGLE__: JSON.stringify(mode === 'single')},
  oxc: {jsx: {runtime: 'automatic', importSource: 'preact'}},
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022'
  },
  server: {host: true}
}))
