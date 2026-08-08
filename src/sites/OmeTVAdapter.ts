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

    // 2. Continuous high-frequency polling
    this.pollInterval = setInterval(() => {
      this.checkConnectionState();
    }, 200);

    // 3. Listen to media stream lifecycle events on window/document
    ['playing', 'play', 'loadeddata', 'timeupdate', 'canplay'].forEach(evtName => {
      window.addEventListener(evtName, () => this.checkConnectionState(), true);
    });

    // Initial check
    this.checkConnectionState();
  }

  detect(): boolean {
    const host = window.location.hostname.toLowerCase();
    return host.includes('ome.tv') || host.includes('ometv') || host.includes('chat') || true;
  }

  /**
   * On OmeTV:
   * - Left box = Remote Stranger Video
   * - Right box = Local Webcam (Self)
   * We strictly target the Remote Stranger Video on the left!
   */
  getVideo(): HTMLVideoElement | null {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;

    // 1. If explicit remote video ID or selector exists
    const specificRemote = document.querySelector('video#remote-video, video.remote-video, [data-qa="remote-video"] video, .video-container:first-child video') as HTMLVideoElement;
    if (specificRemote && specificRemote.videoWidth > 10 && !specificRemote.paused) {
      return specificRemote;
    }

    // 2. In OmeTV two-video layout, videos[0] is the Remote Stranger (Left), videos[1] is Local (Right)
    if (videos.length >= 2) {
      const remote = videos[0]; // Remote is on the left
      if (remote && remote.videoWidth > 10 && !remote.paused) {
        return remote;
      }
    }

    // 3. Any active video with valid dimensions that is not explicitly marked local
    const activeRemote = videos.find(v => !v.id.includes('local') && !v.className.includes('local') && v.videoWidth > 10 && !v.paused);
    return activeRemote || videos[0] || null;
  }

  /**
   * Targets the large green "Next" button or "Stop" button in the bottom left
   */
  getNextButton(): HTMLElement | null {
    // 1. Check for modal confirmation buttons first
    const modalButtons = Array.from(document.querySelectorAll('[class*="modal"] button, [role="dialog"] button, .modal button, .popup button, .button-start'));
    if (modalButtons.length > 0) {
      return modalButtons[0] as HTMLElement;
    }

    // 2. Match exact text "Next" or "Start" on buttons
    const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"], .buttons > *'));
    const textNextBtn = allButtons.find(btn => {
      const text = btn.textContent?.trim().toLowerCase() || '';
      return text === 'next' || text === 'start';
    }) as HTMLElement;

    if (textNextBtn) {
      return textNextBtn;
    }

    // 3. Fallback selectors
    const selectors = [
      'button.btn-next',
      '.buttons__button_next',
      '.buttons__button_start',
      '.button-next',
      '.btn-start-stop',
      '.button-start',
      '.btn-start',
      'button[aria-label="Next"]',
      'button[aria-label="Skip"]',
      '.chat-button-next',
      'button.btn-stop',
      '.btn-stop'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector) as HTMLElement;
      if (el) {
        return el.tagName === 'BUTTON' ? el : (el.closest('button') as HTMLElement) || el;
      }
    }

    return null;
  }

  isConnected(): boolean {
    const video = this.getVideo();
    const isSearching = this.isSearching();
    
    // Connected if remote stranger video has dimensions, is actively playing, and not in searching/connecting state
    const connected = !!video && !video.paused && !isSearching && video.videoWidth > 10;
    return connected;
  }

  isLoading(): boolean {
    return this.isSearching();
  }

  isSearching(): boolean {
    // Check if "Searching for a partner..." text or spinner is active
    const pageText = document.body?.textContent || '';
    const hasSearchingText = pageText.includes('Searching for a partner') || pageText.includes('Connecting...');
    
    const spinner = document.querySelector('.spinner, .loading, [class*="connecting"], [class*="searching"]');
    const hasSpinner = !!spinner && window.getComputedStyle(spinner).display !== 'none';
    
    return hasSearchingText || hasSpinner;
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
    console.log('[SkipSense OmeTVAdapter] Executing Next skip action on OmeTV...');
    
    // 1. Direct DOM button clicks on green Next button
    const nextBtn = this.getNextButton();
    if (nextBtn) {
      this.dispatchClickEvents(nextBtn);

      // In case OmeTV toggles from Stop -> Start
      setTimeout(() => {
        const confirmBtn = this.getNextButton();
        if (confirmBtn && confirmBtn !== nextBtn) {
          this.dispatchClickEvents(confirmBtn);
        }
      }, 100);
    }

    // 2. Dispatch keyboard shortcuts (Escape, ArrowRight, Enter, Space)
    const keyOptions = [
      { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39 },
      { key: 'Escape', code: 'Escape', keyCode: 27, which: 27 },
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
      document.body?.dispatchEvent(keydown);
      
      window.dispatchEvent(keyup);
      document.dispatchEvent(keyup);
      document.body?.dispatchEvent(keyup);
    });
  }

  private dispatchClickEvents(element: HTMLElement) {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
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
