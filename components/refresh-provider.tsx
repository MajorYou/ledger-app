'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface RefreshContextValue {
  /** 数据版本号，每次 refresh 调用 +1，Client Component 可监听此值变化重新拉取数据 */
  dataVersion: number
  /** 触发全局刷新：version+1 并调用 router.refresh() 刷新 Server Component */
  refresh: () => void
}

const RefreshContext = createContext<RefreshContextValue>({
  dataVersion: 0,
  refresh: () => {},
})

export function useRefresh() {
  return useContext(RefreshContext)
}

export function RefreshProvider({
  children,
  routerRefresh,
}: {
  children: ReactNode
  routerRefresh: () => void
}) {
  const [dataVersion, setDataVersion] = useState(0)

  const refresh = useCallback(() => {
    setDataVersion((v) => v + 1)
    routerRefresh()
  }, [routerRefresh])

  return (
    <RefreshContext.Provider value={{ dataVersion, refresh }}>
      {children}
    </RefreshContext.Provider>
  )
}
