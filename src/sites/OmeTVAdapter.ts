import { SiteAdapter } from './SiteAdapter';

export class OmeTVAdapter implements SiteAdapter {
  private observer: MutationObserver | null = null;
  private connectionCallbacks: Set<(isConnected: boolean) => void> = new Set();
  private lastConnectedState = false;

  initialize(): void {
    if (this.observer) return;

    // Observe the entire body for structural changes, this is crucial for SPAs
    this.observer = new MutationObserver(() => {
      this.checkConnectionState();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'src']
    });

    // Initial check
    this.checkConnectionState();
  }

  detect(): boolean {
    return window.location.hostname.includes('ome.tv');
  }

  getVideo(): HTMLVideoElement | null {
    // OmeTV usually has two video elements: local and remote.
    // The remote video is typically the larger one or the one without 'muted' property,
    // or specifically styled. We use a robust fallback approach.
    const videos = Array.from(document.querySelectorAll('video'));
    
    // The remote video is typically the one that is playing media from a remote source
    const remoteVideo = videos.find(v => 
      v.readyState >= 2 && // HAVE_CURRENT_DATA
      v.videoWidth > 0 && 
      !v.muted // Local preview is usually muted
    );

    return remoteVideo || null;
  }

  getNextButton(): HTMLElement | null {
    // Look for common OmeTV Next button selectors
    const selectors = [
      'button.btn-next',
      'button[data-testid="next-button"]',
      '.buttons .next-button',
      // SVG path based fallback if classes change
      'button svg path[d*="M12 4l-1.41"]' 
    ];

    for (const selector of selectors) {
      const btn = document.querySelector(selector) as HTMLElement;
      if (btn) return btn; // If it's a child SVG, we might need to get the parent button
    }

    // Fallback: search by text content (i18n might break this, but good as last resort)
    const allButtons = Array.from(document.querySelectorAll('button'));
    const nextBtn = allButtons.find(btn => 
      btn.textContent?.toLowerCase().includes('next') || 
      btn.textContent?.toLowerCase().includes('stop') // Sometimes it's stop then next
    );

    return nextBtn || null;
  }

  isConnected(): boolean {
    const video = this.getVideo();
    const isLoading = this.isLoading();
    
    // Check if the video is actually playing and we are not in a loading spinner state
    return !!video && !video.paused && !isLoading && video.videoWidth > 10;
  }

  isLoading(): boolean {
    // OmeTV shows a loading spinner or "connecting" text
    const spinner = document.querySelector('.spinner, .loading, [class*="connecting"]');
    return !!spinner && window.getComputedStyle(spinner).display !== 'none';
  }

  waitForConnection(): Promise<void> {
    return new Promise(resolve => {
      if (this.isConnected()) {
        resolve();
        return;
      }

      const cb = (connected: boolean) => {
        if (connected) {
          this.connectionCallbacks.delete(cb);
          resolve();
        }
      };
      this.connectionCallbacks.add(cb);
    });
  }

  observeConnectionChanges(callback: (isConnected: boolean) => void): void {
    this.connectionCallbacks.add(callback);
  }

  clickNext(): void {
    const nextBtn = this.getNextButton();
    if (nextBtn) {
      // OmeTV often requires two clicks: Stop, then Next.
      // Or it might be a single Next button.
      nextBtn.click();
      
      // Attempt a second click after a short delay just in case it was a Stop button
      setTimeout(() => {
        const confirmNextBtn = this.getNextButton();
        if (confirmNextBtn) {
           confirmNextBtn.click();
        }
      }, 100);
    } else {
      // Keyboard fallback: Esc or Enter are sometimes bound to Next
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    }
  }

  cleanup(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.connectionCallbacks.clear();
  }

  private checkConnectionState() {
    const connected = this.isConnected();
    if (connected !== this.lastConnectedState) {
      this.lastConnectedState = connected;
      this.connectionCallbacks.forEach(cb => cb(connected));
    }
  }
}
