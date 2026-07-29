import { defineConfig } from 'vite'

/**
 * GitHub Pages serve o site num subcaminho (/battle-balls/), não na raiz do domínio.
 * Sem `base` correto, o build de produção referenciaria /assets/... (raiz), que 404
 * no Pages. `command === 'build'` isola isso do dev local, que continua na raiz.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/battle-balls/' : '/',
}))
