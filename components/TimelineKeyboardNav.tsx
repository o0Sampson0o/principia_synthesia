"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"

type KeyboardNavContextValue = {
  focusIndex: number
  registerRef: (index: number, el: HTMLElement | null) => void
}

const KeyboardNavContext = createContext<KeyboardNavContextValue>({
  focusIndex: -1,
  registerRef: () => undefined,
})

export function useKeyboardNavContext() {
  return useContext(KeyboardNavContext)
}

type Props = {
  count: number
  children: ReactNode
  onFocusIndexChange?: (index: number) => void
}

export default function TimelineKeyboardNav({ count, children, onFocusIndexChange }: Props) {
  const [focusIndex, setFocusIndex] = useState(-1)
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map())

  const registerRef = useCallback((index: number, el: HTMLElement | null) => {
    if (el) {
      cardRefs.current.set(index, el)
    } else {
      cardRefs.current.delete(index)
    }
  }, [])

  useLayoutEffect(() => {
    if (focusIndex < 0) return
    const el = cardRefs.current.get(focusIndex)
    if (el) {
      el.focus()
    }
  }, [focusIndex])

  useEffect(() => {
    onFocusIndexChange?.(focusIndex)
  }, [focusIndex, onFocusIndexChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (count === 0) return
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setFocusIndex((i) => (i < count - 1 ? i + 1 : i))
          break
        case "ArrowUp":
          e.preventDefault()
          setFocusIndex((i) => (i > 0 ? i - 1 : 0))
          break
        case "Home":
          e.preventDefault()
          setFocusIndex(0)
          break
        case "End":
          e.preventDefault()
          setFocusIndex(count - 1)
          break
        default:
          break
      }
    },
    [count]
  )

  return (
    <KeyboardNavContext.Provider value={{ focusIndex, registerRef }}>
      <div onKeyDown={handleKeyDown}>
        {children}
      </div>
    </KeyboardNavContext.Provider>
  )
}
