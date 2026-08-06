import React from 'react';
import { createRoot } from 'react-dom/client';
import OptionsApp from './OptionsApp';
import '../index.css';
import { MessageBus } from '../core/MessageBus';

MessageBus.init();

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>
);
