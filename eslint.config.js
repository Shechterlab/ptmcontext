// A minimal lint for the site kit (ptmcontext/web/assets/*.js): a name used but never defined, and a variable never used.
// The kit runs in a browser as plain scripts; each module is a function of K, registered on window.PTMC_MODULES.
const browser = [
    '$3Dmol', 'AbortController', 'AbortSignal', 'Array', 'ArrayBuffer', 'BigInt', 'Blob', 'Boolean',
    'BroadcastChannel', 'CSS', 'ClipboardItem', 'CompressionStream', 'CustomEvent', 'DOMMatrix', 'DOMParser',
    'DOMPoint', 'DOMRect', 'DataView', 'Date', 'DecompressionStream', 'Element', 'Error', 'Event', 'FileReader',
    'Float32Array', 'Float64Array', 'FormData', 'HTMLDetailsElement', 'HTMLElement', 'Headers', 'Image',
    'Infinity', 'Int32Array', 'IntersectionObserver', 'Intl', 'JSON', 'KeyboardEvent', 'Map', 'Math',
    'MessageChannel', 'MouseEvent', 'MutationObserver', 'NaN', 'Node', 'NodeFilter', 'NodeList', 'Number',
    'Object', 'OffscreenCanvas', 'PTMC', 'PTMC_MODULES', 'Path2D', 'Plotly', 'Promise', 'Proxy', 'RangeError',
    'Reflect', 'RegExp', 'Request', 'ResizeObserver', 'Response', 'SVGElement', 'Set', 'String', 'Symbol', 'THREE',
    'TextDecoder', 'TextEncoder', 'TouchEvent', 'TypeError', 'URL', 'URLSearchParams', 'Uint16Array',
    'Uint32Array', 'Uint8Array', 'WeakMap', 'WeakSet', 'WebAssembly', 'WebGLRenderingContext', 'Worker',
    'XMLSerializer', 'addEventListener', 'alert', 'atob', 'btoa', 'cancelAnimationFrame', 'clearInterval',
    'clearTimeout', 'confirm', 'console', 'crypto', 'd3', 'decodeURIComponent', 'devicePixelRatio',
    'dispatchEvent', 'document', 'encodeURIComponent', 'fetch', 'getComputedStyle', 'getSelection', 'globalThis',
    'history', 'indexedDB', 'innerHeight', 'innerWidth', 'isFinite', 'isNaN', 'localStorage', 'location',
    'matchMedia', 'navigator', 'open', 'pageYOffset', 'parseFloat', 'parseInt', 'performance', 'print', 'prompt',
    'queueMicrotask', 'removeEventListener', 'requestAnimationFrame', 'requestIdleCallback', 'screen', 'scrollBy',
    'scrollTo', 'scrollX', 'scrollY', 'sessionStorage', 'setInterval', 'setTimeout', 'structuredClone',
    'undefined', 'window',
];
const globals = Object.fromEntries(browser.map((name) => [name, 'readonly']));

module.exports = [
  {
    files: ['ptmcontext/web/assets/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
];
