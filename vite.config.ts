import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			// shadcn/ui + AI Elements components import from "@/..."
			// (URL().pathname avoids needing @types/node for node:url/path)
			'@': new URL('./src', import.meta.url).pathname,
		},
	},
	server: {
		port: 5180,
	},
})
