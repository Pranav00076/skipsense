import { MessageBus } from '../core/MessageBus';
import { StorageService } from '../storage/StorageService';
import { ExtensionSettings, ExtensionStats } from '../types';

class BackgroundService {
  private settings: ExtensionSettings | null = null;
  private stats: ExtensionStats | null = null;

  async init() {
    console.log('[SkipSense Background] Initializing Background Service...');
    
    // 1. Load initial storage
    this.settings = await StorageService.getSettings();
    this.stats = await StorageService.getStats();

    // 2. Initialize MessageBus for background context
    MessageBus.init();

    // 3. Setup Listeners
    this.setupMessageListeners();
    this.setupStorageListeners();
    
    console.log('[SkipSense Background] Background Service Ready.');
  }

  private setupMessageListeners() {
    // Handle Requests for Settings
    MessageBus.on('SETTINGS_UPDATED', (_message, _sender, sendResponse) => {
      sendResponse({ payload: { settings: this.settings } });
      return false; 
    });

    // Handle Stats Updates from Content Scripts
    MessageBus.on('STATS_UPDATED', (message) => {
      if (message.payload) {
        StorageService.updateStats(message.payload).then((updatedStats) => {
          this.stats = updatedStats;
          // Broadcast new stats to Popup/Options
          MessageBus.send({
             type: 'STATS_UPDATED',
             payload: { stats: this.stats }
          });
        });
      }
      return false;
    });

    // Log State Changes for Debugging
    MessageBus.on('FSM_STATE_CHANGE', (message) => {
       if (this.settings?.debugMode) {
          console.log(`[SkipSense State] ${message.payload.from} -> ${message.payload.to}`);
       }
       return false;
    });
  }

  private setupStorageListeners() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.settings) {
        this.settings = { ...this.settings, ...changes.settings.newValue } as ExtensionSettings;
        
        // Broadcast to content scripts and popups
        MessageBus.send({
          type: 'SETTINGS_UPDATED',
          payload: { settings: this.settings }
        });
      }
    });
  }
}

// Instantiate and start
const backgroundService = new BackgroundService();
backgroundService.init();
