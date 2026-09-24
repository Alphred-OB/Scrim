import { createApp } from './app.js'
import { createDb } from './db.js'

const db = createDb()
await db.migrate()
const port = Number(process.env.PORT) || 3000
createApp(db).listen(port, () => console.log(`Scrim feedback listening on ${port}`))
