export type DockerLogService = 'ccs' | 'cliproxy';

export interface DockerCommandTarget {
  host?: string;
}

export interface DockerUpOptions extends DockerCommandTarget {
  port: number;
  proxyPort: number;
}

export interface DockerLogsOptions extends DockerCommandTarget {
  follow: boolean;
  service?: DockerLogService;
}

export interface DockerCommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  remote: boolean;
}

export interface DockerStatusResult {
  compose: DockerCommandResult;
  supervisor?: DockerCommandResult;
}

export interface DockerConfigSummary {
  host?: string;
  remote: boolean;
  ccsDir: string;
  dockerDir: string;
  composeFile: string;
  dockerfile: string;
  supervisordConfig: string;
  entrypoint: string;
  remoteDeployDir: string;
  composeService: string;
  containerName: string;
  dashboardPort: number;
  proxyPort: number;
}
