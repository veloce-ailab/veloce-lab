import { useRef } from "react"
import type { ReactNode } from "react"

interface TabTransitionProps {
  /** The currently active tab's key. Used to detect changes and replay the animation. */
  activeKey: string
  /** Ordered list of tab keys, used to decide slide direction (left vs right). */
  order: string[]
  children: ReactNode
  className?: string
}

/**
 * Wraps tab content and slides it in from the left or right depending on whether
 * the user moved to a later or earlier tab in `order`. Replays on every tab change.
 */
export function TabTransition({ activeKey, order, children, className }: TabTransitionProps) {
  const prevKey = useRef(activeKey)
  const prevIndex = order.indexOf(prevKey.current)
  const nextIndex = order.indexOf(activeKey)
  // Moving to a later tab → enter from the right; earlier tab → enter from the left.
  const direction = nextIndex >= prevIndex ? "animate-tab-in-right" : "animate-tab-in-left"
  prevKey.current = activeKey

  return (
    <div key={activeKey} className={className ? `${direction} ${className}` : direction}>
      {children}
    </div>
  )
}
