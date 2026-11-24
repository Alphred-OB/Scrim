// Opens the demo dashboard in its own plain window (no browser chrome), handy for recording.
//   node_modules\electron\dist\electron.exe demo\dashboard\app.cjs
const { app, BrowserWindow } = require('electron')
const path = require('path')
app.disableHardwareAcceleration() // plain software drawing: always paints, even while a screen recorder is running
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion') // never treat the window as hidden
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 1440, height: 900, title: 'Nimbus', autoHideMenuBar: true, backgroundColor: '#f5f6fa' })
  w.loadFile(path.join(__dirname, 'index.html'))
  w.maximize()
  w.setAlwaysOnTop(true, 'screen-saver') // stays above every other window, so clicks and the recording both see only the dashboard
  w.focus()
})
app.on('window-all-closed', () => app.quit())
