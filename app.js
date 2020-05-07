const express = require('express')
const app = express()
const port = 23119

app.use( express.static('static'))

app.listen( port, () => console.log(`TuneIn listening on port ${port}`) )

