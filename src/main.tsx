import ReactDOM from 'react-dom/client'
// Self-hosted typefaces: bundled by Vite with hashed URLs, so they load from
// the app's own origin and survive the GitHub Pages base path.
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
