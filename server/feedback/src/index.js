import { createApp } from './app.js'
import { createDb } from './db.js'

// without DATABASE_URL the website still runs (handy for trying it locally); feedback is just off
const db = process.env.DATABASE_URL ? createDb() : null
if (db) await db.migrate()
else console.log('No DATABASE_URL: serving the website only, feedback is off')
const port = Number(process.env.PORT) || 3000
createApp(db).listen(port, () => console.log(`Scrim feedback listening on ${port}`))
