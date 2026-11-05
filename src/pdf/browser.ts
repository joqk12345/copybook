import { existsSync } from 'node:fs';
export function browserOptions() {
  const systemChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath=process.env.WORKSHEET_CHROME??(existsSync(systemChrome)?systemChrome:undefined);
  return executablePath ? {executablePath} : {};
}
