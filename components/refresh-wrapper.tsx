'use client'

import { useRouter } from 'next/navigation'
import { RefreshProvider } from './refresh-provider'
import type { ReactNode } from 'react'

export function RefreshWrapper({ children }: { children: ReactNode }) {
  const router = useRouter()
  return (
    <RefreshProvider routerRefresh={() => router.refresh()}>
      {children}
    </RefreshProvider>
  )
}
