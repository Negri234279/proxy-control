// @ts-check
import node from '@astrojs/node'
import preact from '@astrojs/preact'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

const usePolling = process.env.USE_POLLING === 'true'

// https://astro.build/config
export default defineConfig({
    integrations: [preact()],
    vite: {
        plugins: [tailwindcss()],
        server: {
            allowedHosts: ['proxy-control'],
            watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
        },
    },
    output: 'server',
    adapter: node({
        mode: 'standalone',
    }),
})
