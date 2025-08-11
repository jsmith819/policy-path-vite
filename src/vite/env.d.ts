/// <reference types="vite/client" />

// (optional but nice) tell TS exactly which env vars you use
interface ImportMetaEnv {
    readonly VITE_API_BASE_URL: string
    readonly VITE_BASIC_AUTH_USER: string
    readonly VITE_BASIC_AUTH_PASS: string
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
  