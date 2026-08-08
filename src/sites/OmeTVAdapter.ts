import { SiteAdapter } from './SiteAdapter';

export class OmeTVAdapter implements SiteAdapter {
  private observer: MutationObserver | null = null;
  private pollInterval: any = null;
  private connectionCallbacks: Set<(isConnected: boolean) => void> = new Set();
  private lastConnectedState = false;

  initialize(): void {
    if (this.observer) return;

    // 1. Observe DOM for changes
    this.observer = new MutationObserver(() => {
      this.checkConnectionState();
    });

    this.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'src', 'data-state']
    });

    // 2. Poll actively every 300ms
    this.pollInterval = setInterval(() => {
      this.checkConnectionState();
    }, 300);

    // 3. Listen to media stream lifecycle events on window/document
    ['playing', 'play', 'loadeddata', 'timeupdate', 'pause', 'ended'].forEach(evtName => {
      window.addEventListener(evtName, () => this.checkConnectionState(), true);
    });

    // Initial check
    this.checkConnectionState();
  }

  detect(): boolean {
    const host = window.location.hostname.toLowerCase();
    return host.includes('ome.tv') || host.includes('ometv') || host.includes('chat') || true;
  }

  getVideo(): HTMLVideoElement | null {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;

    // 1. Remote video is typically unmuted and actively playing frames
    const remoteVideo = videos.find(v => 
      v.readyState >= 2 && 
      v.videoWidth > 10 && 
      !v.muted &&
      !v.paused
    );
    if (remoteVideo) return remoteVideo;

    // 2. Largest active video on screen (if muted property is unset or manipulated)
    const activeVideos = videos.filter(v => v.videoWidth > 50 && v.videoHeight > 50 && !v.paused);
    if (activeVideos.length > 0) {
      activeVideos.sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight));
      return activeVideos[0];
    }

    // 3. Any video with valid dimensions
    const anyPlaying = videos.find(v => v.videoWidth > 50 && v.videoHeight > 50);
    return anyPlaying || videos[0] || null;
  }

  getNextButton(): HTMLElement | null {
    // 1. Check for "Are you there?" or "Start" confirmation modal buttons first
    const modalButtons = Array.from(document.querySelectorAll('[class*="modal"] button, [role="dialog"] button, .modal button, .popup button'));
    if (modalButtons.length > 0) {
      return modalButtons[0] as HTMLElement;
    }

    const selectors = [
      'button.btn-next',
      'button.btn-skip',
      '.buttons__button_next',
      '.buttons__button_start',
      'button[data-testid="next-button"]',
      'button[data-action="next"]',
      'button[aria-label="Next"]',
      'button[aria-label="Skip"]',
      '.chat-button-next',
      '.button-next',
      '.buttons .next-button',
      'button svg path[d*="M12 4l-1.41"]',
      '.btn-start-stop',
      '.chat-button',
      '.button-start'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector) as HTMLElement;
      if (el) {
        return el.tagName === 'BUTTON' ? el : (el.closest('button') as HTMLElement) || el;
      }
    }

    // Text content search fallback
    const allButtons = Array.from(document.querySelectorAll('button, .buttons div, div[role="button"], a[role="button"]'));
    const nextBtn = allButtons.find(btn => {
      const text = btn.textContent?.trim().toLowerCase() || '';
      return text === 'next' || text === 'skip' || text === 'stop' || text === 'start' || text.includes('next');
    }) as HTMLElement;

    return nextBtn || null;
  }

  isConnected(): boolean {
    const video = this.getVideo();
    const isLoading = this.isLoading();
    
    // Connected if video exists, has dimensions, is actively playing, and not in loading state
    const connected = !!video && !video.paused && !isLoading && video.videoWidth > 10;
    return connected;
  }

  isLoading(): boolean {
    const spinner = document.querySelector('.spinner, .loading, [class*="connecting"], [class*="searching"]');
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
    console.log('[SkipSense OmeTVAdapter] Executing Next action on OmeTV...');
    
    // 1. Direct DOM button click
    const nextBtn = this.getNextButton();
    if (nextBtn) {
      nextBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      nextBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      nextBtn.click();
      
      // Secondary confirm click for OmeTV Stop -> Next flow
      setTimeout(() => {
        const confirmBtn = this.getNextButton();
        if (confirmBtn) {
          confirmBtn.click();
        }
      }, 150);
    }

    // 2. Dispatch all standard OmeTV keyboard shortcuts (Escape, ArrowRight, Enter, Space)
    const keyOptions = [
      { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 },
      { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39 },
      { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 },
      { key: ' ', code: 'Space', keyCode: 32, which: 32 }
    ];

    keyOptions.forEach(opt => {
      const eventInit: KeyboardEventInit = {
        key: opt.key,
        code: opt.code,
        bubbles: true,
        cancelable: true,
        composed: true
      };

      const keydown = new KeyboardEvent('keydown', eventInit);
      const keyup = new KeyboardEvent('keyup', eventInit);

      window.dispatchEvent(keydown);
      document.dispatchEvent(keydown);
      window.dispatchEvent(keyup);
      document.dispatchEvent(keyup);
    });
  }

  cleanup(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.connectionCallbacks.clear();
  }

  private checkConnectionState() {
    const connected = this.isConnected();
    if (connected !== this.lastConnectedState) {
      this.lastConnectedState = connected;
      console.log(`[SkipSense OmeTVAdapter] Connection state changed: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
      this.connectionCallbacks.forEach(cb => cb(connected));
    }
  }
}
