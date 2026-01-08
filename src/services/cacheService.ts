import { ArtifactStore } from '../runtime/ArtifactStore';

/**
 * Cache service for artifact persistence
 * Wraps ArtifactStore with convenience methods
 */
export class CacheService {
  constructor(private artifactStore: ArtifactStore) {}

  /**
   * Cache an artifact
   */
  async cache<T>(runId: string, key: string, value: T): Promise<void> {
    await this.artifactStore.set({ runId, name: key }, value);
  }

  /**
   * Get cached artifact
   */
  async get<T>(runId: string, key: string): Promise<T | undefined> {
    return await this.artifactStore.get<T>({ runId, name: key });
  }

  /**
   * Check if artifact exists
   */
  has(runId: string, key: string): boolean {
    return this.artifactStore.has({ runId, name: key });
  }

  /**
   * Clear cache for a run
   */
  clearRun(runId: string): void {
    this.artifactStore.clearRun(runId);
  }

  /**
   * List cached artifacts for a run
   */
  list(runId: string): string[] {
    return this.artifactStore.listForRun(runId);
  }
}
