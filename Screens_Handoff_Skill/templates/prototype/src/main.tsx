import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './shell/App';
import { noHoverOnMobile } from './shell/noHover';

createRoot(document.getElementById('root')!).render(<App />);
noHoverOnMobile(); // mobile projects: no hover inside the device (Pressed stays)
