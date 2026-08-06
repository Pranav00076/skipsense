export interface SiteAdapter {
  /**
   * Initializes the adapter and any necessary DOM observers.
   */
  initialize(): void;

  /**
   * Returns true if the current page matches this adapter.
   */
  detect(): boolean;

  /**
   * Safely attempts to find the remote HTMLVideoElement.
   * Should return null if not found or not ready.
   */
  getVideo(): HTMLVideoElement | null;

  /**
   * Safely attempts to find the 'Next' or 'Skip' button.
   */
  getNextButton(): HTMLElement | null;

  /**
   * Returns true if a stranger is currently connected and their video is playing.
   */
  isConnected(): boolean;

  /**
   * Returns true if the site is currently searching for a stranger.
   */
  isLoading(): boolean;

  /**
   * Returns a promise that resolves when the next stranger connects.
   */
  waitForConnection(): Promise<void>;

  /**
   * Registers a callback that fires whenever the connection state changes
   * (e.g., from 'loading' to 'connected', or 'connected' to 'disconnected').
   */
  observeConnectionChanges(callback: (isConnected: boolean) => void): void;

  /**
   * Clicks the Next/Skip button.
   */
  clickNext(): void;

  /**
   * Cleans up observers and listeners to prevent memory leaks.
   */
  cleanup(): void;
}
