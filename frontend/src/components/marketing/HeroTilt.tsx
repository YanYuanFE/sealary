import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react'

// critically damped spring (Apple: damping 1.0, response ~0.35s) — no overshoot, interruptible
const spring = { stiffness: 170, damping: 26, mass: 1 }

export function HeroTilt({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const x = useSpring(mx, spring)
  const y = useSpring(my, spring)
  const rotateX = useTransform(y, [-1, 1], [3.5, -3.5])
  const rotateY = useTransform(x, [-1, 1], [-3.5, 3.5])

  if (reduceMotion) return <div className={className}>{children}</div>

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 1100 }}
      onPointerMove={(e) => {
        const rect = ref.current?.getBoundingClientRect()
        if (!rect) return
        mx.set(((e.clientX - rect.left) / rect.width) * 2 - 1)
        my.set(((e.clientY - rect.top) / rect.height) * 2 - 1)
      }}
      onPointerLeave={() => {
        mx.set(0)
        my.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}
