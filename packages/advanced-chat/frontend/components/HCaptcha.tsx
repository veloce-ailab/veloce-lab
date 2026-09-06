import { useEffect, useRef } from "react"

export function HCaptcha({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (token: string) => void; resetKey?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIDRef = useRef<string | null>(null)
  const appliedResetKeyRef = useRef(resetKey)

  useEffect(() => {
    let cancelled = false
    const render = () => {
      const hcaptcha = (window as { hcaptcha?: { render: (element: HTMLDivElement, options: Record<string, unknown>) => string } }).hcaptcha
      if (!containerRef.current || !hcaptcha || widgetIDRef.current || cancelled) return
      widgetIDRef.current = hcaptcha.render(containerRef.current, { sitekey: siteKey, callback: onToken, "expired-callback": () => onToken("") })
    }
    if (!(window as { hcaptcha?: unknown }).hcaptcha) {
      const existingScript = document.querySelector<HTMLScriptElement>("script[data-hcaptcha]")
      const script = existingScript || document.createElement("script")
      script.src = "https://js.hcaptcha.com/1/api.js?render=explicit"
      script.async = true
      script.defer = true
      script.dataset.hcaptcha = "true"
      script.addEventListener("load", render)
      if (!existingScript) document.body.appendChild(script)
    } else {
      render()
    }
    return () => { cancelled = true }
  }, [siteKey, onToken])

  useEffect(() => {
    if (resetKey === undefined || resetKey === appliedResetKeyRef.current || !widgetIDRef.current) return
    appliedResetKeyRef.current = resetKey
    const hcaptcha = (window as { hcaptcha?: { reset?: (widgetID: string) => void } }).hcaptcha
    hcaptcha?.reset?.(widgetIDRef.current)
  }, [resetKey])

  return <div ref={containerRef} className="flex justify-center" />
}
