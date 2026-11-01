// Launch headless Chromium with WebGL (software SwiftShader when no GPU is present).
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];

export async function launchBrowser() {
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  try {
    return await chromium.launch({ args: ARGS });
  } catch (e) {
    if (!executablePath) throw e;
    return chromium.launch({ executablePath, args: ARGS });
  }
}
