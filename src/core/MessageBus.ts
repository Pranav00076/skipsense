import { BaseMessage, MessageType } from '../types';

export type MessageCallback = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => void | boolean;

/**
 * Strongly typed Message Bus for cross-context communication.
 */
export class MessageBus {
  private static listeners: Map<MessageType, Set<MessageCallback>> = new Map();
  private static isListening = false;

  /**
   * Initializes the message listener. Should be called once per context (background, content, popup).
   */
  static init() {
    if (this.isListening || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
    
    chrome.runtime.onMessage.addListener((message: BaseMessage, sender, sendResponse) => {
      if (!message || !message.type) return;
      
      const typeListeners = this.listeners.get(message.type);
      if (!typeListeners) return;

      let isAsync = false;
      typeListeners.forEach(callback => {
        const result = callback(message, sender, sendResponse);
        if (result === true) {
          isAsync = true;
        }
      });
      
      return isAsync; // Return true to indicate async sendResponse
    });
    
    this.isListening = true;
  }

  /**
   * Register a listener for a specific message type.
   */
  static on<T extends BaseMessage>(type: T['type'], callback: (message: T, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => void | boolean) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback as MessageCallback);
  }

  /**
   * Remove a listener.
   */
  static off<T extends BaseMessage>(type: T['type'], callback: MessageCallback) {
    if (this.listeners.has(type)) {
      this.listeners.get(type)!.delete(callback);
    }
  }

  /**
   * Send a message across extension contexts safely without port closed errors.
   */
  static send<T extends BaseMessage>(message: T): Promise<any> {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      return Promise.resolve();
    }
    
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // Chrome sets lastError when no receiver is active (e.g., popup closed).
          // We consume it silently to prevent noisy warnings in the extensions tab.
          if (chrome.runtime.lastError) {
            resolve(undefined);
          } else {
            resolve(response);
          }
        });
      } catch {
        resolve(undefined);
      }
    });
  }

  /**
   * Send a message specifically to a tab.
   */
  static sendToTab<T extends BaseMessage>(tabId: number, message: T): Promise<any> {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.sendMessage) {
      return Promise.resolve();
    }
    
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            resolve(undefined);
          } else {
            resolve(response);
          }
        });
      } catch {
        resolve(undefined);
      }
    });
  }
}
