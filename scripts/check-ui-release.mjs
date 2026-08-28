import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const app = read('apps/web/src/App.tsx');
const api = read('apps/web/src/api.ts');
const publicBooking = read('apps/web/src/PublicBookingWorkspace.tsx');
const styles = read('apps/web/src/styles.css');
const html = read('apps/web/index.html');

const requiredRoutes = [
  'BusinessSetupWorkspace',
  'RevenueAutomationWorkspace',
  'ReportsWorkspace',
  'SettingsWorkspace',
  'OnboardingWorkspace',
  'SystemOwnerWorkspace',
  'PublicBookingWorkspace',
];

const checks = [
  ['No placeholder workspace is routed', !app.includes('WorkspacePreview')],
  ...requiredRoutes.map(name => [`${name} is routed`, app.includes(name)]),
  ['Public booking route is no-login', app.includes('/book\\/([^/]+)') && api.includes('export async function publicGet')],
  ['Responsive viewport is declared', html.includes('name="viewport"')],
  ['Mobile breakpoints are present', styles.includes('@media(max-width:560px)')],
  ['Keyboard focus is visible', styles.includes(':focus-visible')],
  ['Skip navigation is present', app.includes('className="skip-link"') && app.includes('id="main-content"')],
  ['Skip navigation stays outside the application grid', app.indexOf('className="skip-link"') < app.indexOf('className="app-shell"')],
  ['Reduced motion is respected', styles.includes('prefers-reduced-motion:reduce')],
  ['Public booking exposes step state', publicBooking.includes("aria-current={index === step ? 'step'")],
  ['Public booking error is announced', publicBooking.includes('className="public-error" role="alert"')],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) {
  console.error(`UI release preflight failed: ${failed.length} check(s)`);
  process.exit(1);
}
console.log(`UI release preflight: PASS (${checks.length}/${checks.length})`);
