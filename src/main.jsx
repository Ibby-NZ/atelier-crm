import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Agentation } from 'agentation'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { AppStoreProvider } from './store/AppStore.jsx'

// HashRouter keeps deep links working when opened from a static build (file/preview) without server rewrites.
// AppStoreProvider wraps everything (outside the router) so localStorage-backed records are available app-wide.
//
// Agentation is the dev-only visual feedback toolbar. `import.meta.env.DEV` is
// statically replaced with `false` by Vite in `npm run build`, so the whole
// branch — and the agentation import with it — is tree-shaken out of the
// production bundle.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppStoreProvider>
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
      {import.meta.env.DEV && <Agentation />}
    </AppStoreProvider>
  </React.StrictMode>,
)
