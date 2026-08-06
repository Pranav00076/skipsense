import { ExtensionSettings, ExtensionStats } from '../types';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  version: 1,
  enabled: true,
  targetPresentation: 'ANY',
  confidenceThreshold: 0.75,
  detectionDelayMs: 1000,
  unknownBehavior: 'RETRY',
  maxRetries: 3,
  maxInferenceIntervalMs: 1000,
  enableNotifications: false,
  enableSound: false,
  debugMode: false,
  whitelistedSites: [],
  blacklistedSites: [],
  theme: 'SYSTEM',
  preferredModelBackend: 'WASM',
};

export const DEFAULT_STATS: ExtensionStats = {
  totalConnections: 0,
  totalSkipped: 0,
  totalAccepted: 0,
  totalUnknown: 0,
  totalRetries: 0,
  averageConfidence: 0,
  averageInferenceTimeMs: 0,
  sessionDate: new Date().toISOString().split('T')[0],
};

export class StorageService {
  /**
   * Retrieves current settings from Chrome sync storage, merging with defaults.
   */
  static async getSettings(): Promise<ExtensionSettings> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return DEFAULT_SETTINGS;
    }
    
    return new Promise((resolve) => {
      chrome.storage.sync.get('settings', (result) => {
        if (result.settings) {
          resolve({ ...DEFAULT_SETTINGS, ...result.settings });
        } else {
          resolve(DEFAULT_SETTINGS);
        }
      });
    });
  }

  /**
   * Saves settings to Chrome sync storage.
   */
  static async saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return new Promise((resolve) => {
        chrome.storage.sync.set({ settings: updated }, () => {
          resolve(updated);
        });
      });
    }
    return updated;
  }

  /**
   * Retrieves stats from Chrome local storage.
   * Resets stats if the session date has changed (daily reset).
   */
  static async getStats(): Promise<ExtensionStats> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return DEFAULT_STATS;
    }

    return new Promise((resolve) => {
      chrome.storage.local.get('stats', (result) => {
        const today = new Date().toISOString().split('T')[0];
        if (result.stats) {
          const stats = result.stats as ExtensionStats;
          if (stats.sessionDate !== today) {
            // Reset daily
            const resetStats = { ...DEFAULT_STATS, sessionDate: today };
            chrome.storage.local.set({ stats: resetStats });
            resolve(resetStats);
          } else {
            resolve({ ...DEFAULT_STATS, ...stats });
          }
        } else {
          resolve(DEFAULT_STATS);
        }
      });
    });
  }

  /**
   * Increments specific statistics atomically.
   */
  static async updateStats(updates: Partial<ExtensionStats>): Promise<ExtensionStats> {
    const current = await this.getStats();
    
    // Calculate new averages if confidence or time is provided
    let newAvgConfidence = current.averageConfidence;
    let newAvgTime = current.averageInferenceTimeMs;
    
    if (updates.averageConfidence !== undefined) {
      const totalDecisions = current.totalSkipped + current.totalAccepted + current.totalUnknown + 1;
      newAvgConfidence = ((current.averageConfidence * (totalDecisions - 1)) + updates.averageConfidence) / totalDecisions;
    }

    if (updates.averageInferenceTimeMs !== undefined) {
      const totalInferences = current.totalConnections + current.totalRetries + 1;
      newAvgTime = ((current.averageInferenceTimeMs * (totalInferences - 1)) + updates.averageInferenceTimeMs) / totalInferences;
    }

    const updated: ExtensionStats = {
      ...current,
      ...updates,
      totalConnections: current.totalConnections + (updates.totalConnections || 0),
      totalSkipped: current.totalSkipped + (updates.totalSkipped || 0),
      totalAccepted: current.totalAccepted + (updates.totalAccepted || 0),
      totalUnknown: current.totalUnknown + (updates.totalUnknown || 0),
      totalRetries: current.totalRetries + (updates.totalRetries || 0),
      averageConfidence: newAvgConfidence,
      averageInferenceTimeMs: newAvgTime,
    };

    if (typeof chrome !== 'undefined' && chrome.storage) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ stats: updated }, () => {
          resolve(updated);
        });
      });
    }
    return updated;
  }
}
