import { RefreshButton } from './refresh-button'

export function TopBar() {
  return (
    <header className="h-12 shrink-0 flex items-center justify-end px-6 bg-card/80 backdrop-blur border-b border-border">
      <RefreshButton />
    </header>
  )
}
