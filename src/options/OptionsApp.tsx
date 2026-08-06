import { useEffect, useState } from 'react';
import { ExtensionSettings } from '../types';
import { StorageService } from '../storage/StorageService';
import { MessageBus } from '../core/MessageBus';
import { Save } from 'lucide-react';

export default function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    StorageService.getSettings().then(setSettings);
  }, []);

  const handleChange = (key: keyof ExtensionSettings, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const handleSave = async () => {
    if (!settings) return;
    await StorageService.saveSettings(settings);
    MessageBus.send({
      type: 'SETTINGS_UPDATED',
      payload: { settings }
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) return <div className="p-8">Loading Settings...</div>;

  return (
    <div className="max-w-3xl mx-auto p-8 flex flex-col gap-8">
      <div className="flex justify-between items-center border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold">SkipSense Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your local AI preferences.</p>
        </div>
        <button 
          onClick={handleSave}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* General Settings */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">General</h2>
          
          <div className="glass p-4 rounded-lg flex flex-col gap-2">
            <label className="text-sm font-medium">Confidence Threshold ({(settings.confidenceThreshold * 100).toFixed(0)}%)</label>
            <input 
              type="range" 
              min="0.5" max="0.99" step="0.01" 
              value={settings.confidenceThreshold} 
              onChange={e => handleChange('confidenceThreshold', parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">Minimum confidence required before making a skip/stay decision.</p>
          </div>

          <div className="glass p-4 rounded-lg flex flex-col gap-2">
            <label className="text-sm font-medium">Detection Delay (ms)</label>
            <select 
              value={settings.detectionDelayMs}
              onChange={e => handleChange('detectionDelayMs', parseInt(e.target.value))}
              className="bg-background border border-border rounded-md p-2 text-sm"
            >
              <option value="0">0ms (Immediate)</option>
              <option value="500">500ms</option>
              <option value="1000">1000ms (1s)</option>
              <option value="2000">2000ms (2s)</option>
            </select>
            <p className="text-xs text-muted-foreground">Time to wait after connection before capturing frame.</p>
          </div>
        </div>

        {/* Advanced & AI Settings */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Advanced</h2>
          
          <div className="glass p-4 rounded-lg flex flex-col gap-4">
            
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium block">Unknown Behavior</label>
                <p className="text-xs text-muted-foreground">If prediction fails or threshold not met.</p>
              </div>
              <select 
                value={settings.unknownBehavior}
                onChange={e => handleChange('unknownBehavior', e.target.value)}
                className="bg-background border border-border rounded-md p-1.5 text-sm"
              >
                <option value="RETRY">Retry</option>
                <option value="WAIT">Wait (Do nothing)</option>
                <option value="SKIP">Skip immediately</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium block">Model Backend</label>
                <p className="text-xs text-muted-foreground">WebGPU is faster but experimental.</p>
              </div>
              <select 
                value={settings.preferredModelBackend}
                onChange={e => handleChange('preferredModelBackend', e.target.value)}
                className="bg-background border border-border rounded-md p-1.5 text-sm"
              >
                <option value="WASM">WebAssembly (Stable)</option>
                <option value="WEBGPU">WebGPU (Fast)</option>
              </select>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <label className="text-sm font-medium block">Developer Mode</label>
                <p className="text-xs text-muted-foreground">Show debug panel in popup.</p>
              </div>
              <input 
                type="checkbox" 
                checked={settings.debugMode}
                onChange={e => handleChange('debugMode', e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
