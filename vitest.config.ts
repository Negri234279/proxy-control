import { defineConfig } from 'vitest/config'

// Tests unitarios (Vitest). Entorno Node (no DOM): cubrimos la lógica pura del servidor y de
// `src/lib` (validación, parsers, diff, mapeos, cifrado…). El `setupFiles` fija un entorno de
// test hermético ANTES de importar cualquier módulo que valide `env` al cargarse.
export default defineConfig({
    test: {
        environment: 'node',
        setupFiles: ['./test/setup.ts'],
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        // Preact para posibles tipos/JSX compartidos, consistente con el runtime de la app.
        alias: {
            react: 'preact/compat',
            'react-dom': 'preact/compat',
        },
    },
})
