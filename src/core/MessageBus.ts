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
    if (this.isListening || typeof chrome === 'undefined' || !chrome.runtime) return;
    
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
   * Send a message to the background script or other contexts via runtime.
   */
  static send<T extends BaseMessage>(message: T): Promise<any> {
    if (typeof chrome === 'undefined' || !chrome.runtime) return Promise.resolve();
    
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn(`[SkipSense MessageBus] Error sending ${message.type}:`, chrome.runtime.lastError.message);
          resolve(undefined); // Don't throw, just resolve empty to prevent unhandled rejections
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Send a message specifically to a tab (e.g., from background to content script).
   */
  static sendToTab<T extends BaseMessage>(tabId: number, message: T): Promise<any> {
    if (typeof chrome === 'undefined' || !chrome.tabs) return Promise.resolve();
    
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn(`[SkipSense MessageBus] Error sending ${message.type} to tab ${tabId}:`, chrome.runtime.lastError.message);
          resolve(undefined);
        } else {
          resolve(response);
        }
      });
    });
  }
}
