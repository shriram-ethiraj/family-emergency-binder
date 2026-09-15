export interface LegacyMigrationOptions {
  inputPath: string;
  outputPath: string;
  password: string;
  definitionsDir?: string;
  recoveryOutPath?: string;
}

export interface LegacyMigrationResult {
  inputPath: string;
  outputPath: string;
  recoveryKey: string;
  recoveryOutPath?: string;
  profileCount: number;
  documentCount: number;
  revisionCount: number;
  templateCount: number;
}

export function migrateLegacyVault(options: LegacyMigrationOptions): Promise<LegacyMigrationResult>;
