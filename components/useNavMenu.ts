"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

export type UseNavMenuReturn = {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  navPanelRef: React.RefObject<HTMLDivElement | null>
  hamburgerRef: React.RefObject<HTMLButtonElement | null>
}

export function useNavMenu(): UseNavMenuReturn {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const navPanelRef = useRef<HTMLDivElement | null>(null)
  const hamburgerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (navPanelRef.current?.contains(document.activeElement)) {
      hamburgerRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    const panel = navPanelRef.current
    if (!panel) return

    const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

    function getFocusable(): HTMLElement[] {
      return Array.from(panel!.querySelectorAll<HTMLElement>(FOCUSABLE))
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false)
        hamburgerRef.current?.focus()
        return
      }
      if (e.key !== "Tab") return

      const focusable = getFocusable()
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    getFocusable()[0]?.focus()

    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])

  return { open, setOpen, navPanelRef, hamburgerRef }
}
