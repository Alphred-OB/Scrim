// Tells the editor whether a light preview copy of the recording or the webcam exists (see main/proxy.ts).
import { useEffect, useState } from 'react'
import type { Project } from '@shared/types'
import { api } from './api'

export type ProxyKind = 'screen' | 'cam'
export interface ProxyInfo {
  /** checking: main hasn't answered yet (a copy may already exist) */
  status: 'checking' | 'none' | 'building' | 'ready' | 'failed'
  pct?: number
  path?: string
  width?: number
  height?: number
}

const NONE: ProxyInfo = { status: 'none' }
const CHECKING: ProxyInfo = { status: 'checking' }
const states = new Map<string, ProxyInfo>()
const listeners = new Set<() => void>()
// one request per opening of a project (the preview and the timeline both ask); asked again on the next
// opening, so a copy removed by Clear cache is noticed and made again
const inflight = new Map<string, Promise<unknown>>()
const keyOf = (dir: string, kind: ProxyKind = 'screen') => `${kind}|${dir}`
let wired = false

function wire(): void {
  if (wired) return
  wired = true
  try {
    api.on('proxy:update', (s: ProxyInfo & { dir: string; kind?: ProxyKind }) => {
      states.set(keyOf(s.dir, s.kind), s)
      listeners.forEach((f) => f())
    })
  } catch {
    /* the web version has no preview copy */
  }
}

/** Starts (or finds) the preview copy for this project's screen or webcam and follows its progress. */
export function useProxy(project: Project | null, kind: ProxyKind = 'screen'): ProxyInfo {
  const dir = project?.dir ?? ''
  const key = keyOf(dir, kind)
  const [, tick] = useState(0)
  useEffect(() => {
    wire()
    const f = () => tick((x) => x + 1)
    listeners.add(f)
    return () => void listeners.delete(f)
  }, [])
  const screen = project?.media.screen
  const src = kind === 'cam' ? project?.media.webcam : screen
  useEffect(() => {
    if (!dir || !src || !screen || inflight.has(key)) return
    // the webcam has no duration of its own in the project; the screen's is close enough for "is it long"
    const ask = api
      .proxyEnsure(dir, src.path, screen.duration, src.width, src.height, kind)
      .then((s) => {
        // a progress event may have arrived first; a fresh answer from main always wins over a stale "ready"
        if (s.status !== 'building' || states.get(key)?.status !== 'building') states.set(key, s)
        listeners.forEach((fn) => fn())
      })
      .catch(() => {})
      .finally(() => inflight.delete(key))
    inflight.set(key, ask)
  }, [key, src?.path])
  return states.get(key) ?? (dir && src ? CHECKING : NONE)
}
