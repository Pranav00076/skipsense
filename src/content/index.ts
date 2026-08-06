import { MessageBus } from '../core/MessageBus';
import { OmeTVAdapter } from '../sites/OmeTVAdapter';
import { ContentObserver } from './ContentObserver';

// 1. Initialize MessageBus for the Content Script context
MessageBus.init();

// 2. Detect the site and select the appropriate adapter
let adapter = null;

if (window.location.hostname.includes('ome.tv')) {
  adapter = new OmeTVAdapter();
}
// Support for future adapters goes here

if (adapter) {
  console.log(`[SkipSense] Loaded adapter for ${window.location.hostname}`);
  
  // 3. Initialize and start the Content Observer
  const observer = new ContentObserver(adapter);
  
  // Wait for DOM to be fully ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => observer.start());
  } else {
    observer.start();
  }
} else {
  console.log(`[SkipSense] No adapter found for ${window.location.hostname}`);
}
