'use client'

/**
 * Keep a demo thread pinned to its newest message without moving the page.
 *
 * The anchor div at the end of each thread used to call scrollIntoView, which
 * scrolls the window: clicking anything inside a demo threw the reader down
 * the page, and the same effects firing on mount scrolled /demo thousands of
 * pixels on load. These scroll the panel the thread lives in, and nothing else.
 */
import { useEffect, useRef } from 'react'

type Anchor = { current: HTMLElement | null }

/** The scrollable panel an anchor sits in: the phone body, the message list. */
function panelOf(anchor: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = anchor?.parentElement ?? null
  while (el) {
    const overflowY = getComputedStyle(el).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return el
    el = el.parentElement
  }
  return null
}

/** Scroll that panel, and nothing else. The page never moves. */
export function scrollThreadPanel(anchor: HTMLElement | null, to: 'bottom' | 'top' = 'bottom') {
  const panel = panelOf(anchor)
  if (!panel) return
  panel.scrollTo({ top: to === 'top' ? 0 : panel.scrollHeight, behavior: 'smooth' })
}

/**
 * Pin a thread to its newest message whenever it changes. Nothing scrolls on
 * the first render, so arriving at /demo leaves the reader at the top.
 */
export function useStickToBottom(anchor: Anchor, deps: unknown[], to: 'bottom' | 'top' = 'bottom') {
  const rendered = useRef(false)
  useEffect(() => {
    if (!rendered.current) {
      rendered.current = true
      return
    }
    scrollThreadPanel(anchor.current, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
