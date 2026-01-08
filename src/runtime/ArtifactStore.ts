import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppError, ErrorCodes } from './errors';

/**
 * Versioned artifact key
 */
export interface ArtifactKey {
  runId: string;
  name: string;
  version?: number;
}

/**
 * Artifact metadata
 */
export interface ArtifactMetadata {
  key: ArtifactKey;
  createdAt: string;
  type: string;
  size: number;
}

/**
 * In-memory + optional disk persistence for artifacts
 * Stores artifacts per run with versioned keys
 */
export class ArtifactStore {
  private store: Map<string, any> = new Map();
  private metadata: Map<string, ArtifactMetadata> = new Map();
  private persistenceDir?: string;

  constructor(persistenceDir?: string) {
    this.persistenceDir = persistenceDir;
  }

  /**
   * Generate storage key from ArtifactKey
   */
  private toStorageKey(key: ArtifactKey): string {
    const version = key.version !== undefined ? `@${key.version}` : '';
    return `${key.runId}:${key.name}${version}`;
  }

  /**
   * Set an artifact
   */
  async set<T>(key: ArtifactKey, value: T): Promise<void> {
    const storageKey = this.toStorageKey(key);
    
    // Validate JSON-serializable
    try {
      JSON.stringify(value);
    } catch (err) {
      throw new AppError(
        ErrorCodes.ARTIFACT_SAVE_FAILED,
        `Artifact must be JSON-serializable: ${key.name}`,
        false,
        err as Error
      );
    }

    this.store.set(storageKey, value);
    
    // Update metadata
    const metadata: ArtifactMetadata = {
      key,
      createdAt: new Date().toISOString(),
      type: typeof value,
      size: JSON.stringify(value).length,
    };
    this.metadata.set(storageKey, metadata);

    // Persist to disk if enabled
    if (this.persistenceDir) {
      await this.persistToDisk(key, value, metadata);
    }
  }

  /**
   * Get an artifact
   */
  async get<T>(key: ArtifactKey): Promise<T | undefined> {
    const storageKey = this.toStorageKey(key);
    
    // Try in-memory first
    if (this.store.has(storageKey)) {
      return this.store.get(storageKey) as T;
    }

    // Try loading from disk
    if (this.persistenceDir) {
      return await this.loadFromDisk<T>(key);
    }

    return undefined;
  }

  /**
   * Check if artifact exists
   */
  has(key: ArtifactKey): boolean {
    const storageKey = this.toStorageKey(key);
    return this.store.has(storageKey);
  }

  /**
   * Get all artifacts for a run
   */
  getAllForRun(runId: string): Map<string, any> {
    const result = new Map<string, any>();
    for (const [key, value] of this.store.entries()) {
      if (key.startsWith(`${runId}:`)) {
        result.set(key, value);
      }
    }
    return result;
  }

  /**
   * Get metadata for an artifact
   */
  getMetadata(key: ArtifactKey): ArtifactMetadata | undefined {
    const storageKey = this.toStorageKey(key);
    return this.metadata.get(storageKey);
  }

  /**
   * List all artifact names for a run
   */
  listForRun(runId: string): string[] {
    const names: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(`${runId}:`)) {
        const name = key.substring(key.indexOf(':') + 1);
        names.push(name);
      }
    }
    return names;
  }

  /**
   * Clear all artifacts for a run
   */
  clearRun(runId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(`${runId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.store.delete(key);
      this.metadata.delete(key);
    }
  }

  /**
   * Clear all artifacts
   */
  clear(): void {
    this.store.clear();
    this.metadata.clear();
  }

  /**
   * Persist artifact to disk
   */
  private async persistToDisk<T>(
    key: ArtifactKey,
    value: T,
    metadata: ArtifactMetadata
  ): Promise<void> {
    if (!this.persistenceDir) {
      return;
    }

    try {
      const runDir = path.join(this.persistenceDir, key.runId);
      await fs.mkdir(runDir, { recursive: true });

      // Save artifact
      const artifactPath = path.join(runDir, `${key.name}.json`);
      await fs.writeFile(artifactPath, JSON.stringify(value, null, 2), 'utf-8');

      // Save metadata
      const metadataPath = path.join(runDir, `${key.name}.meta.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (err) {
      throw new AppError(
        ErrorCodes.ARTIFACT_SAVE_FAILED,
        `Failed to persist artifact: ${key.name}`,
        true,
        err as Error
      );
    }
  }

  /**
   * Load artifact from disk
   */
  private async loadFromDisk<T>(key: ArtifactKey): Promise<T | undefined> {
    if (!this.persistenceDir) {
      return undefined;
    }

    try {
      const artifactPath = path.join(
        this.persistenceDir,
        key.runId,
        `${key.name}.json`
      );
      
      const content = await fs.readFile(artifactPath, 'utf-8');
      const value = JSON.parse(content) as T;
      
      // Load into memory
      const storageKey = this.toStorageKey(key);
      this.store.set(storageKey, value);

      // Try to load metadata
      try {
        const metadataPath = path.join(
          this.persistenceDir,
          key.runId,
          `${key.name}.meta.json`
        );
        const metaContent = await fs.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(metaContent) as ArtifactMetadata;
        this.metadata.set(storageKey, metadata);
      } catch {
        // Metadata is optional
      }

      return value;
    } catch (err) {
      if ((err as any).code === 'ENOENT') {
        return undefined;
      }
      throw new AppError(
        ErrorCodes.ARTIFACT_NOT_FOUND,
        `Failed to load artifact: ${key.name}`,
        true,
        err as Error
      );
    }
  }

  /**
   * Load all artifacts for a run from disk
   */
  async loadRunFromDisk(runId: string): Promise<void> {
    if (!this.persistenceDir) {
      return;
    }

    try {
      const runDir = path.join(this.persistenceDir, runId);
      const files = await fs.readdir(runDir);

      for (const file of files) {
        if (file.endsWith('.json') && !file.endsWith('.meta.json')) {
          const name = file.replace('.json', '');
          await this.loadFromDisk({ runId, name });
        }
      }
    } catch (err) {
      if ((err as any).code !== 'ENOENT') {
        throw new AppError(
          ErrorCodes.ARTIFACT_NOT_FOUND,
          `Failed to load run artifacts: ${runId}`,
          true,
          err as Error
        );
      }
    }
  }

  /**
   * Get the persistence directory path for a run
   */
  getRunDir(runId: string): string | undefined {
    if (!this.persistenceDir) {
      return undefined;
    }
    return path.join(this.persistenceDir, runId);
  }
}

/**
 * Factory to create artifact stores
 */
export class ArtifactStoreFactory {
  static create(workspaceRoot?: string): ArtifactStore {
    if (workspaceRoot) {
      const persistenceDir = path.join(workspaceRoot, '.vscode', 'helix-runs');
      return new ArtifactStore(persistenceDir);
    }
    return new ArtifactStore();
  }
}
