import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

// Two entry points from one codebase:
//   index.html  → the game
//   world.html  → the world builder (world.supply-chain-sim.lucasjohnston.nl)
//
// They share src/engine and src/config deliberately. The builder exists to tune
// worlds that the game can then reproduce exactly, which only holds if both run
// the same generator — a separate project with a copied map.ts would drift.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main:  resolve(__dirname, 'index.html'),
        world: resolve(__dirname, 'world.html'),
      },
    },
  },
})
