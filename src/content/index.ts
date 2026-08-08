import { MessageBus } from '../core/MessageBus';
import { OmeTVAdapter } from '../sites/OmeTVAdapter';
import { ContentObserver } from './ContentObserver';

console.log('[SkipSense] Content Script loaded in frame:', window.location.href);

// 1. Initialize MessageBus for the Content Script context
MessageBus.init();

// 2. Instantiate OmeTV adapter
const adapter = new OmeTVAdapter();

if (adapter.detect()) {
  console.log(`[SkipSense] Initializing OmeTV adapter on ${window.location.hostname}...`);
  
  // 3. Initialize and start the Content Observer
  const observer = new ContentObserver(adapter);
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => observer.start());
  } else {
    observer.start();
  }
} else {
  console.log(`[SkipSense] Active on frame ${window.location.hostname}`);
}
