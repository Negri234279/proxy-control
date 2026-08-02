import { useEffect, useState } from 'preact/hooks'

// Reloj que re-renderiza cada `intervalMs` para textos de tiempo relativo ("hace Ns").
export function useNow(intervalMs = 5000): number {
    const [now, setNow] = useState(Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs)
        return () => clearInterval(timer)
    }, [intervalMs])
    return now
}
