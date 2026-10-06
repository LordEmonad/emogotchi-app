/// <reference types="vite/client" />
declare module '*.svg?raw' { const src: string; export default src; }
/** The fourth pet's contract address, or '' while he is not launched (vite.config.ts `define`). */
declare const __THICCUMS__: string;
/** r3tardgotchi's contract address, or '' until he is launched (vite.config.ts) */
declare const __R3TARDS__: string;
declare const __EMONAD__: string;
/** True in a build with sound (every dev build; a production build only with VITE_SOUND=on). See src/sound/. */
declare const __SOUND__: boolean;
