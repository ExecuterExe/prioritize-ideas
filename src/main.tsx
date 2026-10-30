import {render} from 'preact'
import {useEffect, useState} from 'preact/hooks'
import './ui/style.css'
import {HostApp} from './ui/host'
import {JoinApp} from './ui/join'
import {Toaster} from './ui/toast'

declare const __SINGLE__: boolean

function parseJoin(): {roomId: string; key: string} | null {
  const m = location.hash.match(/^#j=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/)
  return m ? {roomId: m[1], key: m[2]} : null
}

function App() {
  const [join, setJoin] = useState(parseJoin)
  useEffect(() => {
    const on = () => setJoin(parseJoin())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return (
    <>
      {join && !__SINGLE__ ? <JoinApp key={join.roomId} roomId={join.roomId} secret={join.key} /> : <HostApp />}
      <Toaster />
    </>
  )
}

render(<App />, document.getElementById('app')!)

// Офлайн-кэш: после первого открытия страница грузится даже при плохом интернете
if (!__SINGLE__ && 'serviceWorker' in navigator && location.protocol === 'https:') {
  void navigator.serviceWorker.register('./sw.js')
}
