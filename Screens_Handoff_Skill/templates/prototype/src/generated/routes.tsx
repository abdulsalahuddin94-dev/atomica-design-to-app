// Placeholder: tools/build_prototype.py replaces this file with the screens, flows and routes of the exported Design file.
import type React from 'react';

export type ScreenDef = { slug: string; name: string; w: number; h: number; scroll: boolean; nav?: boolean; figma: Record<string, string>; Component: React.FC };
export const PROJECT = { name: 'Not generated', figmaFile: '', exportedAt: '' };
export const DEVICE = { viewport: 812 };
export const MODES: string[] = ['Light', 'Dark'];
export const SCREENS: ScreenDef[] = [];
export const FLOWS: { name: string; slugs: string[] }[] = [];
export const preloadScreens = () => Promise.resolve([]);
