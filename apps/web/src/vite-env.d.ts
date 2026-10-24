/// <reference types="vite/client" />
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
interface ImportMetaEnv {
  readonly VITE_DATA_MANIFEST?: string;
}
