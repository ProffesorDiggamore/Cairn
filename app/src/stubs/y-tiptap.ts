import { PluginKey } from '@tiptap/pm/state'

// See collaboration.ts — no y-sync plugin is ever installed, so getState() is undefined.
export const ySyncPluginKey = new PluginKey('y-sync')
export const absolutePositionToRelativePosition = () => null
export const relativePositionToAbsolutePosition = () => 0
