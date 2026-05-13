import * as fs from 'fs';
import * as path from 'path';

export function isAccountInstanceName(name: string): boolean {
  return !name.startsWith('.');
}

export function listAccountInstanceNames(instancesDir: string): string[] {
  if (!fs.existsSync(instancesDir)) {
    return [];
  }

  return fs.readdirSync(instancesDir).filter((name) => {
    if (!isAccountInstanceName(name)) {
      return false;
    }

    return fs.statSync(path.join(instancesDir, name)).isDirectory();
  });
}

export function listAccountInstancePaths(instancesDir: string): string[] {
  return listAccountInstanceNames(instancesDir).map((name) => path.join(instancesDir, name));
}
