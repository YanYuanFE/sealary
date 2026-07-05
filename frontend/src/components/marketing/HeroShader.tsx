import { GrainGradient } from '@paper-design/shaders-react'
import { useReducedMotion } from 'motion/react'

export function HeroShader() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <GrainGradient
        className="absolute inset-0 size-full opacity-45"
        width="100%"
        height="100%"
        colors={['#fbf8ef', '#f1dad2', '#9a342b', '#dcebdd', '#6f8a72']}
        colorBack="#fbf8ef"
        softness={0.82}
        intensity={0.16}
        noise={0.18}
        shape="wave"
        speed={reduceMotion ? 0 : 0.08}
        scale={1.18}
        rotation={-8}
        fit="cover"
        maxPixelCount={900000}
      />
      <div className="hero-vignette absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(oklch(0.235_0.014_62/0.055)_0.7px,transparent_0.7px)] bg-[length:18px_18px] opacity-45" />
    </div>
  )
}
