// The ATELIER TEXTILES lockup's geometry, held once for the two places that draw
// it: <Wordmark> in the app, and the printed documents, which are built as HTML
// strings and cannot render a component (the packing slip, utils/orderPackingSlip.js).
// The same geometry the storefront inlines (atelier-storefront/src/components/
// Wordmark.astro) — keep the two identical. 636 × 141.
//
// `tone` is which of the lockup's two colours a shape takes: `accent` the ochre
// ATELIER, `ink` the TEXTILES line beneath it. Each drawer maps the tone to its
// own colour (CSS variables in the app, the token values on paper).

export const WORDMARK_VIEWBOX = '0 0 636 141'

export const WORDMARK_PATHS = Object.freeze([
  { tone: 'accent', d: 'M287.73 22.38h-50.87v12.9h47.07v10.63h-47.07v12.9h50.87v13.3h-70.99V9.08h70.99zM35.3 8.9h20.3L21.26 72.1H0z' },
  { tone: 'ink', d: 'M261.75 91.08h14.02l-28.79 40.24h-14.67z' },
  { tone: 'ink', d: 'M248.23 91H234.2l28.78 40.23h14.68z' },
  { tone: 'accent', d: 'M59.92 8.86h-20.3L74.2 72.1h21.25z' },
  { tone: 'accent', d: 'M23.15 46.67h53.14v14.42H23.15zm93.38-37.58h75.16v16.32h-75.16z' },
  { tone: 'ink', d: 'M133.24 91.08h36.44v10.63h-36.44zm154.49 0h36.44v10.63h-36.44z' },
  { tone: 'ink', d: 'M146.14 131.32v-37.2h10.63v37.2z' },
  { tone: 'accent', d: 'M144.05 72.3V14.6h18.98v57.7z' },
  { tone: 'ink', d: 'M300.64 131.32v-37.2h10.63v37.2zm-114.64 0V91.08h12.91v40.24zm236.1 0V91.08h12.91v40.24z' },
  { tone: 'accent', d: 'M556.1 72.1V9.09h20.11v63zm-240.29 0V9.09h20.12v63zm90.35 0v-63h20.12v63z' },
  { tone: 'ink', d: 'M342.01 131.32V91.08h13.3v40.24zm31.13 0V91.08h13.29v40.24z' },
  { tone: 'ink', d: 'M406.16 131.32h-33.02v-10.25h33.02zm-186-31.12H186v-9.12h34.16zm236.11 0h-34.16v-9.12h34.16zm-236.11 31.12H186v-9.11h34.16zm236.11 0h-34.16v-9.11h34.16z' },
  { tone: 'accent', d: 'M379.96 72.1h-64.15V55.78h64.15zm147.29-49.72h-50.87v12.9h47.07v10.63h-47.07v12.9h50.87v13.3h-70.99V9.08h70.99z' },
  { tone: 'ink', d: 'M220.16 114.61h-29.61v-7.2h29.61zm236.11 0h-29.61v-7.2h29.61z' },
  { tone: 'accent', d: 'M620.62 55.78h-58.84V40.22h58.84zm-2.65-31.12h-55.04V9.1h55.04z' },
  { tone: 'accent', d: 'M610.57 40.22c7.71 0 6.83-15.57 0-15.57V9.1h7.71c11.26-.15 17.72 7.21 17.72 15v9.1c0 10.63-7.21 15.76-14.44 15.76z' },
  { tone: 'accent', d: 'M615.7 60.52c0-3.98-2.86-4.74-5.43-4.74l6.94-9.49 6.26 2.36c8.73 0 11.2 6 11.2 10.36v13.1h-18.98c-.06-2.1 0-7.33 0-11.59' },
  { tone: 'ink', d: 'M495.37 103.09a4.3 4.3 0 0 0-1.63-3.16q-1.43-1.14-4.35-1.14-1.87 0-3.06.43a3.7 3.7 0 0 0-1.73 1.11 2.6 2.6 0 0 0-.59 1.62q-.05.75.28 1.36.35.59 1.09 1.07.74.47 1.88.85 1.16.39 2.73.7l3.64.72q3.69.73 6.31 1.92 2.62 1.2 4.3 2.82a10 10 0 0 1 2.44 3.6q.8 2.01.83 4.37a11 11 0 0 1-2.2 6.93 13.3 13.3 0 0 1-6.2 4.3 28 28 0 0 1-9.64 1.49 29 29 0 0 1-10.1-1.6 14 14 0 0 1-6.68-4.92q-2.36-3.34-2.38-8.55h11.44a6 6 0 0 0 1.02 3.2 5.6 5.6 0 0 0 2.56 1.97q1.68.66 3.97.66 1.93 0 3.23-.44a4.4 4.4 0 0 0 1.97-1.23 2.8 2.8 0 0 0 .7-1.8 2.5 2.5 0 0 0-.68-1.67 5 5 0 0 0-2.08-1.3q-1.45-.57-3.92-1.09l-4.42-.89q-5.9-1.2-9.3-3.98-3.39-2.82-3.36-7.68-.03-3.94 2.25-6.9a15 15 0 0 1 6.35-4.64 25 25 0 0 1 9.35-1.66q5.37 0 9.3 1.68a13.7 13.7 0 0 1 6.04 4.74 12 12 0 0 1 2.17 7.1z' },
])
