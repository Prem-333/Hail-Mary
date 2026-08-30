'use client';

import { useEffect } from 'react';

export function AutoFullscreen() {
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn(`Error attempting to enable fullscreen: ${err.message}`);
        });
      }
      // Remove listeners after first interaction so it doesn't repeatedly try to go fullscreen
      // if the user later exits fullscreen manually.
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    // Listen for any click or keypress to trigger fullscreen
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  return null;
}
